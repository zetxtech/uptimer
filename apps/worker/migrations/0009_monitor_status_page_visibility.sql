-- Phase 16: allow monitors to be hidden from the public status page
-- NOTE: Keep this file append-only.

ALTER TABLE monitors
  ADD COLUMN show_on_status_page INTEGER NOT NULL DEFAULT 1 CHECK (show_on_status_page IN (0, 1));
