ALTER TABLE monitors ADD COLUMN confirmation_period_sec INTEGER;
ALTER TABLE monitors ADD COLUMN recovery_period_sec INTEGER;

ALTER TABLE monitor_state ADD COLUMN failure_started_at INTEGER;
ALTER TABLE monitor_state ADD COLUMN recovery_started_at INTEGER;

ALTER TABLE monitor_probe_state ADD COLUMN failure_started_at INTEGER;
ALTER TABLE monitor_probe_state ADD COLUMN recovery_started_at INTEGER;
