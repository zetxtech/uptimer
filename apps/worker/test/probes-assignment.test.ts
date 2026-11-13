import { describe, expect, it, vi } from 'vitest';

vi.mock('../src/monitor/tcp', () => ({ runTcpCheck: vi.fn() }));

import {
  filterDueMonitors,
  monitorSupportsProbeKind,
  probeKindSupportsTcp,
  selectShardMonitors,
  type AssignedMonitor,
} from '../src/probes/assignment';
import { runProbeShard } from '../src/probes/shard-task';
import type { Env } from '../src/env';
import { createFakeD1Database } from './helpers/fake-d1';

function monitor(id: number, overrides: Partial<AssignedMonitor> = {}): AssignedMonitor {
  return {
    id,
    name: `monitor-${id}`,
    type: 'http',
    target: 'https://example.com',
    intervalSec: 300,
    timeoutMs: 10_000,
    stateStatus: null,
    http: null,
    ...overrides,
  };
}

describe('probe assignment helpers', () => {
  it('keeps edge probes HTTP-only', () => {
    expect(probeKindSupportsTcp('edgeone')).toBe(false);
    expect(probeKindSupportsTcp('durable_object')).toBe(true);
    expect(monitorSupportsProbeKind('edgeone', 'http')).toBe(true);
    expect(monitorSupportsProbeKind('edgeone', 'tcp')).toBe(false);
  });

  it('spreads monitors across shards without overlap or gaps', () => {
    const monitors = [monitor(1), monitor(2), monitor(3), monitor(4), monitor(5)];

    const shard0 = selectShardMonitors(monitors, 0, 2).map((m) => m.id);
    const shard1 = selectShardMonitors(monitors, 1, 2).map((m) => m.id);

    expect(shard0).toEqual([2, 4]);
    expect(shard1).toEqual([1, 3, 5]);
    expect([...shard0, ...shard1].sort()).toEqual([1, 2, 3, 4, 5]);
  });

  it('returns every monitor when there is a single shard', () => {
    const monitors = [monitor(1), monitor(2)];
    expect(selectShardMonitors(monitors, 0, 1)).toHaveLength(2);
  });

  it('normalizes out-of-range shard indexes', () => {
    const monitors = [monitor(1), monitor(2), monitor(3)];
    expect(selectShardMonitors(monitors, 3, 3).map((m) => m.id)).toEqual([3]);
    // -1 wraps to the last shard (index 2), which owns ids where id % 3 === 2.
    expect(selectShardMonitors(monitors, -1, 3).map((m) => m.id)).toEqual([2]);
  });

  it('probes monitors that have never been checked', () => {
    const due = filterDueMonitors([monitor(1, { intervalSec: 300 })], new Map(), 1_800_000_000);
    expect(due.map((m) => m.id)).toEqual([1]);
  });

  it('skips monitors checked within their interval', () => {
    const now = 1_800_000_000;
    const due = filterDueMonitors(
      [monitor(1, { intervalSec: 300 }), monitor(2, { intervalSec: 60 })],
      new Map([
        [1, now - 100],
        [2, now - 100],
      ]),
      now,
    );
    expect(due.map((m) => m.id)).toEqual([2]);
  });

  it('never probes paused monitors', () => {
    const due = filterDueMonitors(
      [monitor(1, { stateStatus: 'paused' })],
      new Map([[1, null]]),
      1_800_000_000,
    );
    expect(due).toHaveLength(0);
  });

  it('records a heartbeat when a shard has no due checks', async () => {
    const heartbeat = vi.fn(() => 1);
    const db = createFakeD1Database([
      {
        match: 'from probes where id',
        first: () => ({
          id: 'cf-do',
          name: 'Cloudflare',
          kind: 'durable_object',
          scope: 'overseas',
          region: 'us',
          is_required: 1,
          config_version: 1,
        }),
      },
      { match: 'from monitors m left join monitor_state', all: () => [] },
      { match: 'update probes set last_seen_at', run: heartbeat },
    ]);
    const result = await runProbeShard({ DB: db } as Env, {} as ExecutionContext, {
      probeId: 'cf-do',
      shardIndex: 0,
      shardCount: 1,
    });
    expect(result.probed).toBe(0);
    expect(heartbeat).toHaveBeenCalledTimes(1);
  });
});
