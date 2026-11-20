import { Hono } from 'hono';
import { z } from 'zod';

import type { Env } from '../env';
import { AppError } from '../middleware/errors';

const groupInput = z.object({
  name: z.string().trim().min(1).max(100),
  is_active: z.boolean().default(true),
  immediate_enabled: z.boolean().default(true),
  debounce_seconds: z.number().int().min(0).max(86400).default(0),
  digest_interval: z.enum(['none', 'daily', 'weekly']).default('none'),
  monitor_ids: z.array(z.number().int().positive()).max(500),
  channel_ids: z.array(z.number().int().positive()).max(50),
});
const groupPatch = groupInput.partial().refine((input) => Object.keys(input).length > 0);
type GroupInput = z.infer<typeof groupInput>;
type GroupRow = {
  id: number;
  name: string;
  is_active: number;
  immediate_enabled: number;
  debounce_seconds: number;
  debounce_due_at: number | null;
  digest_interval: GroupInput['digest_interval'];
  next_digest_at: number | null;
  created_at: number;
  updated_at: number;
};

export const adminNotificationGroupRoutes = new Hono<{ Bindings: Env }>();

function intervalSeconds(interval: GroupInput['digest_interval']): number {
  return interval === 'daily' ? 86400 : interval === 'weekly' ? 604800 : 0;
}

async function memberships(
  db: D1Database,
  groupId: number,
): Promise<{ monitor_ids: number[]; channel_ids: number[] }> {
  const [monitors, channels] = await Promise.all([
    db
      .prepare(
        'SELECT monitor_id AS id FROM notification_group_monitors WHERE group_id = ?1 ORDER BY monitor_id',
      )
      .bind(groupId)
      .all<{ id: number }>(),
    db
      .prepare(
        'SELECT channel_id AS id FROM notification_group_channels WHERE group_id = ?1 ORDER BY channel_id',
      )
      .bind(groupId)
      .all<{ id: number }>(),
  ]);
  return {
    monitor_ids: (monitors.results ?? []).map((row) => row.id),
    channel_ids: (channels.results ?? []).map((row) => row.id),
  };
}

async function groupToApi(db: D1Database, row: GroupRow) {
  return {
    ...row,
    is_active: Boolean(row.is_active),
    immediate_enabled: Boolean(row.immediate_enabled),
    ...(await memberships(db, row.id)),
  };
}

async function ensureReferences(db: D1Database, input: GroupInput): Promise<void> {
  for (const [table, values] of [
    ['monitors', input.monitor_ids],
    ['notification_channels', input.channel_ids],
  ] as const) {
    const ids = [...new Set(values)];
    for (let offset = 0; offset < ids.length; offset += 90) {
      const chunk = ids.slice(offset, offset + 90);
      const placeholders = chunk.map((_, index) => `?${index + 1}`).join(', ');
      const row = await db
        .prepare(`SELECT COUNT(*) AS count FROM ${table} WHERE id IN (${placeholders})`)
        .bind(...chunk)
        .first<{ count: number }>();
      if (Number(row?.count ?? 0) !== chunk.length)
        throw new AppError(400, 'INVALID_ARGUMENT', `Unknown ${table} ID`);
    }
  }
}

function membershipInserts(
  db: D1Database,
  groupSelector: string,
  groupParam: string | number,
  input: GroupInput,
): D1PreparedStatement[] {
  const statements: D1PreparedStatement[] = [];
  for (const [table, column, values] of [
    ['notification_group_monitors', 'monitor_id', input.monitor_ids],
    ['notification_group_channels', 'channel_id', input.channel_ids],
  ] as const) {
    const ids = [...new Set(values)];
    for (let offset = 0; offset < ids.length; offset += 90) {
      const chunk = ids.slice(offset, offset + 90);
      const selects = chunk
        .map((_, index) => `SELECT ${groupSelector}, ?${index + 2}`)
        .join(' UNION ALL ');
      statements.push(
        db
          .prepare(`INSERT INTO ${table} (group_id, ${column}) ${selects}`)
          .bind(groupParam, ...chunk),
      );
    }
  }
  return statements;
}

adminNotificationGroupRoutes.get('/', async (c) => {
  const result = await c.env.DB.prepare(
    'SELECT id, name, is_active, immediate_enabled, debounce_seconds, debounce_due_at, digest_interval, next_digest_at, created_at, updated_at FROM notification_groups ORDER BY id',
  ).all<GroupRow>();
  const groups = await Promise.all((result.results ?? []).map((row) => groupToApi(c.env.DB, row)));
  return c.json({ notification_groups: groups });
});

adminNotificationGroupRoutes.post('/', async (c) => {
  const input = groupInput.parse(await c.req.json());
  await ensureReferences(c.env.DB, input);
  const now = Math.floor(Date.now() / 1000);
  const interval = intervalSeconds(input.digest_interval);
  const token = crypto.randomUUID();
  await c.env.DB.batch([
    c.env.DB.prepare(
      'INSERT INTO notification_groups (creation_token, name, is_active, immediate_enabled, debounce_seconds, digest_interval, next_digest_at, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?8)',
    ).bind(
      token,
      input.name,
      Number(input.is_active),
      Number(input.immediate_enabled),
      input.debounce_seconds,
      input.digest_interval,
      interval ? now + interval : null,
      now,
    ),
    ...membershipInserts(
      c.env.DB,
      '(SELECT id FROM notification_groups WHERE creation_token = ?1)',
      token,
      input,
    ),
  ]);
  const row = await c.env.DB.prepare(
    'SELECT id, name, is_active, immediate_enabled, debounce_seconds, debounce_due_at, digest_interval, next_digest_at, created_at, updated_at FROM notification_groups WHERE creation_token = ?1',
  )
    .bind(token)
    .first<GroupRow>();
  if (!row) throw new AppError(500, 'INTERNAL', 'Failed to create notification group');
  return c.json({ notification_group: await groupToApi(c.env.DB, row) }, 201);
});

adminNotificationGroupRoutes.patch('/:id', async (c) => {
  const id = z.coerce.number().int().positive().parse(c.req.param('id'));
  const patch = groupPatch.parse(await c.req.json());
  const row = await c.env.DB.prepare(
    'SELECT id, name, is_active, immediate_enabled, debounce_seconds, debounce_due_at, digest_interval, next_digest_at, created_at, updated_at FROM notification_groups WHERE id = ?1',
  )
    .bind(id)
    .first<GroupRow>();
  if (!row) throw new AppError(404, 'NOT_FOUND', 'Notification group not found');
  const previous = await groupToApi(c.env.DB, row);
  const input = groupInput.parse({ ...previous, ...patch });
  await ensureReferences(c.env.DB, input);
  const now = Math.floor(Date.now() / 1000);
  const interval = intervalSeconds(input.digest_interval);
  const nextDigest =
    input.digest_interval === row.digest_interval && row.next_digest_at !== null
      ? row.next_digest_at
      : interval
        ? now + interval
        : null;
  await c.env.DB.batch([
    c.env.DB.prepare(
      'UPDATE notification_groups SET name = ?1, is_active = ?2, immediate_enabled = ?3, debounce_due_at = CASE WHEN ?4 = 0 THEN NULL WHEN debounce_due_at IS NOT NULL AND debounce_seconds <> ?4 THEN ?7 + ?4 ELSE debounce_due_at END, debounce_seconds = ?4, digest_interval = ?5, next_digest_at = ?6, updated_at = ?7 WHERE id = ?8',
    ).bind(
      input.name,
      Number(input.is_active),
      Number(input.immediate_enabled),
      input.debounce_seconds,
      input.digest_interval,
      nextDigest,
      now,
      id,
    ),
    c.env.DB.prepare('DELETE FROM notification_group_monitors WHERE group_id = ?1').bind(id),
    c.env.DB.prepare('DELETE FROM notification_group_channels WHERE group_id = ?1').bind(id),
    ...membershipInserts(c.env.DB, '?1', id, input),
    ...(input.debounce_seconds === 0
      ? [
          c.env.DB.prepare(
            'DELETE FROM notification_group_pending_events WHERE group_id = ?1',
          ).bind(id),
        ]
      : []),
  ]);
  const updated = await c.env.DB.prepare(
    'SELECT id, name, is_active, immediate_enabled, debounce_seconds, debounce_due_at, digest_interval, next_digest_at, created_at, updated_at FROM notification_groups WHERE id = ?1',
  )
    .bind(id)
    .first<GroupRow>();
  if (!updated) throw new AppError(500, 'INTERNAL', 'Failed to update notification group');
  return c.json({ notification_group: await groupToApi(c.env.DB, updated) });
});

adminNotificationGroupRoutes.delete('/:id', async (c) => {
  const id = z.coerce.number().int().positive().parse(c.req.param('id'));
  const existing = await c.env.DB.prepare('SELECT id FROM notification_groups WHERE id = ?1')
    .bind(id)
    .first<{ id: number }>();
  if (!existing) throw new AppError(404, 'NOT_FOUND', 'Notification group not found');
  await c.env.DB.batch([
    c.env.DB.prepare('DELETE FROM notification_group_pending_events WHERE group_id = ?1').bind(id),
    c.env.DB.prepare('DELETE FROM notification_group_batches WHERE group_id = ?1').bind(id),
    c.env.DB.prepare('DELETE FROM notification_group_monitors WHERE group_id = ?1').bind(id),
    c.env.DB.prepare('DELETE FROM notification_group_channels WHERE group_id = ?1').bind(id),
    c.env.DB.prepare('DELETE FROM notification_groups WHERE id = ?1').bind(id),
  ]);
  return c.json({ deleted: true });
});
