-- Attachments on manual incident updates, mirroring outage_updates.attachments.
ALTER TABLE incident_updates ADD COLUMN attachments TEXT NOT NULL DEFAULT '[]';
