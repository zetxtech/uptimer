import type { Env } from '../env';
import {
  checkAndStoreMonitorExpiry,
  crossedExpiryThreshold,
  type ExpiryCheckMonitor,
} from '../monitor/expiry';
import { createNotifyContext, queueExpiryNotification, type NotifyContext } from './notifications';

const EXPIRY_CHECK_CONCURRENCY = 4;
/** Re-check a monitor once its stored result is older than this. */
const EXPIRY_REFRESH_SECONDS = 20 * 60 * 60;

const EXPIRY_MONITOR_COLUMNS = `
  id,
  name,
  type,
  target,
  display_url,
  ssl_expiry_enabled,
  domain_expiry_enabled,
  ssl_expires_at,
  domain_expires_at,
  notification_channel_ids_json
`;

const LIST_DUE_EXPIRY_MONITORS_SQL = `
  SELECT ${EXPIRY_MONITOR_COLUMNS}
  FROM monitors
  WHERE is_active = 1
    AND type != 'heartbeat'
    AND (ssl_expiry_enabled = 1 OR domain_expiry_enabled = 1)
    AND (expiry_checked_at IS NULL OR expiry_checked_at < ?1)
  ORDER BY id
`;

async function checkAndNotify(
  env: Env,
  notify: NotifyContext | null,
  monitor: ExpiryCheckMonitor,
  now: number,
): Promise<boolean> {
  try {
    const outcome = await checkAndStoreMonitorExpiry(env, monitor, now);

    if (outcome.errors.length > 0) {
      console.warn(`expiry: monitor ${monitor.id} check failed: ${outcome.errors.join('; ')}`);
    }

    if (notify && outcome.sslExpiresAt !== null) {
      const threshold = crossedExpiryThreshold(monitor.ssl_expires_at, outcome.sslExpiresAt, now);
      if (threshold !== null) {
        queueExpiryNotification(env, notify, {
          monitor,
          kind: 'ssl',
          expiresAt: outcome.sslExpiresAt,
          thresholdDays: threshold,
          checkedAt: now,
        });
      }
    }

    if (notify && outcome.domainExpiresAt !== null) {
      const threshold = crossedExpiryThreshold(
        monitor.domain_expires_at,
        outcome.domainExpiresAt,
        now,
      );
      if (threshold !== null) {
        queueExpiryNotification(env, notify, {
          monitor,
          kind: 'domain',
          expiresAt: outcome.domainExpiresAt,
          thresholdDays: threshold,
          checkedAt: now,
        });
      }
    }

    return outcome.errors.length === 0;
  } catch (err) {
    console.error(`expiry: monitor ${monitor.id} check failed`, err);
    return false;
  }
}

/**
 * Certificate / domain registration expiry sweep, called by the minute cron every 15 minutes.
 * Only monitors whose stored result is older than ~20 hours (or never checked) are touched, so
 * each monitor costs at most one lookup per day and a new monitor is picked up within 15 minutes.
 */
export async function runExpiryChecks(
  env: Env,
  ctx: ExecutionContext,
  now = Math.floor(Date.now() / 1000),
): Promise<number> {
  const { results } = await env.DB.prepare(LIST_DUE_EXPIRY_MONITORS_SQL)
    .bind(now - EXPIRY_REFRESH_SECONDS)
    .all<ExpiryCheckMonitor>();

  const monitors = results ?? [];
  if (monitors.length === 0) return 0;

  const notify = await createNotifyContext(env, ctx);
  let checked = 0;

  for (let index = 0; index < monitors.length; index += EXPIRY_CHECK_CONCURRENCY) {
    const batch = monitors.slice(index, index + EXPIRY_CHECK_CONCURRENCY);
    const outcomes = await Promise.all(
      batch.map((monitor) => checkAndNotify(env, notify, monitor, now)),
    );
    checked += outcomes.filter(Boolean).length;
  }

  return checked;
}
