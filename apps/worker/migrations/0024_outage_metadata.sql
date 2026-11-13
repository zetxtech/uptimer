ALTER TABLE outages ADD COLUMN title TEXT;

CREATE TABLE outage_metadata (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  outage_id INTEGER NOT NULL,
  key TEXT NOT NULL,
  value TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX idx_outage_metadata_outage ON outage_metadata (outage_id, id);
