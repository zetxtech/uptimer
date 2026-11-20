ALTER TABLE incidents ADD COLUMN outage_id INTEGER;

CREATE UNIQUE INDEX IF NOT EXISTS uq_incidents_outage_id
  ON incidents (outage_id) WHERE outage_id IS NOT NULL;

INSERT INTO incidents (title, status, impact, message, started_at, resolved_at, outage_id)
SELECT COALESCE(NULLIF(o.title, ''), m.name),
       CASE WHEN o.ended_at IS NULL THEN 'investigating' ELSE 'resolved' END,
       'major', COALESCE(o.initial_error, 'Monitor is unavailable'),
       o.started_at, o.ended_at, o.id
FROM outages o
JOIN monitors m ON m.id = o.monitor_id
WHERE NOT EXISTS (SELECT 1 FROM incidents i WHERE i.outage_id = o.id);

INSERT OR IGNORE INTO incident_monitors (incident_id, monitor_id, created_at)
SELECT i.id, o.monitor_id, o.started_at
FROM outages o
JOIN incidents i ON i.outage_id = o.id;

CREATE TRIGGER IF NOT EXISTS trg_outage_create_incident
AFTER INSERT ON outages
BEGIN
  INSERT INTO incidents (title, status, impact, message, started_at, resolved_at, outage_id)
  SELECT COALESCE(NULLIF(NEW.title, ''), m.name),
         CASE WHEN NEW.ended_at IS NULL THEN 'investigating' ELSE 'resolved' END,
         'major', COALESCE(NEW.initial_error, 'Monitor is unavailable'),
         NEW.started_at, NEW.ended_at, NEW.id
  FROM monitors m WHERE m.id = NEW.monitor_id;

  INSERT OR IGNORE INTO incident_monitors (incident_id, monitor_id, created_at)
  SELECT i.id, NEW.monitor_id, NEW.started_at
  FROM incidents i WHERE i.outage_id = NEW.id;
END;

CREATE TRIGGER IF NOT EXISTS trg_outage_resolve_incident
AFTER UPDATE OF ended_at ON outages
WHEN OLD.ended_at IS NOT NEW.ended_at
BEGIN
  UPDATE incidents
  SET status = CASE WHEN NEW.ended_at IS NULL THEN 'investigating' ELSE 'resolved' END,
      resolved_at = NEW.ended_at
  WHERE outage_id = NEW.id;
END;
