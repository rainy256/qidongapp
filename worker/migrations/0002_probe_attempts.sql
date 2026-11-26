CREATE TABLE IF NOT EXISTS probe_attempts (id TEXT PRIMARY KEY, member_id TEXT NOT NULL, created_at INTEGER NOT NULL, mode TEXT NOT NULL, status TEXT NOT NULL, provider_http INTEGER, provider_code INTEGER, reason TEXT NOT NULL, recipient_code INTEGER);
CREATE INDEX IF NOT EXISTS probe_attempts_member_time ON probe_attempts(member_id,created_at DESC);
