-- 0004 created empty weekly rows, hiding old absolute schedules. A stored
-- absolute span is a one-day override for each Shanghai 06:00 logical day it
-- intersects. Keep existing overrides (including explicit empty overrides).
WITH RECURSIVE
 spans(member_id, start_slot, end_slot) AS (
   SELECT m.id, json_extract(j.value,'$.from'), json_extract(j.value,'$.to')
   FROM app_members m, json_each(m.schedule_json) j
   WHERE json_type(j.value,'$.from')='integer' AND json_type(j.value,'$.to')='integer'
     AND json_extract(j.value,'$.from')>=0
     AND json_extract(j.value,'$.to')>json_extract(j.value,'$.from')
     AND json_extract(j.value,'$.to')-json_extract(j.value,'$.from')<=336
 ),
 covered(member_id, day, end_slot) AS (
   SELECT member_id, ((start_slot+4)/48)*48-4, end_slot FROM spans
   UNION ALL
   SELECT member_id, day+48, end_slot FROM covered WHERE day+48<end_slot
 )
UPDATE app_weekly
SET override_days_json=(
 SELECT json_group_array(day) FROM (
   SELECT value AS day FROM json_each(app_weekly.override_days_json)
   UNION
   SELECT day FROM covered WHERE member_id=app_weekly.member_id
   ORDER BY day
 )
)
WHERE EXISTS(SELECT 1 FROM covered WHERE member_id=app_weekly.member_id);
