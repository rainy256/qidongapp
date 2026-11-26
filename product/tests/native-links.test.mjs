import {test} from 'node:test';
import assert from 'node:assert/strict';
import {nativeLanding} from '../worker/native-links.mjs';
test('notification landing opens installed APK without a web app link',async()=>{
 const id='12345678-1234-1234-1234-123456789abc';
 const r=nativeLanding('/game/'+id),body=await r.text();
 assert.ok(body.includes('qidongapp://game/'+id));
 assert.ok(!body.includes('/app/'));
 assert.equal(nativeLanding('/game/invalid'),null);
 assert.equal(nativeLanding('/app/'),null);
 for(const page of ['schedule','messages','me']){
  const html=await nativeLanding('/open/'+page).text();
  assert.ok(html.includes('qidongapp://game/'+page));
  assert.ok(!html.includes('/app/'));
 }
});
