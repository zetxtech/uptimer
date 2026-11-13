import type { MonitorStatus } from '@uptimer/db';

import type { CheckOutcome } from './types';

export type MonitorStateSnapshot = {
  status: MonitorStatus;
  lastChangedAt: number | null;
  consecutiveFailures: number;
  consecutiveSuccesses: number;
};

export type OutageAction = 'open' | 'close' | 'update' | 'none';

export type NextState = {
  status: MonitorStatus;
  lastChangedAt: number;
  consecutiveFailures: number;
  consecutiveSuccesses: number;
  changed: boolean;
};

export type StateMachineConfig = {
  failuresToDownFromUp: number;
  successesToUpFromDown: number;
};

const DEFAULT_CONFIG: StateMachineConfig = {
  failuresToDownFromUp: 2,
  successesToUpFromDown: 2,
};

const MAX_STREAK = 1000;

function capStreak(n: number): number {
  return Math.min(Math.max(n, 0), MAX_STREAK);
}

function normalizeThreshold(raw: number | undefined, fallback: number): number {
  if (typeof raw !== 'number' || !Number.isFinite(raw)) return fallback;
  const n = Math.trunc(raw);
  return n >= 1 ? n : fallback;
}

function normalizeConfig(config?: Partial<StateMachineConfig>): StateMachineConfig {
  return {
    failuresToDownFromUp: normalizeThreshold(
      config?.failuresToDownFromUp,
      DEFAULT_CONFIG.failuresToDownFromUp,
    ),
    successesToUpFromDown: normalizeThreshold(
      config?.successesToUpFromDown,
      DEFAULT_CONFIG.successesToUpFromDown,
    ),
  };
}

function pickThreshold(raw: number | null | undefined, fallback: number): number {
  if (raw === null || raw === undefined) return fallback;
  return normalizeThreshold(raw, fallback);
}

/** Per-monitor overrides win over the site-wide defaults; null or invalid values fall back. */
export function resolveStateMachineConfig(
  fallback: Partial<StateMachineConfig> | undefined,
  overrides: { failuresToDownFromUp?: number | null; successesToUpFromDown?: number | null },
): StateMachineConfig {
  const base = normalizeConfig(fallback);
  return {
    failuresToDownFromUp: pickThreshold(overrides.failuresToDownFromUp, base.failuresToDownFromUp),
    successesToUpFromDown: pickThreshold(
      overrides.successesToUpFromDown,
      base.successesToUpFromDown,
    ),
  };
}

export function computeNextState(
  prev: MonitorStateSnapshot | null,
  outcome: CheckOutcome,
  checkedAt: number,
  config?: Partial<StateMachineConfig>,
): { next: NextState; outageAction: OutageAction } {
  const cfg = normalizeConfig(config);

  const prevStatus: MonitorStatus = prev?.status ?? 'unknown';

  // For operator-enforced states, do not auto-transition.
  if (prevStatus === 'paused' || prevStatus === 'maintenance') {
    return {
      next: {
        status: prevStatus,
        lastChangedAt: prev?.lastChangedAt ?? checkedAt,
        consecutiveFailures: 0,
        consecutiveSuccesses: 0,
        changed: false,
      },
      outageAction: 'none',
    };
  }

  const prevFailures = prev?.consecutiveFailures ?? 0;
  const prevSuccesses = prev?.consecutiveSuccesses ?? 0;
  const prevChangedAt = prev?.lastChangedAt ?? null;

  let nextStatus: MonitorStatus = prevStatus;
  let failures = 0;
  let successes = 0;
  let changed = false;

  if (outcome.status === 'up') {
    failures = 0;
    successes = capStreak(prevSuccesses + 1);

    if (prevStatus === 'down') {
      if (successes >= cfg.successesToUpFromDown) {
        nextStatus = 'up';
        changed = true;
      } else {
        nextStatus = 'down';
      }
    } else if (prevStatus === 'unknown') {
      nextStatus = 'up';
      changed = true;
    } else {
      nextStatus = 'up';
    }
  } else if (outcome.status === 'down') {
    successes = 0;
    failures = capStreak(prevFailures + 1);

    if (prevStatus === 'up') {
      if (failures >= cfg.failuresToDownFromUp) {
        nextStatus = 'down';
        changed = true;
      } else {
        nextStatus = 'up';
      }
    } else if (prevStatus === 'unknown') {
      nextStatus = 'down';
      changed = true;
    } else {
      nextStatus = 'down';
    }
  } else {
    // UNKNOWN: do not flip state away from an established UP/DOWN state.
    failures = 0;
    successes = 0;
    nextStatus = prevStatus === 'unknown' ? 'unknown' : prevStatus;
  }

  const lastChangedAt = changed ? checkedAt : (prevChangedAt ?? checkedAt);

  const outageAction: OutageAction =
    prevStatus !== 'down' && nextStatus === 'down'
      ? 'open'
      : prevStatus === 'down' && nextStatus !== 'down'
        ? 'close'
        : prevStatus === 'down' && nextStatus === 'down'
          ? 'update'
          : 'none';

  return {
    next: {
      status: nextStatus,
      lastChangedAt,
      consecutiveFailures: failures,
      consecutiveSuccesses: successes,
      changed,
    },
    outageAction,
  };
}
