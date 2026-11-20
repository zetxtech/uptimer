import { describe, expect, it, vi } from 'vitest';

import type { Env } from '../src/env';
import {
  captureOutageScreenshot,
  loadOutageScreenshot,
  markScreenshotAttempt,
} from '../src/monitor/screenshot';

function createRecordingDb() {
  const runs: Array<{ sql: string; args: unknown[] }> = [];
  let stored: {
    outage_id: number;
    content_type: string;
    width: number | null;
    height: number | null;
    bytes: ArrayBuffer | null;
    captured_at: number;
  } | null = null;

  const db = {
    prepare(sql: string) {
      return {
        bind(...args: unknown[]) {
          const statement = {
            async run() {
              runs.push({ sql, args });
              if (sql.includes('INSERT INTO outage_screenshots') && args.length === 5) {
                stored = {
                  outage_id: args[0] as number,
                  content_type: 'image/jpeg',
                  width: args[1] as number | null,
                  height: args[2] as number | null,
                  bytes: args[3] as ArrayBuffer | null,
                  captured_at: args[4] as number,
                };
              } else if (sql.includes('INSERT INTO outage_screenshots') && args.length === 2) {
                stored ??= {
                  outage_id: args[0] as number,
                  content_type: 'image/jpeg',
                  width: null,
                  height: null,
                  bytes: null,
                  captured_at: args[1] as number,
                };
              }
              return { success: true };
            },
            async first() {
              return stored;
            },
          };
          return statement;
        },
      };
    },
  };

  return { db: db as unknown as Env['DB'], runs, peek: () => stored };
}

function createSession(bytes: Uint8Array) {
  const calls = { goto: [] as string[], viewport: null as unknown, closed: false };
  return {
    calls,
    session: {
      async newPage() {
        return {
          async setViewport(viewport: unknown) {
            calls.viewport = viewport;
          },
          async goto(url: string) {
            calls.goto.push(url);
          },
          async screenshot() {
            return bytes;
          },
        };
      },
      async close() {
        calls.closed = true;
      },
    },
  };
}

describe('outage screenshots', () => {
  it('does nothing without the Browser Rendering binding', async () => {
    const { db } = createRecordingDb();
    const shot = await captureOutageScreenshot({ DB: db } as Env, {
      outageId: 7,
      target: 'https://example.com',
    });
    expect(shot).toBeNull();
  });

  it('renders the target at the fixed viewport and stores the jpeg', async () => {
    const { db, peek } = createRecordingDb();
    const bytes = new Uint8Array([1, 2, 3, 4]);
    const { session, calls } = createSession(bytes);
    const launcher = vi.fn().mockResolvedValue(session);

    const shot = await captureOutageScreenshot(
      { DB: db, BROWSER: { fake: true } } as unknown as Env,
      { outageId: 42, target: 'https://example.com/healthz', launcher },
    );

    expect(launcher).toHaveBeenCalledWith({ fake: true });
    expect(calls.viewport).toEqual({ width: 1280, height: 800 });
    expect(calls.goto).toEqual(['https://example.com/healthz']);
    expect(calls.closed).toBe(true);
    expect(shot?.contentType).toBe('image/jpeg');
    expect(peek()?.bytes?.byteLength).toBe(4);
    expect(peek()?.outage_id).toBe(42);
  });

  it('reports failure without throwing when the renderer errors', async () => {
    const { db } = createRecordingDb();
    const launcher = vi.fn().mockRejectedValue(new Error('renderer unavailable'));
    const shot = await captureOutageScreenshot({ DB: db, BROWSER: {} } as unknown as Env, {
      outageId: 5,
      target: 'https://example.com',
      launcher,
    });
    expect(shot).toBeNull();
  });

  it('records attempts so a broken target is not retried every tick', async () => {
    const { db, runs, peek } = createRecordingDb();
    await markScreenshotAttempt({ DB: db } as Env, 9);
    expect(runs[0]?.sql).toContain('INSERT INTO outage_screenshots');
    expect(peek()?.bytes).toBeNull();
  });

  it('loads a stored screenshot', async () => {
    const { db } = createRecordingDb();
    const bytes = new Uint8Array([9, 9]).buffer;
    await captureOutageScreenshot({ DB: db, BROWSER: {} } as unknown as Env, {
      outageId: 3,
      target: 'https://example.com',
      launcher: async () => createSession(new Uint8Array([9, 9])).session,
    });
    const loaded = await loadOutageScreenshot({ DB: db } as Env, 3);
    expect(loaded?.bytes?.byteLength).toBe(2);
    expect(bytes.byteLength).toBe(2);
  });
});
