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
        headers: {
          Authorization: 'Bearer test-admin',
          'Content-Type': 'application/json',
          ...(init.headers ?? {}),
        },
      }),
      env,
      { waitUntil: vi.fn() } as unknown as ExecutionContext,
    );

  return { database, request };
}

function insertMonitor(
  database: DatabaseSync,
  id: number,
  name: string,
  groupName: string | null,
  groupSortOrder = 0,
) {
  database
    .prepare(
      `
        INSERT INTO monitors (id, name, type, target, interval_sec, timeout_ms, group_name, group_sort_order, created_at, updated_at)
        VALUES (?, ?, 'http', ?, 60, 10000, ?, ?, 0, 0)
      `,
    )
    .run(id, name, `https://example.com/${id}`, groupName, groupSortOrder);
}

describe('monitor group rename and removal', () => {
  let app: ReturnType<typeof createApp>;

  beforeEach(() => {
    app = createApp();
    insertMonitor(app.database, 1, 'a', 'Production', 0);
    insertMonitor(app.database, 2, 'b', 'production', 0);
    insertMonitor(app.database, 3, 'c', 'Staging', 1);
    insertMonitor(app.database, 4, 'd', null, 2);
  });

  it('renames every monitor of the group, case-insensitively', async () => {
    const res = await app.request('/monitors/groups/rename', {
      method: 'POST',
      body: JSON.stringify({ from: 'prodUCTION', to: 'Platform' }),
    });
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({
      group_name: 'Platform',
      updated_monitors: 2,
    });

    const rows = app.database
      .prepare('SELECT group_name FROM monitors WHERE id IN (1, 2) ORDER BY id')
      .all() as Array<{ group_name: string | null }>;
    expect(rows.map((row) => row.group_name)).toEqual(['Platform', 'Platform']);
  });

  it('rejects renaming onto an existing different group', async () => {
    const res = await app.request('/monitors/groups/rename', {
      method: 'POST',
      body: JSON.stringify({ from: 'Production', to: 'Staging' }),
    });
    expect(res.status).toBe(409);
  });

  it('reports a missing group on rename', async () => {
    const res = await app.request('/monitors/groups/rename', {
      method: 'POST',
      body: JSON.stringify({ from: 'Nope', to: 'Other' }),
    });
    expect(res.status).toBe(404);
  });

  it('removes a group by moving its monitors to the default group', async () => {
    const res = await app.request('/monitors/groups/remove', {
      method: 'POST',
      body: JSON.stringify({ name: 'staging' }),
    });
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({ moved_monitors: 1 });

    const rows = app.database
      .prepare('SELECT group_name FROM monitors WHERE id = 3')
      .all() as Array<{ group_name: string | null }>;
    expect(rows[0]?.group_name ?? null).toBeNull();
  });

  it('validates input', async () => {
    const empty = await app.request('/monitors/groups/rename', {
      method: 'POST',
      body: JSON.stringify({ from: '  ', to: 'Other' }),
    });
    expect(empty.status).toBe(400);
  });
});
