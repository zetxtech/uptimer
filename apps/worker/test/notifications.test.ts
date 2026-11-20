import { describe, expect, it } from 'vitest';

import { listMaintenanceSuppressedMonitorIds } from '../src/scheduler/notifications';
import { createFakeD1Database, type FakeD1QueryHandler } from './helpers/fake-d1';

// Wednesday 15 April 2026, 10:30 UTC.
const AT = Math.floor(Date.UTC(2026, 3, 15, 10, 30) / 1000);

const NO_RECURRING_WINDOWS: FakeD1QueryHandler = {
  match: 'from monitors',
  all: () => [],
};

describe('scheduler/notifications', () => {
  it('chunks maintenance suppression lookups under the D1 variable limit', async () => {
    const ids = Array.from({ length: 150 }, (_, index) => index + 1);
    const argLengths: number[] = [];
    const handlers: FakeD1QueryHandler[] = [
      {
        match: 'select distinct mwm.monitor_id',
        all: (args) => {
          argLengths.push(args.length);
          return args.slice(1).map((monitorId) => ({ monitor_id: monitorId as number }));
        },
      },
      NO_RECURRING_WINDOWS,
    ];

    const suppressed = await listMaintenanceSuppressedMonitorIds(
      createFakeD1Database(handlers),
      AT,
      ids,
    );

    expect(argLengths.length).toBeGreaterThan(1);
    expect(Math.max(...argLengths)).toBeLessThanOrEqual(100);
    expect([...suppressed]).toEqual(ids);
  });

  it('fails open when maintenance suppression lookups error', async () => {
    const handlers: FakeD1QueryHandler[] = [
      {
        match: 'select distinct mwm.monitor_id',
        all: () => {
          throw new Error('boom');
        },
      },
    ];

    const suppressed = await listMaintenanceSuppressedMonitorIds(
      createFakeD1Database(handlers),
      AT,
      [1, 2, 3],
    );

    expect([...suppressed]).toEqual([]);
  });

  it('adds monitors whose recurring window covers the tick', async () => {
    const window = (days: number[]) =>
      JSON.stringify({ start_minute: 600, end_minute: 660, days, timezone: 'UTC' });
    const handlers: FakeD1QueryHandler[] = [
      { match: 'select distinct mwm.monitor_id', all: () => [] },
      {
        match: 'from monitors',
        all: () => [
          { id: 1, maintenance_window_json: window([3]) },
          { id: 2, maintenance_window_json: window([2]) },
        ],
      },
    ];

    const suppressed = await listMaintenanceSuppressedMonitorIds(
      createFakeD1Database(handlers),
      AT,
      [1, 2, 3],
    );

    expect([...suppressed]).toEqual([1]);
  });
});
