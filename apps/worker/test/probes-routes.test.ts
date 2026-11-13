import { describe, expect, it, vi } from 'vitest';

import type { Env } from '../src/env';
import worker from '../src/index';

// The probe API is dispatched outside Hono (`probeRoutes.fetch`), so these cases go through the
// real Worker entrypoint. They cover the prefix rewrite: routes are registered as `/config` and
// `/ingest`, while probes call `/api/v1/probe/...`.
function createEnv(): Env {
  return {
    DB: {
      prepare: vi.fn(() => {
        throw new Error('unexpected database access');
      }),
    },
    ADMIN_TOKEN: 'admin-token',
  } as unknown as Env;
}

function createContext(): ExecutionContext {
  return {
    waitUntil: vi.fn(),
    passThroughOnException: vi.fn(),
  } as unknown as ExecutionContext;
}

async function call(path: string, init: RequestInit = {}): Promise<Response> {
  return await worker.fetch(
    new Request(`https://uptimer.test${path}`, init),
    createEnv(),
    createContext(),
  );
}

describe('probe routes', () => {
  it('serves /api/v1/probe/config to the probe handler instead of the not-found fallback', async () => {
    const res = await call('/api/v1/probe/config');

    expect(res.status).toBe(401);
    await expect(res.json()).resolves.toMatchObject({
      error: { code: 'UNAUTHORIZED' },
    });
    expect(res.headers.get('cache-control')).toBe('no-store');
  });

  it('serves /api/v1/probe/ingest to the probe handler instead of the not-found fallback', async () => {
    const res = await call('/api/v1/probe/ingest', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ batch_id: 'b1', results: [] }),
    });

    expect(res.status).toBe(401);
    await expect(res.json()).resolves.toMatchObject({
      error: { code: 'UNAUTHORIZED' },
    });
  });

  it('keeps unknown probe paths on the not-found fallback', async () => {
    const res = await call('/api/v1/probe/unknown');

    expect(res.status).toBe(404);
    await expect(res.json()).resolves.toMatchObject({
      error: { code: 'NOT_FOUND' },
    });
  });
});
