/**
 * Uptimer mainland probe (EdgeOne Edge Function).
 *
 * Flow: domestic scheduler -> this function (runs on a mainland edge node) -> target sites
 *       -> POST /api/v1/probe/ingest on the Uptimer Worker (D1 is the only authority).
 *
 * Design notes:
 * - Edge Functions run at the edge node nearest the caller, so the trigger must originate in
 *   mainland China. If you need a pinned region, deploy the same logic as an EdgeOne Cloud
 *   Function with `mainlandRegions: ["ap-guangzhou"]` instead.
 * - Raw TCP sockets are not available here, so only HTTP monitors are returned by
 *   GET /api/v1/probe/config for `kind = "edgeone"`.
 * - Results are batched and posted once per invocation. The ingest API deduplicates by
 *   `batch_id`, so retrying a failed post is safe.
 */

const USER_AGENT = 'Uptimer-Probe/1.0';
const MAX_BODY_BYTES = 1024 * 1024;
const RETRY_DELAYS_MS = [300, 800];
const DEFAULT_SLICE_SECONDS = 5 * 60;

function readEnv(context, name) {
  const sources = [
    context && context.env,
    context && context.environment,
    typeof globalThis !== 'undefined' ? globalThis.env : undefined,
    typeof process !== 'undefined' ? process.env : undefined,
  ];
  for (const source of sources) {
    if (source && typeof source[name] === 'string' && source[name].length > 0) {
      return source[name];
    }
  }
  return '';
}

function readIntEnv(context, name, fallback, min, max) {
  const raw = readEnv(context, name);
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    },
  });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function toErrorMessage(err) {
  if (err && typeof err === 'object' && 'message' in err) return String(err.message);
  return String(err);
}

function isTimeoutError(err) {
  return Boolean(
    err && typeof err === 'object' && (err.name === 'AbortError' || err.name === 'TimeoutError'),
  );
}

function cancelBody(res) {
  try {
    const body = res && res.body;
    if (body && typeof body.cancel === 'function') {
      body.cancel().catch(() => undefined);
    }
  } catch {
    // ignore
  }
}

function matchesRules(status, rules) {
  if (!Array.isArray(rules) || rules.length === 0) return false;
  for (const rule of rules) {
    if (typeof rule === 'number') {
      if (rule === status) return true;
      continue;
    }
    if (rule && typeof rule.from === 'number' && typeof rule.to === 'number') {
      if (status >= rule.from && status <= rule.to) return true;
    }
  }
  return false;
}

function evaluateStatus(status, expected, forbidden) {
  if (matchesRules(status, forbidden)) {
    return { ok: false, reason: 'forbidden' };
  }
  if (Array.isArray(expected) && expected.length > 0) {
    return matchesRules(status, expected) ? { ok: true } : { ok: false, reason: 'unexpected' };
  }
  return status >= 200 && status < 300 ? { ok: true } : { ok: false, reason: 'unexpected' };
}

function compileAssertions(monitor) {
  const assertions = [];

  const pairs = [
    {
      kind: 'required',
      value: monitor.response_keyword,
      mode: monitor.response_keyword_mode,
      field: 'response_keyword',
    },
    {
      kind: 'forbidden',
      value: monitor.response_forbidden_keyword,
      mode: monitor.response_forbidden_keyword_mode,
      field: 'response_forbidden_keyword',
    },
  ];

  for (const pair of pairs) {
    if (typeof pair.value !== 'string') continue;
    const mode = pair.mode === 'regex' ? 'regex' : 'contains';

    if (mode === 'contains') {
      assertions.push({ kind: pair.kind, mode, test: (text) => text.includes(pair.value) });
      continue;
    }

    let regex;
    try {
      regex = new RegExp(pair.value);
    } catch (err) {
      return { ok: false, error: `Invalid regex for ${pair.field}: ${toErrorMessage(err)}` };
    }
    assertions.push({ kind: pair.kind, mode, test: (text) => regex.test(text) });
  }

  return { ok: true, assertions };
}

function truncationError(assertion) {
  const what = assertion.mode === 'regex' ? 'response regex' : 'keyword';
  return assertion.kind === 'required'
    ? `Response body exceeded ${MAX_BODY_BYTES} bytes; cannot assert required ${what}`
    : `Response body exceeded ${MAX_BODY_BYTES} bytes; cannot assert forbidden ${what} absence`;
}

function missError(assertion) {
  if (assertion.kind === 'required') {
    return assertion.mode === 'regex'
      ? 'Required response regex not matched'
      : 'Response keyword not found';
  }
  return assertion.mode === 'regex'
    ? 'Forbidden response regex matched'
    : 'Forbidden response keyword found';
}

function evaluateAssertions(assertions, text, truncated) {
  for (const assertion of assertions) {
    const matched = assertion.test(text);

    if (assertion.kind === 'required') {
      if (matched) continue;
      return {
        status: truncated ? 'unknown' : 'down',
        error: truncated ? truncationError(assertion) : missError(assertion),
      };
    }

    if (matched) {
      return { status: 'down', error: missError(assertion) };
    }
    if (truncated) {
      return { status: 'unknown', error: truncationError(assertion) };
    }
  }

  return { status: 'up', error: null };
}

async function readBodyUpTo(res, maxBytes) {
  if (!res.body) {
    return { text: '', truncated: false };
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let bytes = 0;
  let text = '';
  let truncated = false;

  try {
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) break;
      const value = chunk.value;
      if (!value || value.length === 0) continue;

      const remaining = maxBytes - bytes;
      if (remaining <= 0) {
        truncated = true;
        break;
      }

      if (value.length <= remaining) {
        bytes += value.length;
        text += decoder.decode(value, { stream: true });
      } else {
        bytes += remaining;
        text += decoder.decode(value.slice(0, remaining), { stream: true });
        truncated = true;
        break;
      }
    }
  } finally {
    if (truncated) {
      await reader.cancel().catch(() => undefined);
    }
    reader.releaseLock();
  }

  text += decoder.decode();
  return { text, truncated };
}

async function attemptHttpCheck(monitor) {
  const started = Date.now();
  const timeoutMs = Number.isFinite(monitor.timeout_ms) ? monitor.timeout_ms : 10000;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const headers = new Headers(monitor.http_headers || undefined);
    if (!headers.has('user-agent')) {
      headers.set('user-agent', USER_AGENT);
    }

    const init = {
      method: typeof monitor.http_method === 'string' ? monitor.http_method : 'GET',
      headers,
      redirect: monitor.follow_redirects === false ? 'manual' : 'follow',
      cache: 'no-store',
      signal: controller.signal,
    };
    if (monitor.http_body !== null && monitor.http_body !== undefined) {
      init.body = monitor.http_body;
    }

    const res = await fetch(monitor.target, init);
    const latencyMs = Date.now() - started;
    const statusEval = evaluateStatus(
      res.status,
      monitor.expected_status,
      monitor.forbidden_status,
    );

    if (!statusEval.ok) {
      cancelBody(res);
      return {
        status: 'down',
        latency_ms: latencyMs,
        http_status: res.status,
        error:
          statusEval.reason === 'forbidden'
            ? `Forbidden HTTP status: ${res.status}`
            : `Unexpected HTTP status: ${res.status}`,
      };
    }

    const compiled = compileAssertions(monitor);
    if (!compiled.ok) {
      cancelBody(res);
      return {
        status: 'unknown',
        latency_ms: latencyMs,
        http_status: res.status,
        error: compiled.error,
      };
    }

    if (compiled.assertions.length === 0) {
      cancelBody(res);
      return { status: 'up', latency_ms: latencyMs, http_status: res.status, error: null };
    }

    const { text, truncated } = await readBodyUpTo(res, MAX_BODY_BYTES);
    const assertionResult = evaluateAssertions(compiled.assertions, text, truncated);

    return {
      status: assertionResult.status,
      latency_ms: latencyMs,
      http_status: res.status,
      error: assertionResult.error,
    };
  } catch (err) {
    return {
      status: 'down',
      latency_ms: Date.now() - started,
      http_status: null,
      error: isTimeoutError(err) ? `Timeout after ${timeoutMs}ms` : toErrorMessage(err),
    };
  } finally {
    clearTimeout(timer);
  }
}

async function runHttpCheck(monitor) {
  let last = null;

  for (let attempt = 1; attempt <= 1 + RETRY_DELAYS_MS.length; attempt += 1) {
    const outcome = await attemptHttpCheck(monitor);
    if (outcome.status !== 'down') {
      return { ...outcome, attempts: attempt };
    }

    last = { ...outcome, attempts: attempt };
    const delay = RETRY_DELAYS_MS[attempt - 1];
    if (delay !== undefined) {
      await sleep(delay);
    }
  }

  return (
    last || {
      status: 'unknown',
      latency_ms: null,
      http_status: null,
      error: 'No attempts executed',
      attempts: 0,
    }
  );
}

async function mapWithConcurrency(items, concurrency, fn) {
  const results = new Array(items.length);
  let nextIndex = 0;

  async function worker() {
    for (;;) {
      const index = nextIndex;
      nextIndex += 1;
      if (index >= items.length) return;
      results[index] = await fn(items[index], index);
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, items.length) }, () => worker());
  await Promise.all(workers);
  return results;
}

/**
 * Rotates through the monitor list when it exceeds one invocation's budget, so a large
 * account does not exceed the edge function duration limit.
 */
function selectSlice(monitors, maxPerRun, nowMs) {
  if (monitors.length <= maxPerRun) {
    return { monitors, index: 0, total: 1 };
  }

  const total = Math.ceil(monitors.length / maxPerRun);
  const index = Math.floor(nowMs / (DEFAULT_SLICE_SECONDS * 1000)) % total;
  return {
    monitors: monitors.slice(index * maxPerRun, (index + 1) * maxPerRun),
    index,
    total,
  };
}

function makeBatchId(probeId) {
  const cryptoObj = typeof crypto !== 'undefined' ? crypto : undefined;
  if (cryptoObj && typeof cryptoObj.randomUUID === 'function') {
    return `${probeId}-${cryptoObj.randomUUID()}`;
  }
  return `${probeId}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export default async function onRequest(context) {
  const request = (context && context.request) || context;
  if (!request || typeof request.headers?.get !== 'function') {
    return jsonResponse({ error: { code: 'BAD_REQUEST', message: 'Missing request' } }, 400);
  }

  const triggerSecret = readEnv(context, 'UPTIMER_PROBE_TRIGGER_SECRET');
  if (triggerSecret) {
    const provided = request.headers.get('x-uptimer-trigger') || '';
    if (provided !== triggerSecret) {
      return jsonResponse(
        { error: { code: 'UNAUTHORIZED', message: 'Invalid trigger secret' } },
        401,
      );
    }
  }

  const apiBaseUrl = readEnv(context, 'UPTIMER_API_BASE_URL').replace(/\/+$/, '');
  const probeToken = readEnv(context, 'UPTIMER_PROBE_TOKEN');
  const probeId = readEnv(context, 'UPTIMER_PROBE_ID');

  if (!apiBaseUrl || !probeToken || !probeId) {
    return jsonResponse(
      {
        error: {
          code: 'NOT_CONFIGURED',
          message: 'UPTIMER_API_BASE_URL, UPTIMER_PROBE_TOKEN and UPTIMER_PROBE_ID are required',
        },
      },
      500,
    );
  }

  const nowMs = Date.now();
  let config;
  try {
    const configRes = await fetch(`${apiBaseUrl}/api/v1/probe/config`, {
      headers: { authorization: `Bearer ${probeToken}` },
      cache: 'no-store',
    });
    if (!configRes.ok) {
      return jsonResponse(
        {
          error: {
            code: 'CONFIG_FAILED',
            message: `Probe config request failed with HTTP ${configRes.status}`,
          },
        },
        502,
      );
    }
    config = await configRes.json();
  } catch (err) {
    return jsonResponse({ error: { code: 'CONFIG_FAILED', message: toErrorMessage(err) } }, 502);
  }

  const monitors = Array.isArray(config && config.monitors) ? config.monitors : [];
  const maxPerRun = readIntEnv(context, 'UPTIMER_PROBE_MAX_MONITORS_PER_RUN', 64, 1, 200);
  const concurrency = readIntEnv(context, 'UPTIMER_PROBE_CONCURRENCY', 16, 1, 32);
  const slice = selectSlice(monitors, maxPerRun, nowMs);

  const probed = await mapWithConcurrency(slice.monitors, concurrency, async (monitor) => {
    const checkedAt = Math.floor(Date.now() / 1000);
    const outcome = await runHttpCheck(monitor);
    return {
      monitor_id: monitor.id,
      checked_at: checkedAt,
      status: outcome.status,
      latency_ms: outcome.latency_ms,
      http_status: outcome.http_status,
      error: outcome.error,
      attempts: outcome.attempts,
    };
  });

  if (probed.length === 0) {
    return jsonResponse({
      ok: true,
      probe_id: probeId,
      probed: 0,
      config_revision: config && config.config_revision ? config.config_revision : null,
      slice: { index: slice.index, total: slice.total },
    });
  }

  const batchId = makeBatchId(probeId);
  const payload = {
    probe_id: probeId,
    batch_id: batchId,
    sent_at: Math.floor(Date.now() / 1000),
    results: probed,
  };

  let ingestStatus = 0;
  let ingestBody = null;
  try {
    const ingestRes = await fetch(`${apiBaseUrl}/api/v1/probe/ingest`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${probeToken}`,
        'content-type': 'application/json; charset=utf-8',
      },
      body: JSON.stringify(payload),
      cache: 'no-store',
    });
    ingestStatus = ingestRes.status;
    ingestBody = await ingestRes.json().catch(() => null);
  } catch (err) {
    return jsonResponse(
      {
        ok: false,
        probe_id: probeId,
        batch_id: batchId,
        probed: probed.length,
        error: { code: 'INGEST_FAILED', message: toErrorMessage(err) },
      },
      502,
    );
  }

  return jsonResponse(
    {
      ok: ingestStatus >= 200 && ingestStatus < 300,
      probe_id: probeId,
      batch_id: batchId,
      probed: probed.length,
      config_revision: config && config.config_revision ? config.config_revision : null,
      slice: { index: slice.index, total: slice.total },
      ingest_status: ingestStatus,
      ingest: ingestBody,
    },
    ingestStatus >= 200 && ingestStatus < 300 ? 200 : 502,
  );
}
