import { describe, expect, it, vi } from 'vitest';

vi.mock('../src/monitor/tcp', () => ({ runTcpCheck: vi.fn() }));

import type { Env } from '../src/env';
import { adminRoutes } from '../src/routes/admin';

// Regression guard for the lazy admin mount.
//
// hono-app.ts does not merge the admin router with `app.route()`; it calls
// `adminRoutes.fetch()` on the standalone router (see rewriteAdminRequest there), which
// strips the `/api/v1/admin` prefix. When the router has no onError/notFound of its own,
// Hono's default handler turns every AppError into a plain-text 500 and the parent app
// never gets a chance to map it. These tests call the router exactly the way the Worker
// entrypoint does, so the JSON error contract is pinned for real requests.

const ADMIN_TOKEN = 'admin-token';

function createExecutionContext(): ExecutionContext {
  return {
    waitUntil() {},
    passThroughOnException() {},
  } as unknown as ExecutionContext;
}

function createEnv(): Env {
  return { ADMIN_TOKEN } as unknown as Env;
}

// Path is relative to the `/api/v1/admin` prefix, matching rewriteAdminRequest().
async function request(path: string, init: RequestInit = {}): Promise<Response> {
  return adminRoutes.fetch(
    new Request(`https://uptimer.test${path}`, init),
    createEnv(),
    createExecutionContext(),
  );
}

function authed(init: RequestInit = {}): RequestInit {
  return {
    ...init,
    headers: {
      ...(init.headers as Record<string, string> | undefined),
      authorization: `Bearer ${ADMIN_TOKEN}`,
    },
  };
}

describe('admin router error contract', () => {
  it('returns a JSON 401 when the token is missing', async () => {
    const res = await request('/auth/verify');

    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({
      error: { code: 'UNAUTHORIZED', message: 'Unauthorized' },
    });
  });

  it('returns a JSON 400 for schema validation failures', async () => {
    const res = await request(
      '/monitors',
      authed({ method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' }),
    );

    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe('INVALID_ARGUMENT');
  });

  it('returns a JSON 404 for unknown admin routes', async () => {
    const res = await request('/definitely-not-a-route', authed());

    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({
      error: { code: 'NOT_FOUND', message: 'Not Found' },
    });
  });
});
