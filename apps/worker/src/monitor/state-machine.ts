import type { MonitorStatus } from '@uptimer/db';

import type { CheckOutcome } from './types';

export type MonitorStateSnapshot = {
  status: MonitorStatus;
  lastChangedAt: number | null;
  consecutiveFailures: number;
  consecutiveSuccesses: number;
  failureStartedAt?: number | null;
  recoveryStartedAt?: number | null;
};

export type OutageAction = 'open' | 'close' | 'update' | 'none';

export type NextState = {
  status: MonitorStatus;
  lastChangedAt: number;
  consecutiveFailures: number;
  consecutiveSuccesses: number;
  failureStartedAt?: number | null;
  recoveryStartedAt?: number | null;
  changed: boolean;
};

export type StateMachineConfig = {
  failuresToDownFromUp: number;
  successesToUpFromDown: number;
  confirmationPeriodSec?: number | null | undefined;
  recoveryPeriodSec?: number | null | undefined;
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

function normalizePeriod(raw: number | null | undefined): number | null {
  if (raw === undefined || raw === null || !Number.isFinite(raw)) return null;
  return Math.max(0, Math.trunc(raw));
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
    confirmationPeriodSec: normalizePeriod(config?.confirmationPeriodSec),
    recoveryPeriodSec: normalizePeriod(config?.recoveryPeriodSec),
  };
}

function pickThreshold(raw: number | null | undefined, fallback: number): number {
  if (raw === null || raw === undefined) return fallback;
  return normalizeThreshold(raw, fallback);
}

/** Per-monitor periods override count-based legacy configuration without changing stored legacy data. */
export function resolveStateMachineConfig(
  fallback: Partial<StateMachineConfig> | undefined,
  overrides: {
    failuresToDownFromUp?: number | null;
    successesToUpFromDown?: number | null;
    confirmationPeriodSec?: number | null;
    recoveryPeriodSec?: number | null;
  },
): StateMachineConfig {
  const base = normalizeConfig(fallback);
  return {
    failuresToDownFromUp: pickThreshold(overrides.failuresToDownFromUp, base.failuresToDownFromUp),
    successesToUpFromDown: pickThreshold(
      overrides.successesToUpFromDown,
      base.successesToUpFromDown,
    ),
    confirmationPeriodSec:
      overrides.confirmationPeriodSec === undefined
        ? base.confirmationPeriodSec
        : normalizePeriod(overrides.confirmationPeriodSec),
    recoveryPeriodSec:
      overrides.recoveryPeriodSec === undefined
        ? base.recoveryPeriodSec
        : normalizePeriod(overrides.recoveryPeriodSec),
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

  if (prevStatus === 'paused' || prevStatus === 'maintenance') {
    return {
      next: {
        status: prevStatus,
        lastChangedAt: prev?.lastChangedAt ?? checkedAt,
        consecutiveFailures: 0,
        consecutiveSuccesses: 0,
        failureStartedAt: null,
        recoveryStartedAt: null,
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
  let failureStartedAt: number | null = null;
  let recoveryStartedAt: number | null = null;
  let changed = false;

  if (outcome.status === 'up') {
    successes = capStreak(prevSuccesses + 1);
    if (prevStatus === 'down') {
      recoveryStartedAt = prev?.recoveryStartedAt ?? checkedAt;
      const recovered = cfg.recoveryPeriodSec != null
        ? checkedAt - recoveryStartedAt >= (cfg.recoveryPeriodSec ?? 0)
        : successes >= cfg.successesToUpFromDown;
      if (recovered) {
        nextStatus = 'up';
        recoveryStartedAt = null;
        changed = true;
      }
    } else if (prevStatus === 'unknown') {
      nextStatus = 'up';
      changed = true;
    }
  } else if (outcome.status === 'down') {
    failures = capStreak(prevFailures + 1);
    if (prevStatus !== 'down') {
      failureStartedAt = prev?.failureStartedAt ?? checkedAt;
      const confirmed = cfg.confirmationPeriodSec != null
        ? checkedAt - failureStartedAt >= (cfg.confirmationPeriodSec ?? 0)
        : prevStatus === 'unknown' || failures >= cfg.failuresToDownFromUp;
      if (confirmed) {
        nextStatus = 'down';
        failureStartedAt = null;
        changed = true;
      }
    }
  } else {
    // An unknown observation breaks an ongoing confirmation/recovery interval.
    nextStatus = prevStatus;
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
      failureStartedAt,
      recoveryStartedAt,
      changed,
    },
    outageAction,
  };
}
