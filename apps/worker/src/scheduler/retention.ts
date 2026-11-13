import type { Env } from '../env';

import { readSettings } from '../settings';
import { acquireLease } from './lock';

const LOCK_NAME = 'retention:check_results';
const LOCK_LEASE_SECONDS = 10 * 60;

// Keep delete batches bounded to avoid long-running SQLite statements.
const DELETE_BATCH_SIZE = 5_000;
const MAX_BATCHES = 40; // 200k rows max per run per table

const DELETE_CHECK_RESULTS_SQL = `
  DELETE FROM check_results
  WHERE id IN (
    SELECT id
    FROM check_results
    WHERE checked_at < ?1
    ORDER BY checked_at
    LIMIT ?2
  )
`;

const DELETE_PROBE_CHECK_RESULTS_SQL = `
  DELETE FROM probe_check_results
  WHERE id IN (
    SELECT id
    FROM probe_check_results
    WHERE checked_at < ?1
    ORDER BY checked_at
    LIMIT ?2
  )
`;

const DELETE_PROBE_HEALTH_EVENTS_SQL = `
  DELETE FROM probe_health_events
  WHERE event_key IN (
    SELECT event_key FROM probe_health_events
    WHERE occurred_at < ?1
    ORDER BY occurred_at
    LIMIT ?2
  )
`;

// Delivery rows only exist to deduplicate sends and back the delivery log; 30 days is enough to
// investigate an incident and keeps the table from growing without bound.
const NOTIFICATION_DELIVERY_RETENTION_SECONDS = 30 * 86400;

const DELETE_NOTIFICATION_DELIVERIES_SQL = `
  DELETE FROM notification_deliveries
  WHERE id IN (
    SELECT id FROM notification_deliveries
    WHERE created_at < ?1
    ORDER BY created_at
    LIMIT ?2
  )
`;

/** Table names come from a fixed allowlist, never from input. */
async function deleteOlderThan(db: D1Database, sql: string, cutoff: number): Promise<number> {
  let totalDeleted = 0;

  for (let i = 0; i < MAX_BATCHES; i++) {
    const r = await db.prepare(sql).bind(cutoff, DELETE_BATCH_SIZE).run();

    const deleted = r.meta.changes ?? 0;
    totalDeleted += deleted;

    if (deleted < DELETE_BATCH_SIZE) break;
  }

  return totalDeleted;
}

export async function runRetention(env: Env, controller: ScheduledController): Promise<void> {
  const now = Math.floor((controller.scheduledTime ?? Date.now()) / 1000);

  const acquired = await acquireLease(env.DB, LOCK_NAME, now, LOCK_LEASE_SECONDS);
  if (!acquired) return;

  const settings = await readSettings(env.DB);
  const retentionDays = settings.retention_check_results_days;

  const cutoff = now - retentionDays * 86400;
  if (!Number.isFinite(cutoff) || cutoff <= 0) return;

  const totalDeleted = await deleteOlderThan(env.DB, DELETE_CHECK_RESULTS_SQL, cutoff);
  const probeDeleted = await deleteOlderThan(env.DB, DELETE_PROBE_CHECK_RESULTS_SQL, cutoff);
  const probeEventsDeleted = await deleteOlderThan(env.DB, DELETE_PROBE_HEALTH_EVENTS_SQL, cutoff);
  const deliveriesDeleted = await deleteOlderThan(
    env.DB,
    DELETE_NOTIFICATION_DELIVERIES_SQL,
    now - NOTIFICATION_DELIVERY_RETENTION_SECONDS,
  );

  console.log(
    `retention: deleted=${totalDeleted} probe_deleted=${probeDeleted} probe_events_deleted=${probeEventsDeleted} deliveries_deleted=${deliveriesDeleted} cutoff=${cutoff} days=${retentionDays}`,
  );
}
