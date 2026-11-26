CREATE TABLE IF NOT EXISTS probe_rate (
 member_id TEXT PRIMARY KEY CHECK(member_id IN ('m1','m2','m3')),
 last_at INTEGER NOT NULL
);
