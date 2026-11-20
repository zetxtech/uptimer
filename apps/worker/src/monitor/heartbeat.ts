import type { MonitorStatus } from '@uptimer/db';

import type { Env } from '../env';

export type HeartbeatPingResult = {
  receivedAt: number;
  recovered: boolean;
  ignored: boolean;
  previousStatus: MonitorStatus | null;
};

/**
 * The ping timestamp is independent from scheduled evaluations. No scheduler run may extend
 * the heartbeat deadline unless the monitored job actually sent another ping.
 */
export async function recordHeartbeatPing(
  env: Env,
  monitorId: number,
  now: number,
): Promise<HeartbeatPingResult> {
  const previous = await env.DB.prepare(
    'SELECT status, last_changed_at, consecutive_successes FROM monitor_state WHERE monitor_id = ?1',
  )
    .bind(monitorId)
    .first<{
      status: MonitorStatus;
      last_changed_at: number | null;
      consecutive_successes: number;
    }>();

  const previousStatus = previous?.status ?? null;
  if (previousStatus === 'paused') {
    return { receivedAt: now, recovered: false, ignored: true, previousStatus };
  }

  const lastChangedAt =
    previousStatus === 'up' ? (previous?.last_changed_at ?? now) : now;
  const successes = Math.min(1000, (previous?.consecutive_successes ?? 0) + 1);

  // The state update and all its dependent writes run as one D1 transaction.
  const [stateResult] = await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO monitor_state (
         monitor_id, status, last_checked_at, last_changed_at, last_latency_ms,
         last_error, consecutive_failures, consecutive_successes
       ) VALUES (?1, 'up', ?2, ?3, NULL, NULL, 0, ?4)
       ON CONFLICT(monitor_id) DO UPDATE SET
         status = 'up', last_checked_at = excluded.last_checked_at,
         last_changed_at = excluded.last_changed_at, last_latency_ms = NULL,
         last_error = NULL, consecutive_failures = 0,
         consecutive_successes = excluded.consecutive_successes,
         failure_started_at = NULL, recovery_started_at = NULL
       WHERE monitor_state.status != 'paused'
         AND (monitor_state.last_checked_at IS NULL
           OR monitor_state.last_checked_at <= excluded.last_checked_at)`,
    ).bind(monitorId, now, lastChangedAt, successes),
    env.DB.prepare(
      `UPDATE monitors SET last_heartbeat_at = ?2
       WHERE id = ?1 AND type = 'heartbeat' AND is_active = 1
         AND (last_heartbeat_at IS NULL OR last_heartbeat_at <= ?2)
         AND EXISTS (
           SELECT 1 FROM monitor_state
           WHERE monitor_id = ?1 AND status = 'up' AND last_checked_at = ?2
         )`,
    ).bind(monitorId, now),
    env.DB.prepare(
      `INSERT INTO check_results (
         monitor_id, checked_at, status, latency_ms, http_status, error, location, attempt
       ) SELECT ?1, ?2, 'up', NULL, NULL, NULL, 'heartbeat', 1
       WHERE EXISTS (
         SELECT 1 FROM monitor_state
         WHERE monitor_id = ?1 AND status = 'up' AND last_checked_at = ?2
       )`,
    ).bind(monitorId, now),
    env.DB.prepare(
      `UPDATE outages SET ended_at = ?2
       WHERE monitor_id = ?1 AND ended_at IS NULL
         AND EXISTS (
           SELECT 1 FROM monitor_state
           WHERE monitor_id = ?1 AND status = 'up' AND last_checked_at = ?2
         )`,
    ).bind(monitorId, now),
  ]);

  const ignored = (stateResult?.meta.changes ?? 0) === 0;
  return {
    receivedAt: now,
    recovered: !ignored && previousStatus === 'down',
    ignored,
    previousStatus,
  };
}

export function heartbeatGraceSeconds(intervalSec: number, graceSec: number | null = null): number {
  if (graceSec !== null && Number.isFinite(graceSec) && graceSec >= 0) {
    return intervalSec + graceSec;
  }
  return Math.max(300, intervalSec * 2);
}
