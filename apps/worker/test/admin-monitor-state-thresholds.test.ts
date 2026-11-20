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

type MonitorPayload = {
  monitor: {
    id: number;
    failures_to_down_from_up: number | null;
    successes_to_up_from_down: number | null;
  };
};

describe('monitor state threshold overrides', () => {
  it('stores per-monitor thresholds and defaults them to null', async () => {
    const { database, request } = createApp();
    try {
      const custom = await request('/api/v1/admin/monitors', 'POST', {
        name: 'Custom thresholds',
        type: 'http',
        target: 'https://example.com/health',
        failures_to_down_from_up: 3,
        successes_to_up_from_down: 4,
      });
      expect(custom.status).toBe(201);
      const customBody = (await custom.json()) as MonitorPayload;
      expect(customBody.monitor.failures_to_down_from_up).toBe(3);
      expect(customBody.monitor.successes_to_up_from_down).toBe(4);

      const inherited = await request('/api/v1/admin/monitors', 'POST', {
        name: 'Inherits defaults',
        type: 'tcp',
        target: 'example.com:443',
      });
      expect(inherited.status).toBe(201);
      const inheritedBody = (await inherited.json()) as MonitorPayload;
      expect(inheritedBody.monitor.failures_to_down_from_up).toBeNull();
      expect(inheritedBody.monitor.successes_to_up_from_down).toBeNull();

      const list = await request('/api/v1/admin/monitors', 'GET');
      const listBody = (await list.json()) as {
        monitors: Array<{
          id: number;
          failures_to_down_from_up: number | null;
          successes_to_up_from_down: number | null;
        }>;
      };
      expect(
        listBody.monitors.map((monitor) => [
          monitor.failures_to_down_from_up,
          monitor.successes_to_up_from_down,
        ]),
      ).toEqual([
        [3, 4],
        [null, null],
      ]);
    } finally {
      database.close();
    }
  });

  it('updates and clears the override through patch', async () => {
    const { database, request } = createApp();
    try {
      const created = await request('/api/v1/admin/monitors', 'POST', {
        name: 'Patchable',
        type: 'http',
        target: 'https://example.com/health',
      });
      const monitorId = ((await created.json()) as MonitorPayload).monitor.id;

      const patched = await request(`/api/v1/admin/monitors/${monitorId}`, 'PATCH', {
        failures_to_down_from_up: 5,
      });
      expect(patched.status).toBe(200);
      const patchedBody = (await patched.json()) as MonitorPayload;
      expect(patchedBody.monitor.failures_to_down_from_up).toBe(5);
      expect(patchedBody.monitor.successes_to_up_from_down).toBeNull();

      const cleared = await request(`/api/v1/admin/monitors/${monitorId}`, 'PATCH', {
        failures_to_down_from_up: null,
      });
      expect(cleared.status).toBe(200);
      expect(
        ((await cleared.json()) as MonitorPayload).monitor.failures_to_down_from_up,
      ).toBeNull();

      const reread = await request('/api/v1/admin/monitors', 'GET');
      const rereadBody = (await reread.json()) as {
        monitors: Array<{
          id: number;
          failures_to_down_from_up: number | null;
          successes_to_up_from_down: number | null;
        }>;
      };
      expect(rereadBody.monitors.find((monitor) => monitor.id === monitorId)).toMatchObject({
        failures_to_down_from_up: null,
        successes_to_up_from_down: null,
      });
    } finally {
      database.close();
    }
  });

  it('rejects out-of-range thresholds on create and patch', async () => {
    const { database, request } = createApp();
    try {
      for (const value of [0, 11, 2.5, '3']) {
        const created = await request('/api/v1/admin/monitors', 'POST', {
          name: `Bad ${String(value)}`,
          type: 'http',
          target: 'https://example.com/health',
          failures_to_down_from_up: value,
        });
        expect(created.status).toBe(400);
      }

      const ok = await request('/api/v1/admin/monitors', 'POST', {
        name: 'Patch target',
        type: 'http',
        target: 'https://example.com/health',
      });
      const monitorId = ((await ok.json()) as MonitorPayload).monitor.id;

      const bad = await request(`/api/v1/admin/monitors/${monitorId}`, 'PATCH', {
        successes_to_up_from_down: 99,
      });
      expect(bad.status).toBe(400);
    } finally {
      database.close();
    }
  });
});
