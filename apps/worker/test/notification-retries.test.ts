import { afterEach, describe, expect, it, vi } from 'vitest';

import type { Env } from '../src/env';
import { runNotificationRetries } from '../src/scheduler/notification-retries';
import { DatabaseSync, sqliteD1 } from './helpers/sqlite-d1';

function createEnv(
  nextAttemptAt: number,
  status = 'failed',
  eventKey = 'monitor:1:down:1700000000',
) {
  const database = new DatabaseSync(':memory:');
  database.exec(`
    CREATE TABLE locks (name TEXT PRIMARY KEY, expires_at INTEGER NOT NULL);
    CREATE TABLE notification_channels (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      type TEXT NOT NULL,
      config_json TEXT NOT NULL,
      is_active INTEGER NOT NULL DEFAULT 1
    );
    CREATE TABLE notification_deliveries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      event_key TEXT NOT NULL,
      channel_id INTEGER NOT NULL,
      status TEXT NOT NULL,
      http_status INTEGER,
      error TEXT,
      event_type TEXT,
      payload_json TEXT,
      attempts INTEGER NOT NULL DEFAULT 0,
      next_attempt_at INTEGER,
      created_at INTEGER NOT NULL,
      UNIQUE (event_key, channel_id)
    );
    INSERT INTO notification_channels (id, name, type, config_json, is_active)
    VALUES (
      10,
      'Ops',
      'webhook',
      '{"preset":"custom","url":"https://hooks.example.test/ops","method":"POST","payload_type":"json"}',
      1
    );
  `);
  database
    .prepare(
      `INSERT INTO notification_deliveries
        (event_key, channel_id, status, http_status, error, event_type, payload_json, attempts, next_attempt_at, created_at)
       VALUES (?3, 10, ?1, 502, 'HTTP 502', 'monitor.down',
               '{"event":"monitor.down"}', 1, ?2, 1700000000)`,
    )
    .run(status, nextAttemptAt, eventKey);

  return { database, env: { DB: sqliteD1(database) } as Env };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('scheduler/notification-retries', () => {
  it('re-delivers a failed notification once it is due', async () => {
    const now = 1_700_000_300;
    const fetchMock = vi.fn(async () => new Response('ok', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const { database, env } = createEnv(now - 1);

    try {
      await runNotificationRetries(env, now);

      expect(fetchMock).toHaveBeenCalledTimes(1);
      const row = database
        .prepare(
          'SELECT status, http_status, attempts, next_attempt_at FROM notification_deliveries WHERE id = 1',
        )
        .get() as {
        status: string;
        http_status: number;
        attempts: number;
        next_attempt_at: number | null;
      };
      expect(row.status).toBe('success');
      expect(row.http_status).toBe(200);
      expect(row.attempts).toBe(2);
      expect(row.next_attempt_at).toBeNull();
    } finally {
      database.close();
    }
  });

  it('leaves deliveries inside their backoff window alone', async () => {
    const now = 1_700_000_300;
    const fetchMock = vi.fn(async () => new Response('ok', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const { database, env } = createEnv(now + 60);

    try {
      await runNotificationRetries(env, now);
      expect(fetchMock).not.toHaveBeenCalled();
    } finally {
      database.close();
    }
  });

  it('never retries one-shot test pings', async () => {
    const now = 1_700_000_300;
    const fetchMock = vi.fn(async () => new Response('ok', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const { database, env } = createEnv(now - 1, 'failed', 'test:webhook:10:1700000000');

    try {
      await runNotificationRetries(env, now);
      expect(fetchMock).not.toHaveBeenCalled();
    } finally {
      database.close();
    }
  });

  it('does not retry deliveries that already succeeded', async () => {
    const now = 1_700_000_300;
    const fetchMock = vi.fn(async () => new Response('ok', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const { database, env } = createEnv(now - 1, 'success');

    try {
      await runNotificationRetries(env, now);
      expect(fetchMock).not.toHaveBeenCalled();
    } finally {
      database.close();
    }
  });
});
