import { readFileSync } from 'node:fs';
import { Hono } from 'hono';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../src/monitor/tcp', () => ({ runTcpCheck: vi.fn() }));

import type { Env } from '../src/env';
import { handleError } from '../src/middleware/errors';
import { adminRoutes } from '../src/routes/admin';
import { DatabaseSync, sqliteD1 } from './helpers/sqlite-d1';

describe('admin probe health settings', () => {
  it('validates the threshold and gives a re-enabled probe a new grace period', async () => {
    const now = 1_800_000_000;
    vi.spyOn(Date, 'now').mockReturnValue(now * 1000);
    const database = new DatabaseSync(':memory:');
    database.exec(
      'CREATE TABLE monitors (id INTEGER PRIMARY KEY); CREATE TABLE check_results (id INTEGER PRIMARY KEY, checked_at INTEGER)',
    );
    database.exec(
      readFileSync(new URL('../migrations/0015_probe_regions.sql', import.meta.url), 'utf8'),
    );
    database.exec(
      readFileSync(new URL('../migrations/0017_probe_health.sql', import.meta.url), 'utf8'),
    );
    const env = { DB: sqliteD1(database), ADMIN_TOKEN: 'test-admin' } as Env;
    const app = new Hono<{ Bindings: Env }>();
    app.onError(handleError);
    app.route('/api/v1/admin', adminRoutes);
    const request = (path: string, method: string, body: unknown) =>
      app.request(
        path,
        {
          method,
          headers: { Authorization: 'Bearer test-admin', 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        },
        env,
      );

    try {
      const created = await request('/api/v1/admin/probes', 'POST', {
        id: 'cn',
        name: 'China',
        kind: 'edgeone',
        scope: 'domestic',
        region: 'cn',
        offline_after_sec: 600,
      });
      expect(created.status).toBe(201);
      expect(await created.json()).toMatchObject({
        probe: { offline_after_sec: 600, health_status: 'waiting' },
      });

      const invalid = await request('/api/v1/admin/probes/cn', 'PATCH', { offline_after_sec: 30 });
      expect(invalid.status).toBe(400);
      database.exec("UPDATE probes SET last_seen_at = 1799998000 WHERE id = 'cn'");
      database.exec("INSERT INTO probe_health_state VALUES ('cn', 'offline', 1, 1799999000)");
      database.exec(
        "INSERT INTO probe_health_events (event_key, probe_id, event_type, occurred_at, probe_name, scope, region) VALUES ('old', 'cn', 'probe.offline', 1799999000, 'China', 'domestic', 'cn')",
      );

      const disabled = await request('/api/v1/admin/probes/cn', 'PATCH', { is_enabled: false });
      expect(await disabled.json()).toMatchObject({ probe: { health_status: 'disabled' } });
      const enabled = await request('/api/v1/admin/probes/cn', 'PATCH', { is_enabled: true });
      expect(await enabled.json()).toMatchObject({ probe: { health_status: 'waiting' } });
      expect(database.prepare('SELECT * FROM probe_health_state').all()).toHaveLength(0);
      expect(database.prepare('SELECT * FROM probe_health_events').all()).toHaveLength(0);
    } finally {
      database.close();
      vi.restoreAllMocks();
    }
  });
});
