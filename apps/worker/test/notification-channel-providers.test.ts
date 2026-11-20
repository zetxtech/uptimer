import { afterEach, describe, expect, it, vi } from 'vitest';

const smtp = vi.hoisted(() => ({ send: vi.fn(), close: vi.fn(), connect: vi.fn() }));
vi.mock('worker-mailer', () => ({
  LogLevel: { NONE: 4 },
  WorkerMailer: { connect: smtp.connect },
}));

import { createNotificationChannelInputSchema } from '../src/schemas/notification-channels';
import { dispatchProvider } from '../src/notify/providers';

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.clearAllMocks();
});

describe('notification provider configuration', () => {
  it('accepts secure Bark and Resend configuration using secret references', () => {
    expect(
      createNotificationChannelInputSchema.safeParse({
        name: 'Bark',
        config_json: {
          preset: 'bark',
          server_url: 'https://api.day.app',
          device_key_secret_ref: 'BARK_KEY',
        },
      }).success,
    ).toBe(true);
    expect(
      createNotificationChannelInputSchema.safeParse({
        name: 'Email',
        config_json: {
          preset: 'resend',
          api_key_secret_ref: 'RESEND_KEY',
          from: 'alerts@example.com',
          to: ['admin@example.com'],
          enabled_events: ['probe.offline'],
        },
      }).success,
    ).toBe(true);
  });

  it('rejects insecure Bark URLs, private SMTP targets and SMTP port 25', () => {
    expect(
      createNotificationChannelInputSchema.safeParse({
        name: 'Bark',
        config_json: {
          preset: 'bark',
          server_url: 'http://api.day.app',
          device_key_secret_ref: 'BARK_KEY',
        },
      }).success,
    ).toBe(false);
    const smtp = {
      preset: 'smtp',
      host: '127.0.0.1',
      port: 465,
      username: 'admin',
      password_secret_ref: 'SMTP_PASSWORD',
      from: 'alerts@example.com',
      to: ['admin@example.com'],
    };
    expect(
      createNotificationChannelInputSchema.safeParse({ name: 'SMTP', config_json: smtp }).success,
    ).toBe(false);
    expect(
      createNotificationChannelInputSchema.safeParse({
        name: 'SMTP',
        config_json: { ...smtp, host: 'smtp.example.com', port: 25 },
      }).success,
    ).toBe(false);
    expect(
      createNotificationChannelInputSchema.safeParse({
        name: 'SMTP',
        config_json: { ...smtp, host: 'smtp.example.com' },
      }).success,
    ).toBe(true);
    expect(
      createNotificationChannelInputSchema.safeParse({
        name: 'Bark',
        config_json: { preset: 'bark', server_url: 'not a URL', device_key_secret_ref: 'BARK_KEY' },
      }).success,
    ).toBe(false);
    expect(
      createNotificationChannelInputSchema.safeParse({
        name: 'Bark',
        config_json: {
          preset: 'bark',
          server_url: 'https://127.0.0.1',
          device_key_secret_ref: 'BARK_KEY',
        },
      }).success,
    ).toBe(false);
  });

  it('sends the Bark device key in the body rather than the URL', async () => {
    const fetchMock = vi.fn(async () => new Response(null, { status: 200 }));
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    const result = await dispatchProvider({
      env: { BARK_KEY: 'device-key' },
      config: {
        preset: 'bark',
        server_url: 'https://api.day.app',
        device_key_secret_ref: 'BARK_KEY',
      },
      channelId: 1,
      eventType: 'monitor.down',
      eventKey: 'event-1',
      message: 'Unavailable',
    });
    expect(result.status).toBe('success');
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.day.app/push');
    expect(JSON.parse(String(init.body))).toEqual({
      device_key: 'device-key',
      title: 'Uptimer',
      body: 'Unavailable',
    });
    expect(init.redirect).toBe('error');
  });

  it('sends Resend with a stable, channel-specific idempotency key', async () => {
    const fetchMock = vi.fn(async () => new Response(null, { status: 200 }));
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    const config = {
      preset: 'resend' as const,
      api_key_secret_ref: 'RESEND_KEY',
      from: 'alerts@example.com',
      to: ['admin@example.com'],
    };
    const args = {
      env: { RESEND_KEY: 'secret' },
      config,
      channelId: 3,
      eventType: 'monitor.down',
      eventKey: 'event-2',
      message: 'Unavailable',
    };
    await dispatchProvider(args);
    await dispatchProvider(args);
    const first = fetchMock.mock.calls[0]?.[1] as RequestInit;
    const second = fetchMock.mock.calls[1]?.[1] as RequestInit;
    expect((first.headers as Record<string, string>).Authorization).toBe('Bearer secret');
    expect((first.headers as Record<string, string>)['Idempotency-Key']).toBe(
      (second.headers as Record<string, string>)['Idempotency-Key'],
    );
    expect(JSON.parse(String(first.body))).toMatchObject({
      from: 'alerts@example.com',
      to: ['admin@example.com'],
      text: 'Unavailable',
    });
  });

  it('uses implicit TLS for SMTP and closes the connection after a failure', async () => {
    smtp.connect.mockResolvedValue({ send: smtp.send, close: smtp.close });
    smtp.send.mockRejectedValue(new Error('delivery failed'));
    const result = await dispatchProvider({
      env: { SMTP_PASSWORD: 'secret' },
      config: {
        preset: 'smtp',
        host: 'smtp.example.com',
        port: 465,
        username: 'sender',
        password_secret_ref: 'SMTP_PASSWORD',
        from: 'alerts@example.com',
        to: ['admin@example.com'],
      },
      channelId: 4,
      eventType: 'monitor.down',
      eventKey: 'event-3',
      message: 'Unavailable',
    });
    expect(result.status).toBe('failed');
    expect(smtp.connect).toHaveBeenCalledWith(
      expect.objectContaining({ secure: true, startTls: false }),
    );
    expect(smtp.close).toHaveBeenCalledOnce();
  });

  it('fails closed when a referenced secret is missing', async () => {
    const result = await dispatchProvider({
      env: {},
      config: {
        preset: 'resend',
        api_key_secret_ref: 'RESEND_KEY',
        from: 'alerts@example.com',
        to: ['admin@example.com'],
      },
      channelId: 5,
      eventType: 'monitor.down',
      eventKey: 'event-4',
      message: 'Unavailable',
    });
    expect(result).toMatchObject({
      status: 'failed',
      error: expect.stringContaining('RESEND_KEY'),
    });
  });
});
