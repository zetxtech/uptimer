import { readdirSync, readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/monitor/tcp', () => ({ runTcpCheck: vi.fn() }));
vi.mock('../src/snapshots', () => ({
  refreshPublicHomepageSnapshotIfNeeded: vi.fn().mockResolvedValue(false),
}));

import type { Env } from '../src/env';
import { adminRoutes } from '../src/routes/admin';
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
  const request = (path: string, authenticated = true) =>
    adminRoutes.fetch(
      new Request(`https://status.example.com${path}`, {
        headers: authenticated ? { Authorization: 'Bearer test-admin' } : {},
      }),
      env,
      { waitUntil: vi.fn() } as unknown as ExecutionContext,
    );

  return { database, request, env };
}

type EventPayload = {
  events: Array<{
    id: number;
    monitor_id: number;
    monitor_name: string;
    monitor_type: string;
    monitor_target: string;
    started_at: number;
    ended_at: number | null;
    initial_error: string | null;
    last_error: string | null;
  }>;
  next_cursor: number | null;
};

describe('GET /events', () => {
  let app: ReturnType<typeof createApp>;

  beforeEach(() => {
    app = createApp();
    const monitor = app.database.prepare(
      `INSERT INTO monitors (id, name, type, target, created_at, updated_at)
       VALUES (?, ?, ?, ?, 1700000000, 1700000100)`,
    );
    monitor.run(1, 'Marketing site', 'http', 'https://example.com/healthz');
    monitor.run(2, 'Edge worker', 'tcp', 'edge.example.com:443');

    const outage = app.database.prepare(
      `INSERT INTO outages (id, monitor_id, started_at, ended_at, initial_error, last_error)
       VALUES (?, ?, ?, ?, ?, ?)`,
    );
    outage.run(10, 1, 1700001000, 1700001300, 'HTTP 500', 'HTTP 500');
    outage.run(11, 1, 1700002000, null, 'HTTP 503', 'HTTP 504');
    outage.run(12, 2, 1700000500, 1700000600, 'TCP connect timeout', 'TCP connect timeout');
  });

  it('requires the admin token', async () => {
    const response = await app.request('/events', false);
    expect(response.status).toBe(401);
  });

  it('returns every outage newest first with its monitor attached', async () => {
    const response = await app.request('/events');
    expect(response.status).toBe(200);
    const payload = (await response.json()) as EventPayload;

    expect(payload.events.map((event) => event.id)).toEqual([12, 11, 10]);
    expect(payload.events[1]).toMatchObject({
      monitor_id: 1,
      monitor_name: 'Marketing site',
      monitor_type: 'http',
      monitor_target: 'https://example.com/healthz',
      started_at: 1700002000,
      ended_at: null,
      initial_error: 'HTTP 503',
      last_error: 'HTTP 504',
    });
    expect(payload.next_cursor).toBeNull();
  });

  it('filters by monitor and state', async () => {
    const byMonitor = (await (await app.request('/events?monitor_id=2')).json()) as EventPayload;
    expect(byMonitor.events.map((event) => event.id)).toEqual([12]);

    const open = (await (await app.request('/events?status=open')).json()) as EventPayload;
    expect(open.events.map((event) => event.id)).toEqual([11]);

    const resolved = (await (await app.request('/events?status=resolved')).json()) as EventPayload;
    expect(resolved.events.map((event) => event.id)).toEqual([12, 10]);
  });

  it('pages by cursor and rejects an out-of-range limit', async () => {
    const first = (await (await app.request('/events?limit=2')).json()) as EventPayload;
    expect(first.events.map((event) => event.id)).toEqual([12, 11]);
    expect(first.next_cursor).toBe(11);

    const second = (await (
      await app.request(`/events?limit=2&cursor=${first.next_cursor}`)
    ).json()) as EventPayload;
    expect(second.events.map((event) => event.id)).toEqual([10]);
    expect(second.next_cursor).toBeNull();

    const invalid = await app.request('/events?limit=500');
    expect(invalid.status).toBe(400);
  });
});

type EventDetailPayload = {
  event: EventPayload['events'][number];
  checks: Array<{
    checked_at: number;
    status: string;
    latency_ms: number | null;
    http_status: number | null;
    error: string | null;
    location: string | null;
  }>;
};

describe('GET /events/:id', () => {
  let app: ReturnType<typeof createApp>;

  beforeEach(() => {
    app = createApp();
    app.database
      .prepare(
        `INSERT INTO monitors (id, name, type, target, created_at, updated_at)
         VALUES (?, ?, ?, ?, 1700000000, 1700000100)`,
      )
      .run(1, 'Marketing site', 'http', 'https://example.com/healthz');

    app.database
      .prepare(
        `INSERT INTO outages (id, monitor_id, started_at, ended_at, initial_error, last_error)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(10, 1, 1700001000, 1700001300, 'HTTP 500', 'HTTP 504');

    const check = app.database.prepare(
      `INSERT INTO check_results (monitor_id, checked_at, status, latency_ms, http_status, error, location, attempt)
       VALUES (?, ?, ?, ?, ?, ?, ?, 1)`,
    );
    check.run(1, 1700000900, 'up', 120, 200, null, 'worker');
    check.run(1, 1700001050, 'down', null, 500, 'HTTP 500', 'worker');
    check.run(1, 1700001180, 'down', null, 504, 'HTTP 504', 'worker');
    check.run(1, 1700001400, 'up', 132, 200, null, 'worker');
  });

  it('requires the admin token', async () => {
    const response = await app.request('/events/10', false);
    expect(response.status).toBe(401);
  });

  it('returns the event with its monitor and the checks inside the window', async () => {
    const response = await app.request('/events/10');
    expect(response.status).toBe(200);
    const payload = (await response.json()) as EventDetailPayload;

    expect(payload.event).toMatchObject({
      id: 10,
      monitor_id: 1,
      monitor_name: 'Marketing site',
      monitor_type: 'http',
      monitor_target: 'https://example.com/healthz',
      started_at: 1700001000,
      ended_at: 1700001300,
      initial_error: 'HTTP 500',
      last_error: 'HTTP 504',
    });
    expect(payload.checks.map((entry) => entry.checked_at)).toEqual([1700001050, 1700001180]);
    expect(payload.checks[0]).toMatchObject({
      status: 'down',
      http_status: 500,
      error: 'HTTP 500',
    });
  });

  it('returns 404 for an unknown event', async () => {
    const response = await app.request('/events/999');
    expect(response.status).toBe(404);
  });

  it('stores attachments with an update and serves them only through the authenticated event', async () => {
    const post = (payload: unknown) =>
      adminRoutes.fetch(
        new Request('https://status.example.com/events/10/updates', {
          method: 'POST',
          headers: { Authorization: 'Bearer test-admin', 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        }),
        app.env,
        { waitUntil: vi.fn() } as unknown as ExecutionContext,
      );
    const data = btoa('attachment contents');
    const response = await post({
      body: 'Investigation',
      attachments: [{ name: 'notes.txt', data }],
    });
    expect(response.status).toBe(200);
    const result = (await response.json()) as {
      update: { id: number; attachments: Array<{ name: string }> };
    };
    expect(result.update.attachments).toEqual([{ name: 'notes.txt' }]);
    const detail = (await (await app.request('/events/10')).json()) as {
      updates: Array<{ attachments: unknown }>;
    };
    expect(detail.updates[0].attachments).toEqual([{ name: 'notes.txt' }]);
    const path = `/events/10/updates/${result.update.id}/attachments/0`;
    expect((await app.request(path, false)).status).toBe(401);
    expect((await app.request(path.replace('/events/10/', '/events/11/'))).status).toBe(404);
    const file = await app.request(path);
    expect(file.status).toBe(200);
    expect(file.headers.get('content-type')).toBe('application/octet-stream');
    expect(await file.text()).toBe('attachment contents');
    expect(
      (await post({ body: 'Invalid', attachments: [{ name: 'bad.txt', data: '!!' }] })).status,
    ).toBe(400);
    expect(
      (await post({ body: 'Too many', attachments: Array(4).fill({ name: 'a', data: '' }) }))
        .status,
    ).toBe(400);
    expect(
      (
        await post({
          body: 'Too large',
          attachments: [{ name: 'a', data: btoa('a'.repeat(200 * 1024 + 1)) }],
        })
      ).status,
    ).toBe(400);
  });
});
