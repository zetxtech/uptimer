import type { Env } from '../env';
import { dispatchWebhookToChannels } from '../notify/webhook';
import { probeHealthStatus } from '../probes/health';
import { acquireLease, releaseLease } from './lock';
import { createNotifyContext } from './notifications';

const LOCK_NAME = 'scheduler:probe-health';
const LOCK_SECONDS = 180;
const EVENT_MAX_AGE_SECONDS = 86400;
const EVENT_BATCH_SIZE = 5;

type ProbeHealthRow = {
  id: string;
  is_enabled: number;
  created_at: number;
  health_started_at: number | null;
  last_seen_at: number | null;
  offline_after_sec: number;
  status: 'online' | 'offline';
  version: number;
};

type ProbeHealthEvent = {
  event_key: string;
  probe_id: string;
  event_type: 'probe.offline' | 'probe.online';
  occurred_at: number;
  last_seen_at: number | null;
  probe_name: string;
  scope: string;
  region: string;
};

const INITIALIZE_HEALTH_SQL = `
  INSERT OR IGNORE INTO probe_health_state (probe_id, status, version, changed_at)
  VALUES (?1, 'online', 0, ?2)
`;

const LIST_HEALTH_SQL = `
  SELECT p.id, p.is_enabled, p.created_at, p.health_started_at, p.last_seen_at,
      p.offline_after_sec, COALESCE(s.status, 'online') AS status,
      COALESCE(s.version, 0) AS version
    FROM probes p LEFT JOIN probe_health_state s ON s.probe_id = p.id
  WHERE p.is_enabled = 1
`;

const TRANSITION_SQL = `
  UPDATE probe_health_state
  SET status = ?1, version = version + 1, changed_at = ?2
  WHERE probe_id = ?3 AND version = ?4 AND status = ?5
    AND EXISTS (
      SELECT 1 FROM probes p WHERE p.id = ?3 AND p.is_enabled = 1 AND (
        (?1 = 'offline' AND MAX(COALESCE(p.last_seen_at, 0),
          COALESCE(p.health_started_at, p.created_at)) <= ?2 - p.offline_after_sec)
        OR
        (?1 = 'online' AND p.last_seen_at IS NOT NULL
          AND p.last_seen_at >= COALESCE(p.health_started_at, p.created_at)
          AND p.last_seen_at > ?2 - p.offline_after_sec)
      )
    )
`;

const INSERT_EVENT_SQL = `
  INSERT OR IGNORE INTO probe_health_events (
    event_key, probe_id, event_type, occurred_at, last_seen_at, probe_name, scope, region
  )
  SELECT ?1, p.id, ?2, ?3, p.last_seen_at, p.name, p.scope, p.region
  FROM probes p JOIN probe_health_state s ON s.probe_id = p.id
  WHERE p.id = ?4 AND p.is_enabled = 1 AND s.status = ?5
    AND s.version = ?6 AND s.changed_at = ?3
`;

const LIST_PENDING_SQL = `
  SELECT e.event_key, e.probe_id, e.event_type, e.occurred_at, e.last_seen_at,
         e.probe_name, e.scope, e.region
  FROM probe_health_events e JOIN probes p ON p.id = e.probe_id
  WHERE e.completed_at IS NULL AND e.occurred_at >= ?1 AND p.is_enabled = 1
    AND NOT EXISTS (
      SELECT 1 FROM probe_health_events earlier
      WHERE earlier.probe_id = e.probe_id AND earlier.completed_at IS NULL
        AND earlier.occurred_at >= ?1
        AND (earlier.occurred_at < e.occurred_at OR
          (earlier.occurred_at = e.occurred_at AND earlier.event_key < e.event_key))
    )
  ORDER BY COALESCE(e.last_attempt_at, 0), e.occurred_at, e.event_key
  LIMIT ?2
`;

async function recordTransitions(
  db: D1Database,
  probes: readonly ProbeHealthRow[],
  now: number,
): Promise<void> {
  for (const probe of probes) {
    const health = probeHealthStatus({
      enabled: probe.is_enabled === 1,
      createdAt: probe.created_at,
      healthStartedAt: probe.health_started_at,
      lastSeenAt: probe.last_seen_at,
      offlineAfterSec: probe.offline_after_sec,
      now,
    });
    if ((health !== 'offline' && health !== 'online') || health === probe.status) continue;

    const version = probe.version + 1;
    const eventType = health === 'offline' ? 'probe.offline' : 'probe.online';
    const epoch = probe.health_started_at ?? probe.created_at;
    const eventKey = `probe:${probe.id}:${epoch}:${version}:${health}`;
    await db.batch([
      db.prepare(INITIALIZE_HEALTH_SQL).bind(probe.id, now),
      db.prepare(TRANSITION_SQL).bind(health, now, probe.id, probe.version, probe.status),
      db.prepare(INSERT_EVENT_SQL).bind(eventKey, eventType, now, probe.id, health, version),
    ]);
  }
}

async function deliverPendingEvents(env: Env, ctx: ExecutionContext, now: number): Promise<void> {
  const { results } = await env.DB.prepare(LIST_PENDING_SQL)
    .bind(now - EVENT_MAX_AGE_SECONDS, EVENT_BATCH_SIZE)
    .all<ProbeHealthEvent>();
  if (!results?.length) return;
  const notify = await createNotifyContext(env, ctx);
  if (!notify) return;

  await Promise.all(
    (results ?? []).map(async (event) => {
      try {
        await env.DB.prepare(
          'UPDATE probe_health_events SET last_attempt_at = ?2 WHERE event_key = ?1',
        )
          .bind(event.event_key, now)
          .run();

        const channels = notify.channels.filter(
          (channel) =>
            channel.created_at <= event.occurred_at &&
            (!channel.config.enabled_events ||
              channel.config.enabled_events.includes(event.event_type)),
        );
        await dispatchWebhookToChannels({
          db: env.DB,
          env: notify.envRecord,
          channels,
          eventType: event.event_type,
          eventKey: event.event_key,
          retryFailed: true,
          throwOnError: true,
          payload: {
            event: event.event_type,
            event_id: event.event_key,
            timestamp: event.occurred_at,
            probe: {
              id: event.probe_id,
              name: event.probe_name,
              scope: event.scope,
              region: event.region,
              last_seen_at: event.last_seen_at,
            },
          },
        });

        const deliveries = await env.DB.prepare(
          `SELECT channel_id, status FROM notification_deliveries
           WHERE event_key = ?1 AND status = 'failed'`,
        )
          .bind(event.event_key)
          .all<{ channel_id: number; status: string }>();
        const channelIds = new Set(channels.map((channel) => channel.id));
        const hasFailedDelivery = (deliveries.results ?? []).some((delivery) =>
          channelIds.has(delivery.channel_id),
        );
        if (!hasFailedDelivery) {
          await env.DB.prepare(
            'UPDATE probe_health_events SET completed_at = ?2 WHERE event_key = ?1',
          )
            .bind(event.event_key, now)
            .run();
        }
      } catch (error) {
        console.error('probe health: event delivery failed', event.event_key, error);
      }
    }),
  );
}

export async function runProbeHealthChecks(
  env: Env,
  ctx: ExecutionContext,
  now = Math.floor(Date.now() / 1000),
): Promise<void> {
  const { results } = await env.DB.prepare(LIST_HEALTH_SQL).all<ProbeHealthRow>();
  if (!results?.length) return;
  if (!(await acquireLease(env.DB, LOCK_NAME, now, LOCK_SECONDS))) return;
  try {
    await recordTransitions(env.DB, results, now);
    await deliverPendingEvents(env, ctx, now);
  } finally {
    await releaseLease(env.DB, LOCK_NAME, now + LOCK_SECONDS);
  }
}
