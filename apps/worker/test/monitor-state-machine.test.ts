import { describe, expect, it } from 'vitest';

import type { MonitorStateSnapshot } from '../src/monitor/state-machine';
import { computeNextState, resolveStateMachineConfig } from '../src/monitor/state-machine';

const CHECKED_AT = 1_735_000_000;

function snapshot(partial: Partial<MonitorStateSnapshot>): MonitorStateSnapshot {
  return {
    status: partial.status ?? 'unknown',
    lastChangedAt: partial.lastChangedAt ?? CHECKED_AT - 120,
    consecutiveFailures: partial.consecutiveFailures ?? 0,
    consecutiveSuccesses: partial.consecutiveSuccesses ?? 0,
  };
}

describe('computeNextState', () => {
  it('confirms downtime only after the configured continuous failure duration', () => {
    const failure = { status: 'down' as const, latencyMs: null, error: 'timeout', httpStatus: null, attempts: 1 };
    const cfg = { confirmationPeriodSec: 120 };
    const first = computeNextState(snapshot({ status: 'up' }), failure, CHECKED_AT, cfg);
    expect(first.next.status).toBe('up');
    expect(first.next.failureStartedAt).toBe(CHECKED_AT);
    const second = computeNextState(
      { ...snapshot({ status: 'up' }), ...first.next },
      failure,
      CHECKED_AT + 60,
      cfg,
    );
    expect(second.next.status).toBe('up');
    const third = computeNextState(
      { ...snapshot({ status: 'up' }), ...second.next },
      failure,
      CHECKED_AT + 120,
      cfg,
    );
    expect(third.next.status).toBe('down');
    expect(third.outageAction).toBe('open');
  });

  it('resolves downtime only after the configured continuous recovery duration', () => {
    const success = { status: 'up' as const, latencyMs: 15, error: null, httpStatus: 200, attempts: 1 };
    const cfg = { recoveryPeriodSec: 90 };
    const first = computeNextState(snapshot({ status: 'down' }), success, CHECKED_AT, cfg);
    expect(first.next.status).toBe('down');
    const second = computeNextState(
      { ...snapshot({ status: 'down' }), ...first.next },
      success,
      CHECKED_AT + 100,
      cfg,
    );
    expect(second.next.status).toBe('up');
    expect(second.outageAction).toBe('close');
  });

  it('resets the timer when the opposite outcome interrupts a pending period', () => {
    const down = { status: 'down' as const, latencyMs: null, error: 'timeout', httpStatus: null, attempts: 1 };
    const up = { status: 'up' as const, latencyMs: 15, error: null, httpStatus: 200, attempts: 1 };
    const cfg = { confirmationPeriodSec: 100 };
    const first = computeNextState(snapshot({ status: 'up' }), down, CHECKED_AT, cfg);
    const recovered = computeNextState(
      { ...snapshot({ status: 'up' }), ...first.next },
      up,
      CHECKED_AT + 60,
      cfg,
    );
    expect(recovered.next.failureStartedAt).toBeNull();
    const again = computeNextState(
      { ...snapshot({ status: 'up' }), ...recovered.next },
      down,
      CHECKED_AT + 120,
      cfg,
    );
    expect(again.next.status).toBe('up');
    expect(again.next.failureStartedAt).toBe(CHECKED_AT + 120);
  });

  it('promotes unknown to up on first successful check', () => {
    const { next, outageAction } = computeNextState(
      null,
      { status: 'up', latencyMs: 25, error: null, httpStatus: 200, attempts: 1 },
      CHECKED_AT,
    );

    expect(next).toMatchObject({
      status: 'up',
      lastChangedAt: CHECKED_AT,
      consecutiveFailures: 0,
      consecutiveSuccesses: 1,
      changed: true,
    });
    expect(outageAction).toBe('none');
  });

  it('keeps up until failure threshold is reached', () => {
    const prev = snapshot({ status: 'up', consecutiveFailures: 0, consecutiveSuccesses: 4 });
    const first = computeNextState(
      prev,
      { status: 'down', latencyMs: null, error: 'timeout', httpStatus: null, attempts: 1 },
      CHECKED_AT,
    );

    expect(first.next.status).toBe('up');
    expect(first.next.changed).toBe(false);
    expect(first.next.consecutiveFailures).toBe(1);
    expect(first.outageAction).toBe('none');

    const second = computeNextState(
      snapshot({ status: 'up', consecutiveFailures: 1, consecutiveSuccesses: 0 }),
      { status: 'down', latencyMs: null, error: 'timeout', httpStatus: null, attempts: 1 },
      CHECKED_AT + 60,
    );

    expect(second.next.status).toBe('down');
    expect(second.next.changed).toBe(true);
    expect(second.outageAction).toBe('open');
  });

  it('keeps down until success threshold is reached', () => {
    const first = computeNextState(
      snapshot({ status: 'down', consecutiveFailures: 3, consecutiveSuccesses: 0 }),
      { status: 'up', latencyMs: 45, error: null, httpStatus: 200, attempts: 1 },
      CHECKED_AT,
    );

    expect(first.next.status).toBe('down');
    expect(first.next.changed).toBe(false);
    expect(first.next.consecutiveSuccesses).toBe(1);
    expect(first.outageAction).toBe('update');

    const second = computeNextState(
      snapshot({ status: 'down', consecutiveFailures: 0, consecutiveSuccesses: 1 }),
      { status: 'up', latencyMs: 40, error: null, httpStatus: 200, attempts: 1 },
      CHECKED_AT + 60,
    );

    expect(second.next.status).toBe('up');
    expect(second.next.changed).toBe(true);
    expect(second.outageAction).toBe('close');
  });

  it('does not auto-transition paused and maintenance states', () => {
    const paused = computeNextState(
      snapshot({ status: 'paused', consecutiveFailures: 5, consecutiveSuccesses: 5 }),
      { status: 'down', latencyMs: null, error: 'timeout', httpStatus: null, attempts: 1 },
      CHECKED_AT,
    );
    expect(paused.next.status).toBe('paused');
    expect(paused.next.changed).toBe(false);
    expect(paused.next.consecutiveFailures).toBe(0);
    expect(paused.next.consecutiveSuccesses).toBe(0);
    expect(paused.outageAction).toBe('none');

    const maintenance = computeNextState(
      snapshot({ status: 'maintenance' }),
      { status: 'up', latencyMs: 30, error: null, httpStatus: 200, attempts: 1 },
      CHECKED_AT,
    );
    expect(maintenance.next.status).toBe('maintenance');
    expect(maintenance.outageAction).toBe('none');
  });

  it('retains current state on unknown checks and clears streaks', () => {
    const { next, outageAction } = computeNextState(
      snapshot({ status: 'up', consecutiveFailures: 1, consecutiveSuccesses: 2 }),
      {
        status: 'unknown',
        latencyMs: null,
        error: 'network jitter',
        httpStatus: null,
        attempts: 1,
      },
      CHECKED_AT,
    );

    expect(next.status).toBe('up');
    expect(next.changed).toBe(false);
    expect(next.consecutiveFailures).toBe(0);
    expect(next.consecutiveSuccesses).toBe(0);
    expect(outageAction).toBe('none');
  });

  it('handles steady-state up/down transitions without flapping', () => {
    const steadyUp = computeNextState(
      snapshot({ status: 'up', consecutiveSuccesses: 3 }),
      { status: 'up', latencyMs: 32, error: null, httpStatus: 200, attempts: 1 },
      CHECKED_AT,
    );
    expect(steadyUp.next.status).toBe('up');
    expect(steadyUp.next.changed).toBe(false);
    expect(steadyUp.outageAction).toBe('none');

    const unknownToDown = computeNextState(
      snapshot({ status: 'unknown', lastChangedAt: null }),
      { status: 'down', latencyMs: null, error: 'dns error', httpStatus: null, attempts: 1 },
      CHECKED_AT + 60,
    );
    expect(unknownToDown.next.status).toBe('down');
    expect(unknownToDown.next.changed).toBe(true);
    expect(unknownToDown.outageAction).toBe('open');

    const steadyDown = computeNextState(
      snapshot({ status: 'down', consecutiveFailures: 4 }),
      { status: 'down', latencyMs: null, error: 'timeout', httpStatus: null, attempts: 1 },
      CHECKED_AT + 120,
    );
    expect(steadyDown.next.status).toBe('down');
    expect(steadyDown.next.changed).toBe(false);
    expect(steadyDown.outageAction).toBe('update');
  });

  it('normalizes invalid thresholds and supports custom thresholds', () => {
    const withInvalidThreshold = computeNextState(
      snapshot({ status: 'up', consecutiveFailures: 1 }),
      { status: 'down', latencyMs: null, error: 'timeout', httpStatus: null, attempts: 1 },
      CHECKED_AT,
      { failuresToDownFromUp: 0, successesToUpFromDown: Number.NaN },
    );
    expect(withInvalidThreshold.next.status).toBe('down');
    expect(withInvalidThreshold.outageAction).toBe('open');

    const withCustomThreshold = computeNextState(
      snapshot({ status: 'down', consecutiveSuccesses: 0 }),
      { status: 'up', latencyMs: 20, error: null, httpStatus: 200, attempts: 1 },
      CHECKED_AT,
      { successesToUpFromDown: 1 },
    );
    expect(withCustomThreshold.next.status).toBe('up');
    expect(withCustomThreshold.outageAction).toBe('close');
  });

  it('caps streak counters at max range', () => {
    const { next } = computeNextState(
      snapshot({ status: 'down', consecutiveSuccesses: 1000 }),
      { status: 'up', latencyMs: 55, error: null, httpStatus: 200, attempts: 1 },
      CHECKED_AT,
      { successesToUpFromDown: 2000 },
    );

    expect(next.status).toBe('down');
    expect(next.consecutiveSuccesses).toBe(1000);
  });
});

describe('resolveStateMachineConfig', () => {
  it('prefers per-monitor overrides over the site defaults', () => {
    expect(
      resolveStateMachineConfig(
        { failuresToDownFromUp: 2, successesToUpFromDown: 2 },
        { failuresToDownFromUp: 5, successesToUpFromDown: null },
      ),
    ).toMatchObject({ failuresToDownFromUp: 5, successesToUpFromDown: 2 });
  });

  it('falls back to the defaults when there is no override', () => {
    expect(
      resolveStateMachineConfig(
        { failuresToDownFromUp: 3, successesToUpFromDown: 4 },
        { failuresToDownFromUp: undefined, successesToUpFromDown: null },
      ),
    ).toMatchObject({ failuresToDownFromUp: 3, successesToUpFromDown: 4 });
  });

  it('normalizes invalid overrides back to the defaults', () => {
    expect(
      resolveStateMachineConfig(
        { failuresToDownFromUp: 3, successesToUpFromDown: 3 },
        { failuresToDownFromUp: 0, successesToUpFromDown: Number.NaN },
      ),
    ).toMatchObject({ failuresToDownFromUp: 3, successesToUpFromDown: 3 });

    expect(resolveStateMachineConfig(undefined, { failuresToDownFromUp: 4 })).toMatchObject({
      failuresToDownFromUp: 4,
      successesToUpFromDown: 2,
    });
  });
});
