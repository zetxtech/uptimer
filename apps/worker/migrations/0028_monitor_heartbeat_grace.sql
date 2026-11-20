-- Per-monitor heartbeat grace period.
--
-- NULL keeps the historical policy (two missed intervals, at least five minutes). When set, the
-- monitor is allowed `interval_sec + heartbeat_grace_sec` of silence before it turns down.
ALTER TABLE monitors ADD COLUMN heartbeat_grace_sec INTEGER;
