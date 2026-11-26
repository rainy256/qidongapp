import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync} from 'node:fs';
import worker from '../worker/index.mjs';
import {digest,dayStart} from '../worker/logic.mjs';

function setup(){
 const db=new DatabaseSync(':memory:');db.exec('PRAGMA foreign_keys=ON');
 const dir=new URL('../worker/migrations/',import.meta.url);
 for(const name of readdirSync(dir).filter(x=>x.endsWith('.sql')).sort())db.exec(readFileSync(new URL(name,dir),'utf8'));
 const adapt={prepare(sql){return make(sql,[]);},async batch(stmts){db.exec('BEGIN');try{const out=stmts.map(s=>s.exec());db.exec('COMMIT');return out;}catch(e){db.exec('ROLLBACK');throw e;}}};
 function make(sql,params){return {bind(...p){return make(sql,p);},async first(){return db.prepare(sql).get(...params)||null;},async all(){return {results:db.prepare(sql).all(...params)};},async run(){return {meta:{changes:Number(db.prepare(sql).run(...params).changes)}};},exec(){const stmt=db.prepare(sql);if(/^\s*(SELECT|WITH)\b/i.test(sql)||/\bRETURNING\b/i.test(sql))return {results:stmt.all(...params)};return {results:[],meta:{changes:Number(stmt.run(...params).changes)}};}};}
 const env={DB:adapt,SPT_ENCRYPTION_KEY:'aa'.repeat(32)};
 return {db,env};
}
const mut=()=>crypto.randomUUID();
test('three-member activation, authenticated state, invitations, outbox, reservations and weekly schedule',async()=>{
 const {db,env}=setup();const originalFetch=globalThis.fetch;let upstream=0;
 globalThis.fetch=async(url,opts)=>{assert.equal(url,'https://wxpusher.zjiecode.com/api/send/message/simple-push');assert.equal(JSON.parse(opts.body).spt,'SPT_test_member_two_only');upstream++;return Response.json({code:1000,success:true});};
 const tokens={};
 async function req(path,who,body){
  const pending=[];const res=await worker.fetch(new Request('https://qidongapp.example'+path,{method:body===undefined?'GET':'POST',headers:{...(who?{Authorization:'Bearer '+tokens[who]}:{}),...(body===undefined?{}:{'Content-Type':'application/json'})},...(body===undefined?{}:{body:JSON.stringify(body)})}),env,{waitUntil(p){pending.push(p);}});
  const data=await res.json();await Promise.all(pending);return {status:res.status,data};
 }
 try{
  assert.equal((await req('/api/state')).status,401);
  for(const id of ['m1','m2','m3']){
   const code=crypto.randomUUID().replaceAll('-','')+crypto.randomUUID().replaceAll('-','');
   db.prepare('UPDATE app_members SET activation_hash=? WHERE id=?').run(await digest(code),id);
   const activated=await req('/api/activate',null,{code});assert.equal(activated.status,200);assert.equal(activated.data.member.id,id);tokens[id]=activated.data.token;
   assert.equal((await req('/api/activate',null,{code})).status,401);
  }
  assert.equal((await req('/api/push/bind','m2',{spt:'SPT_test_member_two_only',member_id:'m1'})).status,200);
  assert.equal((await req('/api/push','m1')).data.bound,false);
  const p=await req('/api/push','m2');assert.equal(p.data.bound,true);assert.ok(!JSON.stringify(p).includes('SPT_test'));
  assert.notEqual(db.prepare('SELECT spt_cipher FROM app_push_bindings WHERE member_id=?').get('m2').spt_cipher,'SPT_test_member_two_only');
  const i={game:'apex',mutation:mut()};const first=await req('/api/invites','m1',i);assert.equal(first.status,201);const inv=first.data.invite;assert.equal((await req('/api/invites','m1',i)).data.invite.id,inv.id);
  assert.equal(db.prepare('SELECT count(*) AS n FROM app_messages WHERE kind=?').get('invite').n,2);assert.equal(upstream,1);
  const r2=await req('/api/invites/'+inv.id+'/reply','m2',{reply:'ready',revision:1,mutation:mut(),memberId:'m3'});assert.equal(r2.status,200);assert.equal(r2.data.invite.r2,'ready');assert.equal(r2.data.invite.r3,'pending');
  assert.equal((await req('/api/invites/'+inv.id+'/reply','m3',{reply:'ready',revision:1,mutation:mut()})).status,409);
  const r3=await req('/api/invites/'+inv.id+'/reply','m3',{reply:'ready',revision:2,mutation:mut()});assert.equal(r3.data.invite.status,'assembled');
  const slot=Math.ceil(Date.now()/1800000)+3,book={game:'gta',from:slot,to:slot+2,mutation:mut()};
  const booked=await req('/api/reservations','m1',book);assert.equal(booked.status,201);const id=booked.data.reservation.id;
  assert.equal((await req('/api/reservations','m2',{...book,mutation:mut()})).status,409);
  assert.equal((await req('/api/reservations/'+id+'/confirm','m2',{revision:1})).status,200);
  const confirmed=await req('/api/reservations/'+id+'/confirm','m3',{revision:2});assert.equal(confirmed.data.reservation.state,'confirmed');
  assert.equal(db.prepare("SELECT count(*) AS n FROM app_push_jobs WHERE kind='reminder' AND status='queued'").get().n,3);
  const cancelled=await req('/api/reservations/'+id+'/cancel','m1',{revision:3});assert.equal(cancelled.data.reservation.state,'cancelled');assert.equal(db.prepare("SELECT count(*) AS n FROM app_push_jobs WHERE kind='reminder' AND status='queued'").get().n,0);
  const day=dayStart(Date.now()),dow=new Date(day*1800000+28800000).getUTCDay();
  assert.equal((await req('/api/schedule/template','m1',{revision:0,mutation:mut(),template:[{day:dow,from:20,to:24}]})).status,200);
  let s=await req('/api/state','m1');assert.deepEqual(s.data.members[0].schedule,[{from:day+20,to:day+24}]);assert.equal(s.data.members[1].template,undefined);
  assert.equal((await req('/api/schedule','m1',{revision:1,mutation:mut(),picks:[]})).status,200);
  s=await req('/api/state','m1');assert.deepEqual(s.data.members[0].schedule,[]);
  assert.equal((await req('/api/schedule/reset-day','m1',{revision:2,mutation:mut(),day})).status,200);
  s=await req('/api/state','m1');assert.deepEqual(s.data.members[0].schedule,[{from:day+20,to:day+24}]);
  const msg=s.data.messages[0];assert.ok(msg);assert.equal((await req('/api/messages/read','m2',{id:msg.id})).status,200);assert.equal(db.prepare('SELECT read_at FROM app_messages WHERE id=?').get(msg.id).read_at,null);
 }finally{globalThis.fetch=originalFetch;db.close();}
});
