import { Hono } from 'hono';

import type { Env } from '../env';
import { handleProbeConfig } from '../probes/config';
import { handleProbeIngest } from '../probes/ingest';

/**
 * Probe-facing API. Authenticated with per-probe tokens (never the admin token).
 *
 * - GET  /api/v1/probe/config  returns the monitor assignment for the calling probe
 * - POST /api/v1/probe/ingest  accepts a batch of observations and aggregates them
 */
export const probeRoutes = new Hono<{ Bindings: Env }>();

probeRoutes.get('/config', async (c) => handleProbeConfig(c.req.raw, c.env));
probeRoutes.post('/ingest', async (c) => handleProbeIngest(c.req.raw, c.env, c.executionCtx));

probeRoutes.all('*', (c) => c.json({ error: { code: 'NOT_FOUND', message: 'Not Found' } }, 404));
