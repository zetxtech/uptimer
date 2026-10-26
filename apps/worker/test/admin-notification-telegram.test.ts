import { Hono } from 'hono';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/snapshots', () => ({
  refreshPublicHomepageSnapshotIfNeeded: vi.fn().mockResolvedValue(false),
}));
vi.mock('../src/monitor/tcp', () => ({
  runTcpCheck: vi.fn(),
}));

import type { Env } from '../src/env';
import { handleError, handleNotFound } from '../src/middleware/errors';
import { decryptTelegramBotToken, encryptTelegramBotToken } from '../src/notify/telegram-token';
import { adminRoutes } from '../src/routes/admin';
import { createFakeD1Database, type FakeD1QueryHandler } from './helpers/fake-d1';

type NotificationChannelRow = {
  id: number;
  name: string;
  type: string;
  config_json: string;
  is_active: number;
  created_at: number;
};

function createAdminApp() {
  const app = new Hono<{ Bindings: Env }>();
  app.onError(handleError);
  app.notFound(handleNotFound);
  app.route('/api/v1/admin', adminRoutes);
  return app;
}

function createEnv(channelsById: Map<number, NotificationChannelRow>): Env {
  let nextChannelId = 100;

  const handlers: FakeD1QueryHandler[] = [
    {
      match: 'insert into notification_channels',
      first: (args) => {
        const row: NotificationChannelRow = {
          id: nextChannelId,
          name: String(args[0]),
          type: String(args[1]),
          config_json: String(args[2]),
          is_active: Number(args[3]),
          created_at: Number(args[4]),
        };
        channelsById.set(row.id, row);
        nextChannelId += 1;
        return row;
      },
    },
    {
      match: 'from notification_channels where id = ?1',
      first: (args) => channelsById.get(Number(args[0])) ?? null,
    },
    {
      match: 'update notification_channels set name = ?1, config_json = ?2, is_active = ?3',
      first: (args) => {
        const id = Number(args[3]);
        const existing = channelsById.get(id);
        if (!existing) return null;

        const row: NotificationChannelRow = {
          ...existing,
          name: String(args[0]),
          config_json: String(args[1]),
          is_active: Number(args[2]),
        };
        channelsById.set(row.id, row);
        return row;
      },
    },
  ];

  return {
    DB: createFakeD1Database(handlers),
    ADMIN_TOKEN: 'test-admin-token',
    ADMIN_RATE_LIMIT_MAX: '100',
    ADMIN_RATE_LIMIT_WINDOW_SEC: '60',
  } as unknown as Env;
}

async function requestAdmin(
  app: ReturnType<typeof createAdminApp>,
  env: Env,
  path: string,
  init: {
    method?: string;
    body?: unknown;
  } = {},
): Promise<Response> {
  const headers = new Headers({
    Authorization: 'Bearer test-admin-token',
  });
  let body: string | undefined;

  if (init.body !== undefined) {
    headers.set('Content-Type', 'application/json');
    body = JSON.stringify(init.body);
  }

  return app.fetch(
    new Request(`https://status.example.com${path}`, {
      method: init.method ?? 'GET',
      headers,
      body,
    }),
    env,
    { waitUntil: vi.fn() } as unknown as ExecutionContext,
  );
}

describe('admin notification Telegram routes', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('encrypts Bot Token input before storage and sanitizes the API response', async () => {
    const app = createAdminApp();
    const channelsById = new Map<number, NotificationChannelRow>();
    const env = createEnv(channelsById);

    const res = await requestAdmin(app, env, '/api/v1/admin/notification-channels', {
      method: 'POST',
      body: {
        name: 'Telegram',
        type: 'webhook',
        config_json: {
          preset: 'telegram',
          bot_token: '123456:TEST',
          chat_id: '-1001234567890',
        },
      },
    });

    expect(res.status).toBe(201);
    const body = (await res.json()) as {
      notification_channel: {
        id: number;
        config_json: Record<string, unknown>;
      };
    };
    expect(body.notification_channel.config_json).toMatchObject({
      preset: 'telegram',
      chat_id: '-1001234567890',
      bot_token_configured: true,
      bot_token_source: 'stored',
    });
    expect(body.notification_channel.config_json.bot_token).toBeUndefined();
    expect(body.notification_channel.config_json.bot_token_encrypted).toBeUndefined();

    const stored = JSON.parse(
      channelsById.get(body.notification_channel.id)!.config_json,
    ) as Record<string, string>;
    expect(stored.bot_token).toBeUndefined();
    expect(stored.bot_token_encrypted).toMatch(/^v1:/);
    expect(stored.bot_token_encrypted).not.toBe('123456:TEST');
    await expect(
      decryptTelegramBotToken(env.ADMIN_TOKEN, stored.bot_token_encrypted),
    ).resolves.toBe('123456:TEST');
  });

  it('preserves the stored Telegram token when editing without a new token', async () => {
    const app = createAdminApp();
    const channelsById = new Map<number, NotificationChannelRow>();
    const env = createEnv(channelsById);
    const encryptedToken = await encryptTelegramBotToken(env.ADMIN_TOKEN, '123456:TEST');
    channelsById.set(10, {
      id: 10,
      name: 'Telegram',
      type: 'webhook',
      config_json: JSON.stringify({
        preset: 'telegram',
        bot_token_encrypted: encryptedToken,
        chat_id: '@old_status',
      }),
      is_active: 1,
      created_at: 1000,
    });

    const res = await requestAdmin(app, env, '/api/v1/admin/notification-channels/10', {
      method: 'PATCH',
      body: {
        config_json: {
          preset: 'telegram',
          chat_id: '@new_status',
          parse_mode: 'HTML',
        },
      },
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      notification_channel: { config_json: Record<string, unknown> };
    };
    expect(body.notification_channel.config_json).toMatchObject({
      preset: 'telegram',
      chat_id: '@new_status',
      parse_mode: 'HTML',
      bot_token_configured: true,
      bot_token_source: 'stored',
    });
    expect(body.notification_channel.config_json.bot_token_encrypted).toBeUndefined();

    const stored = JSON.parse(channelsById.get(10)!.config_json) as Record<string, string>;
    expect(stored.bot_token_encrypted).toBe(encryptedToken);
    expect(stored.chat_id).toBe('@new_status');
    expect(stored.parse_mode).toBe('HTML');
  });
});
