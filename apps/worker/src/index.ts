import { Hono } from 'hono';

import type { Env } from './env';
import { handleError, handleNotFound } from './middleware/errors';
import { adminRoutes } from './routes/admin';
import { publicRoutes } from './routes/public';
import { runDailyRollup } from './scheduler/daily-rollup';
import { runRetention } from './scheduler/retention';
import { runScheduledTick } from './scheduler/scheduled';

const app = new Hono<{ Bindings: Env }>();

// Minimal CORS support so Pages (or any web UI) can call the API when hosted on a different origin
// (e.g. Pages on *.pages.dev and API on *.workers.dev). We reflect the Origin to keep it simple and
// avoid hardcoding a single hostname in the Worker config.
app.use('/api/*', async (c, next) => {
  const origin = c.req.header('Origin');
  if (origin) {
    c.header('Access-Control-Allow-Origin', origin);
    c.header('Vary', 'Origin');
    c.header('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
    c.header('Access-Control-Allow-Headers', 'Authorization,Content-Type');
  }

  if (c.req.method === 'OPTIONS') {
    return c.body(null, 204);
  }

  await next();
});

// Redirect legacy `/api/*` paths to the versioned API.
// This is useful when Pages (dev/prod) proxies `/api` to this Worker but the
// frontend calls `/api/v1/...`.
app.use('/api/*', async (c, next) => {
  const path = new URL(c.req.url).pathname;
  if (path === '/api/v1' || path.startsWith('/api/v1/')) {
    await next();
    return;
  }

  const url = new URL(c.req.url);
  url.pathname = `/api/v1${path.slice('/api'.length)}`;
  return c.redirect(url.toString(), 308);
});

app.onError(handleError);
app.notFound(handleNotFound);

app.get('/', (c) => c.text('ok'));

app.route('/api/v1/public', publicRoutes);
app.route('/api/v1/admin', adminRoutes);

const worker = {
  fetch: app.fetch,
  scheduled: async (controller: ScheduledController, env: Env, ctx: ExecutionContext) => {
    if (controller.cron === '0 0 * * *') {
      await runRetention(env, controller);
      await runDailyRollup(env, controller, ctx);
      return;
    }

    await runScheduledTick(env, ctx);
  },
};

app.get('/_cron/:cronKey', async (c) => {
  const cronKey = c.req.param('cronKey');
  const envCronKey = c.env.CRON_KEY;

  if (!envCronKey || cronKey !== envCronKey) {
    return c.json({ error: { code: 'UNAUTHORIZED', message: 'Invalid or missing CRON_KEY' } }, 401);
  }

  const type = c.req.query('type');
  const ctx = c.executionCtx;

  // We mock a ScheduledController to reuse the existing scheduler functions
  const controller: ScheduledController = {
    cron: type === 'daily' ? '0 0 * * *' : '* * * * *',
    scheduledTime: Date.now(),
    noRetry: () => {},
  };

  await worker.scheduled(controller, c.env, ctx);

  return c.json({ ok: true, type: type === 'daily' ? 'daily' : 'tick' });
});

export default worker;
