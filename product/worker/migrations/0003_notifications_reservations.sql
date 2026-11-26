CREATE TABLE IF NOT EXISTS app_push_preferences (
 member_id TEXT PRIMARY KEY REFERENCES app_members(id),
 quiet_start INTEGER, quiet_end INTEGER,
 CHECK((quiet_start IS NULL AND quiet_end IS NULL) OR (quiet_start BETWEEN 0 AND 1439 AND quiet_end BETWEEN 0 AND 1439 AND quiet_start<>quiet_end))
);
CREATE TABLE IF NOT EXISTS app_push_jobs (
 id TEXT PRIMARY KEY, member_id TEXT NOT NULL REFERENCES app_members(id),
 invite_id TEXT REFERENCES app_invites(id), kind TEXT NOT NULL, content TEXT NOT NULL,
 created_at INTEGER NOT NULL, due_at INTEGER NOT NULL, expires_at INTEGER NOT NULL,
 status TEXT NOT NULL DEFAULT 'queued' CHECK(status IN ('queued','sending','accepted','rejected','unknown','expired','muted','unbound','confirmed')),
 attempts INTEGER NOT NULL DEFAULT 0, claimed_at INTEGER, finished_at INTEGER,
 provider_http INTEGER, provider_code INTEGER
);
CREATE INDEX IF NOT EXISTS app_push_due ON app_push_jobs(status,due_at);
CREATE INDEX IF NOT EXISTS app_push_member ON app_push_jobs(member_id,created_at DESC);
CREATE TRIGGER IF NOT EXISTS app_message_outbox AFTER INSERT ON app_messages BEGIN
 INSERT OR IGNORE INTO app_push_jobs(id,member_id,invite_id,kind,content,created_at,due_at,expires_at)
 SELECT NEW.id,NEW.member_id,NEW.invite_id,NEW.kind,
 CASE NEW.kind WHEN 'invite' THEN '队友邀请你玩：'||NEW.detail WHEN 'assembled' THEN '三人集结成功：'||NEW.detail ELSE '队友已回复约局，请打开 App 查看。' END,
 NEW.created_at,NEW.created_at,expires_at FROM app_invites WHERE id=NEW.invite_id;
END;
CREATE TABLE IF NOT EXISTS app_nudges (
 id TEXT PRIMARY KEY, invite_id TEXT NOT NULL REFERENCES app_invites(id), actor TEXT NOT NULL REFERENCES app_members(id),
 recipient TEXT NOT NULL REFERENCES app_members(id), created_at INTEGER NOT NULL,
 CHECK(actor<>recipient)
);
CREATE INDEX IF NOT EXISTS app_nudge_rate ON app_nudges(actor,recipient,created_at);
CREATE TRIGGER IF NOT EXISTS app_nudge_outbox AFTER INSERT ON app_nudges BEGIN
 INSERT INTO app_push_jobs(id,member_id,invite_id,kind,content,created_at,due_at,expires_at)
 SELECT NEW.id,NEW.recipient,NEW.invite_id,'nudge','队友催你来开黑：'||title,NEW.created_at,NEW.created_at,expires_at FROM app_invites WHERE id=NEW.invite_id;
END;
CREATE TABLE IF NOT EXISTS app_reservations (
 id TEXT PRIMARY KEY,creator TEXT NOT NULL REFERENCES app_members(id),mutation TEXT NOT NULL,
 game TEXT NOT NULL CHECK(game IN ('apex','gta','tarkov','custom')),title TEXT NOT NULL,
 from_slot INTEGER NOT NULL,to_slot INTEGER NOT NULL CHECK(to_slot>from_slot),
 state TEXT NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','confirmed','cancelled')),
 r1 INTEGER NOT NULL DEFAULT 0 CHECK(r1 IN (0,1)),r2 INTEGER NOT NULL DEFAULT 0 CHECK(r2 IN (0,1)),r3 INTEGER NOT NULL DEFAULT 0 CHECK(r3 IN (0,1)),
 revision INTEGER NOT NULL DEFAULT 1,created_at INTEGER NOT NULL,updated_at INTEGER NOT NULL,
 UNIQUE(creator,mutation)
);
CREATE INDEX IF NOT EXISTS app_reservation_window ON app_reservations(state,from_slot,to_slot);
CREATE TABLE IF NOT EXISTS app_reservation_events (
 id TEXT PRIMARY KEY,reservation_id TEXT NOT NULL REFERENCES app_reservations(id),member_id TEXT NOT NULL REFERENCES app_members(id),
 kind TEXT NOT NULL,detail TEXT NOT NULL,created_at INTEGER NOT NULL,read_at INTEGER
);
CREATE TRIGGER IF NOT EXISTS app_reservation_created AFTER INSERT ON app_reservations BEGIN
 INSERT INTO app_reservation_events SELECT NEW.id||':1:'||id,NEW.id,id,'reservation','新预约：'||NEW.title,NEW.created_at,NULL FROM app_members WHERE id<>NEW.creator;
END;
CREATE TRIGGER IF NOT EXISTS app_reservation_changed AFTER UPDATE ON app_reservations WHEN NEW.revision<>OLD.revision BEGIN
 INSERT INTO app_reservation_events SELECT NEW.id||':'||NEW.revision||':'||id,NEW.id,id,'reservation',CASE NEW.state WHEN 'confirmed' THEN '三人确认预约：'||NEW.title WHEN 'cancelled' THEN '预约已取消：'||NEW.title ELSE '预约已更新：'||NEW.title END,NEW.updated_at,NULL FROM app_members;
 UPDATE app_push_jobs SET status='expired' WHERE id LIKE 'reservation:'||NEW.id||':%' AND status='queued';
 INSERT INTO app_push_jobs(id,member_id,kind,content,created_at,due_at,expires_at)
 SELECT 'reservation:'||NEW.id||':'||NEW.revision||':'||id,id,'reminder','预约即将开始：'||NEW.title,NEW.updated_at,max(NEW.updated_at,NEW.from_slot*1800000-600000),NEW.from_slot*1800000+300000 FROM app_members WHERE NEW.state='confirmed';
END;
CREATE TRIGGER IF NOT EXISTS app_reservation_event_outbox AFTER INSERT ON app_reservation_events BEGIN
 INSERT INTO app_push_jobs(id,member_id,kind,content,created_at,due_at,expires_at)
 VALUES(NEW.id,NEW.member_id,NEW.kind,NEW.detail,NEW.created_at,NEW.created_at,NEW.created_at+1800000);
END;
