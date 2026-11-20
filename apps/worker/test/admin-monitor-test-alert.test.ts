import { Hono } from 'hono';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/monitor/tcp', () => ({ runTcpCheck: vi.fn() }));

import type { Env } from '../src/env';
import { handleError } from '../src/middleware/errors';
import { adminRoutes } from '../src/routes/admin';
import { DatabaseSync, sqliteD1 } from './helpers/sqlite-d1';

function createApp(channels: Array<{ id: number; name: string; enabledEvents?: string[] }>) {
  const database = new DatabaseSync(':memory:');
  database.exec(`
    CREATE TABLE monitors (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      type TEXT NOT NULL CHECK (type IN ('http', 'tcp', 'heartbeat')),
      target TEXT NOT NULL,
      interval_sec INTEGER NOT NULL DEFAULT 60,
      timeout_ms INTEGER NOT NULL DEFAULT 10000,
      http_method TEXT,
      http_headers_json TEXT,
      http_body TEXT,
      expected_status_json TEXT,
      response_keyword TEXT,
      response_forbidden_keyword TEXT,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at INTEGER NOT NULL DEFAULT 0,
      updated_at INTEGER NOT NULL DEFAULT 0,
      group_name TEXT,
      sort_order INTEGER NOT NULL DEFAULT 0,
      group_sort_order INTEGER NOT NULL DEFAULT 0,
      show_on_status_page INTEGER NOT NULL DEFAULT 1,
      response_keyword_mode TEXT,
      response_forbidden_keyword_mode TEXT,
      follow_redirects INTEGER NOT NULL DEFAULT 1,
      display_url TEXT,
      forbidden_status_json TEXT,
      probe_mode TEXT NOT NULL DEFAULT 'worker',
      notification_channel_ids_json TEXT,
      maintenance_window_json TEXT,
      ssl_expiry_enabled INTEGER NOT NULL DEFAULT 0,
      domain_expiry_enabled INTEGER NOT NULL DEFAULT 0,
      ssl_expiry_alert_days INTEGER,
      domain_expiry_alert_days INTEGER,
      ssl_expires_at INTEGER,
      ssl_issuer TEXT,
      domain_expires_at INTEGER,
      expiry_checked_at INTEGER,
      keep_cookies INTEGER NOT NULL DEFAULT 0,
      failures_to_down_from_up INTEGER,
      successes_to_up_from_down INTEGER,
      heartbeat_token TEXT,
      heartbeat_grace_sec INTEGER,
      last_heartbeat_at INTEGER,
      confirmation_period_sec INTEGER,
      recovery_period_sec INTEGER
    );
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
    INSERT INTO monitors (id, name, type, target, display_url)
    VALUES (7, 'API', 'http', 'https://api.example.test/health', 'https://api.example.test');
  `);

  for (const channel of channels) {
    database
      .prepare(
        `INSERT INTO notification_channels (id, name, type, config_json, is_active)
         VALUES (?1, ?2, 'webhook', ?3, 1)`,
      )
      .run(
        channel.id,
        channel.name,
        JSON.stringify({
          preset: 'custom',
          url: 'https://hooks.example.test/ops',
          method: 'POST',
          payload_type: 'json',
          ...(channel.enabledEvents ? { enabled_events: channel.enabledEvents } : {}),
        }),
      );
  }

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

describe('admin monitor test alert', () => {
  it('sends a test alert only to channels that accept monitor alerts', async () => {
    const fetchMock = vi.fn(async () => new Response('ok', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const { database, request } = createApp([
      { id: 10, name: 'Ops', enabledEvents: ['monitor.down', 'monitor.up'] },
      { id: 11, name: 'Incident desk', enabledEvents: ['incident.created'] },
    ]);

    try {
      const res = await request('/api/v1/admin/monitors/7/test-alert', 'POST');
      expect(res.status).toBe(200);
      const body = (await res.json()) as {
        channels: number;
        results: Array<{ channel_id: number; status: string; name: string }>;
      };

      expect(body.channels).toBe(1);
      expect(body.results).toEqual([
        expect.objectContaining({ channel_id: 10, name: 'Ops', status: 'success' }),
      ]);
      expect(fetchMock).toHaveBeenCalledTimes(1);

      const row = database
        .prepare(
          'SELECT event_type, payload_json FROM notification_deliveries WHERE channel_id = 10',
        )
        .get() as { event_type: string; payload_json: string };
      expect(row.event_type).toBe('test.ping');
      expect(JSON.parse(row.payload_json)).toMatchObject({
        event: 'test.ping',
        monitor: { id: 7, name: 'API' },
      });
    } finally {
      database.close();
    }
  });

  it('reports zero channels when no channel accepts monitor alerts', async () => {
    const fetchMock = vi.fn(async () => new Response('ok', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const { database, request } = createApp([
      { id: 11, name: 'Incident desk', enabledEvents: ['incident.created'] },
    ]);

    try {
      const res = await request('/api/v1/admin/monitors/7/test-alert', 'POST');
      expect(res.status).toBe(200);
      expect(await res.json()).toMatchObject({ channels: 0, results: [] });
      expect(fetchMock).not.toHaveBeenCalled();
    } finally {
      database.close();
    }
  });
});
