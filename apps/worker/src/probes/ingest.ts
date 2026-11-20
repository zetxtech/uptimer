import type { Env } from '../env';
import { probeIngestBodySchema } from '../schemas/probes';
import { authenticateProbe } from './auth';
import { ingestProbeBatch } from './core';

const MAX_BODY_BYTES = 256 * 1024;

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
 * Probe-facing ingest endpoint: authenticates the probe, validates the payload, then hands the
 * batch to the shared aggregation core (the same core the Durable Object shards use).
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

  const result = await ingestProbeBatch({
    env,
    ctx,
    probe,
    batchId: body.batch_id,
    results: body.results,
  });

  return jsonResponse({
    ok: true,
    probe_id: probe.id,
    batch_id: body.batch_id,
    duplicate: result.duplicate,
    accepted: result.accepted,
    deduplicated: result.deduplicated,
    rejected: result.rejected,
    applied: result.applied,
  });
}
