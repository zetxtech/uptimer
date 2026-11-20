import type { Env } from '../env';
import type { ShardRunInput, ShardRunResult } from './shard-task';

/**
 * Overseas probe shard.
 *
 * Sharding is deterministic (monitor id modulo shard count), so each monitor is probed by
 * exactly one shard per interval. A Durable Object's location is best-effort (see
 * `locationHint`) and it never moves after creation, so shards are a placement/coordination
 * mechanism rather than a fixed-city probe.
 *
 * This is intentionally a plain class rather than `extends DurableObject`: importing
 * `cloudflare:workers` would break the node-environment unit tests that import the Worker
 * entry module, and nothing here needs the base class helpers. Stub RPC works with any
 * exported class, and the probing logic is loaded lazily so the public request path does not
 * pay for it on cold start.
 */
export class ProbeShard {
  constructor(
    private readonly ctx: DurableObjectState,
    private readonly env: Env,
  ) {}

  async runShard(input: ShardRunInput): Promise<ShardRunResult> {
    const { runProbeShard } = await import('./shard-task');
    // DurableObjectState exposes waitUntil, which is all the ingest core needs from the context.
    return await runProbeShard(this.env, this.ctx as unknown as ExecutionContext, input);
  }
}
