ALTER TABLE probes ADD COLUMN offline_after_sec INTEGER NOT NULL DEFAULT 900
  CHECK (offline_after_sec BETWEEN 60 AND 86400);

ALTER TABLE probes ADD COLUMN health_started_at INTEGER;

CREATE TABLE probe_health_state (
  probe_id TEXT PRIMARY KEY,
  status TEXT NOT NULL CHECK (status IN ('online', 'offline')),
  version INTEGER NOT NULL DEFAULT 0,
  changed_at INTEGER NOT NULL
);

CREATE TABLE probe_health_events (
  event_key TEXT PRIMARY KEY,
  probe_id TEXT NOT NULL,
  event_type TEXT NOT NULL CHECK (event_type IN ('probe.offline', 'probe.online')),
  occurred_at INTEGER NOT NULL,
  last_seen_at INTEGER,
  probe_name TEXT NOT NULL,
  scope TEXT NOT NULL,
  region TEXT NOT NULL,
  last_attempt_at INTEGER,
  completed_at INTEGER
);

CREATE INDEX idx_probe_health_events_pending
  ON probe_health_events (completed_at, last_attempt_at, occurred_at);