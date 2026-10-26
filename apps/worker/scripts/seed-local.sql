-- Local demo data seed for Uptimer.
-- Reserved id range:
--   monitors / monitor_state: 900001-900099
--   incidents / maintenance windows: 900001-900099
--   notification channels: 900001-900099

-- 1) Clean previously seeded data (id-range scoped, avoids touching user-created rows).
DELETE FROM check_results WHERE monitor_id BETWEEN 900001 AND 900099;
DELETE FROM monitor_daily_rollups WHERE monitor_id BETWEEN 900001 AND 900099;
DELETE FROM outages WHERE monitor_id BETWEEN 900001 AND 900099;
DELETE FROM monitor_state WHERE monitor_id BETWEEN 900001 AND 900099;
DELETE FROM monitors WHERE id BETWEEN 900001 AND 900099;

DELETE FROM incident_updates WHERE incident_id BETWEEN 900001 AND 900099;
DELETE FROM incident_monitors WHERE incident_id BETWEEN 900001 AND 900099;
DELETE FROM incident_monitors WHERE monitor_id BETWEEN 900001 AND 900099;
DELETE FROM incidents WHERE id BETWEEN 900001 AND 900099;

DELETE FROM maintenance_window_monitors WHERE maintenance_window_id BETWEEN 900001 AND 900099;
DELETE FROM maintenance_window_monitors WHERE monitor_id BETWEEN 900001 AND 900099;
DELETE FROM maintenance_windows WHERE id BETWEEN 900001 AND 900099;

DELETE FROM notification_deliveries WHERE channel_id BETWEEN 900001 AND 900099;
DELETE FROM notification_channels WHERE id BETWEEN 900001 AND 900099;

-- 2) Core monitor configs.
INSERT INTO monitors (
  id,
  name,
  type,
  target,
  interval_sec,
  timeout_ms,
  http_method,
  expected_status_json,
  is_active,
  created_at,
  updated_at
)
VALUES
  (
    900001,
    'Homepage',
    'http',
    'https://example.com/healthz',
    60,
    5000,
    'GET',
    '[200]',
    1,
    CAST(strftime('%s','now') AS INTEGER) - 86400,
    CAST(strftime('%s','now') AS INTEGER)
  ),
  (
    900002,
    'Public API',
    'http',
    'https://api.example.com/healthz',
    60,
    5000,
    'GET',
    '[200,204]',
    1,
    CAST(strftime('%s','now') AS INTEGER) - 86400,
    CAST(strftime('%s','now') AS INTEGER)
  ),
  (
    900003,
    'Billing Service',
    'http',
    'https://billing.example.com/status',
    60,
    8000,
    'GET',
    '[200]',
    1,
    CAST(strftime('%s','now') AS INTEGER) - 86400,
    CAST(strftime('%s','now') AS INTEGER)
  ),
  (
    900004,
    'Database TCP',
    'tcp',
    'db.example.com:5432',
    60,
    5000,
    NULL,
    NULL,
    1,
    CAST(strftime('%s','now') AS INTEGER) - 86400,
    CAST(strftime('%s','now') AS INTEGER)
  ),
  (
    900005,
    'Legacy API',
    'http',
    'https://legacy.example.com/healthz',
    120,
    10000,
    'GET',
    '[200]',
    1,
    CAST(strftime('%s','now') AS INTEGER) - 86400,
    CAST(strftime('%s','now') AS INTEGER)
  ),
  (
    900006,
    'Worker TCP',
    'tcp',
    'edge.example.com:443',
    60,
    4000,
    NULL,
    NULL,
    1,
    CAST(strftime('%s','now') AS INTEGER) - 86400,
    CAST(strftime('%s','now') AS INTEGER)
  );

-- 3) Current state snapshot (covers up/down/maintenance/paused/unknown).
INSERT INTO monitor_state (
  monitor_id,
  status,
  last_checked_at,
  last_changed_at,
  last_latency_ms,
  last_error,
  consecutive_failures,
  consecutive_successes
)
VALUES
  (
    900001,
    'up',
    CAST(strftime('%s','now') AS INTEGER) - 30,
    CAST(strftime('%s','now') AS INTEGER) - 7200,
    93,
    NULL,
    0,
    35
  ),
  (
    900002,
    'down',
    CAST(strftime('%s','now') AS INTEGER) - 20,
    CAST(strftime('%s','now') AS INTEGER) - 2700,
    NULL,
    'HTTP 503',
    46,
    0
  ),
  (
    900003,
    'maintenance',
    CAST(strftime('%s','now') AS INTEGER) - 40,
    CAST(strftime('%s','now') AS INTEGER) - 900,
    NULL,
    NULL,
    0,
    0
  ),
  (
    900004,
    'paused',
    CAST(strftime('%s','now') AS INTEGER) - 3600,
    CAST(strftime('%s','now') AS INTEGER) - 3600,
    NULL,
    'Paused by admin',
    0,
    0
  ),
  (
    900005,
    'unknown',
    CAST(strftime('%s','now') AS INTEGER) - 7200,
    CAST(strftime('%s','now') AS INTEGER) - 3600,
    NULL,
    'No recent checks',
    0,
    0
  ),
  (
    900006,
    'up',
    CAST(strftime('%s','now') AS INTEGER) - 25,
    CAST(strftime('%s','now') AS INTEGER) - 300,
    140,
    NULL,
    0,
    3
  );

-- 4) Heartbeat / latency history (last ~60 samples).
WITH RECURSIVE seq(i) AS (
  SELECT 0
  UNION ALL
  SELECT i + 1 FROM seq WHERE i < 59
)
INSERT INTO check_results (monitor_id, checked_at, status, latency_ms, http_status, error, location, attempt)
SELECT
  900001,
  CAST(strftime('%s','now') AS INTEGER) - i * 60,
  'up',
  80 + (i % 6) * 5,
  200,
  NULL,
  'LAX',
  1
FROM seq;

WITH RECURSIVE seq(i) AS (
  SELECT 0
  UNION ALL
  SELECT i + 1 FROM seq WHERE i < 59
)
INSERT INTO check_results (monitor_id, checked_at, status, latency_ms, http_status, error, location, attempt)
SELECT
  900002,
  CAST(strftime('%s','now') AS INTEGER) - i * 60,
  CASE WHEN i <= 45 THEN 'down' ELSE 'up' END,
  CASE WHEN i <= 45 THEN NULL ELSE 140 + (i % 4) * 10 END,
  CASE WHEN i <= 45 THEN 503 ELSE 200 END,
  CASE WHEN i <= 45 THEN 'HTTP 503' ELSE NULL END,
  'LAX',
  1
FROM seq;

WITH RECURSIVE seq(i) AS (
  SELECT 0
  UNION ALL
  SELECT i + 1 FROM seq WHERE i < 59
)
INSERT INTO check_results (monitor_id, checked_at, status, latency_ms, http_status, error, location, attempt)
SELECT
  900003,
  CAST(strftime('%s','now') AS INTEGER) - i * 60,
  'maintenance',
  NULL,
  NULL,
  NULL,
  'LAX',
  1
FROM seq;

WITH RECURSIVE seq(i) AS (
  SELECT 0
  UNION ALL
  SELECT i + 1 FROM seq WHERE i < 11
)
INSERT INTO check_results (monitor_id, checked_at, status, latency_ms, http_status, error, location, attempt)
SELECT
  900005,
  CAST(strftime('%s','now') AS INTEGER) - (i + 2) * 600,
  CASE WHEN i < 6 THEN 'unknown' ELSE 'up' END,
  CASE WHEN i < 6 THEN NULL ELSE 600 + (i % 3) * 100 END,
  CASE WHEN i < 6 THEN NULL ELSE 200 END,
  CASE WHEN i < 6 THEN 'Upstream timeout' ELSE NULL END,
  'LAX',
  1
FROM seq;

WITH RECURSIVE seq(i) AS (
  SELECT 0
  UNION ALL
  SELECT i + 1 FROM seq WHERE i < 59
)
INSERT INTO check_results (monitor_id, checked_at, status, latency_ms, http_status, error, location, attempt)
SELECT
  900006,
  CAST(strftime('%s','now') AS INTEGER) - i * 60,
  CASE WHEN (i % 10) < 3 THEN 'down' ELSE 'up' END,
  CASE WHEN (i % 10) < 3 THEN NULL ELSE 110 + (i % 8) * 10 END,
  NULL,
  CASE WHEN (i % 10) < 3 THEN 'TCP connect timeout' ELSE NULL END,
  'LAX',
  1
FROM seq;

-- 5) Outages + incidents + maintenance windows.
INSERT INTO outages (monitor_id, started_at, ended_at, initial_error, last_error)
VALUES
  (
    900002,
    CAST(strftime('%s','now') AS INTEGER) - 2700,
    NULL,
    'HTTP 503',
    'HTTP 503'
  ),
  (
    900006,
    CAST(strftime('%s','now') AS INTEGER) - 10800,
    CAST(strftime('%s','now') AS INTEGER) - 10200,
    'TCP connect timeout',
    'TCP connect timeout'
  ),
  (
    900006,
    CAST(strftime('%s','now') AS INTEGER) - 7200,
    CAST(strftime('%s','now') AS INTEGER) - 6840,
    'TCP connect timeout',
    'TCP connect timeout'
  );

INSERT INTO incidents (id, title, status, impact, message, started_at, resolved_at)
VALUES
  (
    900001,
    'Public API instability',
    'identified',
    'major',
    'Investigating elevated 5xx responses.',
    CAST(strftime('%s','now') AS INTEGER) - 2600,
    NULL
  ),
  (
    900002,
    'Worker TCP packet loss',
    'resolved',
    'minor',
    'Intermittent TCP failures observed and resolved.',
    CAST(strftime('%s','now') AS INTEGER) - 93600,
    CAST(strftime('%s','now') AS INTEGER) - 90000
  );

INSERT INTO incident_updates (incident_id, status, message, created_at)
VALUES
  (
    900001,
    'investigating',
    'Initial triage started.',
    CAST(strftime('%s','now') AS INTEGER) - 2500
  ),
  (
    900001,
    'identified',
    'Root cause isolated to upstream dependency.',
    CAST(strftime('%s','now') AS INTEGER) - 1400
  ),
  (
    900002,
    'monitoring',
    'Mitigation deployed, watching error rate.',
    CAST(strftime('%s','now') AS INTEGER) - 91200
  ),
  (
    900002,
    'resolved',
    'Recovered after network route update.',
    CAST(strftime('%s','now') AS INTEGER) - 90000
  );

INSERT INTO incident_monitors (incident_id, monitor_id, created_at)
VALUES
  (900001, 900002, CAST(strftime('%s','now') AS INTEGER) - 2500),
  (900002, 900006, CAST(strftime('%s','now') AS INTEGER) - 91200);

INSERT INTO maintenance_windows (id, title, message, starts_at, ends_at, created_at)
VALUES
  (
    900001,
    'Billing DB maintenance',
    'Scheduled failover in progress.',
    CAST(strftime('%s','now') AS INTEGER) - 900,
    CAST(strftime('%s','now') AS INTEGER) + 1800,
    CAST(strftime('%s','now') AS INTEGER) - 1000
  ),
  (
    900002,
    'Homepage deploy window',
    'Blue-green rollout planned.',
    CAST(strftime('%s','now') AS INTEGER) + 3600,
    CAST(strftime('%s','now') AS INTEGER) + 7200,
    CAST(strftime('%s','now') AS INTEGER) - 100
  );

INSERT INTO maintenance_window_monitors (maintenance_window_id, monitor_id, created_at)
VALUES
  (900001, 900003, CAST(strftime('%s','now') AS INTEGER) - 900),
  (900002, 900001, CAST(strftime('%s','now') AS INTEGER) - 100);

-- 6) Notification channels + delivery history.
INSERT INTO notification_channels (id, name, type, config_json, is_active, created_at)
VALUES
  (
    900001,
    'Local webhook (JSON)',
    'webhook',
    '{"url":"https://example.com/webhook","method":"POST","timeout_ms":5000,"payload_type":"json","enabled_events":["monitor.down","monitor.up","incident.created","incident.updated","incident.resolved"]}',
    1,
    CAST(strftime('%s','now') AS INTEGER) - 86400
  ),
  (
    900002,
    'Backup webhook (param)',
    'webhook',
    '{"url":"https://example.com/query","method":"GET","payload_type":"param","enabled_events":["monitor.down"]}',
    0,
    CAST(strftime('%s','now') AS INTEGER) - 86400
  );

INSERT INTO notification_deliveries (event_key, channel_id, status, http_status, error, created_at)
VALUES
  (
    'monitor:900002:down:' || (CAST(strftime('%s','now') AS INTEGER) - 2600),
    900001,
    'success',
    200,
    NULL,
    CAST(strftime('%s','now') AS INTEGER) - 2500
  ),
  (
    'incident:900001:created:' || (CAST(strftime('%s','now') AS INTEGER) - 2600),
    900001,
    'failed',
    500,
    'Upstream webhook timeout',
    CAST(strftime('%s','now') AS INTEGER) - 2400
  );

-- 7) Settings + 60-day rollup samples (status page/admin analytics warm start).
INSERT OR REPLACE INTO settings (key, value) VALUES ('site_title', 'Uptimer Local Demo');
INSERT OR REPLACE INTO settings (key, value) VALUES ('site_description', '');
INSERT OR REPLACE INTO settings (key, value) VALUES ('site_timezone', 'UTC');
INSERT OR REPLACE INTO settings (key, value) VALUES ('retention_check_results_days', '14');
INSERT OR REPLACE INTO settings (key, value) VALUES ('state_failures_to_down_from_up', '2');
INSERT OR REPLACE INTO settings (key, value) VALUES ('state_successes_to_up_from_down', '2');
INSERT OR REPLACE INTO settings (key, value) VALUES ('admin_default_overview_range', '7d');
INSERT OR REPLACE INTO settings (key, value) VALUES ('admin_default_monitor_range', '30d');
INSERT OR REPLACE INTO settings (key, value) VALUES ('uptime_rating_level', '4');

WITH RECURSIVE day_seq(i, day_start) AS (
  SELECT
    0,
    CAST(strftime('%s', date('now', 'start of day')) AS INTEGER)
  UNION ALL
  SELECT
    i + 1,
    day_start - 86400
  FROM day_seq
  WHERE i < 59
)
INSERT INTO monitor_daily_rollups (
  monitor_id,
  day_start_at,
  total_sec,
  downtime_sec,
  unknown_sec,
  uptime_sec,
  checks_total,
  checks_up,
  checks_down,
  checks_unknown,
  checks_maintenance,
  avg_latency_ms,
  p50_latency_ms,
  p95_latency_ms,
  latency_histogram_json,
  created_at,
  updated_at
)
SELECT
  900001,
  day_start,
  86400,
  CASE WHEN (i % 9) = 0 THEN 120 ELSE 0 END,
  0,
  86400 - CASE WHEN (i % 9) = 0 THEN 120 ELSE 0 END,
  1440,
  1438 - CASE WHEN (i % 9) = 0 THEN 2 ELSE 0 END,
  CASE WHEN (i % 9) = 0 THEN 2 ELSE 0 END,
  0,
  0,
  90 + (i % 6),
  88 + (i % 4),
  140 + (i % 10),
  '[0,0,20,80,160,320,480,240,120,20,0,0,0,0,0,0,0,0,0,0,0,0]',
  CAST(strftime('%s','now') AS INTEGER),
  CAST(strftime('%s','now') AS INTEGER)
FROM day_seq;

WITH RECURSIVE day_seq(i, day_start) AS (
  SELECT
    0,
    CAST(strftime('%s', date('now', 'start of day')) AS INTEGER)
  UNION ALL
  SELECT
    i + 1,
    day_start - 86400
  FROM day_seq
  WHERE i < 59
)
INSERT INTO monitor_daily_rollups (
  monitor_id,
  day_start_at,
  total_sec,
  downtime_sec,
  unknown_sec,
  uptime_sec,
  checks_total,
  checks_up,
  checks_down,
  checks_unknown,
  checks_maintenance,
  avg_latency_ms,
  p50_latency_ms,
  p95_latency_ms,
  latency_histogram_json,
  created_at,
  updated_at
)
SELECT
  900002,
  day_start,
  86400,
  1200 + (i % 5) * 300,
  (i % 3) * 60,
  86400 - (1200 + (i % 5) * 300) - (i % 3) * 60,
  1440,
  1400 - (i % 5) * 4,
  40 + (i % 5) * 4,
  (i % 3),
  0,
  180 + (i % 8) * 8,
  170 + (i % 8) * 8,
  600 + (i % 10) * 20,
  '[0,0,0,10,30,80,120,180,240,220,180,120,70,40,25,15,5,3,1,1,0,0]',
  CAST(strftime('%s','now') AS INTEGER),
  CAST(strftime('%s','now') AS INTEGER)
FROM day_seq;
