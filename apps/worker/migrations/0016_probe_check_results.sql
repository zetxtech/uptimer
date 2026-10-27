-- Multi-region history split.
--
-- `check_results` keeps the aggregated timeline (one row per monitor per evaluation), so every
-- existing history query, rollup and chart stays a single series and needs no probe filter.
-- Raw per-region observations live here, keyed by probe, for regional detail views.
--
-- NOTE: Keep this file append-only.

CREATE TABLE IF NOT EXISTS probe_check_results (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  monitor_id INTEGER NOT NULL,
  probe_id TEXT NOT NULL,
  batch_id TEXT,

  checked_at INTEGER NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('up', 'down', 'maintenance', 'unknown')),
  latency_ms INTEGER,
  http_status INTEGER,
  error TEXT,
  attempt INTEGER NOT NULL DEFAULT 1
);

CREATE INDEX IF NOT EXISTS idx_probe_check_results_monitor_time
  ON probe_check_results (monitor_id, checked_at);

CREATE INDEX IF NOT EXISTS idx_probe_check_results_probe_time
  ON probe_check_results (probe_id, checked_at);
