import type { Env } from '../env';
import { authenticateProbe, type AuthenticatedProbe } from './auth';
import { loadAssignedMonitors } from './assignment';

const TOUCH_PROBE_SQL = `
  UPDATE probes
  SET last_seen_at = ?2, updated_at = ?2
  WHERE id = ?1
`;

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

  return await buildProbeConfigResponse(env, probe);
}

/** Shared by the token-authenticated endpoint and trusted in-platform probes. */
export async function buildProbeConfigResponse(
  env: Env,
  probe: AuthenticatedProbe,
): Promise<Response> {
  const assigned = await loadAssignedMonitors(env.DB, probe.kind);
  const now = Math.floor(Date.now() / 1000);

  const monitors = assigned.map((monitor) => ({
    id: monitor.id,
    name: monitor.name,
    type: monitor.type,
    target: monitor.target,
    interval_sec: monitor.intervalSec,
    timeout_ms: monitor.timeoutMs,
    http_method: monitor.http?.method ?? null,
    http_headers: monitor.http?.headers ?? null,
    http_body: monitor.http?.body ?? null,
    follow_redirects: monitor.http?.followRedirects ?? true,
    expected_status: monitor.http?.expectedStatus ?? null,
    forbidden_status: monitor.http?.forbiddenStatus ?? null,
    response_keyword: monitor.http?.responseKeyword ?? null,
    response_keyword_mode: monitor.http?.responseKeywordMode ?? null,
    response_forbidden_keyword: monitor.http?.responseForbiddenKeyword ?? null,
    response_forbidden_keyword_mode: monitor.http?.responseForbiddenKeywordMode ?? null,
  }));

  const touchCached = touchProbeStatementByDb.get(env.DB);
  const touch = touchCached ?? env.DB.prepare(TOUCH_PROBE_SQL);
  if (!touchCached) {
    touchProbeStatementByDb.set(env.DB, touch);
  }
  await touch.bind(probe.id, now).run();

  // The revision changes when the probe's config version or the assigned monitor set changes,
  // so probes can cheaply detect that their cached assignment is stale.
  const configRevision = `${probe.configVersion}:${monitors.length}:${assigned.reduce(
    (acc, monitor) => acc + monitor.id,
    0,
  )}`;

  return jsonResponse({
    probe: {
      id: probe.id,
      name: probe.name,
      kind: probe.kind,
      scope: probe.scope,
      region: probe.region,
    },
    config_revision: configRevision,
    generated_at: now,
    monitors,
  });
}
