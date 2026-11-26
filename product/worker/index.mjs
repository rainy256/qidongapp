import {MEMBER_IDS,REPLIES,GAMES,normalizeSchedule,replyColumn,mutationValid,secretValid,digest,newToken,inviteView} from './logic.mjs';
import {encryptSpt,validSpt} from './spt.mjs';
const HEADERS={'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','Access-Control-Allow-Origin':'https://localhost','Access-Control-Allow-Headers':'Authorization, Content-Type','Access-Control-Allow-Methods':'GET, POST, OPTIONS','Vary':'Origin'};
const json=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:HEADERS});
const publicInvite='id,creator,game,title,created_at,expires_at,revision,r1,r2,r3';
async function body(req){try{const s=await req.text();if(s.length>20000)return null;return JSON.parse(s);}catch{return null;}}
async function authenticate(req,env){
 const auth=req.headers.get('Authorization')||'';
 if(!auth.startsWith('Bearer ')||!secretValid(auth.slice(7)))return null;
 return env.DB.prepare('SELECT id,nickname FROM app_members WHERE token_hash=?').bind(await digest(auth.slice(7))).first();
}
export default {async fetch(req,env){
 const u=new URL(req.url),path=u.pathname,now=Date.now();
 if(req.method==='OPTIONS')return new Response(null,{status:204,headers:HEADERS});
 if(path==='/api/health'&&req.method==='GET')return json({ok:true,stage:'product-foundation'});
 try{
  if(path==='/api/activate'&&req.method==='POST'){
   const b=await body(req);if(!secretValid(b?.code))return json({error:'invalid_activation'},401);
   const token=newToken();
   const member=await env.DB.prepare('UPDATE app_members SET activation_hash=NULL,token_hash=?,activated_at=?,last_seen=? WHERE activation_hash=? AND activated_at IS NULL RETURNING id,nickname').bind(await digest(token),now,now,await digest(b.code)).first();
   return member?json({member,token}):json({error:'invalid_activation'},401);
  }
  const me=await authenticate(req,env);if(!me)return json({error:'unauthorized'},401);
  if(path==='/api/push'&&req.method==='GET'){
   const r=await env.DB.prepare('SELECT bound_at FROM app_push_bindings WHERE member_id=?').bind(me.id).first();
   return json({bound:!!r,boundAt:r?.bound_at??null});
  }
  if(path==='/api/state'&&req.method==='GET'){
   const r=await env.DB.batch([
    env.DB.prepare('UPDATE app_members SET last_seen=? WHERE id=? AND (last_seen IS NULL OR last_seen<?)').bind(now,me.id,now-30000),
    env.DB.prepare('SELECT id,nickname,schedule_json,schedule_revision,last_seen FROM app_members ORDER BY id'),
    env.DB.prepare('SELECT '+publicInvite+' FROM app_invites WHERE expires_at>? ORDER BY created_at DESC LIMIT 20').bind(now-86400000),
    env.DB.prepare('SELECT id,invite_id,kind,actor,detail,created_at,read_at FROM app_messages WHERE member_id=? ORDER BY created_at DESC LIMIT 100').bind(me.id)
   ]);
   return json({me,members:r[1].results.map(({schedule_json,...x})=>({...x,schedule:JSON.parse(schedule_json)})),invites:r[2].results.map(x=>inviteView(x,now)),messages:r[3].results,now});
  }
  if(req.method!=='POST')return json({error:'not_found'},404);
  const b=await body(req);if(!b||typeof b!=='object')return json({error:'invalid_body'},400);
  if(path==='/api/push/bind'){
   if(!validSpt(b.spt))return json({error:'invalid_spt'},400);
   const cipher=await encryptSpt(env,me.id,b.spt);
   await env.DB.prepare('INSERT INTO app_push_bindings(member_id,spt_cipher,bound_at) VALUES(?,?,?) ON CONFLICT(member_id) DO UPDATE SET spt_cipher=excluded.spt_cipher,bound_at=excluded.bound_at').bind(me.id,cipher,now).run();
   return json({bound:true,boundAt:now});
  }
  if(path==='/api/push/unbind'){
   await env.DB.prepare('DELETE FROM app_push_bindings WHERE member_id=?').bind(me.id).run();return json({bound:false});
  }
  if(path==='/api/invites'){
   if(!mutationValid(b.mutation)||!Object.hasOwn(GAMES,b.game))return json({error:'invalid_invite'},400);
   const title=b.game==='custom'&&typeof b.title==='string'?b.title.trim():GAMES[b.game];
   if(!title||title.length>32)return json({error:'invalid_title'},400);
   const replies=MEMBER_IDS.map(id=>id===me.id?'ready':'pending');
   const row=await env.DB.prepare('INSERT INTO app_invites(id,creator,mutation,game,title,created_at,expires_at,r1,r2,r3) VALUES(?,?,?,?,?,?,?,?,?,?) ON CONFLICT(creator,mutation) DO NOTHING RETURNING '+publicInvite).bind(crypto.randomUUID(),me.id,b.mutation,b.game,title,now,now+1800000,...replies).first();
   const saved=row||await env.DB.prepare('SELECT '+publicInvite+' FROM app_invites WHERE creator=? AND mutation=?').bind(me.id,b.mutation).first();
   return json({invite:inviteView(saved,now)},row?201:200);
  }
  const match=path.match(/^\/api\/invites\/([a-z0-9-]{36})\/reply$/);
  if(match){
   if(!REPLIES.includes(b.reply)||!mutationValid(b.mutation)||!Number.isSafeInteger(b.revision))return json({error:'invalid_reply'},400);
   const col=replyColumn(me.id),mut=me.id+'_mut';
   const row=await env.DB.prepare('UPDATE app_invites SET '+col+'=?,'+mut+'=?,revision=revision+1 WHERE id=? AND revision=? AND expires_at>? AND COALESCE('+mut+",'')<>? AND NOT(r1='ready' AND r2='ready' AND r3='ready') RETURNING "+publicInvite).bind(b.reply,b.mutation,match[1],b.revision,now,b.mutation).first();
   if(row)return json({invite:inviteView(row,now)});
   const retry=await env.DB.prepare('SELECT '+publicInvite+' FROM app_invites WHERE id=? AND '+mut+'=?').bind(match[1],b.mutation).first();
   return retry?json({invite:inviteView(retry,now)}):json({error:'revision_conflict_or_expired'},409);
  }
  if(path==='/api/schedule'){
   if(!mutationValid(b.mutation)||!Number.isSafeInteger(b.revision))return json({error:'invalid_schedule'},400);
   let schedule;try{schedule=normalizeSchedule(b.picks,now);}catch{return json({error:'invalid_schedule'},400);}
   const saved=await env.DB.prepare("UPDATE app_members SET schedule_json=?,schedule_revision=schedule_revision+1,schedule_mutation=? WHERE id=? AND schedule_revision=? AND COALESCE(schedule_mutation,'')<>? RETURNING schedule_revision").bind(JSON.stringify(schedule),b.mutation,me.id,b.revision,b.mutation).first();
   if(saved)return json(saved);
   const retry=await env.DB.prepare('SELECT schedule_revision FROM app_members WHERE id=? AND schedule_mutation=?').bind(me.id,b.mutation).first();
   return retry?json(retry):json({error:'revision_conflict'},409);
  }
  if(path==='/api/messages/read'){
   if(typeof b.id!=='string'||b.id.length>180)return json({error:'invalid_message'},400);
   await env.DB.prepare('UPDATE app_messages SET read_at=COALESCE(read_at,?) WHERE id=? AND member_id=?').bind(now,b.id,me.id).run();return json({ok:true});
  }
  if(path==='/api/profile'){
   const name=typeof b.nickname==='string'?b.nickname.trim():'';
   if(!name||name.length>24)return json({error:'invalid_name'},400);
   await env.DB.prepare('UPDATE app_members SET nickname=? WHERE id=?').bind(name,me.id).run();return json({ok:true});
  }
  return json({error:'not_found'},404);
 }catch{return json({error:'request_failed'},500);}
}};
