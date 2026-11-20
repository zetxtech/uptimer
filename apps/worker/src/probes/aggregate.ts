import type { CheckStatus, MonitorStatus } from '@uptimer/db/schema';

export const PROBE_FRESHNESS_MIN_SEC = 300;
export const PROBE_FRESHNESS_MAX_SEC = 3600;
export const PROBE_FRESHNESS_INTERVAL_FACTOR = 3;

/**
 * How long a probe result stays authoritative for aggregation.
 *
 * A probe is expected to report at least once per monitor interval. Three intervals of slack
 * absorb one missed run plus retries without letting an offline probe pin the status forever.
 */
export function computeProbeFreshnessSec(intervalSec: number): number {
  if (!Number.isFinite(intervalSec) || intervalSec <= 0) {
    return PROBE_FRESHNESS_MIN_SEC;
  }
  const scaled = Math.trunc(intervalSec) * PROBE_FRESHNESS_INTERVAL_FACTOR;
  return Math.min(PROBE_FRESHNESS_MAX_SEC, Math.max(PROBE_FRESHNESS_MIN_SEC, scaled));
}

export type ProbeStateSnapshot = {
  probeId: string;
  required: boolean;
  status: CheckStatus;
  lastCheckedAt: number | null;
  latencyMs?: number | null;
  error?: string | null;
};

export type AggregateReason =
  | 'operator_state'
  | 'no_probes'
  | 'any_up'
  | 'all_down'
  | 'quorum_down'
  | 'all_unknown'
  | 'stale_keep_previous'
  | 'stale_unknown';

export type AggregateDecision = {
  status: MonitorStatus;
  reason: AggregateReason;
  freshCount: number;
  requiredTotal: number;
  requiredFreshCount: number;
};

function emptyDecision(
  status: MonitorStatus,
  reason: AggregateReason,
  counts?: Partial<Pick<AggregateDecision, 'freshCount' | 'requiredTotal' | 'requiredFreshCount'>>,
): AggregateDecision {
  return {
    status,
    reason,
    freshCount: counts?.freshCount ?? 0,
    requiredTotal: counts?.requiredTotal ?? 0,
    requiredFreshCount: counts?.requiredFreshCount ?? 0,
  };
}

/**
 * Aggregates per-probe observations into the single status shown by the public status page.
 *
 * Policy:
 * - Operator states (paused / maintenance) are never overridden by probes.
 * - Required locations drive the global result; optional probes only contribute diagnostics.
 * - Three failed required locations confirm an outage when three or more are configured.
 *   With one or two required locations, every required location must fail.
 * - A fresh successful required location keeps the service up until that threshold is met.
 * - When required probes are missing or stale, keep an established up/down state instead of
 *   flapping to `unknown`; probe health is reported separately.
 */
export function computeAggregateStatus(input: {
  previousStatus: MonitorStatus | null;
  probeStates: readonly ProbeStateSnapshot[];
  now: number;
  freshnessSec: number;
}): AggregateDecision {
  const previous: MonitorStatus = input.previousStatus ?? 'unknown';

  if (previous === 'paused' || previous === 'maintenance') {
    return emptyDecision(previous, 'operator_state');
  }

  if (input.probeStates.length === 0) {
    return emptyDecision(previous, 'no_probes');
  }

  const isFresh = (state: ProbeStateSnapshot): boolean =>
    state.lastCheckedAt !== null &&
    state.lastCheckedAt <= input.now &&
    input.now - state.lastCheckedAt <= input.freshnessSec;

  const fresh = input.probeStates.filter(isFresh);
  const required = input.probeStates.filter((state) => state.required);
  const freshRequired = required.filter(isFresh);

  const counts = {
    freshCount: fresh.length,
    requiredTotal: required.length,
    requiredFreshCount: freshRequired.length,
  };

  const quorum = required.length > 0 ? required : input.probeStates;
  const freshQuorum = required.length > 0 ? freshRequired : fresh;
  // Three independent locations confirm an outage when at least three are configured;
  // smaller installations require every configured location to fail.
  const failuresNeeded = Math.min(3, quorum.length);
  const downCount = freshQuorum.filter((state) => state.status === 'down').length;

  if (downCount >= failuresNeeded) {
    return emptyDecision(
      'down',
      downCount === quorum.length ? 'all_down' : 'quorum_down',
      counts,
    );
  }
  if (freshQuorum.some((state) => state.status === 'up')) {
    return emptyDecision('up', 'any_up', counts);
  }

  if (freshQuorum.length === quorum.length) {
    // No location confirmed success and the threshold for failure was not reached.
    return emptyDecision(previous === 'down' ? 'down' : 'unknown', 'all_unknown', counts);
  }

  if (previous === 'up' || previous === 'down') {
    return emptyDecision(previous, 'stale_keep_previous', counts);
  }

  return emptyDecision('unknown', 'stale_unknown', counts);
}
