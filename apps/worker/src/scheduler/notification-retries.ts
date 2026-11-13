import { parseDbJson, webhookChannelConfigSchema } from '@uptimer/db/json';
import pLimit from 'p-limit';

import type { Env } from '../env';
import { dispatchWebhookToChannel } from '../notify/webhook';
import { acquireLease, releaseLease } from './lock';

const LOCK_NAME = 'notification:retries';
const LOCK_SECONDS = 120;
const RETRY_WINDOW_SECONDS = 86_400;
const RETRY_BATCH_SIZE = 20;
const RETRY_CONCURRENCY = 4;
const MAX_ATTEMPTS = 8;

type RetryRow = {
  event_key: string;
  event_type: string;
  payload_json: string;
  channel_id: number;
  channel_name: string;
  config_json: string;
};

/**
 * Re-delivers failed notifications with the payload captured when the event was first sent.
 *
 * Probe events keep their own retry loop (`scheduler/probe-health.ts`) and test pings are
 * intentionally one-shot, so both are excluded here.
 */
export async function runNotificationRetries(
  env: Env,
  now = Math.floor(Date.now() / 1000),
): Promise<void> {
  if (!(await acquireLease(env.DB, LOCK_NAME, now, LOCK_SECONDS))) return;

  try {
    const { results } = await env.DB.prepare(
      `
      SELECT d.event_key, d.event_type, d.payload_json, d.channel_id,
             c.name AS channel_name, c.config_json
      FROM notification_deliveries d
      INNER JOIN notification_channels c ON c.id = d.channel_id
      WHERE d.status = 'failed'
        AND d.payload_json IS NOT NULL
        AND d.event_type IS NOT NULL
        AND d.attempts < ?1
        AND d.created_at >= ?2
        AND d.next_attempt_at IS NOT NULL
        AND d.next_attempt_at <= ?3
        AND c.is_active = 1
        AND c.type = 'webhook'
        AND d.event_key NOT LIKE 'probe:%'
        AND d.event_key NOT LIKE 'test:%'
      ORDER BY d.next_attempt_at
      LIMIT ?4
    `,
    )
      .bind(MAX_ATTEMPTS, now - RETRY_WINDOW_SECONDS, now, RETRY_BATCH_SIZE)
      .all<RetryRow>();

    const dispatchLimit = pLimit(RETRY_CONCURRENCY);
    const tasks: Array<Promise<void>> = [];

    for (const row of results ?? []) {
      let payload: unknown;
      try {
        payload = JSON.parse(row.payload_json);
      } catch {
        continue;
      }

      tasks.push(
        dispatchLimit(async () => {
          try {
            await dispatchWebhookToChannel({
              db: env.DB,
              env: env as unknown as Record<string, unknown>,
              channel: {
                id: row.channel_id,
                name: row.channel_name,
                config: parseDbJson(webhookChannelConfigSchema, row.config_json, {
                  field: 'config_json',
                }),
              },
              eventType: row.event_type,
              eventKey: row.event_key,
              payload,
              retryFailed: true,
            });
          } catch (error) {
            console.error('notify: retry failed', row.event_key, row.channel_id, error);
          }
        }),
      );
    }

    await Promise.allSettled(tasks);
  } finally {
    await releaseLease(env.DB, LOCK_NAME, now + LOCK_SECONDS);
  }
}
