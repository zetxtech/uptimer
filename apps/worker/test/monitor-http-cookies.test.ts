import { afterEach, describe, expect, it, vi } from 'vitest';

import { runHttpCheck } from '../src/monitor/http';

const BASE_CONFIG = {
  url: 'https://example.com/health',
  timeoutMs: 500,
  method: 'GET' as const,
  headers: null,
  body: null,
  followRedirects: true,
  keepCookies: true,
  expectedStatus: null,
  forbiddenStatus: null,
  responseKeyword: null,
  responseKeywordMode: null,
  responseForbiddenKeyword: null,
  responseForbiddenKeywordMode: null,
};

describe('monitor/http cookie handling', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.clearAllMocks();
  });

  it('carries cookies across redirect hops on the same host', async () => {
    const calls: Array<{ url: string; cookie: string | null; redirect: RequestRedirect }> = [];
    globalThis.fetch = vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({
        url,
        cookie: new Headers(init?.headers).get('cookie'),
        redirect: init?.redirect as RequestRedirect,
      });

      if (calls.length === 1) {
        return new Response(null, {
          status: 302,
          headers: {
            location: '/session',
            'set-cookie': 'sid=abc123; Path=/; HttpOnly',
          },
        });
      }
      return new Response('welcome', { status: 200 });
    }) as unknown as typeof fetch;

    const outcome = await runHttpCheck(BASE_CONFIG);

    expect(outcome.status).toBe('up');
    expect(calls).toHaveLength(2);
    expect(calls[0]?.redirect).toBe('manual');
    expect(calls[0]?.cookie).toBeNull();
    expect(calls[1]?.url).toBe('https://example.com/session');
    expect(calls[1]?.cookie).toBe('sid=abc123');
    expect(outcome.detail?.redirectCount).toBe(1);
  });

  it('drops cookies cleared by the server and never sends them to another host', async () => {
    const seen: Array<{ url: string; cookie: string | null }> = [];
    globalThis.fetch = vi.fn(async (url: string, init?: RequestInit) => {
      seen.push({ url, cookie: new Headers(init?.headers).get('cookie') });

      if (seen.length === 1) {
        return new Response(null, {
          status: 302,
          headers: { location: 'https://other.example.net/next', 'set-cookie': 'sid=gone' },
        });
      }
      if (seen.length === 2) {
        return new Response(null, {
          status: 302,
          headers: { location: 'https://example.com/back', 'set-cookie': 'sid=; Max-Age=0' },
        });
      }
      return new Response('done', { status: 200 });
    }) as unknown as typeof fetch;

    const outcome = await runHttpCheck(BASE_CONFIG);

    expect(outcome.status).toBe('up');
    // The cookie belongs to example.com, so the cross-host hop must not receive it.
    expect(seen[1]?.cookie).toBeNull();
    // Coming back to example.com after Max-Age=0 must also be clean.
    expect(seen[2]?.cookie).toBeNull();
  });

  it('switches to GET when a 303 redirect answers a POST', async () => {
    const methods: string[] = [];
    globalThis.fetch = vi.fn(async (_url: string, init?: RequestInit) => {
      methods.push(String(init?.method));
      if (methods.length === 1) {
        return new Response(null, { status: 303, headers: { location: '/result' } });
      }
      return new Response('ok', { status: 200 });
    }) as unknown as typeof fetch;

    const outcome = await runHttpCheck({ ...BASE_CONFIG, method: 'POST', body: 'a=1' });

    expect(outcome.status).toBe('up');
    expect(methods).toEqual(['POST', 'GET']);
  });

  it('gives up on redirect loops', async () => {
    globalThis.fetch = vi.fn(async () => {
      return new Response(null, { status: 302, headers: { location: '/again' } });
    }) as unknown as typeof fetch;

    const outcome = await runHttpCheck(BASE_CONFIG);

    expect(outcome.status).toBe('down');
    expect(outcome.error).toMatch(/too many redirects/i);
  });
});
