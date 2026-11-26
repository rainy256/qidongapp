import {test} from 'node:test';
import assert from 'node:assert/strict';
import {WxPusherProvider} from '../worker/push.mjs';
const payload={spt:'SPT_TEST_ONLY',url:'qidongapp://game/probe'};
test('accepted never means delivered',async()=>{
 const p=new WxPusherProvider(async(url,opts)=>{assert.equal(url,'https://wxpusher.zjiecode.com/api/send/message/simple-push');assert.equal(JSON.parse(opts.body).spt,payload.spt);return Response.json({code:1000,success:true});});
 assert.equal(await p.send(payload),'accepted');
});
test('business rejection is not accepted',async()=>assert.equal(await new WxPusherProvider(async()=>Response.json({code:1001,success:false})).send(payload),'rejected'));
test('recipient rejection is not accepted',async()=>assert.equal(await new WxPusherProvider(async()=>Response.json({code:1000,data:[{code:1001}]})).send(payload),'rejected'));
test('HTTP failure leaves result unknown',async()=>assert.equal(await new WxPusherProvider(async()=>new Response('',{status:503})).send(payload),'unknown'));
