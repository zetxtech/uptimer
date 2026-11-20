CREATE TRIGGER IF NOT EXISTS trg_outage_remove_incident
AFTER DELETE ON outages
BEGIN
  DELETE FROM incident_updates
  WHERE incident_id IN (SELECT id FROM incidents WHERE outage_id = OLD.id);

  DELETE FROM incident_monitors
  WHERE incident_id IN (SELECT id FROM incidents WHERE outage_id = OLD.id);

  DELETE FROM incidents WHERE outage_id = OLD.id;
END;

CREATE TRIGGER IF NOT EXISTS trg_outage_rename_incident
AFTER UPDATE OF title ON outages
BEGIN
  UPDATE incidents
  SET title = COALESCE(NULLIF(NEW.title, ''), (
    SELECT name FROM monitors WHERE id = NEW.monitor_id
  ), title)
  WHERE outage_id = NEW.id;
END;
