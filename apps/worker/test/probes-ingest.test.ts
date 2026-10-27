import { describe, expect, it, vi } from 'vitest';

vi.mock('../src/scheduler/notifications', () => ({
  createNotifyContext: vi.fn(async () => null),
  listMaintenanceSuppressedMonitorIds: vi.fn(async () => new Set<number>()),
  queueMonitorNotification: vi.fn(),
}));

vi.mock('../src/public/homepage-guard-state', () => ({
  bumpHomepageMonitorGuardVersions: vi.fn(async () => undefined),
}));

import type { Env } from '../src/env';
import { sha256Hex } from '../src/probes/auth';
import { handleProbeIngest } from '../src/probes/ingest';
import { createFakeD1Database, type FakeD1QueryHandler } from './helpers/fake-d1';
const PROBE_ID = 'edgeone-cn-gz';
const TOKEN = `upt_probe_${'a'.repeat(43)}`;

function createContext(): ExecutionContext {
  return {
    waitUntil: vi.fn(),
    passThroughOnException: vi.fn(),
  } as unknown as ExecutionContext;
}

function ingestRequest(body: unknown, token = TOKEN): Request {
  return new Request('https://uptimer.test/api/v1/probe/ingest', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  });
}

function createEnv(handlers: FakeD1QueryHandler[]): Env {
  return { DB: createFakeD1Database(handlers), ADMIN_TOKEN: 'admin-token' } as unknown as Env;
}

function probeAuthHandler(tokenSha256: string): FakeD1QueryHandler {
  return {
    match: (sql) => sql.includes('from probes') && sql.includes('token_sha256'),
    first: (args) =>
      args[0] === tokenSha256
        ? {
            id: PROBE_ID,
            name: 'EdgeOne 广州',
            kind: 'edgeone',
            scope: 'domestic',
            region: 'cn-gz',
            is_required: 1,
            config_version: 1,
          }
        : null,
  };
}

describe('handleProbeIngest', () => {
  it('rejects requests without a valid probe token', async () => {
    const env = createEnv([{ match: 'from probes', first: () => null }]);

    const res = await handleProbeIngest(
      ingestRequest({ batch_id: 'b1', results: [] }),
      env,
      createContext(),
    );

    expect(res.status).toBe(401);
    expect(await res.json()).toMatchObject({
      error: { code: 'UNAUTHORIZED' },
    });
  });

  it('acknowledges a retried batch without touching monitor state', async () => {
    const tokenSha256 = await sha256Hex(TOKEN);
    const run = vi.fn(() => 0);
    const env = createEnv([
      probeAuthHandler(tokenSha256),
      { match: 'insert into probe_batches', run },
    ]);

    const res = await handleProbeIngest(
      ingestRequest({
        probe_id: PROBE_ID,
        batch_id: 'batch-1',
        results: [{ monitor_id: 1, checked_at: Math.floor(Date.now() / 1000), status: 'up' }],
      }),
      env,
      createContext(),
    );

    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, duplicate: true, batch_id: 'batch-1' });
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('persists an accepted result and aggregates it into monitor_state', async () => {
    const now = Math.floor(Date.now() / 1000);
    const tokenSha256 = await sha256Hex(TOKEN);
    const monitorStateRuns: unknown[][] = [];
    const probeStateRuns: unknown[][] = [];
    const probeResultRuns: unknown[][] = [];
    const aggregatedRuns: unknown[][] = [];

    const env = createEnv([
      probeAuthHandler(tokenSha256),
      { match: 'insert into probe_batches', run: () => 1 },
      {
        match: (sql) => sql.includes('from monitors m') && sql.includes('left join monitor_state'),
        all: () => [
          {
            id: 1,
            name: 'Example',
            type: 'http',
            target: 'https://example.com',
            display_url: null,
            interval_sec: 300,
            state_status: null,
            state_last_checked_at: null,
            state_last_changed_at: null,
            state_last_latency_ms: null,
            state_last_error: null,
            state_consecutive_failures: null,
            state_consecutive_successes: null,
          },
        ],
      },
      { match: 'from monitor_probe_state where probe_id', all: () => [] },
      { match: 'select key, value from settings', all: () => [] },
      {
        match: 'insert into probe_check_results',
        run: (args) => {
          probeResultRuns.push(args);
          return 1;
        },
      },
      {
        match: 'insert into check_results',
        run: (args) => {
          aggregatedRuns.push(args);
          return 1;
        },
      },
      {
        match: 'insert into monitor_probe_state',
        run: (args) => {
          probeStateRuns.push(args);
          return 1;
        },
      },
      {
        match: (sql) => sql.includes('from monitor_probe_state s') && sql.includes('join probes p'),
        all: () => [
          {
            monitor_id: 1,
            probe_id: PROBE_ID,
            status: 'up',
            last_checked_at: now,
            is_required: 1,
          },
        ],
      },
      {
        match: 'insert into monitor_state',
        run: (args) => {
          monitorStateRuns.push(args);
          return 1;
        },
      },
      { match: 'update probes set last_seen_at', run: () => 1 },
    ]);

    const res = await handleProbeIngest(
      ingestRequest({
        probe_id: PROBE_ID,
        batch_id: 'batch-2',
        results: [
          {
            monitor_id: 1,
            checked_at: now,
            status: 'up',
            latency_ms: 42,
            http_status: 200,
            attempts: 1,
          },
        ],
      }),
      env,
      createContext(),
    );

    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      ok: true,
      accepted: 1,
      rejected: [],
      applied: [{ monitor_id: 1, status: 'up', reason: 'any_up', changed: true }],
    });

    expect(probeResultRuns).toHaveLength(1);
    // monitor_id, probe_id, batch_id, checked_at, status, latency, http_status, error, attempt
    expect(probeResultRuns[0]?.slice(0, 9)).toEqual([
      1,
      PROBE_ID,
      'batch-2',
      now,
      'up',
      42,
      200,
      null,
      1,
    ]);

    // History keeps a single aggregated series: domestic + overseas merged into one row.
    expect(aggregatedRuns).toHaveLength(1);
    // monitor_id, checked_at, status, latency, http_status, error, location, attempt
    expect(aggregatedRuns[0]?.slice(0, 8)).toEqual([1, now, 'up', 42, 200, null, null, 1]);

    expect(probeStateRuns).toHaveLength(1);
    expect(probeStateRuns[0]?.slice(0, 3)).toEqual([1, PROBE_ID, 'up']);

    expect(monitorStateRuns).toHaveLength(1);
    expect(monitorStateRuns[0]?.slice(0, 2)).toEqual([1, 'up']);
  });
});
