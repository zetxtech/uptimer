import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import type { Env } from '../src/env';
import {
  flushDueNotificationGroups,
  loadNotificationGroupRegistry,
  recordGroupEventsForMonitor,
  runDueNotificationGroupDigests,
  type GroupDispatchArgs,
} from '../src/notify/groups';
import { DatabaseSync, sqliteD1 } from './helpers/sqlite-d1';

const GROUP_MIGRATION = readFileSync(
  new URL('../migrations/0018_notification_groups.sql', import.meta.url),
  'utf8',
);

const CHANNEL_CONFIG = JSON.stringify({ preset: 'custom', url: 'https://example.com/hook' });

function createEnv(): { env: Env; database: InstanceType<typeof DatabaseSync> } {
  const database = new DatabaseSync(':memory:');
  database.exec(`
    CREATE TABLE locks (name TEXT PRIMARY KEY, expires_at INTEGER NOT NULL);
    CREATE TABLE monitors (
      id INTEGER PRIMARY KEY, name TEXT NOT NULL, target TEXT NOT NULL, display_url TEXT,
      sort_order INTEGER NOT NULL DEFAULT 0, is_active INTEGER NOT NULL DEFAULT 1
    );
    CREATE TABLE monitor_state (monitor_id INTEGER PRIMARY KEY, status TEXT NOT NULL, last_error TEXT);
    CREATE TABLE notification_channels (
      id INTEGER PRIMARY KEY, name TEXT NOT NULL, type TEXT NOT NULL DEFAULT 'webhook',
      config_json TEXT NOT NULL, is_active INTEGER NOT NULL DEFAULT 1, created_at INTEGER NOT NULL DEFAULT 0
    );
  `);
  database.exec(GROUP_MIGRATION);
  database.exec(`
    INSERT INTO monitors (id, name, target, display_url, sort_order) VALUES
      (1, 'API', 'https://api.example.com', 'https://api.example.com', 0),
      (2, 'Mail', 'https://mail.example.com', NULL, 1);
    INSERT INTO monitor_state (monitor_id, status, last_error) VALUES
      (1, 'down', 'timeout'), (2, 'up', NULL);
    INSERT INTO notification_channels (id, name, config_json) VALUES
      (10, 'Ops webhook', '${CHANNEL_CONFIG}'),
      (11, 'On-call webhook', '${CHANNEL_CONFIG}');
  `);
  return { env: { DB: sqliteD1(database), ADMIN_TOKEN: 'test' } as Env, database };
}

type GroupSeed = {
  name: string;
  isActive?: number;
  immediateEnabled?: number;
  debounceSeconds?: number;
  digestInterval?: 'none' | 'daily' | 'weekly';
  nextDigestAt?: number | null;
  monitorIds: number[];
  channelIds: number[];
};

function createGroup(database: InstanceType<typeof DatabaseSync>, seed: GroupSeed): number {
  const result = database
    .prepare(
      `INSERT INTO notification_groups (
        creation_token, name, is_active, immediate_enabled, debounce_seconds, digest_interval, next_digest_at, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 0, 0)`,
    )
    .run(
      `token-${seed.name}`,
      seed.name,
      seed.isActive ?? 1,
      seed.immediateEnabled ?? 1,
      seed.debounceSeconds ?? 0,
      seed.digestInterval ?? 'none',
      seed.nextDigestAt ?? null,
    );
  const groupId = Number(result.lastInsertRowid);
  for (const monitorId of seed.monitorIds) {
    database
      .prepare('INSERT INTO notification_group_monitors (group_id, monitor_id) VALUES (?, ?)')
      .run(groupId, monitorId);
  }
  for (const channelId of seed.channelIds) {
    database
      .prepare('INSERT INTO notification_group_channels (group_id, channel_id) VALUES (?, ?)')
      .run(groupId, channelId);
  }
  return groupId;
}

function monitorEvent(
  overrides: Partial<Parameters<typeof recordGroupEventsForMonitor>[1][number]> = {},
) {
  return {
    monitorId: 1,
    eventKey: 'monitor:1:down:1000',
    eventType: 'monitor.down' as const,
    payload: {
      event: 'monitor.down',
      monitor: { id: 1, name: 'API', display_url: 'https://api.example.com' },
    },
    at: 1000,
    ...overrides,
  };
}

function spyDispatch() {
  const calls: GroupDispatchArgs[] = [];
  return {
    calls,
    dispatch: async (args: GroupDispatchArgs) => {
      calls.push(args);
    },
  };
}

function dueAt(database: InstanceType<typeof DatabaseSync>, groupId: number): number | null {
  const row = database
    .prepare('SELECT debounce_due_at AS due FROM notification_groups WHERE id = ?')
    .get(groupId) as { due: number | null } | undefined;
  return row?.due ?? null;
}

describe('notification groups', () => {
  it('sends immediately when debounce is disabled', async () => {
    const { env, database } = createEnv();
    const groupId = createGroup(database, { name: 'Ops', monitorIds: [1], channelIds: [10] });
    const { calls, dispatch } = spyDispatch();

    await recordGroupEventsForMonitor(env, [monitorEvent()], { dispatch });

    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({
      groupId,
      eventType: 'monitor.down',
      eventKey: 'group:1:monitor:1:down:1000',
    });
    expect(
      database.prepare('SELECT COUNT(*) AS c FROM notification_group_pending_events').get(),
    ).toMatchObject({ c: 0 });
    database.close();
  });

  it('accumulates events and resets the quiet period on every new event', async () => {
    const { env, database } = createEnv();
    createGroup(database, {
      name: 'Ops',
      debounceSeconds: 300,
      monitorIds: [1, 2],
      channelIds: [10],
    });
    const { calls, dispatch } = spyDispatch();

    await recordGroupEventsForMonitor(env, [monitorEvent()], { dispatch });
    expect(dueAt(database, 1)).toBe(1300);

    await recordGroupEventsForMonitor(
      env,
      [monitorEvent({ monitorId: 2, eventKey: 'monitor:2:down:1200', at: 1200 })],
      { dispatch },
    );
    expect(dueAt(database, 1)).toBe(1500);
    expect(calls).toHaveLength(0);
    expect(
      database.prepare('SELECT COUNT(*) AS c FROM notification_group_pending_events').get(),
    ).toMatchObject({ c: 2 });

    // Not due yet: nothing is flushed.
    expect(await flushDueNotificationGroups(env, 1499, dispatch)).toBe(0);
    expect(calls).toHaveLength(0);

    expect(await flushDueNotificationGroups(env, 1500, dispatch)).toBe(1);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({ groupId: 1, eventType: 'group.batch', channelIds: [10] });
    expect((calls[0]!.payload as { summary: string }).summary).toContain('2 event(s)');
    expect(
      database.prepare('SELECT COUNT(*) AS c FROM notification_group_pending_events').get(),
    ).toMatchObject({ c: 0 });
    expect(
      database.prepare('SELECT COUNT(*) AS c FROM notification_group_batches').get(),
    ).toMatchObject({ c: 1 });
    expect(dueAt(database, 1)).toBeNull();
    database.close();
  });

  it('keeps events that arrive after a batch was read and delivers them in the next batch', async () => {
    const { env, database } = createEnv();
    createGroup(database, { name: 'Ops', debounceSeconds: 300, monitorIds: [1], channelIds: [10] });
    const { calls, dispatch } = spyDispatch();

    await recordGroupEventsForMonitor(env, [monitorEvent()], { dispatch });
    await flushDueNotificationGroups(env, 1300, dispatch);
    expect(calls).toHaveLength(1);

    // A new event during/after the flush restarts the quiet period and must not be lost.
    await recordGroupEventsForMonitor(
      env,
      [
        monitorEvent({
          eventKey: 'monitor:1:up:1400',
          eventType: 'monitor.up',
          at: 1400,
          payload: { event: 'monitor.up', monitor: { id: 1, name: 'API' } },
        }),
      ],
      { dispatch },
    );
    expect(dueAt(database, 1)).toBe(1700);
    await flushDueNotificationGroups(env, 1700, dispatch);

    expect(calls).toHaveLength(2);
    const second = calls[1]!.payload as { events: Array<{ event: string }> };
    expect(second.events).toHaveLength(1);
    expect(second.events[0]!.event).toBe('monitor.up');
    database.close();
  });

  it('ignores inactive groups, unowned monitors and groups without channels', async () => {
    const { env, database } = createEnv();
    createGroup(database, { name: 'Inactive', isActive: 0, monitorIds: [1], channelIds: [10] });
    createGroup(database, { name: 'No channels', monitorIds: [1], channelIds: [] });
    createGroup(database, { name: 'Unrelated', monitorIds: [2], channelIds: [10] });
    const { calls, dispatch } = spyDispatch();

    await recordGroupEventsForMonitor(env, [monitorEvent()], { dispatch });
    expect(calls).toHaveLength(0);
    database.close();
  });

  it('fans out to every group that owns the monitor', async () => {
    const { env, database } = createEnv();
    createGroup(database, { name: 'Ops', monitorIds: [1], channelIds: [10] });
    createGroup(database, { name: 'On-call', monitorIds: [1], channelIds: [11] });
    const { calls, dispatch } = spyDispatch();

    await recordGroupEventsForMonitor(env, [monitorEvent()], { dispatch });
    expect(calls.map((call) => [call.groupId, call.channelIds])).toEqual([
      [1, [10]],
      [2, [11]],
    ]);
    database.close();
  });

  it('loads a registry that only contains monitors owned by active groups', async () => {
    const { env, database } = createEnv();
    createGroup(database, { name: 'Ops', monitorIds: [1], channelIds: [10] });
    createGroup(database, { name: 'Inactive', isActive: 0, monitorIds: [2], channelIds: [10] });

    const registry = await loadNotificationGroupRegistry(env.DB);
    expect([...registry.keys()]).toEqual([1]);
    expect(registry.get(1)?.[0]).toMatchObject({ name: 'Ops', debounceSeconds: 0 });
    expect(await loadNotificationGroupRegistry(env.DB)).toBeInstanceOf(Map);
    database.close();
  });

  it('sends a digest only when the group has failing monitors', async () => {
    const { env, database } = createEnv();
    createGroup(database, {
      name: 'Daily',
      immediateEnabled: 0,
      digestInterval: 'daily',
      nextDigestAt: 900,
      monitorIds: [1, 2],
      channelIds: [10],
    });
    const { calls, dispatch } = spyDispatch();

    // Not due yet.
    expect(await runDueNotificationGroupDigests(env, 899, dispatch)).toBe(0);
    expect(calls).toHaveLength(0);

    expect(await runDueNotificationGroupDigests(env, 900, dispatch)).toBe(1);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({ groupId: 1, eventType: 'group.digest' });
    expect((calls[0]!.payload as { summary: string }).summary).toContain('API');
    expect(
      database.prepare('SELECT next_digest_at AS n FROM notification_groups WHERE id = 1').get(),
    ).toMatchObject({ n: 87_300 });

    // 87300 is the next daily due time; with everything healthy no message is sent.
    database.exec("UPDATE monitor_state SET status = 'up' WHERE monitor_id = 1");
    expect(await runDueNotificationGroupDigests(env, 87_300, dispatch)).toBe(0);
    expect(calls).toHaveLength(1);
    database.close();
  });

  it('skips paused monitors in a digest but still advances the schedule', async () => {
    const { env, database } = createEnv();
    createGroup(database, {
      name: 'Daily',
      immediateEnabled: 0,
      digestInterval: 'weekly',
      nextDigestAt: 100,
      monitorIds: [1],
      channelIds: [10],
    });
    database.exec("UPDATE monitor_state SET status = 'paused' WHERE monitor_id = 1");
    const { calls, dispatch } = spyDispatch();

    expect(await runDueNotificationGroupDigests(env, 100, dispatch)).toBe(0);
    expect(calls).toHaveLength(0);
    expect(
      database.prepare('SELECT next_digest_at AS n FROM notification_groups WHERE id = 1').get(),
    ).toMatchObject({ n: 100 + 604_800 });
    database.close();
  });
});
