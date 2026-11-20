-- Per-monitor overrides for the state machine thresholds.
-- NULL means "use the site-wide default from settings" (state_failures_to_down_from_up /
-- state_successes_to_up_from_down).
-- NOTE: Keep this file append-only.

ALTER TABLE monitors
  ADD COLUMN failures_to_down_from_up INTEGER;

ALTER TABLE monitors
  ADD COLUMN successes_to_up_from_down INTEGER;
