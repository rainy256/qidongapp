import {test} from 'node:test';
import assert from 'node:assert/strict';
import {availabilityDeadline} from '../worker/availability.mjs';
import {rebookOptions} from '../rebook.mjs';
const now=Date.parse('2026-11-26T21:05:00+08:00');
test('availability starts on the server clock, extends and ends',()=>{
 assert.equal(availabilityDeadline('1h',null,now),now+3600000);
 assert.equal(availabilityDeadline('2h',now+3600000,now),now+10800000);
 assert.equal(availabilityDeadline('1h',now-1,now),now+3600000);
 assert.equal(availabilityDeadline('end',now+3600000,now),null);
 assert.equal(availabilityDeadline('tonight',null,now),Date.parse('2026-11-26T23:00:00+08:00'));
 assert.throws(()=>availabilityDeadline('tonight',null,Date.parse('2026-11-26T23:00:00+08:00')));
 assert.throws(()=>availabilityDeadline('invalid',null,now));
});
const c=(from,to,missingPlayers=0)=>({firstStart:from,availableUntil:to,memberIds:missingPlayers?['m1','m2']:['m1','m2','m3'],missingPlayers});
const r=(from,to,state='pending')=>({from_slot:from,to_slot:to,state});
test('rebook returns earliest one hour per distinct continuous run, skips reservations',()=>{
 const start=Math.floor(now/1800000)+1;
 assert.deepEqual(rebookOptions([c(start+20,start+24),c(start,start+10),c(start+10,start+14),c(start+30,start+36,1)],[r(start,start+2),r(start+5,start+7),r(start+20,start+24,'cancelled')],now),[{from:start+2,to:start+4},{from:start+7,to:start+9},{from:start+20,to:start+22}]);
});
test('rebook excludes elapsed slots and short gaps and limits to three',()=>{
 const start=Math.floor(now/1800000)+1;
 assert.deepEqual(rebookOptions([c(start-3,start+1),c(start+2,start+8),c(start+10,start+12),c(start+14,start+18),c(start+20,start+24)],[r(start+2,start+7)],now),[{from:start+10,to:start+12},{from:start+14,to:start+16},{from:start+20,to:start+22}]);
});
