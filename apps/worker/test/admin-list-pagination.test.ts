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
  // The fixture tests manual incident pagination while automatic outage-to-incident
  // integration is covered independently by outage-incident-bridge.test.ts.
  database.exec(`
    DELETE FROM incident_monitors WHERE incident_id IN
      (SELECT id FROM incidents WHERE outage_id IS NOT NULL);
    DELETE FROM incidents WHERE outage_id IS NOT NULL;
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
        total_count: number;
      };
      expect(firstBody.incidents.map((incident) => incident.id)).toEqual([2, 1]);
      expect(firstBody.next_offset).toBe(2);
      expect(firstBody.total_count).toBe(3);

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

  it('keeps complete similar incident groups on one page', async () => {
    const { database, request } = createApp();
    try {
      database.exec(`
        INSERT INTO incidents (id, title, status, impact, started_at, similar_group_id)
        VALUES (4, 'Same outage later', 'investigating', 'major', 1700009999, 1);
        UPDATE incidents SET similar_group_id = 1 WHERE id = 1;
      `);
      const first = await request('/incidents?group_similar=1&limit=1');
      const firstBody = (await first.json()) as {
        incidents: Array<{ id: number; similar_group_id: number | null }>;
        next_offset: number | null;
        total_count: number;
      };
      expect(firstBody.incidents.map((incident) => incident.id)).toEqual([4, 1]);
      expect(firstBody.total_count).toBe(3);
      expect(firstBody.next_offset).toBe(1);

      const second = await request('/incidents?group_similar=1&limit=1&offset=1');
      const secondBody = (await second.json()) as {
        incidents: Array<{ id: number }>;
        total_count: number;
      };
      expect(secondBody.incidents.map((incident) => incident.id)).toEqual([2]);
      expect(secondBody.total_count).toBe(3);
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

describe('admin incident selection actions', () => {
  it('acknowledges unresolved incidents idempotently without changing lifecycle status', async () => {
    const { database, request } = createApp();
    try {
      const res = await request('/incidents/acknowledge', 'POST', { incident_ids: [1, 2] });
      expect(res.status).toBe(200);
      const body = (await res.json()) as { acknowledged_at: number; incident_ids: number[] };
      expect(body.incident_ids).toEqual([1, 2]);

      const firstAck = database
        .prepare('SELECT acknowledged_at FROM incidents WHERE id = 1')
        .get() as { acknowledged_at: number | null };
      expect(firstAck.acknowledged_at).toBe(body.acknowledged_at);

      await request('/incidents/acknowledge', 'POST', { incident_ids: [1, 2] });
      const afterRepeat = database
        .prepare('SELECT acknowledged_at FROM incidents WHERE id = 1')
        .get() as { acknowledged_at: number | null };
      expect(afterRepeat.acknowledged_at).toBe(body.acknowledged_at);

      const acknowledgedList = await request('/incidents?limit=10');
      const listBody = (await acknowledgedList.json()) as {
        incidents: Array<{ id: number; status: string; acknowledged_at: number | null }>;
      };
      expect(listBody.incidents.find((incident) => incident.id === 1)).toMatchObject({
        status: 'investigating',
        acknowledged_at: body.acknowledged_at,
      });
      expect(listBody.incidents.find((incident) => incident.id === 3)?.acknowledged_at).toBeNull();
    } finally {
      database.close();
    }
  });

  it('groups incidents as similar, merges prior groups, and ungroups the whole set', async () => {
    const { database, request } = createApp();
    try {
      const first = await request('/incidents/group-similar', 'POST', { incident_ids: [1, 2] });
      expect(first.status).toBe(200);
      const firstBody = (await first.json()) as {
        similar_group_id: number;
        incident_ids: number[];
      };
      expect(firstBody).toEqual({ similar_group_id: 1, incident_ids: [1, 2] });

      const merge = await request('/incidents/group-similar', 'POST', { incident_ids: [2, 3] });
      expect(merge.status).toBe(200);
      const mergeBody = (await merge.json()) as {
        similar_group_id: number;
        incident_ids: number[];
      };
      expect(mergeBody).toEqual({ similar_group_id: 1, incident_ids: [1, 2, 3] });

      const groupList = await request('/incidents?similar_group_id=1&limit=10');
      const groupListBody = (await groupList.json()) as { incidents: Array<{ id: number }> };
      expect(groupListBody.incidents.map((incident) => incident.id).sort()).toEqual([1, 2, 3]);

      const detail = await request('/incidents/3');
      const detailBody = (await detail.json()) as {
        incident: { similar_group_id: number | null };
      };
      expect(detailBody.incident.similar_group_id).toBe(1);

      const ungrouped = await request('/incidents/2/ungroup', 'POST');
      expect(ungrouped.status).toBe(200);
      expect(((await ungrouped.json()) as { incident_ids: number[] }).incident_ids).toEqual([
        1, 2, 3,
      ]);
      const list = await request('/incidents?limit=10');
      const listBody = (await list.json()) as {
        incidents: Array<{ similar_group_id: number | null }>;
      };
      expect(listBody.incidents.every((incident) => incident.similar_group_id === null)).toBe(true);
    } finally {
      database.close();
    }
  });

  it('removes every incident in a similar group', async () => {
    const { database, request } = createApp();
    try {
      await request('/incidents/group-similar', 'POST', { incident_ids: [1, 2] });
      const removed = await request('/incidents/similar-groups/1', 'DELETE');
      expect(removed.status).toBe(200);
      expect(((await removed.json()) as { incident_ids: number[] }).incident_ids).toEqual([1, 2]);
      expect(
        database.prepare('SELECT COUNT(*) AS count FROM incidents').get() as { count: number },
      ).toMatchObject({ count: 1 });
    } finally {
      database.close();
    }
  });

  it('clears a stale group marker when only one incident remains', async () => {
    const { database, request } = createApp();
    try {
      await request('/incidents/group-similar', 'POST', { incident_ids: [1, 2] });
      const removed = await request('/incidents/1', 'DELETE');
      expect(removed.status).toBe(200);

      const detail = await request('/incidents/2');
      const detailBody = (await detail.json()) as {
        incident: { similar_group_id: number | null };
      };
      expect(detailBody.incident.similar_group_id).toBeNull();
    } finally {
      database.close();
    }
  });

  it('rejects an acknowledge request containing a missing incident without partial writes', async () => {
    const { database, request } = createApp();
    try {
      const res = await request('/incidents/acknowledge', 'POST', { incident_ids: [1, 999] });
      expect(res.status).toBe(404);
      const row = database.prepare('SELECT acknowledged_at FROM incidents WHERE id = 1').get() as {
        acknowledged_at: number | null;
      };
      expect(row.acknowledged_at).toBeNull();
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
