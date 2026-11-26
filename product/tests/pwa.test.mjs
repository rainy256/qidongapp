import {test} from 'node:test';
import assert from 'node:assert/strict';
import {staticName,pwaStatic,pwaLanding,validWebWrite} from '../worker/pwa.mjs';
test('PWA static assets restricted to private KV binding; no runtime upstream fetch',async()=>{
 assert.equal(staticName('/app/'),'index.html');assert.equal(staticName('/art/hero-runner.png'),'art/hero-runner.png');
 for(const p of ['/app/../worker/index.mjs','/app/.git/config','/app/assets/../../package.json','/app/BUILD_REVISION','/api/state'])assert.equal(staticName(p),null);
 const r=await pwaStatic(new Request('https://qidong.example/app/',{headers:{Cookie:'private',Authorization:'private'}}),{PWA_ASSETS:{async getWithMetadata(key,options){assert.equal(key,'index.html');assert.equal(options.type,'arrayBuffer');return {value:new TextEncoder().encode('<html/>').buffer,metadata:{type:'text/html; charset=utf-8'}};}}});
 assert.equal(r.status,200);assert.equal(r.headers.get('cache-control'),'no-store');assert.match(r.headers.get('content-type'),/text\/html/);
 assert.equal((await pwaStatic(new Request('https://qidong.example/app/.git/config'),{PWA_ASSETS:{async getWithMetadata(){throw Error('must not read');}}})).status,404);
});
test('notification links choose web or native; no private data',async()=>{
 const id='12345678-1234-1234-1234-123456789abc';const r=pwaLanding('/game/'+id);const body=await r.text();
 assert.ok(body.includes('/app/?invite='+id));assert.ok(body.includes('qidongapp://game/'+id));assert.equal(pwaLanding('/game/invalid'),null);
 assert.ok((await pwaLanding('/open/schedule').text()).includes('/app/?page=schedule'));
});
