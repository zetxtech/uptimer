import {
  expectedStatusJsonSchema,
  forbiddenStatusJsonSchema,
  httpHeadersJsonSchema,
  parseDbJsonNullable,
  type StatusCodeRule,
} from '@uptimer/db/json';
import type { HttpResponseMatchMode, ProbeKind } from '@uptimer/db/schema';

export type AssignedMonitorHttp = {
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD';
  headers: Record<string, string> | null;
  body: string | null;
  followRedirects: boolean;
  expectedStatus: StatusCodeRule[] | null;
  forbiddenStatus: StatusCodeRule[] | null;
  responseKeyword: string | null;
  responseKeywordMode: HttpResponseMatchMode | null;
  responseForbiddenKeyword: string | null;
  responseForbiddenKeywordMode: HttpResponseMatchMode | null;
};

export type AssignedMonitor = {
  id: number;
  name: string;
  type: 'http' | 'tcp';
  target: string;
  intervalSec: number;
  timeoutMs: number;
  stateStatus: string | null;
  http: AssignedMonitorHttp | null;
};

type AssignedMonitorRow = {
  id: number;
  name: string;
  type: 'http' | 'tcp';
  target: string;
  interval_sec: number;
  timeout_ms: number;
  state_status: string | null;
  http_method: string | null;
  http_headers_json: string | null;
  http_body: string | null;
  follow_redirects: number | boolean;
  expected_status_json: string | null;
  forbidden_status_json: string | null;
  response_keyword: string | null;
  response_keyword_mode: string | null;
  response_forbidden_keyword: string | null;
  response_forbidden_keyword_mode: string | null;
};

const LIST_ASSIGNED_MONITORS_SQL = `
  SELECT
    m.id,
    m.name,
    m.type,
    m.target,
    m.interval_sec,
    m.timeout_ms,
    s.status AS state_status,
    m.http_method,
    m.http_headers_json,
    m.http_body,
    m.follow_redirects,
    m.expected_status_json,
    m.forbidden_status_json,
    m.response_keyword,
    m.response_keyword_mode,
    m.response_forbidden_keyword,
    m.response_forbidden_keyword_mode
  FROM monitors m
  LEFT JOIN monitor_state s ON s.monitor_id = m.id
  WHERE m.is_active = 1 AND m.probe_mode = 'multi_region'
  ORDER BY m.id
`;

const listAssignedMonitorsStatementByDb = new WeakMap<D1Database, D1PreparedStatement>();

function toBooleanDefaultTrue(value: number | boolean): boolean {
  return value !== false && value !== 0;
}

function toHttpMethod(value: string | null): AssignedMonitorHttp['method'] {
  const normalized = (value ?? 'GET').toUpperCase();
  switch (normalized) {
    case 'POST':
    case 'PUT':
    case 'PATCH':
    case 'DELETE':
    case 'HEAD':
      return normalized;
    default:
      return 'GET';
  }
}

/**
 * Edge functions cannot open raw TCP sockets, so those probes only receive HTTP monitors.
 */
export function probeKindSupportsTcp(kind: ProbeKind): boolean {
  return kind !== 'edgeone';
}

export function monitorSupportsProbeKind(kind: ProbeKind, type: 'http' | 'tcp'): boolean {
  return type === 'http' || probeKindSupportsTcp(kind);
}

export async function loadAssignedMonitors(
  db: D1Database,
  kind: ProbeKind,
): Promise<AssignedMonitor[]> {
  const cached = listAssignedMonitorsStatementByDb.get(db);
  const statement = cached ?? db.prepare(LIST_ASSIGNED_MONITORS_SQL);
  if (!cached) {
    listAssignedMonitorsStatementByDb.set(db, statement);
  }

  const { results } = await statement.all<AssignedMonitorRow>();

  return (results ?? [])
    .filter((row) => monitorSupportsProbeKind(kind, row.type))
    .map((row) => ({
      id: row.id,
      name: row.name,
      type: row.type,
      target: row.target,
      intervalSec: row.interval_sec,
      timeoutMs: row.timeout_ms,
      stateStatus: row.state_status,
      http:
        row.type === 'http'
          ? {
              method: toHttpMethod(row.http_method),
              headers: parseDbJsonNullable(httpHeadersJsonSchema, row.http_headers_json, {
                field: 'http_headers_json',
              }),
              body: row.http_body,
              followRedirects: toBooleanDefaultTrue(row.follow_redirects),
              expectedStatus: parseDbJsonNullable(
                expectedStatusJsonSchema,
                row.expected_status_json,
                { field: 'expected_status_json' },
              ),
              forbiddenStatus: parseDbJsonNullable(
                forbiddenStatusJsonSchema,
                row.forbidden_status_json,
                { field: 'forbidden_status_json' },
              ),
              responseKeyword: row.response_keyword,
              responseKeywordMode: row.response_keyword_mode as HttpResponseMatchMode | null,
              responseForbiddenKeyword: row.response_forbidden_keyword,
              responseForbiddenKeywordMode:
                row.response_forbidden_keyword_mode as HttpResponseMatchMode | null,
            }
          : null,
    }));
}

/**
 * Deterministic shard assignment: monitor ids are spread across shards by modulo, so every
 * monitor is probed by exactly one shard per interval.
 */
export function selectShardMonitors(
  monitors: readonly AssignedMonitor[],
  shardIndex: number,
  shardCount: number,
): AssignedMonitor[] {
  if (shardCount <= 1) {
    return [...monitors];
  }
  const safeIndex = ((shardIndex % shardCount) + shardCount) % shardCount;
  return monitors.filter((monitor) => monitor.id % shardCount === safeIndex);
}

export function filterDueMonitors(
  monitors: readonly AssignedMonitor[],
  lastCheckedAtByMonitorId: ReadonlyMap<number, number | null>,
  now: number,
): AssignedMonitor[] {
  return monitors.filter((monitor) => {
    if (monitor.stateStatus === 'paused') {
      return false;
    }
    const lastCheckedAt = lastCheckedAtByMonitorId.get(monitor.id) ?? null;
    if (lastCheckedAt === null) {
      return true;
    }
    return lastCheckedAt <= now - monitor.intervalSec;
  });
}

const READ_DUE_STATE_SQL_PREFIX = `
  SELECT monitor_id, last_checked_at
  FROM monitor_probe_state
  WHERE probe_id = ?1
    AND monitor_id IN (
`;

/**
 * Reads this probe's own last-check timestamps so a shard only probes what is actually due,
 * independent of what other probes have reported.
 */
export async function loadProbeLastCheckedAt(
  db: D1Database,
  probeId: string,
  monitorIds: readonly number[],
): Promise<Map<number, number | null>> {
  const ids = [...new Set(monitorIds)];
  if (ids.length === 0) {
    return new Map();
  }

  const placeholders = ids.map((_, index) => `?${index + 2}`).join(', ');
  const { results } = await db
    .prepare(`${READ_DUE_STATE_SQL_PREFIX}${placeholders})`)
    .bind(probeId, ...ids)
    .all<{ monitor_id: number; last_checked_at: number | null }>();

  return new Map((results ?? []).map((row) => [row.monitor_id, row.last_checked_at]));
}
