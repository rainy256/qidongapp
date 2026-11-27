import {nativeLanding} from './native-links.mjs';
import {authenticate,login,account,allowAttempt} from './auth.mjs';
import {MEMBER_IDS,REPLIES,GAMES,normalizeSchedule,replyColumn,mutationValid,secretValid,digest,newToken,inviteView} from './logic.mjs';
import {latestVersion} from './version.mjs';
import {encryptSpt,validSpt} from './spt.mjs';
import {scheduleView,normalizeTemplate,updateOverrides,ownSchedule,writeWeekly} from './weekly.mjs';
import {drainPush} from './push.mjs';
import {reservationApi} from './reservations.mjs';
import {availabilityApi} from './availability.mjs';
const HEADERS={'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','Access-Control-Allow-Origin':'https://localhost','Access-Control-Allow-Headers':'Authorization, Content-Type','Access-Control-Allow-Methods':'GET, POST, OPTIONS','Access-Control-Max-Age':'600','Vary':'Origin'};
const json=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:HEADERS});
const publicInvite='id,creator,game,title,created_at,expires_at,revision,r1,r2,r3,r1_eta,r2_eta,r3_eta';
async function body(req){try{const s=await req.text();if(s.length>20000)return null;return JSON.parse(s);}catch{return null;}}
export default {async fetch(req,env,ctx){
 const u=new URL(req.url),path=u.pathname,now=Date.now();
 const kick=()=>ctx.waitUntil(drainPush(env).catch(()=>{}));
 if(req.method==='GET'){
  const landing=nativeLanding(path);if(landing)return landing;
  if(!path.startsWith('/api/'))return json({error:'not_found'},404);
 }
 if(path==='/api/web'||path.startsWith('/api/web/'))return json({error:'not_found'},404);
 if(req.method==='OPTIONS')return new Response(null,{status:204,headers:HEADERS});
 if(path==='/api/health'&&req.method==='GET')return json({ok:true,stage:'product-foundation'});
 try{
  if(path==='/api/login'&&req.method==='POST')return await login(env,await body(req),now,json);
  if(path==='/api/activate'&&req.method==='POST'){
   const b=await body(req);if(!secretValid(b?.code)||(b.memberId!==undefined&&!MEMBER_IDS.includes(b.memberId)))return json({error:'invalid_activation'},401);
   if(!await allowAttempt(env,'legacy:'+(b.memberId??'unknown'),now,30))return json({error:'rate_limited'},429);
   const token=newToken();
   const member=await env.DB.prepare('UPDATE app_members SET activation_hash=NULL,token_hash=?,activated_at=?,last_seen=? WHERE activation_hash=? AND activated_at IS NULL AND (? IS NULL OR id=?) RETURNING id,nickname').bind(await digest(token),now,now,await digest(b.code),b.memberId??null,b.memberId??null).first();
   if(!member)return json({error:'invalid_activation'},401);
   return json({member,token});
  }
  const auth=await authenticate(req,env,now);if(!auth)return json({error:'unauthorized'},401);const me=auth.member;
  if(path==='/api/account'||path.startsWith('/api/account/'))return await account(req,env,auth,req.method==='POST'?await body(req):null,now,json);
  if(path==='/api/version'&&req.method==='GET'){try{return json(await latestVersion());}catch{return json({error:'version_unavailable'},503);}}
  if(path==='/api/push'&&req.method==='GET'){
   const [binding,preferences,jobs]=await env.DB.batch([
    env.DB.prepare('SELECT bound_at FROM app_push_bindings WHERE member_id=?').bind(me.id),
    env.DB.prepare('SELECT quiet_start,quiet_end FROM app_push_preferences WHERE member_id=?').bind(me.id),
    env.DB.prepare("SELECT id,status,created_at,provider_http,provider_code FROM app_push_jobs WHERE member_id=? AND kind='test' ORDER BY created_at DESC LIMIT 1").bind(me.id),
   ]);
   const r=binding.results[0],pref=preferences.results[0];
   return json({bound:!!r,boundAt:r?.bound_at??null,quietStart:pref?.quiet_start??null,quietEnd:pref?.quiet_end??null,test:jobs.results[0]??null,keyConfigured:!!env.SPT_ENCRYPTION_KEY});
  }
  if(path==='/api/state'&&req.method==='GET'){
   const [,members,invites,messages,reservations,events,nudges]=await env.DB.batch([
    env.DB.prepare('UPDATE app_members SET last_seen=? WHERE id=? AND (last_seen IS NULL OR last_seen<?)').bind(now,me.id,now-30000),
    env.DB.prepare('SELECT m.id,m.nickname,m.schedule_json,m.schedule_revision,m.last_seen,m.available_until,m.availability_revision,w.template_json,w.override_days_json FROM app_members m LEFT JOIN app_weekly w ON w.member_id=m.id ORDER BY m.id'),
    env.DB.prepare('SELECT '+publicInvite+' FROM app_invites WHERE expires_at>? ORDER BY created_at DESC LIMIT 20').bind(now-86400000),
    env.DB.prepare('SELECT id,invite_id,kind,actor,detail,created_at,read_at FROM app_messages WHERE member_id=? ORDER BY created_at DESC LIMIT 100').bind(me.id),
    env.DB.prepare('SELECT id,creator,game,title,from_slot,to_slot,state,r1,r2,r3,revision FROM app_reservations WHERE to_slot>? ORDER BY from_slot LIMIT 50').bind(Math.floor((now-86400000)/1800000)),
    env.DB.prepare('SELECT id,reservation_id,kind,detail,created_at,read_at FROM app_reservation_events WHERE member_id=? ORDER BY created_at DESC LIMIT 100').bind(me.id),
    env.DB.prepare("SELECT id,invite_id,kind,content AS detail,created_at,status FROM app_push_jobs WHERE member_id=? AND kind='nudge' ORDER BY created_at DESC LIMIT 50").bind(me.id),
   ]);
   return json({features:{rebook:env.ENABLE_REBOOKING==='true'},reservations:reservations.results,reservationMessages:events.results,nudges:nudges.results,me,
    members:members.results.map(x=>({id:x.id,nickname:x.nickname,last_seen:x.last_seen,available_until:x.available_until>now?x.available_until:null,availability_revision:x.availability_revision,...scheduleView(x,now,x.id===me.id)})),
    invites:invites.results.map(x=>inviteView(x,now)),messages:messages.results,now});
  }
  if(req.method!=='POST')return json({error:'not_found'},404);
  const b=await body(req);if(!b||typeof b!=='object')return json({error:'invalid_body'},400);
  if(path==='/api/availability'){const result=await availabilityApi(env,me,b,now);return json(result.value,result.status);}
  if(path==='/api/push/bind'){
   if(!validSpt(b.spt))return json({error:'invalid_spt'},400);
   if(!env.SPT_ENCRYPTION_KEY)return json({error:'push_key_not_configured'},503);
   const cipher=await encryptSpt(env,me.id,b.spt);
   await env.DB.prepare('INSERT INTO app_push_bindings(member_id,spt_cipher,bound_at) VALUES(?,?,?) ON CONFLICT(member_id) DO UPDATE SET spt_cipher=excluded.spt_cipher,bound_at=excluded.bound_at').bind(me.id,cipher,now).run();
   return json({bound:true,boundAt:now});
  }
  if(path==='/api/push/unbind'){
   await env.DB.prepare('DELETE FROM app_push_bindings WHERE member_id=?').bind(me.id).run();return json({bound:false});
  }
  if(path==='/api/push/preferences'){
   const a=b.quietStart,z=b.quietEnd;if(!((a===null&&z===null)||(Number.isInteger(a)&&Number.isInteger(z)&&a>=0&&a<1440&&z>=0&&z<1440&&a!==z)))return json({error:'invalid_quiet'},400);
   await env.DB.prepare('INSERT INTO app_push_preferences VALUES(?,?,?) ON CONFLICT(member_id) DO UPDATE SET quiet_start=excluded.quiet_start,quiet_end=excluded.quiet_end').bind(me.id,a,z).run();return json({ok:true});
  }
  if(path==='/api/push/test'){
   if(!env.SPT_ENCRYPTION_KEY)return json({error:'push_key_not_configured'},503);
   if(!await env.DB.prepare('SELECT member_id FROM app_push_bindings WHERE member_id=?').bind(me.id).first())return json({error:'not_bound'},409);
   const job=await env.DB.prepare("INSERT INTO app_push_jobs(id,member_id,kind,content,created_at,due_at,expires_at) SELECT ?,?,'test','启动！正式版测试通知',?,?,? WHERE NOT EXISTS(SELECT 1 FROM app_push_jobs WHERE member_id=? AND kind='test' AND created_at>?) RETURNING id").bind(crypto.randomUUID(),me.id,now,now,now+300000,me.id,now-60000).first();
   if(!job)return json({error:'rate_limited'},429);kick();return json({queued:true,id:job.id},202);
  }
  if(path==='/api/push/confirm'){
   const row=await env.DB.prepare("UPDATE app_push_jobs SET status='confirmed' WHERE id=? AND member_id=? AND kind='test' AND status='accepted' RETURNING id").bind(String(b.id||''),me.id).first();return row?json({ok:true}):json({error:'not_accepted'},409);
  }
  if(path==='/api/reservation-messages/read'){
   await env.DB.prepare('UPDATE app_reservation_events SET read_at=COALESCE(read_at,?) WHERE id=? AND member_id=?').bind(now,String(b.id||''),me.id).run();return json({ok:true});
  }
  if(path.startsWith('/api/reservations')){const result=await reservationApi(env,me,path,b,now);if(result.status<300)kick();return json(result.value,result.status);}
  const nudge=path.match(/^\/api\/invites\/([0-9a-f-]{36})\/nudge$/);
  if(nudge){
   if(!MEMBER_IDS.includes(b.recipient)||b.recipient===me.id||!mutationValid(b.mutation))return json({error:'invalid_recipient'},400);
   const id=me.id+':'+b.mutation;
   const existing=await env.DB.prepare('SELECT id FROM app_nudges WHERE id=?').bind(id).first();if(existing)return json({queued:true});
   const col=replyColumn(b.recipient);
   const row=await env.DB.prepare("INSERT OR IGNORE INTO app_nudges(id,invite_id,actor,recipient,created_at) SELECT ?,id,?,?,? FROM app_invites WHERE id=? AND expires_at>? AND "+col+" NOT IN ('ready','no') AND NOT EXISTS(SELECT 1 FROM app_nudges WHERE actor=? AND recipient=? AND created_at>?) RETURNING id").bind(id,me.id,b.recipient,now,nudge[1],now,me.id,b.recipient,now-60000).first();
   if(!row)return json({error:'rate_limited_or_expired'},409);kick();return json({queued:true},202);
  }
  if(path==='/api/invites'){
   if(!mutationValid(b.mutation)||!Object.hasOwn(GAMES,b.game))return json({error:'invalid_invite'},400);
   const title=b.game==='custom'&&typeof b.title==='string'?b.title.trim():GAMES[b.game];
   if(!title||title.length>32)return json({error:'invalid_title'},400);
   const existing=await env.DB.prepare('SELECT '+publicInvite+' FROM app_invites WHERE creator=? AND mutation=?').bind(me.id,b.mutation).first();if(existing)return json({invite:inviteView(existing,now)});
   const replies=MEMBER_IDS.map(id=>id===me.id?'ready':'pending');
   const row=await env.DB.prepare('INSERT INTO app_invites(id,creator,mutation,game,title,created_at,expires_at,r1,r2,r3) SELECT ?,?,?,?,?,?,?,?,?,? WHERE NOT EXISTS(SELECT 1 FROM app_invites WHERE creator=? AND created_at>?) ON CONFLICT(creator,mutation) DO NOTHING RETURNING '+publicInvite).bind(crypto.randomUUID(),me.id,b.mutation,b.game,title,now,now+1800000,...replies,me.id,now-60000).first();
   const saved=row||await env.DB.prepare('SELECT '+publicInvite+' FROM app_invites WHERE creator=? AND mutation=?').bind(me.id,b.mutation).first();
   if(!saved)return json({error:'rate_limited'},429);if(row)kick();return json({invite:inviteView(saved,now)},row?201:200);
  }
  const match=path.match(/^\/api\/invites\/([a-z0-9-]{36})\/reply$/);
  if(match){
   if(!REPLIES.includes(b.reply)||!mutationValid(b.mutation)||!Number.isSafeInteger(b.revision))return json({error:'invalid_reply'},400);
   const col=replyColumn(me.id),mut=me.id+'_mut',eta=['5','10','30'].includes(b.reply)?now+Number(b.reply)*60000:null;
   const row=await env.DB.prepare('UPDATE app_invites SET '+col+'=?,'+col+'_eta=?,'+mut+'=?,revision=revision+1 WHERE id=? AND revision=? AND expires_at>? AND COALESCE('+mut+",'')<>? AND NOT(r1='ready' AND r2='ready' AND r3='ready') RETURNING "+publicInvite).bind(b.reply,eta,b.mutation,match[1],b.revision,now,b.mutation).first();
   if(row){kick();return json({invite:inviteView(row,now)});}
   const retry=await env.DB.prepare('SELECT '+publicInvite+' FROM app_invites WHERE id=? AND '+mut+'=?').bind(match[1],b.mutation).first();
   return retry?json({invite:inviteView(retry,now)}):json({error:'revision_conflict_or_expired'},409);
  }
  if(['/api/schedule','/api/schedule/template','/api/schedule/reset-day'].includes(path)){
   if(!mutationValid(b.mutation)||!Number.isSafeInteger(b.revision))return json({error:'invalid_schedule'},400);
   const current=await ownSchedule(env,me.id);
   if(current.schedule_mutation===b.mutation)return json(scheduleView(current,now,true));
   if(current.schedule_revision!==b.revision)return json({error:'revision_conflict'},409);
   let template=JSON.parse(current.template_json||'[]'),days=JSON.parse(current.override_days_json||'[]'),picks=JSON.parse(current.schedule_json||'[]');
   try{
    if(path==='/api/schedule'){
     if(b.unavailable!==undefined&&typeof b.unavailable!=='boolean')return json({error:'invalid_schedule'},400);
     const explicit=b.unavailable===true||(b.unavailable===undefined&&Array.isArray(b.picks)&&b.picks.length===0);
     if(explicit&&Array.isArray(b.picks)&&b.picks.some(p=>p?.to>Math.ceil(now/1800000)))return json({error:'invalid_schedule'},400);
     const next=updateOverrides(current,b.picks,now,explicit);days=next.days;picks=next.picks;
    }
    if(path==='/api/schedule/template')template=normalizeTemplate(b.template);
    if(path==='/api/schedule/reset-day'){
     if(!Number.isSafeInteger(b.day)||!days.includes(b.day))return json({error:'invalid_day'},400);
     days=days.filter(x=>x!==b.day);picks=picks.flatMap(p=>[{from:p.from,to:Math.min(p.to,b.day)},{from:Math.max(p.from,b.day+48),to:p.to}].filter(q=>q.to>q.from));
    }
   }catch{return json({error:'invalid_schedule'},400);}
   const saved=await writeWeekly(env,me.id,b.revision,b.mutation,template,days,picks);
   if(saved) return json(scheduleView({
    schedule_revision:saved.schedule_revision, schedule_json:JSON.stringify(picks),
    template_json:JSON.stringify(template), override_days_json:JSON.stringify(days)
   },now,true));
   const latest=await ownSchedule(env,me.id);return latest.schedule_mutation===b.mutation?json(scheduleView(latest,now,true)):json({error:'revision_conflict'},409);
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
},async scheduled(event,env,ctx){ctx.waitUntil(drainPush(env));}};
