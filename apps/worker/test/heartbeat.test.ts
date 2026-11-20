import { readdirSync, readFileSync } from 'node:fs';
import { Hono } from 'hono';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../src/monitor/http', () => ({ runHttpCheck: vi.fn() }));
vi.mock('../src/monitor/tcp', () => ({ runTcpCheck: vi.fn() }));
vi.mock('../src/snapshots', () => ({
  refreshPublicHomepageSnapshotIfNeeded: vi.fn().mockResolvedValue(false),
}));

import { runHttpCheck } from '../src/monitor/http';
import { runTcpCheck } from '../src/monitor/tcp';
import { heartbeatGraceSeconds } from '../src/monitor/heartbeat';
import { runExclusivePersistedMonitorBatch } from '../src/scheduler/scheduled';
import type { Env } from '../src/env';
import { handleError, handleNotFound } from '../src/middleware/errors';
import { adminRoutes } from '../src/routes/admin';
import { publicRoutes } from '../src/routes/public';
import { DatabaseSync, sqliteD1 } from './helpers/sqlite-d1';

const migrationsDir = new URL('../migrations/', import.meta.url);

function createApp() {
  const database = new DatabaseSync(':memory:');
  for (const file of readdirSync(migrationsDir)
    .filter((name) => name.endsWith('.sql'))
    .sort()) {
    database.exec(readFileSync(new URL(file, migrationsDir), 'utf8'));
  }

  const env = { DB: sqliteD1(database), ADMIN_TOKEN: 'test-admin' } as unknown as Env;
  const pending: Promise<unknown>[] = [];
  const waitUntil = (promise: Promise<unknown>) => { pending.push(promise); };
  const flushSideEffects = async () => {
    for (let count = 0; count < 10 && pending.length; count++) {
      await Promise.allSettled(pending.splice(0));
    }
  };
  const app = new Hono<{ Bindings: Env }>();
  app.onError(handleError);
  app.notFound(handleNotFound);
  app.route('/api/v1/admin', adminRoutes);
  app.route('/api/v1', publicRoutes);

  const adminRequest = (path: string, method: string, body?: unknown) =>
    app.fetch(
      new Request(`https://status.example.com${path}`, {
        method,
        headers: { Authorization: 'Bearer test-admin', 'Content-Type': 'application/json' },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      }),
      env,
      { waitUntil } as unknown as ExecutionContext,
    );

  const publicRequest = (path: string, method = 'GET') =>
    app.fetch(new Request(`https://status.example.com${path}`, { method }), env, {
      waitUntil,
    } as unknown as ExecutionContext);

  return { database, adminRequest, publicRequest, flushSideEffects };
}

type HeartbeatPayload = { monitor: { id: number; type: string; heartbeat_token: string | null } };

function readState(database: InstanceType<typeof DatabaseSync>, monitorId: number) {
  return database
    .prepare(
      'SELECT status, last_checked_at, consecutive_successes, consecutive_failures FROM monitor_state WHERE monitor_id = ?',
    )
    .get(monitorId) as
    | {
        status: string;
        last_checked_at: number | null;
        consecutive_successes: number;
        consecutive_failures: number;
      }
    | undefined;
}

describe('heartbeat monitors', () => {
  it('creates a monitor with a token and no target', async () => {
    const { adminRequest } = createApp();

    const created = await adminRequest('/api/v1/admin/monitors', 'POST', {
      name: 'Nightly job',
      type: 'heartbeat',
      interval_sec: 3600,
    });
    expect(created.status).toBe(201);

    const body = (await created.json()) as HeartbeatPayload;
    expect(body.monitor.type).toBe('heartbeat');
    expect(body.monitor.heartbeat_token).toMatch(/^[a-f0-9]{32}$/);
  });

  it('rejects http-only fields on a heartbeat monitor', async () => {
    const { adminRequest } = createApp();

    const created = await adminRequest('/api/v1/admin/monitors', 'POST', {
      name: 'Bad heartbeat',
      type: 'heartbeat',
      response_keyword: 'ok',
    });
    expect(created.status).toBe(400);
  });

  it('marks the monitor up on a ping and rejects unknown tokens', async () => {
    const { database, adminRequest, publicRequest } = createApp();

    const created = await adminRequest('/api/v1/admin/monitors', 'POST', {
      name: 'Backup job',
      type: 'heartbeat',
      interval_sec: 300,
    });
    const { monitor } = (await created.json()) as HeartbeatPayload;
    const token = monitor.heartbeat_token as string;

    // An open outage must be closed by the recovery ping.
    database
      .prepare(
        "INSERT INTO outages (monitor_id, started_at, ended_at, initial_error, last_error) VALUES (?, ?, NULL, 'no heartbeat', 'no heartbeat')",
      )
      .run(monitor.id, Math.floor(Date.now() / 1000) - 600);

    const ping = await publicRequest(`/api/v1/heartbeat/${token}`, 'POST');
    expect(ping.status).toBe(202);

    const state = readState(database, monitor.id);
    expect(state?.status).toBe('up');
    expect(state?.last_checked_at).not.toBeNull();
    expect(state?.consecutive_failures).toBe(0);

    const checks = database
      .prepare("SELECT COUNT(*) AS n FROM check_results WHERE monitor_id = ? AND status = 'up'")
      .get(monitor.id) as { n: number };
    expect(checks.n).toBe(1);

    const openOutages = database
      .prepare('SELECT COUNT(*) AS n FROM outages WHERE monitor_id = ? AND ended_at IS NULL')
      .get(monitor.id) as { n: number };
    expect(openOutages.n).toBe(0);

    const unknown = await publicRequest('/api/v1/heartbeat/deadbeef', 'POST');
    expect(unknown.status).toBe(404);
  });

  it('sends a monitor.up notification after a failed heartbeat recovers', async () => {
    const { database, adminRequest, publicRequest, flushSideEffects } = createApp();
    const originalFetch = globalThis.fetch;
    const fetchMock = vi.fn(async () => new Response('accepted', { status: 200 }));
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    try {
      const created = await adminRequest('/api/v1/admin/monitors', 'POST', {
        name: 'Backup recovery', type: 'heartbeat', interval_sec: 300,
      });
      const { monitor } = (await created.json()) as HeartbeatPayload;
      const now = Math.floor(Date.now() / 1000);
      database.prepare(
        "INSERT INTO monitor_state (monitor_id, status, last_checked_at, last_changed_at) VALUES (?, 'down', ?, ?)",
      ).run(monitor.id, now - 360, now - 360);
      database.prepare(
        "INSERT INTO notification_channels (name, type, config_json) VALUES (?, 'webhook', ?)",
      ).run('Ops', JSON.stringify({ preset: 'custom', url: 'https://hooks.example.org/ops', method: 'POST', payload_type: 'json' }));
      database.prepare(
        "INSERT INTO outages (monitor_id, started_at, initial_error) VALUES (?, ?, 'No heartbeat')",
      ).run(monitor.id, now - 360);

      const result = await publicRequest(`/api/v1/heartbeat/${monitor.heartbeat_token}`, 'POST');
      expect(result.status).toBe(202);
      await flushSideEffects();

      const delivery = database.prepare(
        "SELECT event_type, status FROM notification_deliveries WHERE event_type = 'monitor.up'",
      ).get() as { event_type: string; status: string } | undefined;
      expect(delivery).toMatchObject({ event_type: 'monitor.up', status: 'success' });
      expect(fetchMock).toHaveBeenCalled();
    } finally {
      globalThis.fetch = originalFetch;
      database.close();
    }
  });

  it('turns a silent heartbeat down once the grace window passes', async () => {
    const { database, adminRequest, publicRequest } = createApp();

    const created = await adminRequest('/api/v1/admin/monitors', 'POST', {
      name: 'ETL job',
      type: 'heartbeat',
      interval_sec: 300,
    });
    const { monitor } = (await created.json()) as HeartbeatPayload;
    const now = Math.floor(Date.now() / 1000);

    database
      .prepare(
        "INSERT INTO monitor_state (monitor_id, status, last_checked_at, last_changed_at, consecutive_failures, consecutive_successes) VALUES (?, 'up', ?, ?, 0, 5)",
      )
      .run(monitor.id, now - 4000, now - 4000);
    database.prepare('UPDATE monitors SET last_heartbeat_at = ? WHERE id = ?').run(now - 4000, monitor.id);

    // Heartbeats ignore consecutive-count thresholds: the grace window already covers lateness.
    await runExclusivePersistedMonitorBatch({
      db: sqliteD1(database),
      ids: [monitor.id],
      checkedAt: now,
      stateMachineConfig: { failuresToDownFromUp: 5, successesToUpFromDown: 5 },
    });

    expect(readState(database, monitor.id)?.status).toBe('down');
    // Heartbeats are never probed over the network.
    expect(vi.mocked(runHttpCheck)).not.toHaveBeenCalled();
    expect(vi.mocked(runTcpCheck)).not.toHaveBeenCalled();

    const recovered = await publicRequest(
      `/api/v1/heartbeat/${monitor.heartbeat_token}`, 'POST',
    );
    expect(recovered.status).toBe(202);
    expect(readState(database, monitor.id)?.status).toBe('up');
  });

  it('uses the configured grace period instead of the two-interval default', async () => {
    const { database, adminRequest } = createApp();

    const created = await adminRequest('/api/v1/admin/monitors', 'POST', {
      name: 'Nightly export',
      type: 'heartbeat',
      interval_sec: 300,
      heartbeat_grace_sec: 120,
    });
    const { monitor } = (await created.json()) as HeartbeatPayload & {
      heartbeat_grace_sec?: number | null;
    };
    expect(monitor.heartbeat_grace_sec).toBe(120);

    const now = Math.floor(Date.now() / 1000);
    database
      .prepare(
        "INSERT INTO monitor_state (monitor_id, status, last_checked_at, last_changed_at, consecutive_failures, consecutive_successes) VALUES (?, 'up', ?, ?, 0, 1)",
      )
      .run(monitor.id, now - 400, now - 400);
    database.prepare('UPDATE monitors SET last_heartbeat_at = ? WHERE id = ?').run(now - 400, monitor.id);

    // 400s of silence is inside 300s + 120s of grace.
    await runExclusivePersistedMonitorBatch({
      db: sqliteD1(database),
      ids: [monitor.id],
      checkedAt: now,
      stateMachineConfig: { failuresToDownFromUp: 5, successesToUpFromDown: 5 },
    });
    expect(readState(database, monitor.id)?.status).toBe('up');

    database
      .prepare('UPDATE monitor_state SET last_checked_at = ? WHERE monitor_id = ?')
      .run(now - 500, monitor.id);
    database.prepare('UPDATE monitors SET last_heartbeat_at = ? WHERE id = ?').run(now - 500, monitor.id);

    await runExclusivePersistedMonitorBatch({
      db: sqliteD1(database),
      ids: [monitor.id],
      checkedAt: now,
      stateMachineConfig: { failuresToDownFromUp: 5, successesToUpFromDown: 5 },
    });
    expect(readState(database, monitor.id)?.status).toBe('down');
  });

  it('remains pending until the first ping and does not refresh its timer on scheduler ticks', async () => {
    const { database, adminRequest, publicRequest } = createApp();
    const created = await adminRequest('/api/v1/admin/monitors', 'POST', {
      name: 'Deferred cron job',
      type: 'heartbeat',
      interval_sec: 60,
      heartbeat_grace_sec: 0,
    });
    const { monitor } = (await created.json()) as HeartbeatPayload;
    const now = Math.floor(Date.now() / 1000);
    await runExclusivePersistedMonitorBatch({
      db: sqliteD1(database),
      ids: [monitor.id],
      checkedAt: now,
      stateMachineConfig: { failuresToDownFromUp: 1, successesToUpFromDown: 1 },
    });
    expect(readState(database, monitor.id)?.status).toBe('unknown');
    expect(database.prepare('SELECT COUNT(*) AS n FROM outages WHERE monitor_id=?').get(monitor.id)).toMatchObject({n: 0});

    const response = await publicRequest(`/api/v1/heartbeat/${monitor.heartbeat_token}`);
    expect(response.status, await response.clone().text()).toBe(202);
    const started = database.prepare('SELECT last_heartbeat_at FROM monitors WHERE id=?').get(monitor.id) as { last_heartbeat_at: number };
    expect(started.last_heartbeat_at).toBeGreaterThan(0);
    await runExclusivePersistedMonitorBatch({
      db: sqliteD1(database),
      ids: [monitor.id],
      checkedAt: started.last_heartbeat_at + 60,
      stateMachineConfig: { failuresToDownFromUp: 1, successesToUpFromDown: 1 },
    });
    expect(readState(database, monitor.id)?.status).toBe('up');
    await runExclusivePersistedMonitorBatch({
      db: sqliteD1(database),
      ids: [monitor.id],
      checkedAt: started.last_heartbeat_at + 120,
      stateMachineConfig: { failuresToDownFromUp: 1, successesToUpFromDown: 1 },
    });
    expect(readState(database, monitor.id)?.status).toBe('down');
    const final = database.prepare('SELECT last_heartbeat_at FROM monitors WHERE id=?').get(monitor.id) as { last_heartbeat_at: number };
    expect(final.last_heartbeat_at).toBe(started.last_heartbeat_at);
  });

  it('does not resume a paused heartbeat when its job continues to ping', async () => {
    const { database, adminRequest, publicRequest } = createApp();
    const created = await adminRequest('/api/v1/admin/monitors', 'POST', {
      name: 'Pause safely', type: 'heartbeat', interval_sec: 60,
    });
    const { monitor } = (await created.json()) as HeartbeatPayload;
    await publicRequest(`/api/v1/heartbeat/${monitor.heartbeat_token}`);
    const previous = database.prepare('SELECT last_heartbeat_at FROM monitors WHERE id=?').get(monitor.id) as { last_heartbeat_at: number };
    const paused = await adminRequest(`/api/v1/admin/monitors/${monitor.id}/pause`, 'POST');
    expect(paused.status).toBe(200);
    const ping = await publicRequest(`/api/v1/heartbeat/${monitor.heartbeat_token}`);
    expect(ping.status, await ping.clone().text()).toBe(202);
    expect((await ping.json()) as {ignored:boolean}).toMatchObject({ignored:true});
    expect(readState(database, monitor.id)?.status).toBe('paused');
    const after = database.prepare('SELECT last_heartbeat_at FROM monitors WHERE id=?').get(monitor.id) as { last_heartbeat_at: number };
    expect(after.last_heartbeat_at).toBe(previous.last_heartbeat_at);
  });

  it('falls back to the default policy when no grace period is configured', () => {
    expect(heartbeatGraceSeconds(60)).toBe(300);
    expect(heartbeatGraceSeconds(600)).toBe(1200);
    expect(heartbeatGraceSeconds(300, 0)).toBe(300);
    expect(heartbeatGraceSeconds(300, 120)).toBe(420);
    expect(heartbeatGraceSeconds(300, null)).toBe(600);
  });
});
