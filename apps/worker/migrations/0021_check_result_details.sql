ALTER TABLE check_results ADD COLUMN effective_url TEXT;
ALTER TABLE check_results ADD COLUMN redirect_count INTEGER;
ALTER TABLE check_results ADD COLUMN response_headers TEXT;
ALTER TABLE check_results ADD COLUMN timings TEXT;
ALTER TABLE check_results ADD COLUMN resolved_ips TEXT;
