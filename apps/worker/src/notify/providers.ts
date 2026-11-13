import type { BarkChannelConfig, ResendChannelConfig, SmtpChannelConfig } from '@uptimer/db';

import { validateHttpTarget, validateTcpTarget } from '../monitor/targets';
import type { WebhookDispatchResult } from './webhook';

type ProviderConfig = BarkChannelConfig | ResendChannelConfig | SmtpChannelConfig;

function readSecret(env: Record<string, unknown>, ref: string): string | null {
  const value = env[ref];
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function failure(error: string): WebhookDispatchResult {
  return { status: 'failed', httpStatus: null, error };
}

async function idempotencyKey(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function dispatchProvider(args: {
  env: Record<string, unknown>;
  config: ProviderConfig;
  channelId: number;
  eventType: string;
  eventKey: string;
  message: string;
}): Promise<WebhookDispatchResult> {
  const { config, env, message } = args;
  const secretRef =
    config.preset === 'bark'
      ? config.device_key_secret_ref
      : config.preset === 'resend'
        ? config.api_key_secret_ref
        : config.password_secret_ref;
  const secret = readSecret(env, secretRef);
  if (!secret) return failure(`Notification secret not configured: ${secretRef}`);

  if (config.preset === 'smtp') {
    const targetError = validateTcpTarget(`${config.host}:${config.port}`);
    if (targetError) return failure(targetError);
    try {
      const { WorkerMailer, LogLevel } = await import('worker-mailer');
      const mailer = await WorkerMailer.connect({
        host: config.host,
        port: config.port,
        secure: true,
        startTls: false,
        credentials: { username: config.username, password: secret },
        authType: ['plain', 'login'],
        logLevel: LogLevel.NONE,
        socketTimeoutMs: config.timeout_ms ?? 10000,
        responseTimeoutMs: config.timeout_ms ?? 10000,
      });
      try {
        await mailer.send({
          from: config.from,
          to: config.to,
          subject: `${config.subject_prefix ?? 'Uptimer'}: ${args.eventType}`,
          text: message,
        });
      } finally {
        await mailer.close();
      }
      return { status: 'success', httpStatus: null, error: null };
    } catch (error) {
      return failure(
        (error instanceof Error ? error.message : String(error)).split(secret).join('[redacted]'),
      );
    }
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.timeout_ms ?? 10000);
  try {
    let url: string;
    let headers: Record<string, string>;
    let body: unknown;
    if (config.preset === 'bark') {
      const targetError = validateHttpTarget(config.server_url);
      if (targetError) return failure(targetError);
      const target = new URL(config.server_url);
      target.pathname = `${target.pathname.replace(/\/+$/, '')}/push`;
      url = target.toString();
      headers = { 'Content-Type': 'application/json' };
      body = { device_key: secret, title: 'Uptimer', body: message };
    } else {
      url = 'https://api.resend.com/emails';
      headers = {
        Authorization: `Bearer ${secret}`,
        'Content-Type': 'application/json',
        'Idempotency-Key': await idempotencyKey(`${args.channelId}:${args.eventKey}`),
      };
      body = {
        from: config.from,
        to: config.to,
        subject: `${config.subject_prefix ?? 'Uptimer'}: ${args.eventType}`,
        text: message,
      };
    }
    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: controller.signal,
      redirect: 'error',
      cache: 'no-store',
    });
    response.body?.cancel();
    return {
      status: response.ok ? 'success' : 'failed',
      httpStatus: response.status,
      error: response.ok ? null : `HTTP ${response.status}`,
    };
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    return failure(detail.split(secret).join('[redacted]'));
  } finally {
    clearTimeout(timeout);
  }
}
