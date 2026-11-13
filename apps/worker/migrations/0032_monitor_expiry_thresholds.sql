-- Per-monitor expiry alert thresholds. NULL keeps the shared ladder (1/3/7/14/30 days).
ALTER TABLE monitors ADD COLUMN ssl_expiry_alert_days INTEGER;
ALTER TABLE monitors ADD COLUMN domain_expiry_alert_days INTEGER;
