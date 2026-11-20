ALTER TABLE monitors ADD COLUMN last_heartbeat_at INTEGER;

UPDATE monitors
SET last_heartbeat_at = (
  SELECT MAX(checked_at)
  FROM check_results
  WHERE monitor_id = monitors.id AND location = 'heartbeat'
)
WHERE type = 'heartbeat';

UPDATE monitor_state
SET status = 'unknown', last_error = NULL,
    consecutive_failures = 0, consecutive_successes = 0
WHERE monitor_id IN (
  SELECT id FROM monitors WHERE type = 'heartbeat' AND last_heartbeat_at IS NULL
) AND status != 'paused';

UPDATE outages
SET ended_at = CAST(strftime('%s','now') AS INTEGER)
WHERE ended_at IS NULL
  AND monitor_id IN (
    SELECT id FROM monitors WHERE type = 'heartbeat' AND last_heartbeat_at IS NULL
  );
