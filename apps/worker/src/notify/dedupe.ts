export type NotificationDeliveryOutcome = {
  status: 'success' | 'failed';
  httpStatus: number | null;
  error: string | null;
};

export type NotificationDeliveryClaim = {
  /** Event type stored with the row so the delivery log can show what was sent. */
  eventType?: string;
  /** Original payload, stored so a failed delivery can be retried by the scheduler. */
  payload?: unknown;
  /** Manual retry: ignore the minimum retry interval and the backoff window. */
  force?: boolean;
};

function serializePayload(payload: unknown): string | null {
  if (payload === undefined) return null;
  try {
    return JSON.stringify(payload);
  } catch {
    return null;
  }
}

export async function claimNotificationDelivery(
  db: D1Database,
  eventKey: string,
  channelId: number,
  createdAt: number,
  retryFailed = false,
  claim: NotificationDeliveryClaim = {},
): Promise<boolean> {
  const payloadJson = serializePayload(claim.payload);

  // Use the UNIQUE(event_key, channel_id) constraint as an idempotency key.
  // We insert a placeholder row first to claim the event before sending.
  const r = await db
    .prepare(
      `
      INSERT OR IGNORE INTO notification_deliveries (
        event_key,
        channel_id,
        status,
        http_status,
        error,
        created_at,
        event_type,
        payload_json
      ) VALUES (?1, ?2, 'failed', NULL, 'pending', ?3, ?4, ?5)
    `,
    )
    .bind(eventKey, channelId, createdAt, claim.eventType ?? null, payloadJson)
    .run();

  if ((r.meta?.changes ?? 0) > 0) return true;
  if (!retryFailed) return false;

  const retry = await db
    .prepare(
      `
      UPDATE notification_deliveries
      SET http_status = NULL,
          error = 'pending',
          created_at = ?3,
          next_attempt_at = NULL,
          event_type = COALESCE(?4, event_type),
          payload_json = COALESCE(?5, payload_json)
      WHERE event_key = ?1 AND channel_id = ?2 AND status = 'failed'
        AND (created_at <= ?3 - 120 OR ?6 = 1)
        AND (next_attempt_at IS NULL OR next_attempt_at <= ?3 OR ?6 = 1)
    `,
    )
    .bind(eventKey, channelId, createdAt, claim.eventType ?? null, payloadJson, claim.force ? 1 : 0)
    .run();

  return (retry.meta?.changes ?? 0) > 0;
}

export async function finalizeNotificationDelivery(
  db: D1Database,
  eventKey: string,
  channelId: number,
  outcome: NotificationDeliveryOutcome,
  now = Math.floor(Date.now() / 1000),
): Promise<void> {
  // Exponential backoff (120s, 240s, ... capped at 1h) keeps a dead endpoint from being hit on
  // every scheduler tick while the event is still inside the 24h retry window.
  await db
    .prepare(
      `
      UPDATE notification_deliveries
      SET status = ?1,
          http_status = ?2,
          error = ?3,
          attempts = attempts + 1,
          next_attempt_at = CASE
            WHEN ?1 = 'failed' THEN ?6 + CASE
              WHEN attempts <= 0 THEN 120
              WHEN attempts = 1 THEN 240
              WHEN attempts = 2 THEN 480
              WHEN attempts = 3 THEN 960
              WHEN attempts = 4 THEN 1920
              ELSE 3600
            END
            ELSE NULL
          END
      WHERE event_key = ?4 AND channel_id = ?5
    `,
    )
    .bind(outcome.status, outcome.httpStatus, outcome.error, eventKey, channelId, now)
    .run();
}
