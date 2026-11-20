import { readFileSync } from 'node:fs';
import { Hono } from 'hono';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../src/monitor/tcp', () => ({ runTcpCheck: vi.fn() }));

import type { Env } from '../src/env';
import { handleError } from '../src/middleware/errors';
import { adminRoutes } from '../src/routes/admin';
import { DatabaseSync, sqliteD1 } from './helpers/sqlite-d1';

function createApp() {
  const database = new DatabaseSync(':memory:');
  database.exec(`
    CREATE TABLE monitors (id INTEGER PRIMARY KEY, name TEXT NOT NULL);
    CREATE TABLE notification_channels (id INTEGER PRIMARY KEY, name TEXT NOT NULL);
  `);
  database.exec(
    readFileSync(new URL('../migrations/0018_notification_groups.sql', import.meta.url), 'utf8'),
  );
  database.exec(`
    INSERT INTO monitors (id, name) VALUES (1, 'API'), (2, 'Mail');
    INSERT INTO notification_channels (id, name) VALUES (10, 'Ops'), (11, 'On-call');
  `);
  const env = { DB: sqliteD1(database), ADMIN_TOKEN: 'test-admin' } as Env;
  const app = new Hono<{ Bindings: Env }>();
  app.onError(handleError);
  app.route('/api/v1/admin', adminRoutes);

  const request = (path: string, method: string, body?: unknown) =>
    app.request(
      path,
      {
        method,
        headers: { Authorization: 'Bearer test-admin', 'Content-Type': 'application/json' },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      },
      env,
    );

  return { database, request };
}

const baseGroup = {
  name: 'Operations',
  is_active: true,
  immediate_enabled: true,
  debounce_seconds: 0,
  digest_interval: 'none',
  monitor_ids: [1, 2],
  channel_ids: [10],
};

describe('admin notification groups', () => {
  it('creates a group with monitors and channels and lists it back', async () => {
    const { database, request } = createApp();
    try {
      const created = await request('/api/v1/admin/notification-groups', 'POST', baseGroup);
      expect(created.status).toBe(201);
      expect(await created.json()).toMatchObject({
        notification_group: { name: 'Operations', monitor_ids: [1, 2], channel_ids: [10] },
      });

      const list = await request('/api/v1/admin/notification-groups', 'GET');
      const body = (await list.json()) as { notification_groups: unknown[] };
      expect(body.notification_groups).toHaveLength(1);
    } finally {
      database.close();
    }
  });

  it('rejects unknown monitor and channel references', async () => {
    const { database, request } = createApp();
    try {
      const badMonitor = await request('/api/v1/admin/notification-groups', 'POST', {
        ...baseGroup,
        monitor_ids: [1, 999],
      });
      expect(badMonitor.status).toBe(400);

      const badChannel = await request('/api/v1/admin/notification-groups', 'POST', {
        ...baseGroup,
        channel_ids: [999],
      });
      expect(badChannel.status).toBe(400);
      expect(database.prepare('SELECT COUNT(*) AS c FROM notification_groups').get()).toMatchObject(
        { c: 0 },
      );
    } finally {
      database.close();
    }
  });

  it('updates memberships, quiet period and digest interval', async () => {
    const { database, request } = createApp();
    try {
      await request('/api/v1/admin/notification-groups', 'POST', baseGroup);
      const patched = await request('/api/v1/admin/notification-groups/1', 'PATCH', {
        debounce_seconds: 300,
        digest_interval: 'daily',
        monitor_ids: [2],
        channel_ids: [11],
      });
      expect(patched.status).toBe(200);
      expect(await patched.json()).toMatchObject({
        notification_group: {
          debounce_seconds: 300,
          digest_interval: 'daily',
          monitor_ids: [2],
          channel_ids: [11],
        },
      });

      const row = database
        .prepare(
          'SELECT next_digest_at AS n, debounce_due_at AS d FROM notification_groups WHERE id = 1',
        )
        .get() as { n: number | null; d: number | null };
      expect(row.n).toBeGreaterThan(0);
      expect(row.d).toBeNull();

      // Disabling the quiet period drops any accumulated events.
      database.exec(
        "INSERT INTO notification_group_pending_events (group_id, monitor_id, event_key, event_type, payload_json, insert_token, created_at) VALUES (1, 2, 'e', 'monitor.down', '{}', 't', 1)",
      );
      await request('/api/v1/admin/notification-groups/1', 'PATCH', { debounce_seconds: 0 });
      expect(
        database.prepare('SELECT COUNT(*) AS c FROM notification_group_pending_events').get(),
      ).toMatchObject({ c: 0 });
    } finally {
      database.close();
    }
  });

  it('deletes a group together with its queue and memberships', async () => {
    const { database, request } = createApp();
    try {
      await request('/api/v1/admin/notification-groups', 'POST', {
        ...baseGroup,
        debounce_seconds: 60,
      });
      database.exec(
        "INSERT INTO notification_group_pending_events (group_id, monitor_id, event_key, event_type, payload_json, insert_token, created_at) VALUES (1, 1, 'e', 'monitor.down', '{}', 't', 1)",
      );

      const deleted = await request('/api/v1/admin/notification-groups/1', 'DELETE');
      expect(deleted.status).toBe(200);
      expect(database.prepare('SELECT COUNT(*) AS c FROM notification_groups').get()).toMatchObject(
        { c: 0 },
      );
      expect(
        database.prepare('SELECT COUNT(*) AS c FROM notification_group_monitors').get(),
      ).toMatchObject({ c: 0 });
      expect(
        database.prepare('SELECT COUNT(*) AS c FROM notification_group_channels').get(),
      ).toMatchObject({ c: 0 });
      expect(
        database.prepare('SELECT COUNT(*) AS c FROM notification_group_pending_events').get(),
      ).toMatchObject({ c: 0 });

      expect((await request('/api/v1/admin/notification-groups/1', 'DELETE')).status).toBe(404);
    } finally {
      database.close();
    }
  });
});
