import {
  expectedStatusJsonSchema,
  forbiddenStatusJsonSchema,
  httpHeadersJsonSchema,
  parseDbJsonNullable,
} from '@uptimer/db/json';

import type { Env } from '../env';
import { authenticateProbe, type AuthenticatedProbe } from './auth';

type MonitorConfigRow = {
  id: number;
  name: string;
  type: 'http' | 'tcp';
  target: string;
  interval_sec: number;
  timeout_ms: number;
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
  updated_at: number;
};

const LIST_PROBE_MONITORS_SQL = `
  SELECT
    id,
    name,
    type,
    target,
    interval_sec,
    timeout_ms,
    http_method,
    http_headers_json,
    http_body,
    follow_redirects,
    expected_status_json,
    forbidden_status_json,
    response_keyword,
    response_keyword_mode,
    response_forbidden_keyword,
    response_forbidden_keyword_mode,
    updated_at
  FROM monitors
  WHERE is_active = 1 AND probe_mode = 'multi_region'
  ORDER BY id
`;

const TOUCH_PROBE_SQL = `
  UPDATE probes
  SET last_seen_at = ?2, updated_at = ?2
  WHERE id = ?1
`;

const listProbeMonitorsStatementByDb = new WeakMap<D1Database, D1PreparedStatement>();
const touchProbeStatementByDb = new WeakMap<D1Database, D1PreparedStatement>();

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });
}

function toBooleanDefaultTrue(value: number | boolean): boolean {
  return value !== false && value !== 0;
}

function probeSupportsMonitor(probe: AuthenticatedProbe, type: 'http' | 'tcp'): boolean {
  // Edge functions can only make HTTP requests; raw TCP sockets are not available there.
  if (probe.kind === 'edgeone') {
    return type === 'http';
  }
  return true;
}

/**
 * Returns the probe's assignment: every active monitor that opted into multi-region probing.
 *
 * The response contains monitor headers and bodies, so it is served with `no-store` and must
 * only be reachable with a probe token (never the admin token).
 */
export async function handleProbeConfig(request: Request, env: Env): Promise<Response> {
  const probe = await authenticateProbe(env.DB, request);
  if (!probe) {
    return jsonResponse({ error: { code: 'UNAUTHORIZED', message: 'Invalid probe token' } }, 401);
  }

  const cached = listProbeMonitorsStatementByDb.get(env.DB);
  const statement = cached ?? env.DB.prepare(LIST_PROBE_MONITORS_SQL);
  if (!cached) {
    listProbeMonitorsStatementByDb.set(env.DB, statement);
  }

  const { results } = await statement.all<MonitorConfigRow>();
  const rows = results ?? [];
  const now = Math.floor(Date.now() / 1000);

  const monitors = rows
    .filter((row) => probeSupportsMonitor(probe, row.type))
    .map((row) => ({
      id: row.id,
      name: row.name,
      type: row.type,
      target: row.target,
      interval_sec: row.interval_sec,
      timeout_ms: row.timeout_ms,
      http_method: row.http_method,
      http_headers: parseDbJsonNullable(httpHeadersJsonSchema, row.http_headers_json, {
        field: 'http_headers_json',
      }),
      http_body: row.http_body,
      follow_redirects: toBooleanDefaultTrue(row.follow_redirects),
      expected_status: parseDbJsonNullable(expectedStatusJsonSchema, row.expected_status_json, {
        field: 'expected_status_json',
      }),
      forbidden_status: parseDbJsonNullable(forbiddenStatusJsonSchema, row.forbidden_status_json, {
        field: 'forbidden_status_json',
      }),
      response_keyword: row.response_keyword,
      response_keyword_mode: row.response_keyword_mode,
      response_forbidden_keyword: row.response_forbidden_keyword,
      response_forbidden_keyword_mode: row.response_forbidden_keyword_mode,
    }));

  const maxUpdatedAt = rows.reduce((max, row) => Math.max(max, row.updated_at ?? 0), 0);

  const touchCached = touchProbeStatementByDb.get(env.DB);
  const touch = touchCached ?? env.DB.prepare(TOUCH_PROBE_SQL);
  if (!touchCached) {
    touchProbeStatementByDb.set(env.DB, touch);
  }
  await touch.bind(probe.id, now).run();

  return jsonResponse({
    probe: {
      id: probe.id,
      name: probe.name,
      kind: probe.kind,
      scope: probe.scope,
      region: probe.region,
    },
    config_revision: `${probe.configVersion}:${maxUpdatedAt}`,
    generated_at: now,
    monitors,
  });
}
