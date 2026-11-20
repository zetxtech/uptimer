import { parseDbJson, webhookChannelConfigSchema } from '@uptimer/db/json';

import type { Env } from '../env';
import type { WebhookChannel } from './webhook';

export type GroupMonitorEventType = 'monitor.down' | 'monitor.up';

export type GroupMonitorEvent = {
  monitorId: number;
  eventKey: string;
  eventType: GroupMonitorEventType;
  payload: unknown;
  at: number;
};

export type GroupDispatchArgs = {
  groupId: number;
  channelIds: number[];
  eventType: string;
  eventKey: string;
  payload: unknown;
};

export type GroupDispatchFn = (args: GroupDispatchArgs) => Promise<void>;

export type NotificationGroupSummary = {
  id: number;
  name: string;
  immediateEnabled: boolean;
  debounceSeconds: number;
  digestInterval: 'none' | 'daily' | 'weekly';
};

export type NotificationGroupRegistry = Map<number, NotificationGroupSummary[]>;

const PENDING_EVENTS_PER_BATCH = 100;
const MAX_GROUPS_PER_TICK = 25;
const MAX_REGISTRY_ROWS = 20000;
const GROUP_BATCH_RETENTION_SECONDS = 7 * 86400;

type GroupRow = {
  id: number;
  name: string;
  immediate_enabled: number;
  debounce_seconds: number;
  digest_interval: 'none' | 'daily' | 'weekly';
};

type PendingEventRow = {
  id: number;
  monitor_id: number;
  event_key: string;
  event_type: GroupMonitorEventType;
  payload_json: string;
  created_at: number;
};

type DownMonitorRow = {
  id: number;
  name: string;
  target: string;
  display_url: string | null;
  last_error: string | null;
};

type ChannelRow = { id: number; name: string; config_json: string };

function monitorLabel(monitor: {
  name: string;
  display_url?: string | null;
  target?: string;
}): string {
  const detail = monitor.display_url ?? monitor.target ?? '';
  return detail ? `${monitor.name} (${detail})` : monitor.name;
}

function describeEvent(eventType: string): string {
  return eventType === 'monitor.down' ? 'DOWN' : eventType === 'monitor.up' ? 'UP' : eventType;
}

export function buildBatchSummary(
  groupName: string,
  events: Array<{ event_type: string; payload_json: string }>,
): string {
  const lines = events.map((event, index) => {
    let monitor: { name?: string; display_url?: string | null; target?: string } = {};
    try {
      const parsed = JSON.parse(event.payload_json) as { monitor?: typeof monitor };
      monitor = parsed?.monitor ?? {};
    } catch {
      monitor = {};
    }
    const label = monitorLabel({
      name: monitor.name ?? `#${index + 1}`,
      ...(monitor.display_url ? { display_url: monitor.display_url } : {}),
      ...(monitor.target ? { target: monitor.target } : {}),
    });
    return `- [${describeEvent(event.event_type)}] ${label}`;
  });
  return `Uptimer group "${groupName}": ${events.length} event(s)\n${lines.join('\n')}`;
}

export function buildDigestSummary(
  groupName: string,
  interval: string,
  monitors: DownMonitorRow[],
): string {
  const lines = monitors.map((monitor) => {
    const label = monitorLabel(monitor);
    return `- ${label}${monitor.last_error ? `: ${monitor.last_error}` : ''}`;
  });
  return `Uptimer ${interval} digest "${groupName}": ${monitors.length} monitor(s) down\n${lines.join('\n')}`;
}

async function loadGroupChannels(db: D1Database, channelIds: number[]): Promise<WebhookChannel[]> {
  const ids = [...new Set(channelIds)];
  if (ids.length === 0) return [];

  const channels: WebhookChannel[] = [];
  for (let offset = 0; offset < ids.length; offset += 90) {
    const chunk = ids.slice(offset, offset + 90);
    const placeholders = chunk.map((_, index) => `?${index + 1}`).join(', ');
    const { results } = await db
      .prepare(
        `SELECT id, name, config_json FROM notification_channels WHERE is_active = 1 AND id IN (${placeholders}) ORDER BY id`,
      )
      .bind(...chunk)
      .all<ChannelRow>();
    for (const row of results ?? []) {
      channels.push({
        id: row.id,
        name: row.name,
        config: parseDbJson(webhookChannelConfigSchema, row.config_json, { field: 'config_json' }),
      });
    }
  }
  return channels;
}

export function createGroupDispatch(env: Env): GroupDispatchFn {
  return async (args) => {
    const channels = await loadGroupChannels(env.DB, args.channelIds);
    if (channels.length === 0) return;
    const { dispatchWebhookToChannels } = await import('./webhook');
    await dispatchWebhookToChannels({
      db: env.DB,
      env: env as unknown as Record<string, unknown>,
      channels,
      eventType: args.eventType,
      eventKey: args.eventKey,
      payload: args.payload,
    });
  };
}

async function listGroupsForMonitor(db: D1Database, monitorId: number): Promise<GroupRow[]> {
  const { results } = await db
    .prepare(
      `
      SELECT g.id, g.name, g.immediate_enabled, g.debounce_seconds, g.digest_interval
      FROM notification_groups g
      JOIN notification_group_monitors m ON m.group_id = g.id
      WHERE m.monitor_id = ?1 AND g.is_active = 1
      ORDER BY g.id
    `,
    )
    .bind(monitorId)
    .all<GroupRow>();
  return results ?? [];
}

// Kept for callers that need a fresh membership lookup outside the scheduler tick path.
export async function listActiveGroupsForMonitor(
  db: D1Database,
  monitorId: number,
): Promise<NotificationGroupSummary[]> {
  const rows = await listGroupsForMonitor(db, monitorId);
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    immediateEnabled: Boolean(row.immediate_enabled),
    debounceSeconds: row.debounce_seconds,
    digestInterval: row.digest_interval,
  }));
}

async function listGroupChannelIds(db: D1Database, groupId: number): Promise<number[]> {
  const { results } = await db
    .prepare(
      'SELECT channel_id AS id FROM notification_group_channels WHERE group_id = ?1 ORDER BY channel_id',
    )
    .bind(groupId)
    .all<{ id: number }>();
  return (results ?? []).map((row) => row.id);
}

// Loads every active group together with the monitors it owns, so the scheduler can decide
// per monitor whether group handling is needed without an extra query per event.
export async function loadNotificationGroupRegistry(
  db: D1Database,
): Promise<NotificationGroupRegistry> {
  let results: Array<GroupRow & { monitor_id: number }> = [];
  try {
    const response = await db
      .prepare(
        `
        SELECT g.id, g.name, g.immediate_enabled, g.debounce_seconds, g.digest_interval, m.monitor_id
        FROM notification_groups g
        JOIN notification_group_monitors m ON m.group_id = g.id
        WHERE g.is_active = 1
        ORDER BY g.id, m.monitor_id
        LIMIT ?1
      `,
      )
      .bind(MAX_REGISTRY_ROWS)
      .all<GroupRow & { monitor_id: number }>();
    results = response.results ?? [];
  } catch (error) {
    // A missing table (un-migrated database, test double) must not affect normal alerting.
    console.warn('notify: notification group registry unavailable', error);
    return new Map();
  }

  const registry: NotificationGroupRegistry = new Map();
  for (const row of results) {
    const summary: NotificationGroupSummary = {
      id: row.id,
      name: row.name,
      immediateEnabled: Boolean(row.immediate_enabled),
      debounceSeconds: row.debounce_seconds,
      digestInterval: row.digest_interval,
    };
    const existing = registry.get(row.monitor_id);
    if (existing) {
      existing.push(summary);
    } else {
      registry.set(row.monitor_id, [summary]);
    }
  }
  return registry;
}

// Records monitor events for every group that owns the monitor.
// - debounce_seconds = 0 + immediate_enabled -> dispatch right away
// - debounce_seconds > 0 -> append to the persistent queue and reset the quiet period
//
// The quiet period is deliberately reset (moved forward) on every new event, matching the
// "accumulate until traffic stops" behaviour.
export async function recordGroupEventsForMonitor(
  env: Env,
  events: GroupMonitorEvent[],
  options: {
    dispatch?: GroupDispatchFn;
    groupsByMonitor?: NotificationGroupRegistry;
  } = {},
): Promise<void> {
  if (events.length === 0) return;

  const registry = options.groupsByMonitor ?? (await loadNotificationGroupRegistry(env.DB));
  if (registry.size === 0) return;

  const dispatch = options.dispatch ?? createGroupDispatch(env);

  for (const event of events) {
    const groups = registry.get(event.monitorId) ?? [];
    if (groups.length === 0) continue;

    for (const group of groups) {
      if (group.debounceSeconds > 0) {
        await env.DB.batch([
          env.DB.prepare(
            `
            INSERT OR IGNORE INTO notification_group_pending_events (
              group_id, monitor_id, event_key, event_type, payload_json, insert_token, created_at
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
          `,
          ).bind(
            group.id,
            event.monitorId,
            event.eventKey,
            event.eventType,
            JSON.stringify(event.payload ?? null),
            crypto.randomUUID(),
            event.at,
          ),
          env.DB.prepare(
            'UPDATE notification_groups SET debounce_due_at = ?1 + debounce_seconds, updated_at = ?1 WHERE id = ?2',
          ).bind(event.at, group.id),
        ]);
        continue;
      }

      if (!group.immediateEnabled) continue;
      const channelIds = await listGroupChannelIds(env.DB, group.id);
      if (channelIds.length === 0) continue;
      await dispatch({
        groupId: group.id,
        channelIds,
        eventType: event.eventType,
        eventKey: `group:${group.id}:${event.eventKey}`,
        payload: event.payload,
      });
    }
  }
}

async function claimDueDebounceGroups(db: D1Database, now: number): Promise<GroupRow[]> {
  const { results } = await db
    .prepare(
      `
      SELECT id, name, immediate_enabled, debounce_seconds, digest_interval
      FROM notification_groups
      WHERE is_active = 1 AND debounce_seconds > 0 AND debounce_due_at IS NOT NULL AND debounce_due_at <= ?1
      ORDER BY debounce_due_at ASC, id ASC
      LIMIT ?2
    `,
    )
    .bind(now, MAX_GROUPS_PER_TICK)
    .all<GroupRow>();

  const claimed: GroupRow[] = [];
  for (const group of results ?? []) {
    const updated = await db
      .prepare(
        'UPDATE notification_groups SET debounce_due_at = NULL, updated_at = ?2 WHERE id = ?1 AND debounce_due_at IS NOT NULL AND debounce_due_at <= ?2',
      )
      .bind(group.id, now)
      .run();
    if ((updated.meta?.changes ?? 0) > 0) claimed.push(group);
  }
  return claimed;
}

async function flushGroupDebounce(
  db: D1Database,
  group: GroupRow,
  now: number,
  dispatch: GroupDispatchFn,
): Promise<void> {
  const { results } = await db
    .prepare(
      `
      SELECT id, monitor_id, event_key, event_type, payload_json, created_at
      FROM notification_group_pending_events
      WHERE group_id = ?1
      ORDER BY id
      LIMIT ?2
    `,
    )
    .bind(group.id, PENDING_EVENTS_PER_BATCH)
    .all<PendingEventRow>();

  const pending = results ?? [];
  if (pending.length === 0) return;

  // Delete exactly the events we read. Events inserted after this read have higher ids and
  // survive (and reset the quiet period again), so nothing is lost to a racing insert.
  const maxId = pending[pending.length - 1]!.id;
  const summary = buildBatchSummary(group.name, pending);
  const batchId = `group-batch:${group.id}:${crypto.randomUUID()}`;
  const payload = {
    event: 'group.batch',
    event_id: batchId,
    timestamp: now,
    group: { id: group.id, name: group.name },
    summary,
    events: pending.map((event) => {
      try {
        return JSON.parse(event.payload_json) as unknown;
      } catch {
        return null;
      }
    }),
  };

  const memberships = await listGroupChannelIds(db, group.id);
  await db.batch([
    db
      .prepare('DELETE FROM notification_group_pending_events WHERE group_id = ?1 AND id <= ?2')
      .bind(group.id, maxId),
    db
      .prepare('DELETE FROM notification_group_batches WHERE group_id = ?1 AND created_at < ?2')
      .bind(group.id, now - GROUP_BATCH_RETENTION_SECONDS),
    db
      .prepare(
        'INSERT INTO notification_group_batches (id, group_id, event_type, payload_json, created_at) VALUES (?1, ?2, ?3, ?4, ?5)',
      )
      .bind(batchId, group.id, 'group.batch', JSON.stringify(payload), now),
  ]);

  if (memberships.length === 0) return;
  await dispatch({
    groupId: group.id,
    channelIds: memberships,
    eventType: 'group.batch',
    eventKey: batchId,
    payload,
  });
}

export async function flushDueNotificationGroups(
  env: Env,
  now: number,
  dispatch: GroupDispatchFn = createGroupDispatch(env),
): Promise<number> {
  const groups = await claimDueDebounceGroups(env.DB, now);
  for (const group of groups) {
    try {
      await flushGroupDebounce(env.DB, group, now, dispatch);
    } catch (error) {
      console.error(`notify: failed to flush group ${group.id}`, error);
    }
  }
  return groups.length;
}

async function listDownMonitors(db: D1Database, groupId: number): Promise<DownMonitorRow[]> {
  const { results } = await db
    .prepare(
      `
      SELECT m.id, m.name, m.target, m.display_url, s.last_error
      FROM notification_group_monitors gm
      JOIN monitors m ON m.id = gm.monitor_id
      LEFT JOIN monitor_state s ON s.monitor_id = m.id
      WHERE gm.group_id = ?1 AND m.is_active = 1 AND s.status = 'down'
      ORDER BY m.sort_order, m.id
      LIMIT 200
    `,
    )
    .bind(groupId)
    .all<DownMonitorRow>();
  return results ?? [];
}

async function claimDueDigestGroups(db: D1Database, now: number): Promise<GroupRow[]> {
  const { results } = await db
    .prepare(
      `
      SELECT id, name, immediate_enabled, debounce_seconds, digest_interval
      FROM notification_groups
      WHERE is_active = 1 AND digest_interval IN ('daily', 'weekly') AND next_digest_at IS NOT NULL AND next_digest_at <= ?1
      ORDER BY next_digest_at ASC, id ASC
      LIMIT ?2
    `,
    )
    .bind(now, MAX_GROUPS_PER_TICK)
    .all<GroupRow>();

  const claimed: GroupRow[] = [];
  for (const group of results ?? []) {
    const interval = group.digest_interval === 'daily' ? 86400 : 604800;
    const updated = await db
      .prepare(
        'UPDATE notification_groups SET next_digest_at = ?3, updated_at = ?2 WHERE id = ?1 AND next_digest_at IS NOT NULL AND next_digest_at <= ?2',
      )
      .bind(group.id, now, now + interval)
      .run();
    if ((updated.meta?.changes ?? 0) > 0) claimed.push(group);
  }
  return claimed;
}

// Sends a digest only when the group currently has failing monitors. When everything is healthy
// the run is a no-op apart from advancing the schedule, so admin inboxes stay quiet.
export async function runDueNotificationGroupDigests(
  env: Env,
  now: number,
  dispatch: GroupDispatchFn = createGroupDispatch(env),
): Promise<number> {
  const groups = await claimDueDigestGroups(env.DB, now);
  let sent = 0;

  for (const group of groups) {
    try {
      const downMonitors = await listDownMonitors(env.DB, group.id);
      if (downMonitors.length === 0) continue;

      const channelIds = await listGroupChannelIds(env.DB, group.id);
      if (channelIds.length === 0) continue;

      const summary = buildDigestSummary(group.name, group.digest_interval, downMonitors);
      const eventKey = `group:${group.id}:digest:${now}`;
      await dispatch({
        groupId: group.id,
        channelIds,
        eventType: 'group.digest',
        eventKey,
        payload: {
          event: 'group.digest',
          event_id: eventKey,
          timestamp: now,
          interval: group.digest_interval,
          group: { id: group.id, name: group.name },
          summary,
          down_monitors: downMonitors.map((monitor) => ({
            id: monitor.id,
            name: monitor.name,
            target: monitor.target,
            display_url: monitor.display_url,
            error: monitor.last_error,
          })),
        },
      });
      sent += 1;
    } catch (error) {
      console.error(`notify: failed to send digest for group ${group.id}`, error);
    }
  }

  return sent;
}
