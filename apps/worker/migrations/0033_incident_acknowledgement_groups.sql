ALTER TABLE incidents ADD COLUMN acknowledged_at INTEGER;
ALTER TABLE incidents ADD COLUMN similar_group_id INTEGER;

CREATE INDEX IF NOT EXISTS idx_incidents_similar_group_id
  ON incidents (similar_group_id);
