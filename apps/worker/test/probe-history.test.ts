import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { Hono } from 'hono';

vi.mock('../src/monitor/tcp', () => ({ runTcpCheck: vi.fn() }));

import type { Env } from '../src/env';
import { handleError } from '../src/middleware/errors';
import { adminRoutes } from '../src/routes/admin';
import { adminAnalyticsRoutes } from '../src/routes/admin-analytics';
import { createFakeD1Database } from './helpers/fake-d1';
import { DatabaseSync, sqliteD1 } from './helpers/sqlite-d1';

describe('probe history API', () => {
  it('returns independent time series and bounded bucket sizes', async () => {
    const now = 1_800_000_000;
    vi.spyOn(Date, 'now').mockReturnValue(now * 1000);
    let queryArgs: unknown[] = [];
    const env = {
      DB: createFakeD1Database([
        { match: 'select id from monitors', first: () => ({ id: 1 }) },
        {
          match: 'from probe_check_results',
          all: (args) => {
            queryArgs = args;
            return [
              {
                probe_id: 'cn',
                probe_name: 'China',
                scope: 'domestic',
                region: 'cn',
                bucket_at: now - 300,
                avg_latency_ms: 80,
                checks_up: 2,
                checks_down: 1,
                checks_unknown: 0,
              },
              {
                probe_id: 'us',
                probe_name: 'US',
                scope: 'overseas',
                region: 'us',
                bucket_at: now - 300,
                avg_latency_ms: 200,
                checks_up: 1,
                checks_down: 0,
                checks_unknown: 0,
              },
            ];
          },
        },
      ]),
    } as Env;

    try {
      const response = await adminAnalyticsRoutes.request(
        '/monitors/1/probe-history?range=24h',
        {},
        env,
      );
      expect(response.status).toBe(200);
      const body = await response.json();
      expect(queryArgs).toEqual([1, 300, now - 86400, now]);
      expect(body).toMatchObject({
        monitor_id: 1,
        bucket_seconds: 300,
        truncated: false,
        probes: [
          { probe_id: 'cn', points: [{ avg_latency_ms: 80, checks_down: 1 }] },
          { probe_id: 'us', points: [{ avg_latency_ms: 200, checks_down: 0 }] },
        ],
      });
    } finally {
      vi.restoreAllMocks();
    }
  });

  it('rejects an invalid range and a missing monitor', async () => {
    const env = {
      DB: createFakeD1Database([{ match: 'select id from monitors', first: () => null }]),
    } as Env;
    const missing = await adminAnalyticsRoutes.request('/monitors/123/probe-history', {}, env);
    expect(missing.status).toBe(404);
    const invalid = await adminAnalyticsRoutes.request(
      '/monitors/1/probe-history?range=1y',
      {},
      env,
    );
    expect(invalid.status).toBe(400);
  });

  it('aggregates each probe independently against SQLite', async () => {
    const now = 1_800_000_000;
    vi.spyOn(Date, 'now').mockReturnValue(now * 1000);
    const database = new DatabaseSync(':memory:');
    database.exec(`CREATE TABLE monitors (id INTEGER PRIMARY KEY); INSERT INTO monitors VALUES (1);
      CREATE TABLE probes (id TEXT PRIMARY KEY, name TEXT, scope TEXT, region TEXT);
      INSERT INTO probes VALUES ('cn', 'China', 'domestic', 'cn'), ('us', 'US', 'overseas', 'us');`);
    database.exec(
      readFileSync(new URL('../migrations/0016_probe_check_results.sql', import.meta.url), 'utf8'),
    );
    const insert = database.prepare(`INSERT INTO probe_check_results
      (monitor_id, probe_id, checked_at, status, latency_ms) VALUES (?, ?, ?, ?, ?)`);
    insert.run(1, 'cn', now - 40, 'up', 80);
    insert.run(1, 'cn', now - 30, 'up', 120);
    insert.run(1, 'cn', now - 20, 'down', null);
    insert.run(1, 'us', now - 10, 'up', 250);
    try {
      const env = { DB: sqliteD1(database) } as Env;
      const response = await adminAnalyticsRoutes.request('/monitors/1/probe-history', {}, env);
      const body = await response.json();
      expect(body.probes).toMatchObject([
        { probe_id: 'cn', points: [{ avg_latency_ms: 100, checks_up: 2, checks_down: 1 }] },
        { probe_id: 'us', points: [{ avg_latency_ms: 250, checks_up: 1, checks_down: 0 }] },
      ]);
    } finally {
      database.close();
      vi.restoreAllMocks();
    }
  });

  it('requires an administrator token through the real admin router', async () => {
    const app = new Hono<{ Bindings: Env }>();
    app.onError(handleError);
    app.route('/api/v1/admin', adminRoutes);
    const env = { ADMIN_TOKEN: 'test-admin', DB: createFakeD1Database([]) } as Env;
    const response = await app.request('/api/v1/admin/analytics/monitors/1/probe-history', {}, env);
    expect(response.status).toBe(401);
  });
});
