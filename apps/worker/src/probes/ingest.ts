import type { CheckStatus, MonitorStatus } from '@uptimer/db/schema';

import type { Env } from '../env';
import {
  computeNextState,
  type MonitorStateSnapshot,
  type NextState,
} from '../monitor/state-machine';
import type { CheckOutcome } from '../monitor/types';
import { bumpHomepageMonitorGuardVersions } from '../public/homepage-guard-state';
import { probeIngestBodySchema, type ProbeResultInput } from '../schemas/probes';
import {
  createNotifyContext,
  listMaintenanceSuppressedMonitorIds,
  queueMonitorNotification,
} from '../scheduler/notifications';
import { readSettings } from '../settings';
import { authenticateProbe } from './auth';
import {
  computeAggregateStatus,
  computeProbeFreshnessSec,
  type AggregateDecision,
  type ProbeStateSnapshot,
} from './aggregate';

const MAX_BODY_BYTES = 256 * 1024;
const RESULT_MAX_AGE_SEC = 3600;
const RESULT_MAX_FUTURE_SEC = 300;

const CHECK_RESULT_BINDINGS_PER_ROW = 10;
const CHECK_RESULT_BATCH_SIZE = Math.max(1, Math.floor(100 / CHECK_RESULT_BINDINGS_PER_ROW));
const PROBE_STATE_BINDINGS_PER_ROW = 9;
const PROBE_STATE_BATCH_SIZE = Math.max(1, Math.floor(100 / PROBE_STATE_BINDINGS_PER_ROW));
const MAX_STATEMENTS_PER_BATCH = 50;

type IngestMonitorRow = {
  id: number;
  name: string;
  type: 'http' | 'tcp';
  target: string;
  display_url: string | null;
  interval_sec: number;
  state_status: string | null;
  state_last_checked_at: number | null;
  state_last_changed_at: number | null;
  state_last_latency_ms: number | null;
  state_last_error: string | null;
  state_consecutive_failures: number | null;
  state_consecutive_successes: number | null;
};

type ProbeStateRow = {
  monitor_id: number;
  status: string;
  last_checked_at: number | null;
  last_changed_at: number | null;
  last_latency_ms: number | null;
  last_error: string | null;
  consecutive_failures: number;
  consecutive_successes: number;
};

type AggregateStateRow = {
  monitor_id: number;
  probe_id: string;
  status: string;
  last_checked_at: number | null;
  last_latency_ms: number | null;
  last_error: string | null;
  is_required: number | boolean;
};

type RegionUpdate = {
  monitor: IngestMonitorRow;
  result: ProbeResultInput;
  outcome: CheckOutcome;
  next: NextState;
  checkedAt: number;
};

type GlobalUpdate = {
  monitor: IngestMonitorRow;
  prevStatus: MonitorStatus | null;
  decision: AggregateDecision;
  lastCheckedAt: number;
  lastChangedAt: number;
  latencyMs: number | null;
  error: string | null;
  outcome: CheckOutcome;
  consecutiveFailures: number;
  consecutiveSuccesses: number;
  changed: boolean;
};

const CLAIM_BATCH_SQL = `
  INSERT INTO probe_batches (probe_id, batch_id, received_at, result_count)
  VALUES (?1, ?2, ?3, ?4)
  ON CONFLICT(probe_id, batch_id) DO NOTHING
`;

const TOUCH_PROBE_SQL = `
  UPDATE probes
  SET last_seen_at = ?2,
      last_result_at = COALESCE(?3, last_result_at),
      updated_at = ?2
  WHERE id = ?1
`;

const UPSERT_MONITOR_STATE_SQL = `
  INSERT INTO monitor_state (
    monitor_id,
    status,
    last_checked_at,
    last_changed_at,
    last_latency_ms,
    last_error,
    consecutive_failures,
    consecutive_successes
  ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
  ON CONFLICT(monitor_id) DO UPDATE SET
    status = excluded.status,
    last_checked_at = excluded.last_checked_at,
    last_changed_at = excluded.last_changed_at,
    last_latency_ms = excluded.last_latency_ms,
    last_error = excluded.last_error,
    consecutive_failures = excluded.consecutive_failures,
    consecutive_successes = excluded.consecutive_successes
  WHERE monitor_state.last_checked_at IS NULL
     OR excluded.last_checked_at >= monitor_state.last_checked_at
`;

const OPEN_OUTAGE_SQL = `
  INSERT INTO outages (monitor_id, started_at, ended_at, initial_error, last_error)
  SELECT ?1, ?2, NULL, ?3, ?4
  WHERE EXISTS (
    SELECT 1 FROM monitor_state
    WHERE monitor_id = ?5 AND last_checked_at = ?6 AND status = 'down'
  )
    AND NOT EXISTS (
      SELECT 1 FROM outages WHERE monitor_id = ?7 AND ended_at IS NULL
    )
`;

const CLOSE_OUTAGE_SQL = `
  UPDATE outages
  SET ended_at = ?1
  WHERE monitor_id = ?2 AND ended_at IS NULL
    AND EXISTS (
      SELECT 1 FROM monitor_state
      WHERE monitor_id = ?2 AND last_checked_at = ?1 AND status != 'down'
    )
`;

const UPDATE_OUTAGE_SQL = `
  UPDATE outages
  SET last_error = ?1
  WHERE monitor_id = ?2 AND ended_at IS NULL
    AND EXISTS (
      SELECT 1 FROM monitor_state
      WHERE monitor_id = ?2 AND last_checked_at = ?3 AND status = 'down'
    )
`;

const claimBatchStatementByDb = new WeakMap<D1Database, D1PreparedStatement>();
const touchProbeStatementByDb = new WeakMap<D1Database, D1PreparedStatement>();
const upsertMonitorStateStatementByDb = new WeakMap<D1Database, D1PreparedStatement>();
const openOutageStatementByDb = new WeakMap<D1Database, D1PreparedStatement>();
const closeOutageStatementByDb = new WeakMap<D1Database, D1PreparedStatement>();
const updateOutageStatementByDb = new WeakMap<D1Database, D1PreparedStatement>();

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });
}

function toCheckStatus(value: string | null | undefined): CheckStatus | null {
  switch (value) {
    case 'up':
    case 'down':
    case 'maintenance':
    case 'unknown':
      return value;
    default:
      return null;
  }
}

function toMonitorStatus(value: string | null | undefined): MonitorStatus | null {
  switch (value) {
    case 'up':
    case 'down':
    case 'maintenance':
    case 'paused':
    case 'unknown':
      return value;
    default:
      return null;
  }
}

function toCheckOutcome(result: ProbeResultInput): CheckOutcome {
  return {
    status: result.status,
    latencyMs: result.latency_ms ?? null,
    httpStatus: result.http_status ?? null,
    error: result.status === 'up' ? null : (result.error ?? null),
    attempts: result.attempts ?? 1,
  };
}

function buildPlaceholders(count: number, startIndex = 1): string {
  return Array.from({ length: count }, (_, index) => `?${startIndex + index}`).join(', ');
}

async function loadIngestMonitors(db: D1Database, ids: number[]): Promise<IngestMonitorRow[]> {
  if (ids.length === 0) return [];
  const { results } = await db
    .prepare(
      `
      SELECT
        m.id,
        m.name,
        m.type,
        m.target,
        m.display_url,
        m.interval_sec,
        s.status AS state_status,
        s.last_checked_at AS state_last_checked_at,
        s.last_changed_at AS state_last_changed_at,
        s.last_latency_ms AS state_last_latency_ms,
        s.last_error AS state_last_error,
        s.consecutive_failures AS state_consecutive_failures,
        s.consecutive_successes AS state_consecutive_successes
      FROM monitors m
      LEFT JOIN monitor_state s ON s.monitor_id = m.id
      WHERE m.is_active = 1
        AND m.probe_mode = 'multi_region'
        AND m.id IN (${buildPlaceholders(ids.length)})
      ORDER BY m.id
    `,
    )
    .bind(...ids)
    .all<IngestMonitorRow>();
  return results ?? [];
}

async function loadProbeStates(
  db: D1Database,
  probeId: string,
  ids: number[],
): Promise<ProbeStateRow[]> {
  if (ids.length === 0) return [];
  const { results } = await db
    .prepare(
      `
      SELECT
        monitor_id,
        status,
        last_checked_at,
        last_changed_at,
        last_latency_ms,
        last_error,
        consecutive_failures,
        consecutive_successes
      FROM monitor_probe_state
      WHERE probe_id = ?1
        AND monitor_id IN (${buildPlaceholders(ids.length, 2)})
    `,
    )
    .bind(probeId, ...ids)
    .all<ProbeStateRow>();
  return results ?? [];
}

async function loadAggregateStates(db: D1Database, ids: number[]): Promise<AggregateStateRow[]> {
  if (ids.length === 0) return [];
  const { results } = await db
    .prepare(
      `
      SELECT s.monitor_id, s.probe_id, s.status, s.last_checked_at, s.last_latency_ms,
             s.last_error, p.is_required
      FROM monitor_probe_state s
      JOIN probes p ON p.id = s.probe_id
      WHERE p.is_enabled = 1
        AND s.monitor_id IN (${buildPlaceholders(ids.length)})
    `,
    )
    .bind(...ids)
    .all<AggregateStateRow>();
  return results ?? [];
}

function buildCheckResultStatement(
  db: D1Database,
  probeId: string,
  batchId: string,
  rows: RegionUpdate[],
): D1PreparedStatement {
  const tuples = rows
    .map((_, index) => {
      const base = index * CHECK_RESULT_BINDINGS_PER_ROW;
      return `(${buildPlaceholders(CHECK_RESULT_BINDINGS_PER_ROW, base + 1)})`;
    })
    .join(', ');

  const bindings: unknown[] = [];
  for (const update of rows) {
    const { monitor, outcome, checkedAt } = update;
    bindings.push(
      monitor.id,
      checkedAt,
      outcome.status,
      outcome.latencyMs,
      outcome.httpStatus,
      outcome.status === 'up' ? null : outcome.error,
      null,
      outcome.attempts,
      probeId,
      batchId,
    );
  }

  return db
    .prepare(
      `
      INSERT INTO check_results (
        monitor_id,
        checked_at,
        status,
        latency_ms,
        http_status,
        error,
        location,
        attempt,
        probe_id,
        batch_id
      ) VALUES ${tuples}
    `,
    )
    .bind(...bindings);
}

function buildProbeStateStatement(
  db: D1Database,
  probeId: string,
  rows: RegionUpdate[],
): D1PreparedStatement {
  const tuples = rows
    .map((_, index) => {
      const base = index * PROBE_STATE_BINDINGS_PER_ROW;
      return `(${buildPlaceholders(PROBE_STATE_BINDINGS_PER_ROW, base + 1)})`;
    })
    .join(', ');

  const bindings: unknown[] = [];
  for (const update of rows) {
    bindings.push(
      update.monitor.id,
      probeId,
      update.next.status,
      update.checkedAt,
      update.next.lastChangedAt,
      update.outcome.latencyMs,
      update.next.status === 'up' ? null : update.outcome.error,
      update.next.consecutiveFailures,
      update.next.consecutiveSuccesses,
    );
  }

  return db
    .prepare(
      `
      INSERT INTO monitor_probe_state (
        monitor_id,
        probe_id,
        status,
        last_checked_at,
        last_changed_at,
        last_latency_ms,
        last_error,
        consecutive_failures,
        consecutive_successes
      ) VALUES ${tuples}
      ON CONFLICT(monitor_id, probe_id) DO UPDATE SET
        status = excluded.status,
        last_checked_at = excluded.last_checked_at,
        last_changed_at = excluded.last_changed_at,
        last_latency_ms = excluded.last_latency_ms,
        last_error = excluded.last_error,
        consecutive_failures = excluded.consecutive_failures,
        consecutive_successes = excluded.consecutive_successes
      WHERE monitor_probe_state.last_checked_at IS NULL
         OR excluded.last_checked_at >= monitor_probe_state.last_checked_at
    `,
    )
    .bind(...bindings);
}

async function persistRegionObservations(
  db: D1Database,
  probeId: string,
  batchId: string,
  rows: RegionUpdate[],
): Promise<void> {
  const statements: D1PreparedStatement[] = [];

  for (let index = 0; index < rows.length; index += CHECK_RESULT_BATCH_SIZE) {
    const chunk = rows.slice(index, index + CHECK_RESULT_BATCH_SIZE);
    statements.push(buildCheckResultStatement(db, probeId, batchId, chunk));
  }

  for (let index = 0; index < rows.length; index += PROBE_STATE_BATCH_SIZE) {
    const chunk = rows.slice(index, index + PROBE_STATE_BATCH_SIZE);
    statements.push(buildProbeStateStatement(db, probeId, chunk));
  }

  for (let index = 0; index < statements.length; index += MAX_STATEMENTS_PER_BATCH) {
    await db.batch(statements.slice(index, index + MAX_STATEMENTS_PER_BATCH));
  }
}

function buildGlobalStateStatements(
  db: D1Database,
  updates: GlobalUpdate[],
): D1PreparedStatement[] {
  const statements: D1PreparedStatement[] = [];

  for (const update of updates) {
    const upsertCached = upsertMonitorStateStatementByDb.get(db);
    const upsert = upsertCached ?? db.prepare(UPSERT_MONITOR_STATE_SQL);
    if (!upsertCached) {
      upsertMonitorStateStatementByDb.set(db, upsert);
    }

    statements.push(
      upsert.bind(
        update.monitor.id,
        update.decision.status,
        update.lastCheckedAt,
        update.lastChangedAt,
        update.latencyMs,
        update.error,
        update.consecutiveFailures,
        update.consecutiveSuccesses,
      ),
    );

    if (update.prevStatus !== 'down' && update.decision.status === 'down') {
      const cached = openOutageStatementByDb.get(db);
      const open = cached ?? db.prepare(OPEN_OUTAGE_SQL);
      if (!cached) {
        openOutageStatementByDb.set(db, open);
      }
      statements.push(
        open.bind(
          update.monitor.id,
          update.lastCheckedAt,
          update.error ?? 'down',
          update.error ?? 'down',
          update.monitor.id,
          update.lastCheckedAt,
          update.monitor.id,
        ),
      );
    } else if (update.prevStatus === 'down' && update.decision.status !== 'down') {
      const cached = closeOutageStatementByDb.get(db);
      const close = cached ?? db.prepare(CLOSE_OUTAGE_SQL);
      if (!cached) {
        closeOutageStatementByDb.set(db, close);
      }
      statements.push(close.bind(update.lastCheckedAt, update.monitor.id));
    } else if (update.prevStatus === 'down' && update.decision.status === 'down' && update.error) {
      const cached = updateOutageStatementByDb.get(db);
      const updateOutage = cached ?? db.prepare(UPDATE_OUTAGE_SQL);
      if (!cached) {
        updateOutageStatementByDb.set(db, updateOutage);
      }
      statements.push(updateOutage.bind(update.error, update.monitor.id, update.lastCheckedAt));
    }
  }

  return statements;
}

async function touchProbe(
  db: D1Database,
  probeId: string,
  now: number,
  lastResultAt: number | null,
): Promise<void> {
  const cached = touchProbeStatementByDb.get(db);
  const statement = cached ?? db.prepare(TOUCH_PROBE_SQL);
  if (!cached) {
    touchProbeStatementByDb.set(db, statement);
  }
  await statement.bind(probeId, now, lastResultAt).run();
}

/**
 * Accepts a batch of probe observations.
 *
 * The pipeline is:
 * 1. authenticate the probe and claim the batch id (idempotent retries),
 * 2. run each probe's own state machine (region streaks, out-of-order protection),
 * 3. persist raw results and region state,
 * 4. aggregate region states into monitor_state, outages and notifications.
 *
 * A claimed batch id is never applied twice. If processing fails, the probe should retry with
 * a new batch id; reusing the failed id is acknowledged as a duplicate and applies nothing.
 *
 * Probe results never write monitor_state directly: that keeps one failing region from
 * flipping the global status of a monitor that other regions can still reach.
 */
export async function handleProbeIngest(
  request: Request,
  env: Env,
  ctx: ExecutionContext,
): Promise<Response> {
  const contentLength = request.headers.get('content-length');
  if (contentLength) {
    const parsedLength = Number.parseInt(contentLength, 10);
    if (Number.isFinite(parsedLength) && parsedLength > MAX_BODY_BYTES) {
      return jsonResponse(
        { error: { code: 'PAYLOAD_TOO_LARGE', message: 'Probe batch is too large' } },
        413,
      );
    }
  }

  const probe = await authenticateProbe(env.DB, request);
  if (!probe) {
    return jsonResponse({ error: { code: 'UNAUTHORIZED', message: 'Invalid probe token' } }, 401);
  }

  const rawBody = await request.json().catch(() => null);
  const parsed = probeIngestBodySchema.safeParse(rawBody);
  if (!parsed.success) {
    return jsonResponse(
      { error: { code: 'INVALID_ARGUMENT', message: parsed.error.message } },
      400,
    );
  }

  const body = parsed.data;
  if (body.probe_id && body.probe_id !== probe.id) {
    return jsonResponse(
      { error: { code: 'FORBIDDEN', message: 'probe_id does not match the presented token' } },
      403,
    );
  }

  const now = Math.floor(Date.now() / 1000);

  const claimCached = claimBatchStatementByDb.get(env.DB);
  const claim = claimCached ?? env.DB.prepare(CLAIM_BATCH_SQL);
  if (!claimCached) {
    claimBatchStatementByDb.set(env.DB, claim);
  }
  const claimed = await claim.bind(probe.id, body.batch_id, now, body.results.length).run();
  if ((claimed.meta.changes ?? 0) === 0) {
    return jsonResponse({
      ok: true,
      duplicate: true,
      probe_id: probe.id,
      batch_id: body.batch_id,
    });
  }

  const monitorIds = [...new Set(body.results.map((result) => result.monitor_id))];
  const monitors = await loadIngestMonitors(env.DB, monitorIds);
  const monitorById = new Map(monitors.map((monitor) => [monitor.id, monitor]));

  const rejected: { monitor_id: number; reason: string }[] = [];
  const newestByMonitor = new Map<number, ProbeResultInput>();
  let deduplicated = 0;

  for (const result of body.results) {
    if (!monitorById.has(result.monitor_id)) {
      rejected.push({ monitor_id: result.monitor_id, reason: 'unknown_monitor' });
      continue;
    }
    if (result.checked_at > now + RESULT_MAX_FUTURE_SEC) {
      rejected.push({ monitor_id: result.monitor_id, reason: 'future_result' });
      continue;
    }
    if (result.checked_at < now - RESULT_MAX_AGE_SEC) {
      rejected.push({ monitor_id: result.monitor_id, reason: 'stale_result' });
      continue;
    }

    const existing = newestByMonitor.get(result.monitor_id);
    if (!existing) {
      newestByMonitor.set(result.monitor_id, result);
      continue;
    }
    deduplicated += 1;
    if (result.checked_at > existing.checked_at) {
      newestByMonitor.set(result.monitor_id, result);
    }
  }

  if (newestByMonitor.size === 0) {
    await touchProbe(env.DB, probe.id, now, null);
    return jsonResponse({
      ok: true,
      probe_id: probe.id,
      batch_id: body.batch_id,
      accepted: 0,
      deduplicated,
      rejected,
      applied: [],
    });
  }

  const acceptedIds = [...newestByMonitor.keys()];
  const [stateRows, settings] = await Promise.all([
    loadProbeStates(env.DB, probe.id, acceptedIds),
    readSettings(env.DB),
  ]);
  const stateByMonitor = new Map(stateRows.map((row) => [row.monitor_id, row]));

  const regionUpdates: RegionUpdate[] = [];
  for (const [monitorId, result] of newestByMonitor) {
    const monitor = monitorById.get(monitorId);
    if (!monitor) continue;

    const prevRow = stateByMonitor.get(monitorId);
    const prevStatus = toCheckStatus(prevRow?.status ?? null);
    const prev: MonitorStateSnapshot | null =
      prevStatus === null
        ? null
        : {
            status: prevStatus,
            lastChangedAt: prevRow?.last_changed_at ?? null,
            consecutiveFailures: prevRow?.consecutive_failures ?? 0,
            consecutiveSuccesses: prevRow?.consecutive_successes ?? 0,
          };

    const outcome = toCheckOutcome(result);
    const { next } = computeNextState(prev, outcome, result.checked_at, {
      failuresToDownFromUp: settings.state_failures_to_down_from_up,
      successesToUpFromDown: settings.state_successes_to_up_from_down,
    });

    regionUpdates.push({ monitor, result, outcome, next, checkedAt: result.checked_at });
  }

  await persistRegionObservations(env.DB, probe.id, body.batch_id, regionUpdates);

  const aggregateRows = await loadAggregateStates(
    env.DB,
    regionUpdates.map((update) => update.monitor.id),
  );
  const aggregateByMonitor = new Map<number, ProbeStateSnapshot[]>();
  for (const row of aggregateRows) {
    const status = toCheckStatus(row.status);
    if (status === null) continue;
    const list = aggregateByMonitor.get(row.monitor_id) ?? [];
    list.push({
      probeId: row.probe_id,
      required: row.is_required === 1 || row.is_required === true,
      status,
      lastCheckedAt: row.last_checked_at,
      latencyMs: row.last_latency_ms,
      error: row.last_error,
    });
    aggregateByMonitor.set(row.monitor_id, list);
  }

  const globalUpdates: GlobalUpdate[] = [];
  for (const update of regionUpdates) {
    const { monitor, result, outcome } = update;
    const prevStatus = toMonitorStatus(monitor.state_status);
    const decision = computeAggregateStatus({
      previousStatus: prevStatus,
      probeStates: aggregateByMonitor.get(monitor.id) ?? [],
      now,
      freshnessSec: computeProbeFreshnessSec(monitor.interval_sec),
    });

    const freshCheckedAt = (aggregateByMonitor.get(monitor.id) ?? [])
      .map((state) => state.lastCheckedAt)
      .filter((value): value is number => value !== null);
    const lastCheckedAt =
      freshCheckedAt.length > 0
        ? Math.max(...freshCheckedAt)
        : (monitor.state_last_checked_at ?? update.checkedAt);

    const changed = decision.status !== (prevStatus ?? 'unknown');
    const lastChangedAt = changed
      ? lastCheckedAt
      : (monitor.state_last_changed_at ?? lastCheckedAt);

    // Use the newest regional observation for latency/error so an out-of-order retry cannot
    // overwrite fresher data with an older result.
    const probeStates = aggregateByMonitor.get(monitor.id) ?? [];
    let latestState: ProbeStateSnapshot | null = null;
    for (const state of probeStates) {
      if (state.lastCheckedAt === null) continue;
      if (
        latestState === null ||
        latestState.lastCheckedAt === null ||
        state.lastCheckedAt > latestState.lastCheckedAt
      ) {
        latestState = state;
      }
    }

    const latencyMs =
      latestState?.latencyMs ?? result.latency_ms ?? monitor.state_last_latency_ms ?? null;
    const error =
      decision.status === 'up'
        ? null
        : (latestState?.error ?? result.error ?? monitor.state_last_error ?? outcome.error ?? null);

    const notificationOutcome: CheckOutcome = {
      status:
        decision.status === 'up' || decision.status === 'down' || decision.status === 'unknown'
          ? decision.status
          : 'unknown',
      latencyMs,
      httpStatus: result.http_status ?? null,
      error,
      attempts: outcome.attempts,
    };

    globalUpdates.push({
      monitor,
      prevStatus,
      decision,
      lastCheckedAt,
      lastChangedAt,
      latencyMs,
      error,
      outcome: notificationOutcome,
      consecutiveFailures: changed ? 0 : (monitor.state_consecutive_failures ?? 0),
      consecutiveSuccesses: changed ? 0 : (monitor.state_consecutive_successes ?? 0),
      changed,
    });
  }

  const statements = buildGlobalStateStatements(env.DB, globalUpdates);
  for (let index = 0; index < statements.length; index += MAX_STATEMENTS_PER_BATCH) {
    await env.DB.batch(statements.slice(index, index + MAX_STATEMENTS_PER_BATCH));
  }

  const changedUpdates = globalUpdates.filter((update) => update.changed);
  if (changedUpdates.length > 0) {
    const notify = await createNotifyContext(env, ctx);
    if (notify) {
      const suppressed = await listMaintenanceSuppressedMonitorIds(
        env.DB,
        now,
        changedUpdates.map((update) => update.monitor.id),
      );
      for (const update of changedUpdates) {
        queueMonitorNotification(env, notify, {
          row: {
            id: update.monitor.id,
            name: update.monitor.name,
            type: update.monitor.type,
            target: update.monitor.target,
            display_url: update.monitor.display_url,
          },
          checkedAt: update.lastCheckedAt,
          prevStatus: update.prevStatus,
          outcome: update.outcome,
          next: {
            status: update.decision.status,
            lastChangedAt: update.lastChangedAt,
            consecutiveFailures: update.consecutiveFailures,
            consecutiveSuccesses: update.consecutiveSuccesses,
            changed: true,
          },
          maintenanceSuppressed: suppressed.has(update.monitor.id),
        });
      }
    }

    // Invalidate the precomputed public snapshot; the next cron tick (<= 60s) rebuilds it.
    await bumpHomepageMonitorGuardVersions(env.DB).catch((err) => {
      console.warn('probe ingest: failed to bump homepage guard versions', err);
    });
  }

  await touchProbe(env.DB, probe.id, now, now);

  return jsonResponse({
    ok: true,
    probe_id: probe.id,
    batch_id: body.batch_id,
    accepted: regionUpdates.length,
    deduplicated,
    rejected,
    applied: globalUpdates.map((update) => ({
      monitor_id: update.monitor.id,
      status: update.decision.status,
      reason: update.decision.reason,
      changed: update.changed,
    })),
  });
}
