import { readdirSync, readFileSync } from 'node:fs';
import { Hono } from 'hono';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../src/monitor/tcp', () => ({ runTcpCheck: vi.fn() }));
vi.mock('../src/snapshots', () => ({
  refreshPublicHomepageSnapshotIfNeeded: vi.fn().mockResolvedValue(false),
}));

import type { Env } from '../src/env';
import { handleError, handleNotFound } from '../src/middleware/errors';
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
  const app = new Hono<{ Bindings: Env }>();
  app.onError(handleError);
  app.notFound(handleNotFound);
  app.route('/api/v1/admin', adminRoutes);

  const request = (path: string, method: string, body?: unknown) =>
    app.fetch(
      new Request(`https://status.example.com${path}`, {
        method,
        headers: { Authorization: 'Bearer test-admin', 'Content-Type': 'application/json' },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      }),
      env,
      { waitUntil: vi.fn() } as unknown as ExecutionContext,
    );

  return { database, request };
}

const WINDOW = {
  start_minute: 1_380,
  end_minute: 120,
  days: [1, 2, 3],
  timezone: 'Asia/Shanghai',
};

type MonitorPayload = {
  monitor: {
    id: number;
    notification_channel_ids: number[] | null;
    maintenance_window: typeof WINDOW | null;
    metadata: Array<{ key: string; value: string }>;
  };
};

describe('monitor escalation, maintenance window and metadata', () => {
  it('round-trips the new fields through create, list and patch', async () => {
    const { request } = createApp();

    const created = await request('/api/v1/admin/monitors', 'POST', {
      name: 'With escalation',
      type: 'http',
      target: 'https://example.com/health',
      notification_channel_ids: [2, 1],
      maintenance_window: WINDOW,
      metadata: [
        { key: 'team', value: 'sre' },
        { key: 'tier', value: '1' },
      ],
    });
    expect(created.status).toBe(201);
    const createdBody = (await created.json()) as MonitorPayload;
    expect(createdBody.monitor.notification_channel_ids).toEqual([2, 1]);
    expect(createdBody.monitor.maintenance_window).toEqual(WINDOW);
    expect(createdBody.monitor.metadata).toEqual([
      { key: 'team', value: 'sre' },
      { key: 'tier', value: '1' },
    ]);
    const monitorId = createdBody.monitor.id;

    const list = await request('/api/v1/admin/monitors', 'GET');
    const listBody = (await list.json()) as { monitors: MonitorPayload['monitor'][] };
    const listed = listBody.monitors.find((monitor) => monitor.id === monitorId);
    expect(listed?.notification_channel_ids).toEqual([2, 1]);
    expect(listed?.metadata).toHaveLength(2);

    const detected = await request('/api/v1/admin/monitors', 'POST', {
      name: 'Defaults',
      type: 'tcp',
      target: 'example.com:443',
    });
    const detectedBody = (await detected.json()) as MonitorPayload;
    expect(detectedBody.monitor.notification_channel_ids).toBeNull();
    expect(detectedBody.monitor.maintenance_window).toBeNull();
    expect(detectedBody.monitor.metadata).toEqual([]);
  });

  it('clears the selection, window and metadata through patch', async () => {
    const { request } = createApp();

    const created = await request('/api/v1/admin/monitors', 'POST', {
      name: 'To clear',
      type: 'http',
      target: 'https://example.com/health',
      notification_channel_ids: [1],
      maintenance_window: WINDOW,
      metadata: [{ key: 'team', value: 'sre' }],
    });
    const createdBody = (await created.json()) as MonitorPayload;

    const patched = await request(`/api/v1/admin/monitors/${createdBody.monitor.id}`, 'PATCH', {
      notification_channel_ids: null,
      maintenance_window: null,
      metadata: [],
    });
    expect(patched.status).toBe(200);
    const patchedBody = (await patched.json()) as MonitorPayload;
    expect(patchedBody.monitor.notification_channel_ids).toBeNull();
    expect(patchedBody.monitor.maintenance_window).toBeNull();
    expect(patchedBody.monitor.metadata).toEqual([]);

    const detail = await request(`/api/v1/admin/monitors/${createdBody.monitor.id}`, 'GET');
    const detailBody = (await detail.json()) as MonitorPayload;
    expect(detailBody.monitor.maintenance_window).toBeNull();
    expect(detailBody.monitor.metadata).toEqual([]);
  });

  it('rejects malformed escalation, window and metadata payloads', async () => {
    const { request } = createApp();

    const emptySelection = await request('/api/v1/admin/monitors', 'POST', {
      name: 'Empty selection',
      type: 'http',
      target: 'https://example.com/health',
      notification_channel_ids: [],
    });
    expect(emptySelection.status).toBe(400);

    const emptyWindow = await request('/api/v1/admin/monitors', 'POST', {
      name: 'Empty window',
      type: 'http',
      target: 'https://example.com/health',
      maintenance_window: { ...WINDOW, end_minute: WINDOW.start_minute },
    });
    expect(emptyWindow.status).toBe(400);

    const unknownZone = await request('/api/v1/admin/monitors', 'POST', {
      name: 'Unknown zone',
      type: 'http',
      target: 'https://example.com/health',
      maintenance_window: { ...WINDOW, timezone: 'Not/AZone' },
    });
    expect(unknownZone.status).toBe(400);

    const duplicateKeys = await request('/api/v1/admin/monitors', 'POST', {
      name: 'Duplicate metadata',
      type: 'http',
      target: 'https://example.com/health',
      metadata: [
        { key: 'team', value: 'sre' },
        { key: 'team', value: 'platform' },
      ],
    });
    expect(duplicateKeys.status).toBe(400);
  });

  it('stores the expiry and cookie toggles', async () => {
    const { request } = createApp();

    const created = await request('/api/v1/admin/monitors', 'POST', {
      name: 'TLS watch',
      type: 'http',
      target: 'https://example.com/health',
      ssl_expiry_enabled: true,
      domain_expiry_enabled: true,
      keep_cookies: true,
    });
    expect(created.status).toBe(201);
    const body = (await created.json()) as {
      monitor: {
        id: number;
        ssl_expiry_enabled: boolean;
        domain_expiry_enabled: boolean;
        keep_cookies: boolean;
        ssl_expires_at: number | null;
        expiry_checked_at: number | null;
      };
    };
    expect(body.monitor.ssl_expiry_enabled).toBe(true);
    expect(body.monitor.domain_expiry_enabled).toBe(true);
    expect(body.monitor.keep_cookies).toBe(true);
    expect(body.monitor.ssl_expires_at).toBeNull();

    const patched = await request(`/api/v1/admin/monitors/${body.monitor.id}`, 'PATCH', {
      ssl_expiry_enabled: false,
      keep_cookies: false,
    });
    const patchedBody = (await patched.json()) as typeof body;
    expect(patchedBody.monitor.ssl_expiry_enabled).toBe(false);
    expect(patchedBody.monitor.domain_expiry_enabled).toBe(true);
    expect(patchedBody.monitor.keep_cookies).toBe(false);

    const heartbeat = await request('/api/v1/admin/monitors', 'POST', {
      name: 'Heartbeat with cookies',
      type: 'heartbeat',
      keep_cookies: true,
    });
    expect(heartbeat.status).toBe(400);
  });

  it('removes stored metadata when the monitor is deleted', async () => {
    const { database, request } = createApp();

    const created = await request('/api/v1/admin/monitors', 'POST', {
      name: 'Disposable',
      type: 'http',
      target: 'https://example.com/health',
      metadata: [{ key: 'team', value: 'sre' }],
    });
    const createdBody = (await created.json()) as MonitorPayload;

    const deleted = await request(`/api/v1/admin/monitors/${createdBody.monitor.id}`, 'DELETE');
    expect(deleted.status).toBe(200);

    const remaining = database
      .prepare('SELECT COUNT(*) AS count FROM monitor_metadata WHERE monitor_id = ?1')
      .get(createdBody.monitor.id) as { count: number };
    expect(remaining.count).toBe(0);
  });
});
