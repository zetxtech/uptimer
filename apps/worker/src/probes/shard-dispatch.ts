import type { Env } from '../env';
import type { ShardRunInput, ShardRunResult } from './shard-task';

const DEFAULT_SHARD_COUNT = 1;
const MAX_SHARD_COUNT = 8;
const DEFAULT_PROBE_ID = 'cf-do';

export type ShardDispatchSummary = {
  enabled: boolean;
  skippedReason?: string;
  shardCount: number;
  probeId: string;
  probed: number;
  accepted: number;
  applied: number;
  failures: { shardIndex: number; error: string }[];
};

function isTruthy(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  const normalized = value.trim().toLowerCase();
  return normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on';
}

function readBoundedInt(value: unknown, fallback: number, min: number, max: number): number {
  if (typeof value !== 'string') return fallback;
  const parsed = Number.parseInt(value.trim(), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

export function resolveShardProbeId(env: Env): string {
  const raw = env.UPTIMER_DO_PROBE_ID;
  const trimmed = typeof raw === 'string' ? raw.trim() : '';
  return trimmed.length > 0 ? trimmed : DEFAULT_PROBE_ID;
}

export function resolveShardCount(env: Env): number {
  return readBoundedInt(env.UPTIMER_DO_SHARD_COUNT, DEFAULT_SHARD_COUNT, 1, MAX_SHARD_COUNT);
}

export function isProbeShardDispatchEnabled(env: Env): boolean {
  return Boolean(env.PROBE_SHARD) && isTruthy(env.UPTIMER_DO_PROBES);
}

/**
 * Dispatches the overseas probe shards.
 *
 * The Durable Object binding is the same Worker, so this is additive: it never touches the
 * in-Worker cron path, which still owns `probe_mode = 'worker'` monitors. Shard failures are
 * isolated (allSettled) so one unhealthy shard cannot stop the others or the cron tick.
 */
export async function runProbeShardDispatch(
  env: Env,
  ctx: ExecutionContext,
): Promise<ShardDispatchSummary> {
  const probeId = resolveShardProbeId(env);
  const shardCount = resolveShardCount(env);
  const namespace = env.PROBE_SHARD;

  const skeleton: ShardDispatchSummary = {
    enabled: true,
    shardCount,
    probeId,
    probed: 0,
    accepted: 0,
    applied: 0,
    failures: [],
  };

  if (!namespace) {
    return { ...skeleton, enabled: false, skippedReason: 'binding_missing' };
  }

  const locationHint = (env.UPTIMER_DO_LOCATION_HINT ?? '').trim();

  const settled = await Promise.allSettled(
    Array.from({ length: shardCount }, async (_unused, shardIndex) => {
      const id = namespace.idFromName(`shard-${shardIndex}`);
      const stub = locationHint
        ? namespace.get(id, { locationHint: locationHint as DurableObjectLocationHint })
        : namespace.get(id);
      const input: ShardRunInput = { probeId, shardIndex, shardCount };
      const runnable = stub as unknown as {
        runShard(next: ShardRunInput): Promise<ShardRunResult>;
      };
      return await runnable.runShard(input);
    }),
  );

  const summary: ShardDispatchSummary = { ...skeleton };

  settled.forEach((entry, shardIndex) => {
    if (entry.status === 'rejected') {
      const error = entry.reason instanceof Error ? entry.reason.message : String(entry.reason);
      summary.failures.push({ shardIndex, error });
      return;
    }
    const result = entry.value;
    if (!result.ok) {
      summary.failures.push({ shardIndex, error: result.reason ?? 'shard_failed' });
      return;
    }
    summary.probed += result.probed;
    summary.accepted += result.accepted;
    summary.applied += result.applied;
  });

  // Keeps the dispatch observable in Tail/Workers Logs without changing the cron contract.
  if (summary.probed > 0 || summary.failures.length > 0) {
    console.log(
      `probe_shard_dispatch ${JSON.stringify({
        probe_id: probeId,
        shard_count: shardCount,
        probed: summary.probed,
        accepted: summary.accepted,
        applied: summary.applied,
        failures: summary.failures.length,
      })}`,
    );
  }

  void ctx;

  return summary;
}
