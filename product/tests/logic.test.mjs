import {test} from 'node:test';import assert from 'node:assert/strict';import {dayStart,normalizeSchedule,inviteView,replyColumn,mutationValid} from '../worker/logic.mjs';
const now=Date.parse('2026-11-26T15:00:00+08:00'),start=dayStart(now);
test('Shanghai logical day starts at 06:00 and crosses midnight',()=>assert.equal(new Date(start*1800000).toISOString(),'2026-11-25T22:00:00.000Z'));
test('merges adjacent intervals, preserves gaps',()=>assert.deepEqual(normalizeSchedule([{from:start+4,to:start+6},{from:start+1,to:start+4},{from:start+8,to:start+9}],now),[{from:start+1,to:start+6},{from:start+8,to:start+9}]));
test('rejects out-of-range and fractional slots',()=>{assert.throws(()=>normalizeSchedule([{from:start-1,to:start+2}],now));assert.throws(()=>normalizeSchedule([{from:start,to:start+1.5}],now));});
test('only three ready replies assemble; expiration takes precedence',()=>{assert.equal(inviteView({expires_at:now+1,r1:'ready',r2:'ready',r3:'pending'},now).status,'pending');assert.equal(inviteView({expires_at:now+1,r1:'ready',r2:'ready',r3:'ready'},now).status,'assembled');assert.equal(inviteView({expires_at:now,r1:'ready',r2:'ready',r3:'ready'},now).status,'expired');});
test('member-controlled SQL identifier is constrained',()=>{assert.equal(replyColumn('m2'),'r2');assert.throws(()=>replyColumn('m4'));assert.equal(mutationValid('x'),false);});
