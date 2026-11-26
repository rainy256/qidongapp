import {test} from 'node:test';import assert from 'node:assert/strict';import {dayStart} from '../worker/logic.mjs';import {weekday,normalizeTemplate,effectiveSchedule,scheduleStatus,updateOverrides} from '../worker/weekly.mjs';
const now=Date.parse('2026-11-26T15:00:00+08:00'),day=dayStart(now),t=normalizeTemplate([{day:weekday(day),from:28,to:38}]);
const row={schedule_json:'[]',template_json:JSON.stringify(t),override_days_json:'[]'};
test('template resolves to absolute slots and supports midnight',()=>assert.deepEqual(effectiveSchedule(row,now),[{from:day+28,to:day+38}]));
test('empty explicit override suppresses template',()=>{const n=updateOverrides(row,[],now);assert.deepEqual(n.days,[day]);assert.deepEqual(effectiveSchedule({...row,schedule_json:JSON.stringify(n.picks),override_days_json:JSON.stringify(n.days)},now),[]);});
test('adjacent template spans merged',()=>assert.deepEqual(normalizeTemplate([{day:1,from:1,to:2},{day:1,from:2,to:3}]),[{day:1,from:1,to:3}]));

test('unanswered differs from an explicitly empty seven-day schedule',()=>{
 const blank={schedule_json:'[]',template_json:'[]',override_days_json:'[]'};
 assert.equal(scheduleStatus(blank,now),'unanswered');
 const n=updateOverrides(blank,[],now,true);
 assert.equal(n.days.length,7);
 const saved={...blank,override_days_json:JSON.stringify(n.days)};
 assert.equal(scheduleStatus(saved,now),'unavailable');
 assert.equal(scheduleStatus(saved,now+86400000),'unanswered');
});
test('explicit no availability preserves elapsed slots and suppresses weekly template',()=>{
 const before={...row,schedule_json:JSON.stringify([{from:day+2,to:day+4}]),override_days_json:JSON.stringify([day])};
 const n=updateOverrides(before,[{from:day+2,to:day+4}],now,true);
 const saved={...before,schedule_json:JSON.stringify(n.picks),override_days_json:JSON.stringify(n.days)};
 assert.deepEqual(effectiveSchedule(saved,now),[{from:day+2,to:day+4}]);
 assert.equal(scheduleStatus(saved,now),'unavailable');
});
