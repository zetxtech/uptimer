import { describe, expect, it } from 'vitest';

import { runBulkMonitorOperation } from '../../web/src/utils/bulkMonitorOperations';

describe('bulk monitor operations', () => {
  it('deduplicates ids and preserves failures for retry', async () => {
    const result = await runBulkMonitorOperation([1, 2, 1, 3], async (id) => {
      if (id === 2) throw new Error('unavailable');
    });
    expect(result.succeeded).toEqual([1, 3]);
    expect(result.failed).toEqual([{ id: 2, error: expect.any(Error) }]);
  });

  it('limits concurrent requests', async () => {
    let active = 0;
    let maximum = 0;
    await runBulkMonitorOperation(
      [1, 2, 3, 4, 5],
      async () => {
        active += 1;
        maximum = Math.max(maximum, active);
        await Promise.resolve();
        active -= 1;
      },
      2,
    );
    expect(maximum).toBe(2);
  });

  it('handles an empty selection', async () => {
    const result = await runBulkMonitorOperation([], async () => {
      throw new Error('must not run');
    });
    expect(result).toEqual({ succeeded: [], failed: [] });
  });
});
