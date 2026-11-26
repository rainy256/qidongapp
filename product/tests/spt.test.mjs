import {test} from 'node:test';import assert from 'node:assert/strict';import {encryptSpt,decryptSpt,validSpt} from '../worker/spt.mjs';
const env={SPT_ENCRYPTION_KEY:'ab'.repeat(32)},spt='SPT_example_for_test_only_123';
test('SPT encrypted, random IV, round-trip, member-bound AAD',async()=>{const a=await encryptSpt(env,'m1',spt),b=await encryptSpt(env,'m1',spt);assert.notEqual(a,b);assert.ok(!a.includes(spt));assert.equal(await decryptSpt(env,'m1',a),spt);await assert.rejects(decryptSpt(env,'m2',a));});
test('invalid SPT and missing key rejected',async()=>{assert.equal(validSpt(''),false);await assert.rejects(encryptSpt({},'m1',spt));await assert.rejects(encryptSpt(env,'m1','wrong'));});
