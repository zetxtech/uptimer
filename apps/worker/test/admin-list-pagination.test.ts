import { readdirSync, readFileSync } from 'node:fs';
import { Hono } from 'hono';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../src/monitor/http', () => ({ runHttpCheck: vi.fn() }));
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

  database.exec(`
    INSERT INTO monitors (id, name, type, target, interval_sec)
    VALUES (1, 'API', 'http', 'https://api.example.test/health', 60),
           (2, 'Mail', 'tcp', 'mail.example.test:25', 60),
           (3, 'Web', 'http', 'https://web.example.test', 60);

    INSERT INTO incidents (id, title, status, impact, message, started_at, resolved_at)
    VALUES (1, 'Status 525', 'investigating', 'major', 'TLS handshake failed', 1700000100, NULL),
           (2, 'Mail latency', 'monitoring', 'minor', 'Delivery delays', 1700000200, NULL),
           (3, 'Old outage', 'resolved', 'minor', 'Recovered', 1700000000, 1700000300);

    INSERT INTO outages (id, monitor_id, started_at, ended_at, initial_error, last_error)
    VALUES (1, 1, 1700000100, NULL, 'Status 525', 'Status 525'),
           (2, 2, 1700000200, 1700000300, 'connection refused', 'timeout');
  `);

  const env = { DB: sqliteD1(database), ADMIN_TOKEN: 'test-admin' } as unknown as Env;
  const app = new Hono<{ Bindings: Env }>();
  app.onError(handleError);
  app.notFound(handleNotFound);
  app.route('/api/v1/admin', adminRoutes);

  const request = (path: string, method = 'GET', body?: unknown) =>
    app.fetch(
      new Request(`https://status.example.com/api/v1/admin${path}`, {
        method,
        headers: {
          Authorization: 'Bearer test-admin',
          ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      }),
      env,
      {
        waitUntil: () => {},
        passThroughOnException: () => {},
      } as unknown as ExecutionContext,
    );

  return { database, request };
}

describe('admin list pagination and search', () => {
  it('paginates monitors with offset and reports the next page', async () => {
    const { database, request } = createApp();
    try {
      const first = await request('/monitors?limit=2');
      const firstBody = (await first.json()) as {
        monitors: Array<{ id: number }>;
        next_offset: number | null;
      };
      expect(firstBody.monitors.map((monitor) => monitor.id)).toEqual([1, 2]);
      expect(firstBody.next_offset).toBe(2);

      const second = await request('/monitors?limit=2&offset=2');
      const secondBody = (await second.json()) as {
        monitors: Array<{ id: number }>;
        next_offset: number | null;
      };
      expect(secondBody.monitors.map((monitor) => monitor.id)).toEqual([3]);
      expect(secondBody.next_offset).toBeNull();
    } finally {
      database.close();
    }
  });

  it('paginates incidents and filters them on the server', async () => {
    const { database, request } = createApp();
    try {
      const first = await request('/incidents?limit=2');
      const firstBody = (await first.json()) as {
        incidents: Array<{ id: number }>;
        next_offset: number | null;
      };
      expect(firstBody.incidents.map((incident) => incident.id)).toEqual([2, 1]);
      expect(firstBody.next_offset).toBe(2);

      const second = await request('/incidents?limit=2&offset=2');
      const secondBody = (await second.json()) as {
        incidents: Array<{ id: number }>;
        next_offset: number | null;
      };
      expect(secondBody.incidents.map((incident) => incident.id)).toEqual([3]);
      expect(secondBody.next_offset).toBeNull();

      const searched = await request('/incidents?q=mail');
      const searchedBody = (await searched.json()) as { incidents: Array<{ id: number }> };
      expect(searchedBody.incidents.map((incident) => incident.id)).toEqual([2]);

      const resolved = await request('/incidents?status=resolved');
      const resolvedBody = (await resolved.json()) as { incidents: Array<{ id: number }> };
      expect(resolvedBody.incidents.map((incident) => incident.id)).toEqual([3]);
    } finally {
      database.close();
    }
  });

  it('filters events by monitor, target and error text', async () => {
    const { database, request } = createApp();
    try {
      const byMonitor = await request('/events?q=api.example');
      const byMonitorBody = (await byMonitor.json()) as { events: Array<{ id: number }> };
      expect(byMonitorBody.events.map((event) => event.id)).toEqual([1]);

      const byError = await request('/events?q=connection');
      const byErrorBody = (await byError.json()) as { events: Array<{ id: number }> };
      expect(byErrorBody.events.map((event) => event.id)).toEqual([2]);

      const none = await request('/events?q=does-not-exist');
      expect(((await none.json()) as { events: unknown[] }).events).toEqual([]);
    } finally {
      database.close();
    }
  });
});

describe('admin incident attachments', () => {
  it('stores an attachment on an update and serves it back', async () => {
    const { database, request } = createApp();
    try {
      const payload = Buffer.from('hello attachment').toString('base64');
      const created = await request(`/incidents/1/updates`, 'POST', {
        message: 'Attached the logs',
        attachments: [{ name: 'logs.txt', data: payload }],
      });
      expect(created.status).toBe(200);
      const createdBody = (await created.json()) as {
        update: { id: number; attachments: Array<{ name: string }> };
      };
      expect(createdBody.update.attachments).toEqual([{ name: 'logs.txt' }]);

      const detail = await request('/incidents/1');
      const detailBody = (await detail.json()) as {
        incident: { updates: Array<{ id: number; attachments?: Array<{ name: string }> }> };
      };
      expect(detailBody.incident.updates.at(-1)?.attachments).toEqual([{ name: 'logs.txt' }]);

      const download = await request(`/incidents/1/updates/${createdBody.update.id}/attachments/0`);
      expect(download.status).toBe(200);
      expect(await download.text()).toBe('hello attachment');

      const missing = await request(`/incidents/1/updates/${createdBody.update.id}/attachments/1`);
      expect(missing.status).toBe(404);
    } finally {
      database.close();
    }
  });

  it('rejects attachments that exceed the limit', async () => {
    const { database, request } = createApp();
    try {
      const big = Buffer.alloc(201 * 1024).toString('base64');
      const res = await request('/incidents/1/updates', 'POST', {
        message: 'Too big',
        attachments: [{ name: 'big.bin', data: big }],
      });
      expect(res.status).toBe(400);
    } finally {
      database.close();
    }
  });
});
