CREATE TABLE outage_updates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  outage_id INTEGER NOT NULL,
  body TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX idx_outage_updates_outage_time ON outage_updates (outage_id, created_at);
