CREATE TABLE outage_screenshots (
  outage_id INTEGER PRIMARY KEY,
  content_type TEXT NOT NULL,
  width INTEGER,
  height INTEGER,
  bytes BLOB,
  captured_at INTEGER NOT NULL
);
