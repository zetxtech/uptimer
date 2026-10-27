import { Hono } from 'hono';
import { z } from 'zod';

import type { Env } from '../env';
import { AppError } from '../middleware/errors';
import { generateProbeToken, sha256Hex } from '../probes/auth';
import { createProbeInputSchema, patchProbeInputSchema } from '../schemas/probes';

type ProbeRow = {
  id: string;
  name: string;
  kind: string;
  scope: string;
  region: string;
  is_enabled: number | boolean;
  is_required: number | boolean;
  config_version: number;
  last_seen_at: number | null;
  last_result_at: number | null;
  created_at: number;
  updated_at: number;
};

const LIST_PROBES_SQL = `
  SELECT
    id,
    name,
    kind,
    scope,
    region,
    is_enabled,
    is_required,
    config_version,
    last_seen_at,
    last_result_at,
    created_at,
    updated_at
  FROM probes
  ORDER BY scope, region, id
`;

const GET_PROBE_SQL = `${LIST_PROBES_SQL.replace('ORDER BY scope, region, id', 'WHERE id = ?1')}`;

function toBoolean(value: number | boolean): boolean {
  return value === 1 || value === true;
}

function probeRowToApi(row: ProbeRow) {
  return {
    id: row.id,
    name: row.name,
    kind: row.kind,
    scope: row.scope,
    region: row.region,
    is_enabled: toBoolean(row.is_enabled),
    is_required: toBoolean(row.is_required),
    config_version: row.config_version,
    last_seen_at: row.last_seen_at,
    last_result_at: row.last_result_at,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export const adminProbeRoutes = new Hono<{ Bindings: Env }>();

adminProbeRoutes.get('/', async (c) => {
  const { results } = await c.env.DB.prepare(LIST_PROBES_SQL).all<ProbeRow>();
  return c.json({ probes: (results ?? []).map(probeRowToApi) });
});

adminProbeRoutes.post('/', async (c) => {
  const rawBody = await c.req.json().catch(() => {
    throw new AppError(400, 'INVALID_ARGUMENT', 'Invalid JSON body');
  });
  const input = createProbeInputSchema.parse(rawBody);
  const now = Math.floor(Date.now() / 1000);

  const existing = await c.env.DB.prepare(GET_PROBE_SQL).bind(input.id).first<ProbeRow>();
  if (existing) {
    throw new AppError(409, 'ALREADY_EXISTS', 'Probe id already exists');
  }

  const token = generateProbeToken();
  const tokenSha256 = await sha256Hex(token);

  await c.env.DB.prepare(
    `
    INSERT INTO probes (
      id, name, kind, scope, region, token_sha256, is_enabled, is_required,
      config_version, created_at, updated_at
    ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, 1, ?7, 1, ?8, ?8)
  `,
  )
    .bind(
      input.id,
      input.name,
      input.kind,
      input.scope,
      input.region,
      tokenSha256,
      input.is_required === false ? 0 : 1,
      now,
    )
    .run();

  const created = await c.env.DB.prepare(GET_PROBE_SQL).bind(input.id).first<ProbeRow>();

  return c.json(
    {
      probe: created ? probeRowToApi(created) : null,
      // The plaintext token is returned exactly once and never stored.
      token,
    },
    201,
  );
});

adminProbeRoutes.patch('/:id', async (c) => {
  const id = z.string().trim().min(2).max(64).parse(c.req.param('id'));
  const rawBody = await c.req.json().catch(() => {
    throw new AppError(400, 'INVALID_ARGUMENT', 'Invalid JSON body');
  });
  const input = patchProbeInputSchema.parse(rawBody);

  const existing = await c.env.DB.prepare(GET_PROBE_SQL).bind(id).first<ProbeRow>();
  if (!existing) {
    throw new AppError(404, 'NOT_FOUND', 'Probe not found');
  }

  const now = Math.floor(Date.now() / 1000);
  const sets: string[] = [];
  const binds: unknown[] = [];

  // Column names come from a fixed allowlist, never from user input.
  if (input.name !== undefined) {
    sets.push(`name = ?${binds.length + 1}`);
    binds.push(input.name);
  }
  if (input.scope !== undefined) {
    sets.push(`scope = ?${binds.length + 1}`);
    binds.push(input.scope);
  }
  if (input.region !== undefined) {
    sets.push(`region = ?${binds.length + 1}`);
    binds.push(input.region);
  }
  if (input.is_enabled !== undefined) {
    sets.push(`is_enabled = ?${binds.length + 1}`);
    binds.push(input.is_enabled ? 1 : 0);
  }
  if (input.is_required !== undefined) {
    sets.push(`is_required = ?${binds.length + 1}`);
    binds.push(input.is_required ? 1 : 0);
  }

  sets.push(`updated_at = ?${binds.length + 1}`);
  binds.push(now);

  binds.push(id);
  await c.env.DB.prepare(`UPDATE probes SET ${sets.join(', ')} WHERE id = ?${binds.length}`)
    .bind(...binds)
    .run();

  const updated = await c.env.DB.prepare(GET_PROBE_SQL).bind(id).first<ProbeRow>();
  return c.json({ probe: updated ? probeRowToApi(updated) : null });
});

adminProbeRoutes.post('/:id/rotate-token', async (c) => {
  const id = z.string().trim().min(2).max(64).parse(c.req.param('id'));
  const existing = await c.env.DB.prepare(GET_PROBE_SQL).bind(id).first<ProbeRow>();
  if (!existing) {
    throw new AppError(404, 'NOT_FOUND', 'Probe not found');
  }

  const token = generateProbeToken();
  const tokenSha256 = await sha256Hex(token);
  const now = Math.floor(Date.now() / 1000);

  await c.env.DB.prepare('UPDATE probes SET token_sha256 = ?2, updated_at = ?3 WHERE id = ?1')
    .bind(id, tokenSha256, now)
    .run();

  return c.json({ ok: true, probe_id: id, token });
});

adminProbeRoutes.post('/:id/bump-config', async (c) => {
  const id = z.string().trim().min(2).max(64).parse(c.req.param('id'));
  const existing = await c.env.DB.prepare(GET_PROBE_SQL).bind(id).first<ProbeRow>();
  if (!existing) {
    throw new AppError(404, 'NOT_FOUND', 'Probe not found');
  }

  const now = Math.floor(Date.now() / 1000);
  await c.env.DB.prepare(
    'UPDATE probes SET config_version = config_version + 1, updated_at = ?2 WHERE id = ?1',
  )
    .bind(id, now)
    .run();

  return c.json({ ok: true, probe_id: id, config_version: existing.config_version + 1 });
});

adminProbeRoutes.delete('/:id', async (c) => {
  const id = z.string().trim().min(2).max(64).parse(c.req.param('id'));
  const existing = await c.env.DB.prepare(GET_PROBE_SQL).bind(id).first<ProbeRow>();
  if (!existing) {
    throw new AppError(404, 'NOT_FOUND', 'Probe not found');
  }

  await c.env.DB.batch([
    c.env.DB.prepare('DELETE FROM monitor_probe_state WHERE probe_id = ?1').bind(id),
    c.env.DB.prepare('DELETE FROM probe_batches WHERE probe_id = ?1').bind(id),
    c.env.DB.prepare('DELETE FROM probes WHERE id = ?1').bind(id),
  ]);

  return c.json({ ok: true });
});
