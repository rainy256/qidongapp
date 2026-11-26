-- Product tables are isolated from the probe tables.
CREATE TABLE IF NOT EXISTS app_members (
 id TEXT PRIMARY KEY CHECK(id IN ('m1','m2','m3')),
 nickname TEXT NOT NULL CHECK(length(nickname) BETWEEN 1 AND 24),
 activation_hash TEXT UNIQUE,
 token_hash TEXT UNIQUE,
 activated_at INTEGER,
 schedule_json TEXT NOT NULL DEFAULT '[]' CHECK(json_valid(schedule_json)),
 schedule_revision INTEGER NOT NULL DEFAULT 0,
 schedule_mutation TEXT,
 last_seen INTEGER
);
INSERT OR IGNORE INTO app_members(id,nickname) VALUES ('m1','成员一'),('m2','成员二'),('m3','成员三');
CREATE TABLE IF NOT EXISTS app_invites (
 id TEXT PRIMARY KEY,
 creator TEXT NOT NULL REFERENCES app_members(id),
 mutation TEXT NOT NULL,
 game TEXT NOT NULL CHECK(game IN ('apex','gta','tarkov','custom')),
 title TEXT NOT NULL CHECK(length(title) BETWEEN 1 AND 32),
 created_at INTEGER NOT NULL,
 expires_at INTEGER NOT NULL CHECK(expires_at>created_at),
 revision INTEGER NOT NULL DEFAULT 1,
 r1 TEXT NOT NULL CHECK(r1 IN ('pending','ready','5','10','30','no')),
 r2 TEXT NOT NULL CHECK(r2 IN ('pending','ready','5','10','30','no')),
 r3 TEXT NOT NULL CHECK(r3 IN ('pending','ready','5','10','30','no')),
 m1_mut TEXT, m2_mut TEXT, m3_mut TEXT,
 UNIQUE(creator,mutation)
);
CREATE TABLE IF NOT EXISTS app_messages (
 id TEXT PRIMARY KEY,
 member_id TEXT NOT NULL REFERENCES app_members(id),
 invite_id TEXT NOT NULL REFERENCES app_invites(id),
 kind TEXT NOT NULL CHECK(kind IN ('invite','reply','assembled')),
 actor TEXT NOT NULL REFERENCES app_members(id),
 detail TEXT NOT NULL,
 created_at INTEGER NOT NULL,
 read_at INTEGER
);
CREATE INDEX IF NOT EXISTS app_messages_member ON app_messages(member_id,created_at DESC);
CREATE INDEX IF NOT EXISTS app_invites_expiry ON app_invites(expires_at DESC);
CREATE TRIGGER IF NOT EXISTS app_invite_message AFTER INSERT ON app_invites BEGIN
 INSERT INTO app_messages(id,member_id,invite_id,kind,actor,detail,created_at)
 SELECT NEW.id||':invite:'||id,id,NEW.id,'invite',NEW.creator,NEW.title,NEW.created_at FROM app_members WHERE id<>NEW.creator;
END;
CREATE TRIGGER IF NOT EXISTS app_invite_reply1 AFTER UPDATE OF r1 ON app_invites WHEN NEW.r1<>OLD.r1 BEGIN
 INSERT INTO app_messages SELECT NEW.id||':'||NEW.revision||':m1:'||id,id,NEW.id,'reply','m1',NEW.r1,unixepoch()*1000,NULL FROM app_members WHERE id<>'m1';
END;
CREATE TRIGGER IF NOT EXISTS app_invite_reply2 AFTER UPDATE OF r2 ON app_invites WHEN NEW.r2<>OLD.r2 BEGIN
 INSERT INTO app_messages SELECT NEW.id||':'||NEW.revision||':m2:'||id,id,NEW.id,'reply','m2',NEW.r2,unixepoch()*1000,NULL FROM app_members WHERE id<>'m2';
END;
CREATE TRIGGER IF NOT EXISTS app_invite_reply3 AFTER UPDATE OF r3 ON app_invites WHEN NEW.r3<>OLD.r3 BEGIN
 INSERT INTO app_messages SELECT NEW.id||':'||NEW.revision||':m3:'||id,id,NEW.id,'reply','m3',NEW.r3,unixepoch()*1000,NULL FROM app_members WHERE id<>'m3';
END;
CREATE TRIGGER IF NOT EXISTS app_invite_assembled AFTER UPDATE ON app_invites
WHEN NEW.r1='ready' AND NEW.r2='ready' AND NEW.r3='ready' AND (OLD.r1<>'ready' OR OLD.r2<>'ready' OR OLD.r3<>'ready') BEGIN
 INSERT INTO app_messages SELECT NEW.id||':assembled:'||NEW.revision||':'||id,id,NEW.id,'assembled',NEW.creator,NEW.title,unixepoch()*1000,NULL FROM app_members;
END;
