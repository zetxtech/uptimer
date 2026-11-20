import { afterEach, describe, expect, it, vi } from 'vitest';

import type { Env } from '../src/env';
import { adminAnalyticsRoutes } from '../src/routes/admin-analytics';
import { DatabaseSync, sqliteD1 } from './helpers/sqlite-d1';

describe('monitor analytics ranges', () => {
  afterEach(() => vi.restoreAllMocks());

  it('serves the one-hour range as rolling hourly data', async () => {
    const now = 1_800_000_000;
    vi.spyOn(Date, 'now').mockReturnValue(now * 1000);
    const database = new DatabaseSync(':memory:');
    database.exec(`
      CREATE TABLE monitors (
        id INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        type TEXT NOT NULL,
        interval_sec INTEGER NOT NULL,
        created_at INTEGER NOT NULL
      );
      INSERT INTO monitors VALUES (1, 'API', 'http', 60, ${now - 7200});
      CREATE TABLE outages (
        id INTEGER PRIMARY KEY,
        monitor_id INTEGER NOT NULL,
        started_at INTEGER NOT NULL,
        ended_at INTEGER
      );
      CREATE TABLE check_results (
        monitor_id INTEGER NOT NULL,
        checked_at INTEGER NOT NULL,
        status TEXT NOT NULL,
        latency_ms INTEGER
      );
      INSERT INTO check_results VALUES (1, ${now - 1800}, 'up', 42);
      CREATE TABLE probes (id TEXT PRIMARY KEY, region TEXT NOT NULL);
      CREATE TABLE probe_check_results (
        monitor_id INTEGER NOT NULL,
        probe_id TEXT NOT NULL,
        checked_at INTEGER NOT NULL
      );
    `);

    try {
      const response = await adminAnalyticsRoutes.request('/monitors/1?range=1h', {}, {
        DB: sqliteD1(database),
      } as Env);

      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({
        range: '1h',
        range_start_at: now - 3600,
        range_end_at: now,
        total_sec: 3600,
        points: [{ checked_at: now - 1800, status: 'up', latency_ms: 42 }],
      });
    } finally {
      database.close();
    }
  });
});
