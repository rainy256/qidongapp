-- Keep all member, schedule, invitation and push records intact.
CREATE TABLE IF NOT EXISTS app_credentials (
 member_id TEXT PRIMARY KEY REFERENCES app_members(id),
 salt TEXT NOT NULL, password_hash TEXT NOT NULL,
 generation TEXT NOT NULL, updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS app_sessions (
 id TEXT PRIMARY KEY, member_id TEXT NOT NULL REFERENCES app_members(id),
 token_hash TEXT NOT NULL UNIQUE, generation TEXT NOT NULL,
 kind TEXT NOT NULL CHECK(kind IN ('android','web')),
 created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS app_sessions_member ON app_sessions(member_id, generation, expires_at);
CREATE TABLE IF NOT EXISTS app_login_limits (
 scope TEXT PRIMARY KEY, bucket INTEGER NOT NULL, attempts INTEGER NOT NULL
);
CREATE TRIGGER IF NOT EXISTS app_credential_initial AFTER INSERT ON app_credentials BEGIN
 UPDATE app_members SET activation_hash=NULL,token_hash=NULL,activated_at=COALESCE(activated_at,NEW.updated_at) WHERE id=NEW.member_id;
END;
CREATE TRIGGER IF NOT EXISTS app_credential_rotated AFTER UPDATE OF generation ON app_credentials WHEN NEW.generation<>OLD.generation BEGIN
 UPDATE app_members SET activation_hash=NULL,token_hash=NULL WHERE id=NEW.member_id;
 DELETE FROM app_sessions WHERE member_id=NEW.member_id AND generation<>NEW.generation;
END;
