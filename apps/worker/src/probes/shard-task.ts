import pLimit from 'p-limit';

import type { Env } from '../env';
import { runHttpCheck } from '../monitor/http';
import { runTcpCheck } from '../monitor/tcp';
import type { CheckOutcome } from '../monitor/types';
import type { ProbeResultInput } from '../schemas/probes';
import {
  filterDueMonitors,
  loadAssignedMonitors,
  loadProbeLastCheckedAt,
  selectShardMonitors,
  type AssignedMonitor,
} from './assignment';
import { ingestProbeBatch, resolveProbeById } from './core';

const SHARD_CHECK_CONCURRENCY = 5;
const MAX_RESULTS_PER_BATCH = 64;

export type ShardRunInput = {
  probeId: string;
  shardIndex: number;
  shardCount: number;
};

export type ShardRunResult = {
  ok: boolean;
  reason?: string;
  probeId: string;
  shardIndex: number;
  shardCount: number;
  probeModeCount: number;
  assigned: number;
  due: number;
  probed: number;
  batchId: string | null;
  accepted: number;
  applied: number;
  duplicate: boolean;
};

function makeBatchId(probeId: string, shardIndex: number): string {
  const suffix =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `${probeId}-s${shardIndex}-${suffix}`;
}

function baseResult(input: ShardRunInput, overrides: Partial<ShardRunResult>): ShardRunResult {
  return {
    ok: true,
    probeId: input.probeId,
    shardIndex: input.shardIndex,
    shardCount: input.shardCount,
    probeModeCount: 0,
    assigned: 0,
    due: 0,
    probed: 0,
    batchId: null,
    accepted: 0,
    applied: 0,
    duplicate: false,
    ...overrides,
  };
}

async function checkMonitor(monitor: AssignedMonitor): Promise<ProbeResultInput> {
  const checkedAt = Math.floor(Date.now() / 1000);

  let outcome: CheckOutcome;
  try {
    if (monitor.type === 'http' && monitor.http) {
      outcome = await runHttpCheck({
        url: monitor.target,
        timeoutMs: monitor.timeoutMs,
        method: monitor.http.method,
        headers: monitor.http.headers,
        body: monitor.http.body,
        followRedirects: monitor.http.followRedirects,
        expectedStatus: monitor.http.expectedStatus,
        forbiddenStatus: monitor.http.forbiddenStatus,
        responseKeyword: monitor.http.responseKeyword,
        responseKeywordMode: monitor.http.responseKeywordMode,
        responseForbiddenKeyword: monitor.http.responseForbiddenKeyword,
        responseForbiddenKeywordMode: monitor.http.responseForbiddenKeywordMode,
      });
    } else if (monitor.type === 'tcp') {
      outcome = await runTcpCheck({ target: monitor.target, timeoutMs: monitor.timeoutMs });
    } else {
      outcome = {
        status: 'unknown',
        latencyMs: null,
        httpStatus: null,
        error: `Unsupported monitor type: ${String(monitor.type)}`,
        attempts: 1,
      };
    }
  } catch (err) {
    outcome = {
      status: 'unknown',
      latencyMs: null,
      httpStatus: null,
      error: err instanceof Error ? err.message : String(err),
      attempts: 1,
    };
  }

  return {
    monitor_id: monitor.id,
    checked_at: checkedAt,
    status: outcome.status,
    latency_ms: outcome.latencyMs,
    http_status: outcome.httpStatus,
    error: outcome.error,
    attempts: outcome.attempts,
  };
}

/**
 * Runs one shard of the overseas probe: loads the multi-region assignment, keeps only the
 * checks this shard owns and that are due, probes them, then feeds the shared ingest core.
 */
export async function runProbeShard(
  env: Env,
  ctx: ExecutionContext,
  input: ShardRunInput,
): Promise<ShardRunResult> {
  const now = Math.floor(Date.now() / 1000);

  const probe = await resolveProbeById(env.DB, input.probeId);
  if (!probe) {
    return baseResult(input, { ok: false, reason: 'probe_not_registered' });
  }

  const assignedAll = await loadAssignedMonitors(env.DB, probe.kind);
  const assignedToShard = selectShardMonitors(assignedAll, input.shardIndex, input.shardCount);
  const lastCheckedAt = await loadProbeLastCheckedAt(
    env.DB,
    probe.id,
    assignedToShard.map((monitor) => monitor.id),
  );

  const due = filterDueMonitors(assignedToShard, lastCheckedAt, now).slice(
    0,
    MAX_RESULTS_PER_BATCH,
  );

  if (due.length === 0) {
    return baseResult(input, {
      probeModeCount: assignedAll.length,
      assigned: assignedToShard.length,
    });
  }

  const limit = pLimit(SHARD_CHECK_CONCURRENCY);
  const results = await Promise.all(due.map((monitor) => limit(() => checkMonitor(monitor))));

  const batchId = makeBatchId(probe.id, input.shardIndex);
  const summary = await ingestProbeBatch({ env, ctx, probe, batchId, results, now });

  return baseResult(input, {
    probeModeCount: assignedAll.length,
    assigned: assignedToShard.length,
    due: due.length,
    probed: results.length,
    batchId,
    accepted: summary.accepted,
    applied: summary.applied.length,
    duplicate: summary.duplicate,
  });
}
