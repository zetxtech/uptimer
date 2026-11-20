-- Heartbeat monitors (cron / worker check-ins).
--
-- SQLite cannot drop a CHECK constraint in place, so the monitors table is rebuilt with the type
-- constraint relaxed to include 'heartbeat', keeping every column added by earlier migrations.
-- NOTE: Keep this file append-only.

CREATE TABLE monitors_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('http', 'tcp', 'heartbeat')),
  target TEXT NOT NULL,

  interval_sec INTEGER NOT NULL DEFAULT 60 CHECK (interval_sec >= 60),
  timeout_ms   INTEGER NOT NULL DEFAULT 10000 CHECK (timeout_ms >= 1000),

  http_method TEXT,
  http_headers_json TEXT,
  http_body TEXT,
  expected_status_json TEXT,
  response_keyword TEXT,
  response_forbidden_keyword TEXT,

  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  created_at INTEGER NOT NULL DEFAULT (CAST(strftime('%s','now') AS INTEGER)),
  updated_at INTEGER NOT NULL DEFAULT (CAST(strftime('%s','now') AS INTEGER)),
  group_name TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  group_sort_order INTEGER NOT NULL DEFAULT 0,
  show_on_status_page INTEGER NOT NULL DEFAULT 1 CHECK (show_on_status_page IN (0, 1)),
  response_keyword_mode TEXT CHECK (response_keyword_mode IN ('contains', 'regex')),
  response_forbidden_keyword_mode TEXT CHECK (response_forbidden_keyword_mode IN ('contains', 'regex')),
  follow_redirects INTEGER NOT NULL DEFAULT 1 CHECK (follow_redirects IN (0, 1)),
  display_url TEXT,
  forbidden_status_json TEXT,
  probe_mode TEXT NOT NULL DEFAULT 'worker' CHECK (probe_mode IN ('worker', 'multi_region')),
  failures_to_down_from_up INTEGER,
  successes_to_up_from_down INTEGER,
  -- Ping token for heartbeat monitors; NULL for probed monitors.
  heartbeat_token TEXT
);

INSERT INTO monitors_new (
  id, name, type, target, interval_sec, timeout_ms, http_method, http_headers_json, http_body,
  expected_status_json, response_keyword, response_forbidden_keyword, is_active, created_at,
  updated_at, group_name, sort_order, group_sort_order, show_on_status_page,
  response_keyword_mode, response_forbidden_keyword_mode, follow_redirects, display_url,
  forbidden_status_json, probe_mode, failures_to_down_from_up, successes_to_up_from_down
)
SELECT
  id, name, type, target, interval_sec, timeout_ms, http_method, http_headers_json, http_body,
  expected_status_json, response_keyword, response_forbidden_keyword, is_active, created_at,
  updated_at, group_name, sort_order, group_sort_order, show_on_status_page,
  response_keyword_mode, response_forbidden_keyword_mode, follow_redirects, display_url,
  forbidden_status_json, probe_mode, failures_to_down_from_up, successes_to_up_from_down
FROM monitors;

DROP TABLE monitors;

ALTER TABLE monitors_new RENAME TO monitors;

CREATE INDEX IF NOT EXISTS idx_monitors_group_sort
  ON monitors(group_name, group_sort_order, sort_order, id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_monitors_heartbeat_token
  ON monitors(heartbeat_token);
