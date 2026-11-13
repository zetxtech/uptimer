import { Hono } from 'hono';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/monitor/tcp', () => ({ runTcpCheck: vi.fn() }));

import type { Env } from '../src/env';
import { handleError } from '../src/middleware/errors';
import { adminRoutes } from '../src/routes/admin';
import { DatabaseSync, sqliteD1 } from './helpers/sqlite-d1';

function createApp() {
  const database = new DatabaseSync(':memory:');
  database.exec(`
    CREATE TABLE notification_channels (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      type TEXT NOT NULL,
      config_json TEXT NOT NULL,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE notification_deliveries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      event_key TEXT NOT NULL,
      channel_id INTEGER NOT NULL,
      status TEXT NOT NULL,
      http_status INTEGER,
      error TEXT,
      event_type TEXT,
      payload_json TEXT,
      attempts INTEGER NOT NULL DEFAULT 0,
      next_attempt_at INTEGER,
      created_at INTEGER NOT NULL,
      UNIQUE (event_key, channel_id)
    );
  `);
  database.exec(`
    INSERT INTO notification_channels (id, name, type, config_json, is_active)
    VALUES (
      10,
      'Ops webhook',
      'webhook',
      '{"preset":"custom","url":"https://hooks.example.test/ops","method":"POST","payload_type":"json"}',
      1
    );
    INSERT INTO notification_deliveries
      (event_key, channel_id, status, http_status, error, event_type, payload_json, attempts, created_at)
    VALUES
      (
        'monitor:1:down:1700000000',
        10,
        'failed',
        502,
        'HTTP 502',
        'monitor.down',
        '{"event":"monitor.down","monitor":{"id":1,"name":"API"}}',
        1,
        1700000000
      ),
      ('monitor:1:up:1700000100', 10, 'success', 200, NULL, 'monitor.up', NULL, 0, 1700000100);
  `);

  const env = { DB: sqliteD1(database), ADMIN_TOKEN: 'test-admin' } as Env;
  const app = new Hono<{ Bindings: Env }>();
  app.onError(handleError);
  app.route('/api/v1/admin', adminRoutes);

  const request = (path: string, method = 'GET') =>
    app.request(path, { method, headers: { Authorization: 'Bearer test-admin' } }, env);

  return { database, request };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('admin notification deliveries', () => {
  it('lists recent deliveries with channel names and retry eligibility', async () => {
    const { database, request } = createApp();
    try {
      const res = await request('/api/v1/admin/notification-deliveries');
      expect(res.status).toBe(200);
      const body = (await res.json()) as {
        deliveries: Array<{
          event_type: string;
          channel_name: string;
          status: string;
          can_retry: boolean;
        }>;
      };

      expect(body.deliveries).toHaveLength(2);
      expect(body.deliveries[0]).toMatchObject({
        event_type: 'monitor.up',
        channel_name: 'Ops webhook',
        status: 'success',
        can_retry: false,
      });
      expect(body.deliveries[1]).toMatchObject({
        event_type: 'monitor.down',
        status: 'failed',
        can_retry: true,
      });
    } finally {
      database.close();
    }
  });

  it('retries a failed delivery with the stored payload', async () => {
    const fetchMock = vi.fn(async () => new Response('ok', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const { database, request } = createApp();
    try {
      const res = await request('/api/v1/admin/notification-deliveries/1/retry', 'POST');
      expect(res.status).toBe(200);

      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
      expect(url).toBe('https://hooks.example.test/ops');
      expect(String(init.body)).toContain('monitor.down');

      const row = database
        .prepare(
          'SELECT status, http_status, error, attempts FROM notification_deliveries WHERE id = 1',
        )
        .get() as { status: string; http_status: number; error: string | null; attempts: number };
      expect(row.status).toBe('success');
      expect(row.http_status).toBe(200);
      expect(row.error).toBeNull();
      expect(row.attempts).toBe(2);
    } finally {
      database.close();
    }
  });

  it('refuses to retry a delivery without a stored payload', async () => {
    const { database, request } = createApp();
    try {
      const res = await request('/api/v1/admin/notification-deliveries/2/retry', 'POST');
      expect(res.status).toBe(409);

      const missing = await request('/api/v1/admin/notification-deliveries/999/retry', 'POST');
      expect(missing.status).toBe(404);
    } finally {
      database.close();
    }
  });
});
