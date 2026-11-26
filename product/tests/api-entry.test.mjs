import {test} from 'node:test';
import assert from 'node:assert/strict';
import entry from '../worker/api-entry.mjs';
test('API entry rewrites only its dedicated path and forwards bearer not cookies',async()=>{
 const env={APP:{async fetch(req){
  assert.equal(req.url,'https://qidongapp.apexdaishi.xyz/api/account/password');
  assert.equal(req.headers.get('Authorization'),'Bearer test');
  assert.equal(req.headers.get('Cookie'),null);
  assert.equal(req.headers.get('Origin'),'https://localhost');
  assert.deepEqual(await req.json(),{password:'test'});
  return Response.json({ok:true},{headers:{'Set-Cookie':'private','Cache-Control':'public'}});
 }}};
 const r=await entry.fetch(new Request('https://qidong.apexdaishi.xyz/app-api/account/password',{method:'POST',headers:{Authorization:'Bearer test',Cookie:'old-site-session=x',Origin:'https://localhost','Content-Type':'application/json'},body:JSON.stringify({password:'test'})}),env);
 assert.equal(r.status,200);assert.equal(r.headers.get('Set-Cookie'),null);assert.equal(r.headers.get('Cache-Control'),'no-store');
 assert.equal((await entry.fetch(new Request('https://qidong.apexdaishi.xyz/app-api/web/login'),env)).status,404);
 assert.equal((await entry.fetch(new Request('https://qidong.apexdaishi.xyz/'),env)).status,404);
 assert.equal((await entry.fetch(new Request('https://unrelated.example/app-api/health'),env)).status,404);
});
test('health and CORS preflight preserve method and response',async()=>{
 const env={APP:{async fetch(req){assert.equal(new URL(req.url).pathname,'/api/health');return new Response(req.method==='OPTIONS'?null:'{"ok":true}',{status:req.method==='OPTIONS'?204:200,headers:{'Access-Control-Allow-Origin':'https://localhost'}});}}};
 assert.equal((await entry.fetch(new Request('https://qidong.apexdaishi.xyz/app-api/health'),env)).status,200);
 const pre=await entry.fetch(new Request('https://qidong.apexdaishi.xyz/app-api/health',{method:'OPTIONS',headers:{Origin:'https://localhost'}}),env);
 assert.equal(pre.status,204);assert.equal(pre.headers.get('Access-Control-Allow-Origin'),'https://localhost');
});
