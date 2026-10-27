-- Multi-region probes: independent monitoring viewpoints (for example an EdgeOne mainland
-- edge function or a Cloudflare Durable Object) that report into the same D1 authority.
-- NOTE: Keep this file append-only.

CREATE TABLE IF NOT EXISTS probes (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('edgeone', 'durable_object', 'worker', 'server')),
  scope TEXT NOT NULL CHECK (scope IN ('domestic', 'overseas')),
  region TEXT NOT NULL,

  -- Only the SHA-256 hash of the probe token is stored. The token itself is shown once
  -- when it is created and can never be read back from D1.
  token_sha256 TEXT NOT NULL,

  is_enabled INTEGER NOT NULL DEFAULT 1 CHECK (is_enabled IN (0, 1)),
  is_required INTEGER NOT NULL DEFAULT 1 CHECK (is_required IN (0, 1)),
  config_version INTEGER NOT NULL DEFAULT 1,

  last_seen_at INTEGER,
  last_result_at INTEGER,

  created_at INTEGER NOT NULL DEFAULT (CAST(strftime('%s','now') AS INTEGER)),
  updated_at INTEGER NOT NULL DEFAULT (CAST(strftime('%s','now') AS INTEGER))
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_probes_token_sha256 ON probes (token_sha256);

-- Idempotency ledger: a probe may retry the same batch after a timeout or a network failure.
-- The first insert wins; retries are acknowledged without being counted twice.
CREATE TABLE IF NOT EXISTS probe_batches (
  probe_id TEXT NOT NULL,
  batch_id TEXT NOT NULL,
  received_at INTEGER NOT NULL,
  result_count INTEGER NOT NULL,
  PRIMARY KEY (probe_id, batch_id)
);

CREATE INDEX IF NOT EXISTS idx_probe_batches_received ON probe_batches (received_at);

-- Per-probe state machine. Region-level streaks are kept separately from the aggregated
-- monitor_state so one failing region cannot overwrite another region's observations.
CREATE TABLE IF NOT EXISTS monitor_probe_state (
  monitor_id INTEGER NOT NULL,
  probe_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('up', 'down', 'maintenance', 'paused', 'unknown')),
  last_checked_at INTEGER,
  last_changed_at INTEGER,
  last_latency_ms INTEGER,
  last_error TEXT,
  consecutive_failures INTEGER NOT NULL DEFAULT 0,
  consecutive_successes INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (monitor_id, probe_id)
);

CREATE INDEX IF NOT EXISTS idx_monitor_probe_state_probe
  ON monitor_probe_state (probe_id, last_checked_at);

-- 'worker' keeps the existing in-Worker cron scheduler as the owner of monitor_state.
-- 'multi_region' hands ownership to the probe ingest + aggregation pipeline.
ALTER TABLE monitors ADD COLUMN probe_mode TEXT NOT NULL DEFAULT 'worker'
  CHECK (probe_mode IN ('worker', 'multi_region'));

ALTER TABLE check_results ADD COLUMN probe_id TEXT;
ALTER TABLE check_results ADD COLUMN batch_id TEXT;

CREATE INDEX IF NOT EXISTS idx_check_results_probe_time
  ON check_results (probe_id, checked_at);
