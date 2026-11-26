CREATE TABLE IF NOT EXISTS app_weekly (
 member_id TEXT PRIMARY KEY REFERENCES app_members(id),
 template_json TEXT NOT NULL DEFAULT '[]' CHECK(json_valid(template_json)),
 override_days_json TEXT NOT NULL DEFAULT '[]' CHECK(json_valid(override_days_json))
);
INSERT OR IGNORE INTO app_weekly(member_id) SELECT id FROM app_members;
