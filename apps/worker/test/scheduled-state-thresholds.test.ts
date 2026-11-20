import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../src/monitor/http', () => ({ runHttpCheck: vi.fn() }));
vi.mock('../src/monitor/tcp', () => ({ runTcpCheck: vi.fn() }));
vi.mock('../src/snapshots', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/snapshots')>();
  return {
    ...actual,
    refreshPublicHomepageSnapshotIfNeeded: vi.fn().mockResolvedValue(false),
  };
});

import { runHttpCheck } from '../src/monitor/http';
import { runExclusivePersistedMonitorBatch } from '../src/scheduler/scheduled';
import { DatabaseSync, sqliteD1 } from './helpers/sqlite-d1';

const migrationsDir = new URL('../migrations/', import.meta.url);

function createDatabase(): InstanceType<typeof DatabaseSync> {
  const database = new DatabaseSync(':memory:');
  for (const file of readdirSync(migrationsDir)
    .filter((name) => name.endsWith('.sql'))
    .sort()) {
    database.exec(readFileSync(new URL(file, migrationsDir), 'utf8'));
  }
  return database;
}

function seedMonitors(
  database: InstanceType<typeof DatabaseSync>,
  checkedAt: number,
  priorFailures: { strict: number; byDefault: number },
): void {
  database.exec(`
    INSERT INTO monitors (id, name, type, target, interval_sec, timeout_ms, is_active, probe_mode, failures_to_down_from_up, created_at, updated_at)
    VALUES
      (1, 'Strict', 'http', 'https://example.com/1', 60, 10000, 1, 'worker', 4, ${checkedAt}, ${checkedAt}),
      (2, 'Default', 'http', 'https://example.com/2', 60, 10000, 1, 'worker', NULL, ${checkedAt}, ${checkedAt});

    INSERT INTO monitor_state (monitor_id, status, last_checked_at, last_changed_at, consecutive_failures, consecutive_successes)
    VALUES
      (1, 'up', ${checkedAt - 60}, ${checkedAt - 600}, ${priorFailures.strict}, 0),
      (2, 'up', ${checkedAt - 60}, ${checkedAt - 600}, ${priorFailures.byDefault}, 0);
  `);
}

function readState(database: InstanceType<typeof DatabaseSync>, id: number) {
  return database
    .prepare(
      'SELECT status, consecutive_failures, consecutive_successes FROM monitor_state WHERE monitor_id = ?',
    )
    .get(id) as {
    status: string;
    consecutive_failures: number;
    consecutive_successes: number;
  };
}

describe('per-monitor state thresholds in the scheduler batch', () => {
  const downCheck = {
    status: 'down',
    latencyMs: null,
    httpStatus: null,
    error: 'timeout',
    attempts: 1,
  } as never;

  it('holds an overridden monitor up while the site default already flips', async () => {
    const checkedAt = 1_770_000_000;
    const database = createDatabase();
    seedMonitors(database, checkedAt, { strict: 2, byDefault: 1 });
    vi.mocked(runHttpCheck).mockResolvedValue(downCheck);

    try {
      await runExclusivePersistedMonitorBatch({
        db: sqliteD1(database),
        ids: [1, 2],
        checkedAt,
        stateMachineConfig: { failuresToDownFromUp: 2, successesToUpFromDown: 2 },
      });

      expect(readState(database, 1)).toEqual({
        status: 'up',
        consecutive_failures: 3,
        consecutive_successes: 0,
      });
      expect(readState(database, 2)).toEqual({
        status: 'down',
        consecutive_failures: 2,
        consecutive_successes: 0,
      });
    } finally {
      database.close();
    }
  });

  it('flips a monitor once its own threshold is reached', async () => {
    const checkedAt = 1_770_000_600;
    const database = createDatabase();
    seedMonitors(database, checkedAt, { strict: 3, byDefault: 0 });
    vi.mocked(runHttpCheck).mockResolvedValue(downCheck);

    try {
      await runExclusivePersistedMonitorBatch({
        db: sqliteD1(database),
        ids: [1],
        checkedAt,
        stateMachineConfig: { failuresToDownFromUp: 2, successesToUpFromDown: 2 },
      });

      expect(readState(database, 1)).toEqual({
        status: 'down',
        consecutive_failures: 4,
        consecutive_successes: 0,
      });
    } finally {
      database.close();
    }
  });
});
