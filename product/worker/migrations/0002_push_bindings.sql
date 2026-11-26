CREATE TABLE IF NOT EXISTS app_push_bindings (
 member_id TEXT PRIMARY KEY REFERENCES app_members(id) ON DELETE CASCADE,
 spt_cipher TEXT NOT NULL,
 bound_at INTEGER NOT NULL
);
