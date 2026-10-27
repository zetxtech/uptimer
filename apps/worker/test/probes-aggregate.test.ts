import { describe, expect, it } from 'vitest';

import {
  computeAggregateStatus,
  computeProbeFreshnessSec,
  type ProbeStateSnapshot,
} from '../src/probes/aggregate';

const NOW = 1_800_000_000;

function state(
  probeId: string,
  status: ProbeStateSnapshot['status'],
  lastCheckedAt: number | null,
  required = true,
): ProbeStateSnapshot {
  return { probeId, status, lastCheckedAt, required };
}

describe('computeProbeFreshnessSec', () => {
  it('uses three intervals with a 5 minute floor', () => {
    expect(computeProbeFreshnessSec(60)).toBe(300);
    expect(computeProbeFreshnessSec(120)).toBe(360);
  });

  it('caps freshness at one hour', () => {
    expect(computeProbeFreshnessSec(3600)).toBe(3600);
    expect(computeProbeFreshnessSec(999_999)).toBe(3600);
  });

  it('falls back to the floor for invalid intervals', () => {
    expect(computeProbeFreshnessSec(0)).toBe(300);
    expect(computeProbeFreshnessSec(Number.NaN)).toBe(300);
  });
});

describe('computeAggregateStatus', () => {
  it('never overrides operator states', () => {
    const decision = computeAggregateStatus({
      previousStatus: 'maintenance',
      probeStates: [state('cn', 'down', NOW)],
      now: NOW,
      freshnessSec: 300,
    });
    expect(decision.status).toBe('maintenance');
    expect(decision.reason).toBe('operator_state');
  });

  it('stays up when any fresh probe can reach the target', () => {
    const decision = computeAggregateStatus({
      previousStatus: 'up',
      probeStates: [state('cn', 'down', NOW), state('cf', 'up', NOW)],
      now: NOW,
      freshnessSec: 300,
    });
    expect(decision.status).toBe('up');
    expect(decision.reason).toBe('any_up');
    expect(decision.freshCount).toBe(2);
  });

  it('goes down only when every required probe reports down', () => {
    const decision = computeAggregateStatus({
      previousStatus: 'up',
      probeStates: [state('cn', 'down', NOW), state('cf', 'down', NOW)],
      now: NOW,
      freshnessSec: 300,
    });
    expect(decision.status).toBe('down');
    expect(decision.reason).toBe('all_down');
  });

  it('does not treat a single regional failure as a global outage', () => {
    const decision = computeAggregateStatus({
      previousStatus: 'up',
      probeStates: [state('cn', 'down', NOW), state('cf', 'unknown', NOW)],
      now: NOW,
      freshnessSec: 300,
    });
    expect(decision.status).not.toBe('down');
    expect(decision.status).toBe('unknown');
  });

  it('keeps an established state when a required probe is stale', () => {
    const decision = computeAggregateStatus({
      previousStatus: 'down',
      probeStates: [state('cn', 'down', NOW - 4000), state('cf', 'unknown', NOW)],
      now: NOW,
      freshnessSec: 300,
    });
    expect(decision.status).toBe('down');
    expect(decision.reason).toBe('stale_keep_previous');
    expect(decision.requiredFreshCount).toBe(1);
    expect(decision.requiredTotal).toBe(2);
  });

  it('returns unknown when no probe has fresh data and no state is established', () => {
    const decision = computeAggregateStatus({
      previousStatus: null,
      probeStates: [state('cn', 'down', NOW - 4000), state('cf', 'down', NOW - 4000)],
      now: NOW,
      freshnessSec: 300,
    });
    expect(decision.status).toBe('unknown');
    expect(decision.reason).toBe('stale_unknown');
  });

  it('reports unknown when all fresh required probes are unknown', () => {
    const decision = computeAggregateStatus({
      previousStatus: 'up',
      probeStates: [state('cn', 'unknown', NOW), state('cf', 'unknown', NOW)],
      now: NOW,
      freshnessSec: 300,
    });
    expect(decision.status).toBe('unknown');
    expect(decision.reason).toBe('all_unknown');
  });

  it('ignores stale down results when another probe is fresh up', () => {
    const decision = computeAggregateStatus({
      previousStatus: 'down',
      probeStates: [state('cn', 'down', NOW - 4000), state('cf', 'up', NOW)],
      now: NOW,
      freshnessSec: 300,
    });
    expect(decision.status).toBe('up');
  });

  it('uses all probes as quorum when none is marked required', () => {
    const decision = computeAggregateStatus({
      previousStatus: 'up',
      probeStates: [state('a', 'down', NOW, false), state('b', 'down', NOW, false)],
      now: NOW,
      freshnessSec: 300,
    });
    expect(decision.status).toBe('down');
    expect(decision.requiredTotal).toBe(0);
  });

  it('keeps the previous status when there are no probes at all', () => {
    const decision = computeAggregateStatus({
      previousStatus: 'up',
      probeStates: [],
      now: NOW,
      freshnessSec: 300,
    });
    expect(decision.status).toBe('up');
    expect(decision.reason).toBe('no_probes');
  });
});
