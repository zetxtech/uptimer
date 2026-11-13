-- Certificate / domain expiry checks and cookie handling for HTTP monitors.
--
-- ssl_expiry_enabled / domain_expiry_enabled opt into the daily expiry job; the result columns
-- are written by that job and only read by the admin API.
ALTER TABLE monitors ADD COLUMN ssl_expiry_enabled INTEGER NOT NULL DEFAULT 0;
ALTER TABLE monitors ADD COLUMN domain_expiry_enabled INTEGER NOT NULL DEFAULT 0;
ALTER TABLE monitors ADD COLUMN ssl_expires_at INTEGER;
ALTER TABLE monitors ADD COLUMN ssl_issuer TEXT;
ALTER TABLE monitors ADD COLUMN domain_expires_at INTEGER;
ALTER TABLE monitors ADD COLUMN expiry_checked_at INTEGER;

-- Keep cookies received on one redirect hop for the next one (manual redirect loop).
ALTER TABLE monitors ADD COLUMN keep_cookies INTEGER NOT NULL DEFAULT 0;
