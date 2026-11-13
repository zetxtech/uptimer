CREATE TABLE notification_groups (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  creation_token TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  immediate_enabled INTEGER NOT NULL DEFAULT 1 CHECK (immediate_enabled IN (0, 1)),
  debounce_seconds INTEGER NOT NULL DEFAULT 0 CHECK (debounce_seconds BETWEEN 0 AND 86400),
  debounce_due_at INTEGER,
  digest_interval TEXT NOT NULL DEFAULT 'none' CHECK (digest_interval IN ('none', 'daily', 'weekly')),
  next_digest_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE notification_group_monitors (
  group_id INTEGER NOT NULL,
  monitor_id INTEGER NOT NULL,
  PRIMARY KEY (group_id, monitor_id)
);
CREATE INDEX idx_notification_group_monitors_monitor ON notification_group_monitors(monitor_id);

CREATE TABLE notification_group_channels (
  group_id INTEGER NOT NULL,
  channel_id INTEGER NOT NULL,
  PRIMARY KEY (group_id, channel_id)
);
CREATE INDEX idx_notification_group_channels_channel ON notification_group_channels(channel_id);

CREATE TABLE notification_group_pending_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  group_id INTEGER NOT NULL,
  monitor_id INTEGER NOT NULL,
  event_key TEXT NOT NULL,
  event_type TEXT NOT NULL CHECK (event_type IN ('monitor.down', 'monitor.up')),
  payload_json TEXT NOT NULL,
  insert_token TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  UNIQUE (group_id, event_key)
);
CREATE INDEX idx_notification_group_pending_group ON notification_group_pending_events(group_id, id);

CREATE TABLE notification_group_batches (
  id TEXT PRIMARY KEY,
  group_id INTEGER NOT NULL,
  event_type TEXT NOT NULL CHECK (event_type IN ('group.batch', 'group.digest')),
  payload_json TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX idx_notification_group_batches_created ON notification_group_batches(created_at, id);