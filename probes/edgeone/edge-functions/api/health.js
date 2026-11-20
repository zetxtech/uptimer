export default function onRequest(context) {
  if (context.request.method !== 'GET') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'content-type': 'application/json; charset=utf-8', 'allow': 'GET' },
    });
  }

  const env = context.env || {};
  const configured = [
    'UPTIMER_API_BASE_URL',
    'UPTIMER_PROBE_ID',
    'UPTIMER_PROBE_TOKEN',
    'UPTIMER_PROBE_TRIGGER_SECRET',
  ].every((key) => typeof env[key] === 'string' && env[key].length > 0);

  return new Response(JSON.stringify({ ok: true, service: 'uptimer-edgeone-probe', configured }), {
    status: 200,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    },
  });
}
