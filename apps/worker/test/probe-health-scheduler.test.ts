import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';

vi.mock('../src/scheduler/lock', () => ({
  acquireLease: vi.fn(async () => true),
  releaseLease: vi.fn(async () => undefined),
}));
vi.mock('../src/scheduler/notifications', () => ({
  createNotifyContext: vi.fn(),
}));
vi.mock('../src/notify/webhook', () => ({
  dispatchWebhookToChannels: vi.fn(async () => undefined),
}));

import type { Env } from '../src/env';
import { dispatchWebhookToChannels } from '../src/notify/webhook';
import { runProbeHealthChecks } from '../src/scheduler/probe-health';
import { createNotifyContext } from '../src/scheduler/notifications';
import { createFakeD1Database } from './helpers/fake-d1';
import { DatabaseSync, sqliteD1 } from './helpers/sqlite-d1';

type EventRow = {
  event_key: string;
  probe_id: string;
  event_type: string;
  occurred_at: number;
  last_seen_at: number | null;
  probe_name: string;
  scope: string;
  region: string;
  completed_at: number | null;
};

function setup() {
  const probe = {
    id: 'cn',
    is_enabled: 1,
    created_at: 1000,
    health_started_at: null as number | null,
    last_seen_at: 1100 as number | null,
    offline_after_sec: 900,
    status: 'online',
    version: 0,
  };
  const events: EventRow[] = [];
  let deliveryFailed = false;

  const db = createFakeD1Database([
    { match: 'insert or ignore into probe_health_state', run: () => 1 },
    { match: 'from probes p left join probe_health_state', all: () => [{ ...probe }] },
    {
      match: 'update probe_health_state',
      run: (args) => {
        probe.status = String(args[0]);
        probe.version += 1;
        return 1;
      },
    },
    {
      match: 'insert or ignore into probe_health_events',
      run: (args) => {
        events.push({
          event_key: String(args[0]),
          probe_id: probe.id,
          event_type: String(args[1]),
          occurred_at: Number(args[2]),
          last_seen_at: probe.last_seen_at,
          probe_name: 'China',
          scope: 'domestic',
          region: 'cn',
          completed_at: null,
        });
        return 1;
      },
    },
    {
      match: 'from probe_health_events e join probes p',
      all: () => events.filter((event) => event.completed_at === null),
    },
    { match: 'set last_attempt_at', run: () => 1 },
    {
      match: 'from notification_deliveries',
      all: () => (deliveryFailed ? [{ channel_id: 3, status: 'failed' }] : []),
    },
    {
      match: 'set completed_at',
      run: (args) => {
        const event = events.find((item) => item.event_key === args[0]);
        if (event) event.completed_at = Number(args[1]);
        return 1;
      },
    },
  ]);
  const env = { DB: db } as Env;
  const ctx = { waitUntil: vi.fn() } as unknown as ExecutionContext;
  return {
    probe,
    events,
    env,
    ctx,
    setDeliveryFailed: (value: boolean) => (deliveryFailed = value),
  };
}

describe('probe health scheduling', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(createNotifyContext).mockResolvedValue({
      ctx: {} as ExecutionContext,
      envRecord: {},
      channels: [{ id: 3, name: 'alerts', config: { preset: 'custom' }, created_at: 1 }],
    } as never);
  });

  it('does not acquire a lease when no probes are configured', async () => {
    const env = {
      DB: createFakeD1Database([
        { match: 'from probes p left join probe_health_state', all: () => [] },
      ]),
    } as Env;
    await runProbeHealthChecks(env, {} as ExecutionContext, 2000);
    const { acquireLease } = await import('../src/scheduler/lock');
    expect(acquireLease).not.toHaveBeenCalled();
    expect(createNotifyContext).not.toHaveBeenCalled();
  });

  it('emits one offline event and one recovery event across repeated scans', async () => {
    const { probe, events, env, ctx } = setup();

    await runProbeHealthChecks(env, ctx, 2000);
    await runProbeHealthChecks(env, ctx, 2060);
    expect(events.map((event) => event.event_type)).toEqual(['probe.offline']);
    expect(dispatchWebhookToChannels).toHaveBeenCalledTimes(1);

    probe.last_seen_at = 2100;
    await runProbeHealthChecks(env, ctx, 2100);
    await runProbeHealthChecks(env, ctx, 2160);
    expect(events.map((event) => event.event_type)).toEqual(['probe.offline', 'probe.online']);
    expect(dispatchWebhookToChannels).toHaveBeenCalledTimes(2);
    expect(events.every((event) => event.completed_at !== null)).toBe(true);
  });

  it('keeps failed deliveries pending and retries with the same event key', async () => {
    const { events, env, ctx, setDeliveryFailed } = setup();
    setDeliveryFailed(true);
    await runProbeHealthChecks(env, ctx, 2000);
    expect(events[0]?.completed_at).toBeNull();

    setDeliveryFailed(false);
    await runProbeHealthChecks(env, ctx, 2120);
    expect(events[0]?.completed_at).toBe(2120);
    expect(dispatchWebhookToChannels).toHaveBeenCalledTimes(2);
    expect(vi.mocked(dispatchWebhookToChannels).mock.calls[1]?.[0]).toMatchObject({
      eventKey: events[0]?.event_key,
      retryFailed: true,
    });
  });

  it('persists offline and recovery transitions against SQLite', async () => {
    const database = new DatabaseSync(':memory:');
    database.exec(`
      CREATE TABLE monitors (id INTEGER PRIMARY KEY);
      CREATE TABLE check_results (id INTEGER PRIMARY KEY, checked_at INTEGER);
      CREATE TABLE notification_deliveries (event_key TEXT, channel_id INTEGER, status TEXT);
    `);
    database.exec(
      readFileSync(new URL('../migrations/0015_probe_regions.sql', import.meta.url), 'utf8'),
    );
    database.exec(
      readFileSync(new URL('../migrations/0017_probe_health.sql', import.meta.url), 'utf8'),
    );
    database.exec(`
      INSERT INTO probes (id, name, kind, scope, region, token_sha256, created_at, updated_at, last_seen_at)
      VALUES ('cn', 'China', 'edgeone', 'domestic', 'cn', 'hash', 1000, 1000, 1100)
    `);
    const env = { DB: sqliteD1(database) } as Env;
    const ctx = { waitUntil: vi.fn() } as unknown as ExecutionContext;

    await runProbeHealthChecks(env, ctx, 2000);
    await runProbeHealthChecks(env, ctx, 2060);
    database.prepare('UPDATE probes SET last_seen_at = ? WHERE id = ?').run(2100, 'cn');
    await runProbeHealthChecks(env, ctx, 2100);
    await runProbeHealthChecks(env, ctx, 2160);

    expect(
      database.prepare('SELECT event_type FROM probe_health_events ORDER BY occurred_at').all(),
    ).toEqual([{ event_type: 'probe.offline' }, { event_type: 'probe.online' }]);
    expect(dispatchWebhookToChannels).toHaveBeenCalledTimes(2);
    database.close();
  });

  it('delivers an earlier failed offline event before its recovery event', async () => {
    const database = new DatabaseSync(':memory:');
    database.exec(`
      CREATE TABLE monitors (id INTEGER PRIMARY KEY);
      CREATE TABLE check_results (id INTEGER PRIMARY KEY, checked_at INTEGER);
      CREATE TABLE notification_deliveries (event_key TEXT, channel_id INTEGER, status TEXT);
    `);
    database.exec(
      readFileSync(new URL('../migrations/0015_probe_regions.sql', import.meta.url), 'utf8'),
    );
    database.exec(
      readFileSync(new URL('../migrations/0017_probe_health.sql', import.meta.url), 'utf8'),
    );
    database.exec(`
      INSERT INTO probes (id, name, kind, scope, region, token_sha256, created_at, updated_at, last_seen_at)
      VALUES ('cn', 'China', 'edgeone', 'domestic', 'cn', 'hash', 1000, 1000, 2100);
      INSERT INTO probe_health_state VALUES ('cn', 'offline', 1, 2000);
      INSERT INTO probe_health_events (event_key, probe_id, event_type, occurred_at, probe_name, scope, region)
      VALUES ('offline-event', 'cn', 'probe.offline', 2000, 'China', 'domestic', 'cn');
      INSERT INTO notification_deliveries VALUES ('offline-event', 3, 'failed');
    `);
    const env = { DB: sqliteD1(database) } as Env;
    const ctx = { waitUntil: vi.fn() } as unknown as ExecutionContext;

    await runProbeHealthChecks(env, ctx, 2100);
    expect(
      vi.mocked(dispatchWebhookToChannels).mock.calls.map((call) => call[0].eventType),
    ).toEqual(['probe.offline']);

    database.exec(
      "UPDATE notification_deliveries SET status = 'success' WHERE event_key = 'offline-event'",
    );
    await runProbeHealthChecks(env, ctx, 2160);
    await runProbeHealthChecks(env, ctx, 2220);
    expect(
      vi.mocked(dispatchWebhookToChannels).mock.calls.map((call) => call[0].eventType),
    ).toEqual(['probe.offline', 'probe.offline', 'probe.online']);
    database.close();
  });
});
