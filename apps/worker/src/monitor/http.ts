import { evaluateHttpStatusCode, type StatusCodeRule } from '@uptimer/db';

import {
  evaluateHttpResponseAssertions,
  prepareHttpResponseAssertions,
  type HttpResponseMatchMode,
  type PreparedHttpResponseAssertion,
} from './http-assertions';
import { validateHttpTarget } from './targets';
import type { CheckOutcome } from './types';

export type HttpCheckConfig = {
  url: string;
  timeoutMs: number;
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD';
  headers: Record<string, string> | null;
  body: string | null;
  followRedirects: boolean;
  keepCookies?: boolean;
  expectedStatus: StatusCodeRule[] | null;
  forbiddenStatus: StatusCodeRule[] | null;
  responseKeyword: string | null;
  responseKeywordMode: HttpResponseMatchMode | null;
  responseForbiddenKeyword: string | null;
  responseForbiddenKeywordMode: HttpResponseMatchMode | null;
};

const USER_AGENT = 'Uptimer/0.1';
const RETRY_DELAYS_MS = [300, 800] as const;
const MAX_ASSERTION_BODY_BYTES = 1024 * 1024; // 1 MiB
const MAX_REDIRECT_HOPS = 10;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function toErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}

function isAbortError(err: unknown): boolean {
  if (err && typeof err === 'object' && 'name' in err) {
    return (err as { name?: unknown }).name === 'AbortError';
  }
  return false;
}

async function fetchWithTimeout(
  url: string,
  timeoutMs: number,
  init: RequestInit,
): Promise<Response> {
  // Prefer AbortSignal.timeout when available (avoids setTimeout + event listener overhead).
  const timeoutFn = (AbortSignal as unknown as { timeout?: (ms: number) => AbortSignal }).timeout;
  const isWorkersRuntime =
    typeof navigator !== 'undefined' &&
    typeof navigator.userAgent === 'string' &&
    navigator.userAgent === 'Cloudflare-Workers';
  if (isWorkersRuntime && !init.signal && typeof timeoutFn === 'function') {
    return fetch(url, { ...init, signal: timeoutFn(timeoutMs) });
  }

  const controller = new AbortController();

  // If the caller also passes a signal, forward abort.
  if (init.signal) {
    init.signal.addEventListener('abort', () => controller.abort());
  }

  const t = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(t);
  }
}

const MAX_HEADER_ENTRIES = 40;
const MAX_HEADER_VALUE_CHARS = 900;
const DNS_JSON_TYPE_A = 1;
const DNS_JSON_TYPE_AAAA = 28;

function captureResponseHeaders(res: Response): Record<string, string> | null {
  const captured: Record<string, string> = {};
  let count = 0;
  res.headers.forEach((value, name) => {
    if (count >= MAX_HEADER_ENTRIES) return;
    captured[name] =
      value.length > MAX_HEADER_VALUE_CHARS ? value.slice(0, MAX_HEADER_VALUE_CHARS) : value;
    count += 1;
  });
  return count > 0 ? captured : null;
}

/** Resolves A/AAAA records over DNS-over-HTTPS; the Workers runtime exposes no peer address. */
async function resolveIpsOverDoh(hostname: string): Promise<string[] | null> {
  const lookups: Array<Promise<Response>> = [DNS_JSON_TYPE_A, DNS_JSON_TYPE_AAAA].map((type) =>
    fetch(
      `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(hostname)}&type=${type}`,
      {
        headers: { accept: 'application/dns-json' },
        cache: 'no-store',
      },
    ),
  );
  try {
    const responses = await Promise.all(lookups);
    const answers: Array<{ type?: number; data?: string }> = [];
    for (const response of responses) {
      if (!response.ok) continue;
      const body = (await response.json()) as { Answer?: Array<{ type?: number; data?: string }> };
      if (Array.isArray(body.Answer)) answers.push(...body.Answer);
    }
    const ips = answers
      .filter((answer) => answer.type === DNS_JSON_TYPE_A || answer.type === DNS_JSON_TYPE_AAAA)
      .map((answer) => answer.data)
      .filter((data): data is string => typeof data === 'string' && data.length > 0);
    return ips.length > 0 ? Array.from(new Set(ips)) : null;
  } catch {
    return null;
  }
}

async function readTextUpTo(
  stream: ReadableStream<Uint8Array>,
  maxBytes: number,
): Promise<{ text: string; truncated: boolean }> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let bytes = 0;
  let text = '';
  let truncated = false;

  try {
    while (true) {
      const r = await reader.read();
      if (r.done) break;

      const chunk = r.value;
      if (!chunk || chunk.length === 0) continue;

      const remaining = maxBytes - bytes;
      if (remaining <= 0) {
        truncated = true;
        break;
      }

      if (chunk.length <= remaining) {
        bytes += chunk.length;
        text += decoder.decode(chunk, { stream: true });
      } else {
        bytes += remaining;
        text += decoder.decode(chunk.slice(0, remaining), { stream: true });
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

async function resolveHostIps(
  url: string,
): Promise<{ ips: string[] | null; dnsMs: number | null }> {
  try {
    const { hostname } = new URL(url);
    if (!hostname || /^\d{1,3}(\.\d{1,3}){3}$/.test(hostname) || hostname.includes(':')) {
      return { ips: null, dnsMs: null };
    }
    const started = performance.now();
    const ips = await resolveIpsOverDoh(hostname);
    return { ips, dnsMs: Math.round(performance.now() - started) };
  } catch {
    return { ips: null, dnsMs: null };
  }
}

async function resolveHostIpsWithTiming(
  url: string,
  timings: Record<string, number>,
): Promise<{ resolvedIps: string[] | null; timings: Record<string, number> }> {
  const { ips, dnsMs } = await resolveHostIps(url);
  return {
    resolvedIps: ips,
    timings: dnsMs === null ? timings : { ...timings, dnsMs },
  };
}

type PerformedRequest = { res: Response; effectiveUrl: string; redirectCount: number };

/** Set-Cookie values of a response; falls back to a best-effort split when getSetCookie is absent. */
function readSetCookieHeaders(res: Response): string[] {
  const headers = res.headers as Headers & { getSetCookie?: () => string[] };
  if (typeof headers.getSetCookie === 'function') {
    return headers.getSetCookie();
  }
  const single = res.headers.get('set-cookie');
  if (!single) return [];
  // Expires attributes contain commas, so only split where the next chunk starts a new pair.
  return single.split(/,(?=\s*[^;,=\s]+=)/);
}

type ParsedCookie = { name: string; value: string; removed: boolean };

function parseSetCookie(raw: string): ParsedCookie | null {
  const [pair, ...attributes] = raw.split(';');
  if (!pair) return null;
  const separator = pair.indexOf('=');
  if (separator <= 0) return null;

  const name = pair.slice(0, separator).trim();
  const value = pair.slice(separator + 1).trim();
  if (name.length === 0) return null;

  let removed = false;
  for (const attribute of attributes) {
    const [key, ...rest] = attribute.split('=');
    const normalized = key?.trim().toLowerCase();
    const attributeValue = rest.join('=').trim();
    if (normalized === 'max-age' && attributeValue !== '') {
      const seconds = Number(attributeValue);
      if (Number.isFinite(seconds) && seconds <= 0) removed = true;
    }
    if (normalized === 'expires' && attributeValue !== '') {
      const at = Date.parse(attributeValue);
      if (Number.isFinite(at) && at <= Date.now()) removed = true;
    }
  }

  return { name, value, removed };
}

function toHttpInit(
  config: HttpCheckConfig,
  method: HttpCheckConfig['method'],
  body: string | null,
  cookieHeader: string | null,
  includeOriginalHeaders: boolean,
): RequestInit {
  const headers = new Headers(includeOriginalHeaders ? (config.headers ?? undefined) : undefined);
  if (!headers.has('user-agent')) headers.set('User-Agent', USER_AGENT);
  if (cookieHeader) headers.set('Cookie', cookieHeader);

  const init: RequestInit = {
    method,
    headers,
    redirect: 'manual',
    cache: 'no-store',
    cf: { cacheTtlByStatus: { '100-599': -1 } },
  };
  if (body !== null) init.body = body;
  return init;
}

/** Resolve every redirect explicitly so each destination and its credentials are independently checked. */
async function performRequest(config: HttpCheckConfig): Promise<PerformedRequest> {
  const jar = new Map<string, { value: string; host: string }>();
  let currentUrl = config.url;
  let method = config.method;
  let body = config.body;
  let hops = 0;
  let includeOriginalHeaders = true;
  const started = performance.now();

  for (;;) {
    const host = new URL(currentUrl).hostname;
    const cookieHeader =
      config.keepCookies && jar.size > 0
        ? [...jar.entries()]
            .filter(([, cookie]) => cookie.host === host)
            .map(([name, cookie]) => `${name}=${cookie.value}`)
            .join('; ')
        : null;

    const remainingMs = Math.ceil(config.timeoutMs - (performance.now() - started));
    if (remainingMs <= 0) {
      throw new DOMException('Request timed out', 'AbortError');
    }
    const init = toHttpInit(config, method, body, cookieHeader || null, includeOriginalHeaders);
    const res = await fetchWithTimeout(currentUrl, remainingMs, init);

    if (config.keepCookies) {
      for (const raw of readSetCookieHeaders(res)) {
        const cookie = parseSetCookie(raw);
        if (!cookie) continue;
        if (cookie.removed) jar.delete(cookie.name);
        else jar.set(cookie.name, { value: cookie.value, host });
      }
    }

    const location = res.headers.get('location');
    if (!config.followRedirects || res.status < 300 || res.status >= 400 || !location) {
      return { res, effectiveUrl: currentUrl, redirectCount: hops };
    }

    let nextUrl: URL;
    try {
      nextUrl = new URL(location, currentUrl);
    } catch {
      void res.body?.cancel().catch(() => undefined);
      throw new Error('Invalid redirect location');
    }
    const targetError = validateHttpTarget(nextUrl.toString());
    if (targetError) {
      void res.body?.cancel().catch(() => undefined);
      throw new Error(`Redirect target is not allowed: ${targetError}`);
    }

    hops += 1;
    if (hops > MAX_REDIRECT_HOPS) {
      void res.body?.cancel().catch(() => undefined);
      throw new Error(`Too many redirects (> ${MAX_REDIRECT_HOPS})`);
    }

    if (
      res.status === 303 ||
      ((res.status === 301 || res.status === 302) && method !== 'GET' && method !== 'HEAD')
    ) {
      method = 'GET';
      body = null;
    }

    if (new URL(currentUrl).origin !== nextUrl.origin) {
      // A redirect must not forward credentials, custom headers or an unsafe request body
      // to another origin, including when it redirects back to the original origin.
      if (method !== 'GET' && method !== 'HEAD') {
        void res.body?.cancel().catch(() => undefined);
        throw new Error('Cross-origin redirect with a request body or unsafe method is not allowed');
      }
      includeOriginalHeaders = false;
    }

    void res.body?.cancel().catch(() => undefined);
    currentUrl = nextUrl.toString();
  }
}

async function attemptHttpCheck(
  config: HttpCheckConfig,
  assertions: PreparedHttpResponseAssertion[],
): Promise<Omit<CheckOutcome, 'attempts'>> {
  const started = performance.now();

  try {
    const performed = await performRequest(config);
    const res = performed.res;

    const ttfbMs = Math.round(performance.now() - started);
    const latencyMs = ttfbMs;
    const httpStatus = res.status;
    const responseHeaders = captureResponseHeaders(res);

    const statusEval = evaluateHttpStatusCode(httpStatus, {
      expected: config.expectedStatus,
      forbidden: config.forbiddenStatus,
    });
    if (!statusEval.ok) {
      res.body?.cancel();
      return {
        status: 'down',
        latencyMs,
        httpStatus,
        error:
          statusEval.reason === 'forbidden'
            ? `Forbidden HTTP status: ${httpStatus}`
            : `Unexpected HTTP status: ${httpStatus}`,
        detail: {
          effectiveUrl: performed.effectiveUrl,
          redirectCount: performed.redirectCount,
          responseHeaders,
          ...(await resolveHostIpsWithTiming(config.url, { ttfbMs, totalMs: ttfbMs })),
        },
      };
    }

    if (assertions.length === 0) {
      res.body?.cancel();
      return {
        status: 'up',
        latencyMs,
        httpStatus,
        error: null,
        detail: {
          effectiveUrl: performed.effectiveUrl,
          redirectCount: performed.redirectCount,
          responseHeaders,
          timings: { ttfbMs, totalMs: ttfbMs },
          resolvedIps: null,
        },
      };
    }

    if (!res.body) {
      return {
        status: 'unknown',
        latencyMs,
        httpStatus,
        error: 'Response body is not readable for response assertions',
      };
    }

    const { text, truncated } = await readTextUpTo(res.body, MAX_ASSERTION_BODY_BYTES);
    const readMs = Math.round(performance.now() - started) - ttfbMs;
    const assertionResult = evaluateHttpResponseAssertions({
      assertions,
      text,
      truncated,
      maxBytes: MAX_ASSERTION_BODY_BYTES,
    });

    return {
      status: assertionResult.status,
      latencyMs,
      httpStatus,
      error: assertionResult.error,
      detail: {
        effectiveUrl: performed.effectiveUrl,
        redirectCount: performed.redirectCount,
        responseHeaders,
        timings: { ttfbMs, readMs, totalMs: ttfbMs + readMs },
        resolvedIps:
          assertionResult.status === 'down' ? (await resolveHostIps(config.url)).ips : null,
      },
    };
  } catch (err) {
    const latencyMs = Math.round(performance.now() - started);
    if (isAbortError(err)) {
      return {
        status: 'down',
        latencyMs,
        httpStatus: null,
        error: `Timeout after ${config.timeoutMs}ms`,
      };
    }

    return {
      status: 'down',
      latencyMs,
      httpStatus: null,
      error: toErrorMessage(err),
    };
  }
}

export async function runHttpCheck(config: HttpCheckConfig): Promise<CheckOutcome> {
  const targetErr = validateHttpTarget(config.url);
  if (targetErr) {
    return { status: 'unknown', latencyMs: null, httpStatus: null, error: targetErr, attempts: 1 };
  }

  const preparedAssertions = prepareHttpResponseAssertions({
    responseKeyword: config.responseKeyword,
    responseKeywordMode: config.responseKeywordMode,
    responseForbiddenKeyword: config.responseForbiddenKeyword,
    responseForbiddenKeywordMode: config.responseForbiddenKeywordMode,
  });
  if (!preparedAssertions.ok) {
    return {
      status: 'unknown',
      latencyMs: null,
      httpStatus: null,
      error: preparedAssertions.error,
      attempts: 1,
    };
  }

  const maxAttempts = 1 + RETRY_DELAYS_MS.length;
  let last: CheckOutcome | null = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const r = await attemptHttpCheck(config, preparedAssertions.assertions);
    const outcome: CheckOutcome = { ...r, attempts: attempt };

    if (outcome.status === 'up') {
      return outcome;
    }
    if (outcome.status === 'unknown') {
      return outcome;
    }

    last = outcome;
    const delay = RETRY_DELAYS_MS[attempt - 1];
    if (delay !== undefined) {
      await sleep(delay);
    }
  }

  return (
    last ?? {
      status: 'unknown',
      latencyMs: null,
      httpStatus: null,
      error: 'No attempts executed',
      attempts: 0,
    }
  );
}
