import { describe, expect, it, vi } from 'vitest';

import { AppError } from '../src/middleware/errors';
import {
  applyStatusCacheHeaders,
  getSnapshotKey,
  getSnapshotMaxAgeSeconds,
  readStatusSnapshot,
  readStatusSnapshotAgeSeconds,
  SNAPSHOT_REFRESH_AGE_SECONDS,
  toSnapshotPayload,
  writeStatusSnapshot,
} from '../src/snapshots/public-status';
import { createFakeD1Database } from './helpers/fake-d1';

function samplePayload(now = 1_728_000_000) {
  return {
    generated_at: now,
    site_title: 'Uptimer',
    site_description: '',
    site_locale: 'auto' as const,
    site_timezone: 'UTC',
    uptime_rating_level: 3 as const,
    overall_status: 'up' as const,
    banner: {
      source: 'monitors' as const,
      status: 'operational' as const,
      title: 'All Systems Operational',
      down_ratio: null,
    },
    summary: {
      up: 0,
      down: 0,
      maintenance: 0,
      paused: 0,
      unknown: 0,
    },
    monitors: [],
    active_incidents: [],
    maintenance_windows: {
      active: [],
      upcoming: [],
    },
  };
}

describe('snapshots/public-status', () => {
  it('exposes stable snapshot key and max-age constants', () => {
    expect(getSnapshotKey()).toBe('status');
    expect(getSnapshotMaxAgeSeconds()).toBe(300);
    expect(SNAPSHOT_REFRESH_AGE_SECONDS).toBe(270);
    expect(SNAPSHOT_REFRESH_AGE_SECONDS).toBeLessThan(getSnapshotMaxAgeSeconds());
  });

  it('reads a fresh and valid snapshot payload', async () => {
    const now = 200;
    const payload = samplePayload(190);
    const db = createFakeD1Database([
      {
        match: 'from public_snapshots',
        first: () => ({
          generated_at: payload.generated_at,
          body_json: JSON.stringify(payload),
        }),
      },
    ]);

    const result = await readStatusSnapshot(db, now);
    expect(result).toEqual({
      data: payload,
      age: 10,
    });
  });

  it('falls back to live compute when snapshot is stale or invalid', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    const staleDb = createFakeD1Database([
      {
        match: 'from public_snapshots',
        first: () => ({ generated_at: 0, body_json: JSON.stringify(samplePayload(0)) }),
      },
    ]);
    await expect(readStatusSnapshot(staleDb, 20 * 60)).resolves.toBeNull();

    const invalidJsonDb = createFakeD1Database([
      {
        match: 'from public_snapshots',
        first: () => ({ generated_at: 190, body_json: '{not-json' }),
      },
    ]);
    await expect(readStatusSnapshot(invalidJsonDb, 200)).resolves.toBeNull();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('reports the stored snapshot age without parsing the payload', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    const db = createFakeD1Database([
      {
        match: 'from public_snapshots',
        first: () => ({ generated_at: 900 }),
      },
    ]);
    await expect(readStatusSnapshotAgeSeconds(db, 1000)).resolves.toBe(100);

    const emptyDb = createFakeD1Database([
      {
        match: 'from public_snapshots',
        first: () => null,
      },
    ]);
    await expect(readStatusSnapshotAgeSeconds(emptyDb, 1000)).resolves.toBeNull();

    // A missing table or a D1 error must not stop the scheduler from refreshing.
    const brokenDb = createFakeD1Database([]);
    await expect(readStatusSnapshotAgeSeconds(brokenDb, 1000)).resolves.toBeNull();
    expect(warn).toHaveBeenCalled();

    warn.mockRestore();
  });

  it('writes the normalized snapshot payload with upsert semantics', async () => {
    let boundArgs: unknown[] | null = null;
    const db = createFakeD1Database([
      {
        match: 'insert into public_snapshots',
        run: (args) => {
          boundArgs = args;
          return { meta: { changes: 1 } };
        },
      },
    ]);

    const now = 300;
    const payload = samplePayload(280);
    await writeStatusSnapshot(db, now, payload);

    expect(boundArgs).toEqual(['status', 280, JSON.stringify(payload), now]);
  });

  it('sets bounded cache-control headers based on current snapshot age', () => {
    const young = new Response('ok');
    applyStatusCacheHeaders(young, 10);
    expect(young.headers.get('Cache-Control')).toBe(
      'public, max-age=30, stale-while-revalidate=260, stale-if-error=260',
    );

    const nearlyExpired = new Response('ok');
    applyStatusCacheHeaders(nearlyExpired, 290);
    expect(nearlyExpired.headers.get('Cache-Control')).toBe(
      'public, max-age=10, stale-while-revalidate=0, stale-if-error=0',
    );

    const expired = new Response('ok');
    applyStatusCacheHeaders(expired, 300);
    expect(expired.headers.get('Cache-Control')).toBe(
      'public, max-age=0, stale-while-revalidate=0, stale-if-error=0',
    );
  });

  it('validates snapshot payload shape before persistence', () => {
    const payload = samplePayload(123);
    expect(toSnapshotPayload(payload)).toEqual(payload);
    expect(() => toSnapshotPayload({ generated_at: 1 })).toThrow(AppError);
  });
});
