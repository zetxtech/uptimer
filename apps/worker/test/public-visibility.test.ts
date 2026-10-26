import { describe, expect, it } from 'vitest';

import { listStatusPageVisibleMonitorIds } from '../src/public/visibility';
import { createFakeD1Database, type FakeD1QueryHandler } from './helpers/fake-d1';

describe('public visibility helpers', () => {
  it('chunks visible monitor lookups before building D1 IN clauses', async () => {
    const bindCalls: unknown[][] = [];
    const ids = Array.from({ length: 450 }, (_, idx) => idx + 1);

    const handlers: FakeD1QueryHandler[] = [
      {
        match: (sql) => sql.includes('from monitors') && sql.includes('show_on_status_page = 1'),
        all: (args) => {
          bindCalls.push([...args]);
          return args
            .map((id) => Number(id))
            .filter((id) => id % 2 === 0)
            .map((id) => ({ id }));
        },
      },
    ];

    const visibleMonitorIds = await listStatusPageVisibleMonitorIds(
      createFakeD1Database(handlers),
      ids,
    );

    expect(bindCalls.length).toBeGreaterThan(1);
    expect(visibleMonitorIds.has(2)).toBe(true);
    expect(visibleMonitorIds.has(3)).toBe(false);
    expect(visibleMonitorIds.has(450)).toBe(true);
  });
});
