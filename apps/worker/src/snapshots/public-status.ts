import { AppError } from '../middleware/errors';
import { publicStatusResponseSchema, type PublicStatusResponse } from '../schemas/public-status';

const SNAPSHOT_KEY = 'status';

// How long a stored snapshot is served before readers fall back to a live computation, and the
// budget the cache headers may spend on it. Recomputing the payload scans check_results, so the
// window is measured in minutes instead of seconds.
const MAX_AGE_SECONDS = 5 * 60;

// The scheduler ticks every minute. Refresh a little before the freshness window closes so that
// readers never find an expired snapshot in between two ticks.
export const SNAPSHOT_REFRESH_AGE_SECONDS = MAX_AGE_SECONDS - 30;

export function getSnapshotKey() {
  return SNAPSHOT_KEY;
}

export function getSnapshotMaxAgeSeconds() {
  return MAX_AGE_SECONDS;
}

function safeJsonParse(text: string): unknown | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    return null;
  }
}

export async function readStatusSnapshot(
  db: D1Database,
  now: number,
): Promise<{ data: PublicStatusResponse; age: number } | null> {
  try {
    const row = await db
      .prepare(
        `
        SELECT generated_at, body_json
        FROM public_snapshots
        WHERE key = ?1
      `,
      )
      .bind(SNAPSHOT_KEY)
      .first<{ generated_at: number; body_json: string }>();

    if (!row) return null;

    const age = Math.max(0, now - row.generated_at);
    if (age > MAX_AGE_SECONDS) return null;

    const parsed = safeJsonParse(row.body_json);
    const data = publicStatusResponseSchema.parse(parsed);
    return { data, age };
  } catch (err) {
    // Backward compatible: if the table doesn't exist yet or snapshot is invalid,
    // callers should fall back to live computation.
    console.warn('public snapshot: read failed, falling back to live', err);
    return null;
  }
}

export async function writeStatusSnapshot(
  db: D1Database,
  now: number,
  payload: PublicStatusResponse,
): Promise<void> {
  const bodyJson = JSON.stringify(payload);
  await db
    .prepare(
      `
      INSERT INTO public_snapshots (key, generated_at, body_json, updated_at)
      VALUES (?1, ?2, ?3, ?4)
      ON CONFLICT(key) DO UPDATE SET
        generated_at = excluded.generated_at,
        body_json = excluded.body_json,
        updated_at = excluded.updated_at
    `,
    )
    .bind(SNAPSHOT_KEY, payload.generated_at, bodyJson, now)
    .run();
}

/**
 * Cheap freshness probe for the scheduler: reads the generation timestamp only, without parsing
 * and validating the stored payload.
 */
export async function readStatusSnapshotAgeSeconds(
  db: D1Database,
  now: number,
): Promise<number | null> {
  try {
    const row = await db
      .prepare(
        `
        SELECT generated_at
        FROM public_snapshots
        WHERE key = ?1
      `,
      )
      .bind(SNAPSHOT_KEY)
      .first<{ generated_at: number }>();

    if (!row) return null;
    return Math.max(0, now - row.generated_at);
  } catch (err) {
    // A missing table or a D1 hiccup must not stop the scheduler from refreshing.
    console.warn('public snapshot: age read failed, refreshing anyway', err);
    return null;
  }
}

export function applyStatusCacheHeaders(res: Response, ageSeconds: number): void {
  // Guarantee freshness bound <= MAX_AGE_SECONDS. Prefer <= 30s in normal cases.
  //
  // We ensure (max-age + stale-*) never exceeds MAX_AGE_SECONDS.
  const remaining = Math.max(0, MAX_AGE_SECONDS - ageSeconds);
  const maxAge = Math.min(30, remaining);
  const stale = Math.max(0, remaining - maxAge);

  res.headers.set(
    'Cache-Control',
    `public, max-age=${maxAge}, stale-while-revalidate=${stale}, stale-if-error=${stale}`,
  );
}

export function toSnapshotPayload(value: unknown): PublicStatusResponse {
  const parsed = publicStatusResponseSchema.safeParse(value);
  if (!parsed.success) {
    throw new AppError(500, 'INTERNAL', 'Failed to generate status snapshot');
  }
  return parsed.data;
}
