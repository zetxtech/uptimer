import { afterEach, describe, expect, it, vi } from 'vitest';
import { Hono } from 'hono';

vi.mock('../src/snapshots', () => ({
  refreshPublicHomepageSnapshotIfNeeded: vi.fn().mockResolvedValue(false),
}));
vi.mock('../src/monitor/tcp', () => ({
  runTcpCheck: vi.fn(),
}));

import type { Env } from '../src/env';
import { handleError, handleNotFound } from '../src/middleware/errors';
import { adminRoutes } from '../src/routes/admin';
import { createFakeD1Database, type FakeD1QueryHandler } from './helpers/fake-d1';

type StoredMonitorRow = {
  id: number;
  name: string;
  type: 'http' | 'tcp';
  target: string;
  display_url: string | null;
  interval_sec: number;
  timeout_ms: number;
  http_method: string | null;
  http_headers_json: string | null;
  http_body: string | null;
  follow_redirects: number;
  expected_status_json: string | null;
  forbidden_status_json: string | null;
  response_keyword: string | null;
  response_keyword_mode: 'contains' | 'regex' | null;
  response_forbidden_keyword: string | null;
  response_forbidden_keyword_mode: 'contains' | 'regex' | null;
  group_name: string | null;
  group_sort_order: number;
  sort_order: number;
  show_on_status_page: number;
  is_active: number;
  probe_mode: string;
  notification_channel_ids_json: string | null;
  maintenance_window_json: string | null;
  heartbeat_token: string | null;
  heartbeat_grace_sec: number | null;
  failures_to_down_from_up: number | null;
  successes_to_up_from_down: number | null;
  created_at: number;
  updated_at: number;
};

/** Column order of the drizzle select on `monitors`. */
function monitorRowToRaw(row: StoredMonitorRow): unknown[] {
  return [
    row.id,
    row.name,
    row.type,
    row.target,
    row.display_url,
    row.interval_sec,
    row.timeout_ms,
    row.http_method,
    row.http_headers_json,
    row.http_body,
    row.follow_redirects,
    row.expected_status_json,
    row.forbidden_status_json,
    row.response_keyword,
    row.response_keyword_mode,
    row.response_forbidden_keyword,
    row.response_forbidden_keyword_mode,
    row.group_name,
    row.group_sort_order,
    row.sort_order,
    row.show_on_status_page,
    row.is_active,
    row.probe_mode,
    row.notification_channel_ids_json,
    row.maintenance_window_json,
    row.heartbeat_token,
    row.heartbeat_grace_sec,
    row.failures_to_down_from_up,
    row.successes_to_up_from_down,
    row.created_at,
    row.updated_at,
  ];
}

function createAdminApp() {
  const app = new Hono<{ Bindings: Env }>();
  app.onError(handleError);
  app.notFound(handleNotFound);
  app.route('/api/v1/admin', adminRoutes);
  return app;
}

function createEnv(monitorsById: Map<number, StoredMonitorRow>): Env {
  let nextMonitorId = 1000;

  const handlers: FakeD1QueryHandler[] = [
    {
      match: 'select group_sort_order from monitors',
      first: () => null,
    },
    {
      match: 'insert into "monitors"',
      raw: (args) => {
        const row: StoredMonitorRow = {
          id: nextMonitorId,
          name: String(args[0]),
          type: String(args[1]) as 'http' | 'tcp',
          target: String(args[2]),
          display_url: (args[3] as string | null) ?? null,
          interval_sec: Number(args[4]),
          timeout_ms: Number(args[5]),
          http_method: (args[6] as string | null) ?? null,
          http_headers_json: (args[7] as string | null) ?? null,
          http_body: (args[8] as string | null) ?? null,
          follow_redirects: args[9] === false || args[9] === 0 ? 0 : 1,
          expected_status_json: (args[10] as string | null) ?? null,
          forbidden_status_json: (args[11] as string | null) ?? null,
          response_keyword: (args[12] as string | null) ?? null,
          response_keyword_mode: (args[13] as StoredMonitorRow['response_keyword_mode']) ?? null,
          response_forbidden_keyword: (args[14] as string | null) ?? null,
          response_forbidden_keyword_mode:
            (args[15] as StoredMonitorRow['response_forbidden_keyword_mode']) ?? null,
          group_name: (args[16] as string | null) ?? null,
          group_sort_order: Number(args[17]),
          sort_order: Number(args[18]),
          show_on_status_page: Number(args[19]),
          is_active: Number(args[20]),
          probe_mode: String(args[21] ?? 'worker'),
          notification_channel_ids_json: (args[22] as string | null) ?? null,
          maintenance_window_json: (args[23] as string | null) ?? null,
          heartbeat_token: (args[24] as string | null) ?? null,
          heartbeat_grace_sec: (args[25] as number | null) ?? null,
          failures_to_down_from_up: (args[26] as number | null) ?? null,
          successes_to_up_from_down: (args[27] as number | null) ?? null,
          created_at: Number(args[28]),
          updated_at: Number(args[29]),
        };
        monitorsById.set(row.id, row);
        nextMonitorId += 1;
        return [monitorRowToRaw(row)];
      },
    },
    {
      match: 'from "monitors" where "monitors"."id" = ?',
      raw: (args) => {
        const id = Number(args[0]);
        const row = monitorsById.get(id);
        return row ? [monitorRowToRaw(row)] : [];
      },
    },
    {
      match: 'from monitor_metadata',
      all: () => [],
    },
    {
      match: 'public_snapshot_guard_versions',
      run: () => ({ meta: { changes: 1 } }),
    },
  ];

  return {
    DB: createFakeD1Database(handlers),
    ADMIN_TOKEN: 'test-admin-token',
    ADMIN_RATE_LIMIT_MAX: '100',
    ADMIN_RATE_LIMIT_WINDOW_SEC: '60',
  } as unknown as Env;
}

async function requestAdmin(
  app: ReturnType<typeof createAdminApp>,
  env: Env,
  path: string,
  init: {
    method?: string;
    body?: unknown;
  } = {},
): Promise<Response> {
  const headers = new Headers({
    Authorization: 'Bearer test-admin-token',
  });
  let body: string | undefined;

  if (init.body !== undefined) {
    headers.set('Content-Type', 'application/json');
    body = JSON.stringify(init.body);
  }

  return app.fetch(
    new Request(`https://status.example.com${path}`, {
      method: init.method ?? 'GET',
      headers,
      body,
    }),
    env,
    { waitUntil: vi.fn() } as unknown as ExecutionContext,
  );
}

describe('admin monitor response assertion routes', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('persists explicit assertion modes and reuses them for manual monitor tests', async () => {
    vi.useFakeTimers();
    const app = createAdminApp();
    const monitorsById = new Map<number, StoredMonitorRow>();
    const env = createEnv(monitorsById);

    const createRes = await requestAdmin(app, env, '/api/v1/admin/monitors', {
      method: 'POST',
      body: {
        name: 'Regex API',
        type: 'http',
        target: 'https://example.com/health',
        response_keyword: 'ready:\\d+',
        response_keyword_mode: 'regex',
        response_forbidden_keyword: 'FAIL_[A-Z]+',
        response_forbidden_keyword_mode: 'regex',
      },
    });

    expect(createRes.status).toBe(201);
    const created = (await createRes.json()) as {
      monitor: {
        id: number;
        response_keyword_mode: string | null;
        response_forbidden_keyword_mode: string | null;
      };
    };
    expect(created.monitor.response_keyword_mode).toBe('regex');
    expect(created.monitor.response_forbidden_keyword_mode).toBe('regex');

    const createdId = created.monitor.id;

    const httpBodies = [
      'ready:42',
      'ready:42\nFAIL_TOKEN',
      'ready:42\nFAIL_TOKEN',
      'ready:42\nFAIL_TOKEN',
      'starting up',
      'starting up',
      'starting up',
    ];
    globalThis.fetch = vi.fn().mockImplementation((input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      // Failing checks also resolve the hostname; answer those without consuming the queue.
      if (url.startsWith('https://cloudflare-dns.com/')) {
        return Promise.resolve(
          new Response(JSON.stringify({ Answer: [{ type: 1, data: '203.0.113.9' }] }), {
            status: 200,
          }),
        );
      }
      return Promise.resolve(new Response(httpBodies.shift() ?? 'ready:42', { status: 200 }));
    }) as unknown as typeof fetch;

    const upRes = await requestAdmin(app, env, `/api/v1/admin/monitors/${createdId}/test`, {
      method: 'POST',
    });
    expect(upRes.status).toBe(200);
    await expect(upRes.json()).resolves.toMatchObject({
      result: {
        status: 'up',
        error: null,
      },
    });

    const forbiddenHitPromise = requestAdmin(app, env, `/api/v1/admin/monitors/${createdId}/test`, {
      method: 'POST',
    });
    await vi.advanceTimersByTimeAsync(1_200);
    const forbiddenHitRes = await forbiddenHitPromise;
    expect(forbiddenHitRes.status).toBe(200);
    await expect(forbiddenHitRes.json()).resolves.toMatchObject({
      result: {
        status: 'down',
        error: 'Forbidden response regex matched',
      },
    });

    const requiredMissPromise = requestAdmin(app, env, `/api/v1/admin/monitors/${createdId}/test`, {
      method: 'POST',
    });
    await vi.advanceTimersByTimeAsync(1_200);
    const requiredMissRes = await requiredMissPromise;
    expect(requiredMissRes.status).toBe(200);
    await expect(requiredMissRes.json()).resolves.toMatchObject({
      result: {
        status: 'down',
        error: 'Required response regex not matched',
      },
    });
  });

  it('persists display URL and disabled redirect following for manual monitor tests', async () => {
    const app = createAdminApp();
    const monitorsById = new Map<number, StoredMonitorRow>();
    const env = createEnv(monitorsById);

    const createRes = await requestAdmin(app, env, '/api/v1/admin/monitors', {
      method: 'POST',
      body: {
        name: 'Redirect API',
        type: 'http',
        target: 'https://example.com/redirect',
        display_url: '  https://example.com/status  ',
        follow_redirects: false,
        expected_status_json: [302],
      },
    });

    expect(createRes.status).toBe(201);
    const created = (await createRes.json()) as {
      monitor: {
        id: number;
        display_url: string | null;
        follow_redirects: boolean;
        expected_status_json: number[] | null;
      };
    };
    expect(created.monitor.display_url).toBe('https://example.com/status');
    expect(created.monitor.follow_redirects).toBe(false);
    expect(created.monitor.expected_status_json).toEqual([302]);

    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      expect(init?.redirect).toBe('manual');
      return new Response(null, {
        status: 302,
        headers: { Location: 'https://example.com/final' },
      });
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const testRes = await requestAdmin(
      app,
      env,
      `/api/v1/admin/monitors/${created.monitor.id}/test`,
      {
        method: 'POST',
      },
    );

    expect(testRes.status).toBe(200);
    await expect(testRes.json()).resolves.toMatchObject({
      result: {
        status: 'up',
        http_status: 302,
        error: null,
      },
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('rejects invalid regex patterns at API validation time', async () => {
    const app = createAdminApp();
    const env = createEnv(new Map());

    const res = await requestAdmin(app, env, '/api/v1/admin/monitors', {
      method: 'POST',
      body: {
        name: 'Bad Regex API',
        type: 'http',
        target: 'https://example.com/health',
        response_keyword: '(',
        response_keyword_mode: 'regex',
      },
    });

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({
      error: {
        code: 'INVALID_ARGUMENT',
        message: expect.stringMatching(/invalid regex/i),
      },
    });
  });

  it('rejects new HTTP-only assertion mode fields for tcp monitors on create and patch', async () => {
    const app = createAdminApp();
    const tcpMonitor: StoredMonitorRow = {
      id: 7,
      name: 'TCP Service',
      type: 'tcp',
      target: 'example.com:443',
      display_url: null,
      interval_sec: 60,
      timeout_ms: 5000,
      http_method: null,
      http_headers_json: null,
      http_body: null,
      follow_redirects: 1,
      expected_status_json: null,
      forbidden_status_json: null,
      response_keyword: null,
      response_keyword_mode: null,
      response_forbidden_keyword: null,
      response_forbidden_keyword_mode: null,
      group_name: null,
      group_sort_order: 0,
      sort_order: 0,
      show_on_status_page: 1,
      is_active: 1,
      created_at: 1700000000,
      updated_at: 1700000000,
    };
    const env = createEnv(new Map([[tcpMonitor.id, tcpMonitor]]));

    const createRes = await requestAdmin(app, env, '/api/v1/admin/monitors', {
      method: 'POST',
      body: {
        name: 'TCP Create',
        type: 'tcp',
        target: 'example.com:5432',
        response_keyword: 'ready',
        response_keyword_mode: 'regex',
      },
    });
    expect(createRes.status).toBe(400);
    await expect(createRes.json()).resolves.toMatchObject({
      error: {
        code: 'INVALID_ARGUMENT',
        message: expect.stringMatching(/http_\* fields are not allowed for tcp monitors/i),
      },
    });

    const patchRes = await requestAdmin(app, env, `/api/v1/admin/monitors/${tcpMonitor.id}`, {
      method: 'PATCH',
      body: {
        response_keyword: 'ready',
        response_keyword_mode: 'regex',
      },
    });
    expect(patchRes.status).toBe(400);
    await expect(patchRes.json()).resolves.toMatchObject({
      error: {
        code: 'INVALID_ARGUMENT',
        message: expect.stringMatching(/http_\* fields are not allowed for tcp monitors/i),
      },
    });
  });
});
