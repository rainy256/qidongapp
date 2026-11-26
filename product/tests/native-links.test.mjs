import {test} from 'node:test';
import assert from 'node:assert/strict';
import {nativeLanding} from '../worker/native-links.mjs';
import {nativeLinkForPath,parseNativeLaunch} from '../native-link.mjs';
test('notification landing opens installed APK without a web app link',async()=>{
 const id='12345678-1234-1234-1234-123456789abc';
 const r=nativeLanding('/game/'+id),body=await r.text();
 assert.ok(body.includes('qidongapp://game/'+id));
 assert.ok(body.includes('打开 App'));
 assert.ok(!body.includes('/app/'));
 assert.equal(nativeLanding('/game/invalid'),null);
 assert.equal(nativeLanding('/app/'),null);
 for(const page of ['schedule','messages','me']){
  const html=await nativeLanding('/open/'+page).text();
  assert.ok(html.includes('qidongapp://game/'+page));
  assert.ok(!html.includes('/app/'));
 }
});

test('all legacy HTTPS notification paths round-trip to the exact app target',()=>{
 const id='12345678-1234-1234-1234-123456789abc';
 assert.deepEqual(parseNativeLaunch(nativeLinkForPath('/game/'+id)),{kind:'invite',id});
 for(const page of ['schedule','messages','me']){
  assert.deepEqual(parseNativeLaunch(nativeLinkForPath('/open/'+page)),{kind:'page',page});
 }
 for(const path of ['/game/invalid','/open/unknown','/app/','/game/'+'-'.repeat(36)])assert.equal(nativeLinkForPath(path),null);
 for(const link of ['https://example.org/game/'+id,'qidongapp://other/'+id,'qidongapp://game/'+id+'?x=1','qidongapp://game/'+id+'#x','qidongapp://game:99/'+id,'qidongapp://user@game/'+id,'qidongapp://game/invalid'])assert.equal(parseNativeLaunch(link),null);
});
