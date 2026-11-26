import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {dayStart} from '../worker/logic.mjs';
import {effectiveSchedule} from '../worker/weekly.mjs';
const migration=name=>readFileSync(new URL('../worker/migrations/'+name,import.meta.url),'utf8');
test('weekly upgrade restores old absolute slots across a logical day boundary',()=>{
 const db=new DatabaseSync(':memory:');
 try{
  db.exec(migration('0001_app.sql'));
  const now=Date.parse('2026-11-26T15:00:00+08:00'),day=dayStart(now);
  const picks=[{from:day+46,to:day+51},{from:day+100,to:day+105}];
  db.prepare('UPDATE app_members SET schedule_json=?,schedule_revision=3 WHERE id=?').run(JSON.stringify(picks),'m1');
  const read=()=>db.prepare('SELECT m.schedule_json,w.template_json,w.override_days_json FROM app_members m LEFT JOIN app_weekly w ON m.id=w.member_id WHERE m.id=?').get('m1');
  db.exec(migration('0004_weekly.sql'));
  db.prepare('UPDATE app_weekly SET override_days_json=? WHERE member_id=?').run(JSON.stringify([day+192]),'m1');
  assert.deepEqual(effectiveSchedule(read(),now),[]);
  db.exec(migration('0006_preserve_legacy_schedule.sql'));
  assert.deepEqual(effectiveSchedule(read(),now),picks);
  assert.deepEqual(JSON.parse(read().override_days_json),[day,day+48,day+96,day+192]);
  assert.equal(db.prepare('SELECT schedule_revision FROM app_members WHERE id=?').get('m1').schedule_revision,3);
  db.exec(migration('0006_preserve_legacy_schedule.sql'));
  assert.deepEqual(effectiveSchedule(read(),now),picks);
  assert.equal(db.prepare('SELECT override_days_json FROM app_weekly WHERE member_id=?').get('m2').override_days_json,'[]');
 }finally{db.close();}
});
