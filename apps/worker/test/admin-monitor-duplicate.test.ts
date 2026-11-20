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

  const db = sqliteD1(database);
  const env = { DB: db, ADMIN_TOKEN: 'test-admin' } as unknown as Env;
  const request = (path: string, init: RequestInit = {}) =>
    adminRoutes.fetch(
      new Request(`https://status.example.com${path}`, {
        ...init,
        headers: { Authorization: 'Bearer test-admin', ...(init.headers ?? {}) },
      }),
      env,
      { waitUntil: vi.fn() } as unknown as ExecutionContext,
    );

  return { database, request };
}

describe('POST /admin/monitors/:id/duplicate', () => {
  let app: ReturnType<typeof createApp>;

  beforeEach(() => {
    app = createApp();
    app.database.exec(`
      INSERT INTO monitors (
        id, name, type, target, display_url, interval_sec, timeout_ms,
        http_method, http_headers_json, response_keyword, response_keyword_mode,
        group_name, group_sort_order, show_on_status_page, is_active, probe_mode,
        notification_channel_ids_json, ssl_expiry_enabled, domain_expiry_enabled,
        ssl_expires_at, ssl_issuer, expiry_checked_at, keep_cookies,
        failures_to_down_from_up, successes_to_up_from_down, created_at, updated_at
      ) VALUES (
        900001, 'Homepage', 'http', 'https://example.com/health', 'https://example.com',
        60, 10000, 'GET', '{"x-api-key":"secret"}', 'ok', 'contains',
        'Core', 3, 1, 1, 'worker', '[7,9]', 1, 1,
        1760000000, 'Example CA', 1760000500, 1, 3, 2, 1700000000, 1700000100
      );
      INSERT INTO monitor_metadata (monitor_id, key, value, created_at, updated_at)
      VALUES (900001, 'env', 'prod', 1700000000, 1700000000);
    `);
  });

  it('copies the configuration and metadata under a new name', async () => {
    const res = await app.request('/monitors/900001/duplicate', { method: 'POST' });
    expect(res.status).toBe(201);
    const body = (await res.json()) as {
      monitor: { id: number; name: string; notification_channel_ids: number[] };
    };

    expect(body.monitor.id).not.toBe(900001);
    expect(body.monitor.name).toBe('Homepage (copy)');
    expect(body.monitor.notification_channel_ids).toEqual([7, 9]);

    const rows = app.database
      .prepare(
        `SELECT name, target, http_headers_json, group_name, group_sort_order,
                failures_to_down_from_up, successes_to_up_from_down, keep_cookies,
                ssl_expiry_enabled, notification_channel_ids_json
         FROM monitors WHERE id = ?`,
      )
      .all(body.monitor.id) as Array<Record<string, unknown>>;
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      name: 'Homepage (copy)',
      target: 'https://example.com/health',
      http_headers_json: '{"x-api-key":"secret"}',
      group_name: 'Core',
      group_sort_order: 3,
      failures_to_down_from_up: 3,
      successes_to_up_from_down: 2,
      keep_cookies: 1,
      ssl_expiry_enabled: 1,
      notification_channel_ids_json: '[7,9]',
    });

    const metadata = app.database
      .prepare('SELECT monitor_id, key, value FROM monitor_metadata ORDER BY monitor_id, key')
      .all() as Array<{ monitor_id: number; key: string; value: string }>;
    expect(metadata).toEqual([
      { monitor_id: 900001, key: 'env', value: 'prod' },
      { monitor_id: body.monitor.id, key: 'env', value: 'prod' },
    ]);
  });

  it('starts the copy without the origin certificate or domain results', async () => {
    const res = await app.request('/monitors/900001/duplicate', { method: 'POST' });
    const body = (await res.json()) as { monitor: { id: number } };

    const row = app.database
      .prepare(
        'SELECT ssl_expires_at, ssl_issuer, domain_expires_at, expiry_checked_at FROM monitors WHERE id = ?',
      )
      .get(body.monitor.id) as Record<string, unknown>;

    expect(row).toEqual({
      ssl_expires_at: null,
      ssl_issuer: null,
      domain_expires_at: null,
      expiry_checked_at: null,
    });
  });

  it('gives a copied heartbeat monitor its own ping token', async () => {
    app.database.exec(`
      INSERT INTO monitors (id, name, type, target, heartbeat_token, created_at, updated_at)
      VALUES (900002, 'Nightly backup', 'heartbeat', '', 'hb-original', 1700000000, 1700000000);
    `);

    const res = await app.request('/monitors/900002/duplicate', { method: 'POST' });
    const body = (await res.json()) as { monitor: { id: number } };

    const row = app.database
      .prepare('SELECT heartbeat_token FROM monitors WHERE id = ?')
      .get(body.monitor.id) as { heartbeat_token: string | null };
    expect(row.heartbeat_token).toBeTruthy();
    expect(row.heartbeat_token).not.toBe('hb-original');
  });

  it('answers 404 for an unknown monitor', async () => {
    const res = await app.request('/monitors/424242/duplicate', { method: 'POST' });
    expect(res.status).toBe(404);
  });
});
