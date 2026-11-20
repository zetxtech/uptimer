-- Monitor escalation and maintenance settings.
--
-- notification_channel_ids_json: JSON array of channel ids for this monitor. NULL (the default)
-- keeps the historical fan-out to every enabled channel; a set list restricts monitor.down/up
-- notifications to exactly those channels.
ALTER TABLE monitors ADD COLUMN notification_channel_ids_json TEXT;

-- maintenance_window_json: recurring daily maintenance window
-- ({start_minute, end_minute, days, timezone}); NULL disables suppression.
ALTER TABLE monitors ADD COLUMN maintenance_window_json TEXT;

-- Free-form labels of a monitor, mirroring outage_metadata.
CREATE TABLE monitor_metadata (
  monitor_id INTEGER NOT NULL,
  key TEXT NOT NULL,
  value TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (monitor_id, key)
);
