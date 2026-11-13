import { and, checkResults, eq, getDb, monitorState, outages, sql } from '@uptimer/db';

import type { Env } from '../env';

export type HeartbeatPingResult = {
  receivedAt: number;
  /** True when the ping moved the monitor from anything other than up. */
  recovered: boolean;
};

/**
 * A heartbeat monitor never opens a connection itself: the job it watches pings us, and a missed
 * ping is what turns the monitor down. The ping only ever records a success, so a leaked token
 * cannot be used to take a monitor down.
 */
export async function recordHeartbeatPing(
  env: Env,
  monitorId: number,
  now: number,
): Promise<HeartbeatPingResult> {
  const db = getDb(env);
  const previous = await db
    .select()
    .from(monitorState)
    .where(eq(monitorState.monitorId, monitorId))
    .get();

  const recovered = (previous?.status ?? null) !== 'up';
  const lastChangedAt = recovered ? now : (previous?.lastChangedAt ?? now);

  await db
    .insert(monitorState)
    .values({
      monitorId,
      status: 'up',
      lastCheckedAt: now,
      lastChangedAt,
      lastLatencyMs: null,
      lastError: null,
      consecutiveFailures: 0,
      consecutiveSuccesses: (previous?.consecutiveSuccesses ?? 0) + 1,
    })
    .onConflictDoUpdate({
      target: monitorState.monitorId,
      set: {
        status: 'up',
        lastCheckedAt: now,
        lastChangedAt,
        lastLatencyMs: null,
        lastError: null,
        consecutiveFailures: 0,
        consecutiveSuccesses: (previous?.consecutiveSuccesses ?? 0) + 1,
      },
    });

  await db.insert(checkResults).values({
    monitorId,
    checkedAt: now,
    status: 'up',
    latencyMs: null,
    httpStatus: null,
    error: null,
    location: 'heartbeat',
    attempt: 1,
  });

  await db
    .update(outages)
    .set({ endedAt: now })
    .where(and(eq(outages.monitorId, monitorId), sql`${outages.endedAt} IS NULL`));

  return { receivedAt: now, recovered };
}

/**
 * How long a heartbeat monitor may stay silent before the scheduler marks it down.
 *
 * A configured grace period means `interval + grace`; without one the historical policy applies:
 * two missed intervals, or a 5 minute floor so a 60s heartbeat is not judged on a single late ping.
 */
export function heartbeatGraceSeconds(intervalSec: number, graceSec: number | null = null): number {
  if (graceSec !== null && Number.isFinite(graceSec) && graceSec >= 0) {
    return intervalSec + graceSec;
  }
  return Math.max(300, intervalSec * 2);
}
