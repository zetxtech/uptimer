ALTER TABLE notification_deliveries ADD COLUMN event_type TEXT;
ALTER TABLE notification_deliveries ADD COLUMN payload_json TEXT;
ALTER TABLE notification_deliveries ADD COLUMN attempts INTEGER NOT NULL DEFAULT 0;
ALTER TABLE notification_deliveries ADD COLUMN next_attempt_at INTEGER;

CREATE INDEX IF NOT EXISTS idx_notification_deliveries_retry
  ON notification_deliveries (status, next_attempt_at);
