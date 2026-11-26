-- Additive migration: preserve existing accounts, schedules and legacy replies.
ALTER TABLE app_members ADD COLUMN available_until INTEGER;
ALTER TABLE app_members ADD COLUMN availability_revision INTEGER NOT NULL DEFAULT 0;
ALTER TABLE app_members ADD COLUMN availability_mutation TEXT;
ALTER TABLE app_invites ADD COLUMN r1_eta INTEGER;
ALTER TABLE app_invites ADD COLUMN r2_eta INTEGER;
ALTER TABLE app_invites ADD COLUMN r3_eta INTEGER;
CREATE TRIGGER app_arrival_m1 AFTER UPDATE OF m1_mut ON app_invites
WHEN NEW.m1_mut IS NOT OLD.m1_mut BEGIN
 UPDATE app_push_jobs SET status='expired' WHERE kind='arrival' AND invite_id=NEW.id AND member_id='m1' AND status='queued';
 INSERT OR IGNORE INTO app_push_jobs(id,member_id,invite_id,kind,content,created_at,due_at,expires_at)
 SELECT 'eta:'||NEW.id||':m1:'||NEW.m1_mut,'m1',NEW.id,'arrival','预计到场时间到了：'||NEW.title||'，请确认是否已到。',
 NEW.r1_eta-CAST(NEW.r1 AS INTEGER)*60000,NEW.r1_eta,min(NEW.expires_at,NEW.r1_eta+300000)
 WHERE NEW.r1 IN ('5','10','30') AND NEW.r1_eta IS NOT NULL AND NEW.r1_eta<NEW.expires_at;
END;

CREATE TRIGGER app_arrival_m2 AFTER UPDATE OF m2_mut ON app_invites
WHEN NEW.m2_mut IS NOT OLD.m2_mut BEGIN
 UPDATE app_push_jobs SET status='expired' WHERE kind='arrival' AND invite_id=NEW.id AND member_id='m2' AND status='queued';
 INSERT OR IGNORE INTO app_push_jobs(id,member_id,invite_id,kind,content,created_at,due_at,expires_at)
 SELECT 'eta:'||NEW.id||':m2:'||NEW.m2_mut,'m2',NEW.id,'arrival','预计到场时间到了：'||NEW.title||'，请确认是否已到。',
 NEW.r2_eta-CAST(NEW.r2 AS INTEGER)*60000,NEW.r2_eta,min(NEW.expires_at,NEW.r2_eta+300000)
 WHERE NEW.r2 IN ('5','10','30') AND NEW.r2_eta IS NOT NULL AND NEW.r2_eta<NEW.expires_at;
END;

CREATE TRIGGER app_arrival_m3 AFTER UPDATE OF m3_mut ON app_invites
WHEN NEW.m3_mut IS NOT OLD.m3_mut BEGIN
 UPDATE app_push_jobs SET status='expired' WHERE kind='arrival' AND invite_id=NEW.id AND member_id='m3' AND status='queued';
 INSERT OR IGNORE INTO app_push_jobs(id,member_id,invite_id,kind,content,created_at,due_at,expires_at)
 SELECT 'eta:'||NEW.id||':m3:'||NEW.m3_mut,'m3',NEW.id,'arrival','预计到场时间到了：'||NEW.title||'，请确认是否已到。',
 NEW.r3_eta-CAST(NEW.r3 AS INTEGER)*60000,NEW.r3_eta,min(NEW.expires_at,NEW.r3_eta+300000)
 WHERE NEW.r3 IN ('5','10','30') AND NEW.r3_eta IS NOT NULL AND NEW.r3_eta<NEW.expires_at;
END;
