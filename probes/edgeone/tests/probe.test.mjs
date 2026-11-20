import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';

import onProbeRequest from '../edge-functions/api/probe.js';
import onHealthRequest from '../edge-functions/api/health.js';

const originalFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = originalFetch;
});

const baseEnv = {
  UPTIMER_API_BASE_URL: 'https://uptimer.example.com',
  UPTIMER_PROBE_ID: 'edgeone-cn',
  UPTIMER_PROBE_TOKEN: 'upt_probe_fake-token',
  UPTIMER_PROBE_TRIGGER_SECRET: 'long-secret',
};

function context(method = 'POST', env = baseEnv, secret = 'long-secret') {
  return {
    env,
    request: new Request('https://probe.example.com/api/probe', {
      method,
      headers: secret ? { 'x-uptimer-trigger': secret } : undefined,
    }),
  };
}

test('only authorized POST requests may start a probe', async () => {
  const fetchCalls = [];
  globalThis.fetch = async (...args) => {
    fetchCalls.push(args);
    throw new Error('No network calls should be made');
  };
  assert.equal((await onProbeRequest(context('GET'))).status, 405);
  assert.equal((await onProbeRequest(context('POST', baseEnv, 'incorrect'))).status, 401);
  assert.equal(
    (await onProbeRequest(context('POST', { ...baseEnv, UPTIMER_PROBE_TRIGGER_SECRET: '' }))).status,
    500,
  );
  assert.equal(fetchCalls.length, 0);
});

test('health endpoint reports configuration readiness without exposing secrets', async () => {
  const result = await onHealthRequest({
    env: baseEnv,
    request: new Request('https://probe.example.com/api/health'),
  });
  assert.equal(result.status, 200);
  assert.deepEqual(await result.json(), {
    ok: true,
    service: 'uptimer-edgeone-probe',
    configured: true,
  });

  const missing = await onHealthRequest({
    env: { ...baseEnv, UPTIMER_PROBE_TOKEN: '' },
    request: new Request('https://probe.example.com/api/health'),
  });
  assert.equal((await missing.json()).configured, false);
});

test('empty assignment avoids target probes and ingest calls', async () => {
  let requests = 0;
  globalThis.fetch = async (url) => {
    requests += 1;
    assert.equal(String(url), 'https://uptimer.example.com/api/v1/probe/config');
    return Response.json({ config_revision: 'rev-1', monitors: [] });
  };
  const result = await onProbeRequest(context());
  assert.equal(result.status, 200);
  assert.equal((await result.json()).probed, 0);
  assert.equal(requests, 1);
});

test('fetches targets from the edge and ingests the results', async () => {
  const calls = [];
  let submitted = null;
  globalThis.fetch = async (url, init = {}) => {
    const path = String(url);
    calls.push(path);
    if (path.endsWith('/api/v1/probe/config')) {
      assert.equal(init.headers.authorization, 'Bearer upt_probe_fake-token');
      return Response.json({
        config_revision: '1:1:42',
        monitors: [{
          id: 42,
          target: 'https://target.example.com/health',
          interval_sec: 60,
          timeout_ms: 2000,
          http_method: 'GET',
          http_headers: {},
          follow_redirects: false,
          expected_status: [{ from: 200, to: 299 }],
        }],
      });
    }
    if (path === 'https://target.example.com/health') {
      return new Response('healthy', { status: 200 });
    }
    if (path.endsWith('/api/v1/probe/ingest')) {
      assert.equal(init.method, 'POST');
      submitted = JSON.parse(init.body);
      return Response.json({ inserted: 1 });
    }
    throw new Error('Unexpected endpoint');
  };

  const result = await onProbeRequest(context());
  assert.equal(result.status, 200);
  assert.deepEqual(calls, [
    'https://uptimer.example.com/api/v1/probe/config',
    'https://target.example.com/health',
    'https://uptimer.example.com/api/v1/probe/ingest',
  ]);
  assert.equal(submitted.probe_id, 'edgeone-cn');
  assert.equal(submitted.results.length, 1);
  assert.equal(submitted.results[0].status, 'up');
  assert.equal(submitted.results[0].monitor_id, 42);
});
