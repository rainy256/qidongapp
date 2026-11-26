import {MEMBER_IDS,secretValid,digest,newToken} from './logic.mjs';
const TTL=365*86400000,ITERATIONS=100000;
const hex=bytes=>Array.from(new Uint8Array(bytes),v=>v.toString(16).padStart(2,'0')).join('');
const unhex=s=>Uint8Array.from(s.match(/../g),v=>parseInt(v,16));
export const passwordValid=v=>typeof v==='string'&&v.length>=16&&v.length<=128&&v.trim()===v;
export async function passwordHash(password,salt){
 const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(password),'PBKDF2',false,['deriveBits']);
 return hex(await crypto.subtle.deriveBits({name:'PBKDF2',hash:'SHA-256',salt:unhex(salt),iterations:ITERATIONS},key,256));
}
const same=(a,b)=>{if(typeof a!=='string'||typeof b!=='string'||a.length!==b.length)return false;let diff=0;for(let i=0;i<a.length;i++)diff|=a.charCodeAt(i)^b.charCodeAt(i);return diff===0;};
async function makeCredential(password,now){const salt=hex(crypto.getRandomValues(new Uint8Array(16)));return {salt,hash:await passwordHash(password,salt),generation:crypto.randomUUID(),now};}
export async function allowAttempt(env,scope,now,max=10){
 const bucket=Math.floor(now/900000);
 const r=await env.DB.prepare('INSERT INTO app_login_limits(scope,bucket,attempts) VALUES(?,?,1) ON CONFLICT(scope) DO UPDATE SET attempts=CASE WHEN bucket=excluded.bucket THEN attempts+1 ELSE 1 END,bucket=excluded.bucket WHERE bucket<>excluded.bucket OR attempts<? RETURNING attempts').bind(scope,bucket,max).first();
 return !!r;
}
export async function authenticate(req,env,now){
 const auth=req.headers.get('Authorization')||'';
 const token=auth.startsWith('Bearer ')?auth.slice(7):'';
 if(!secretValid(token))return null;
 const hash=await digest(token);
 const row=await env.DB.prepare('SELECT m.id,m.nickname,s.id AS session_id,s.generation FROM app_sessions s JOIN app_members m ON m.id=s.member_id JOIN app_credentials c ON c.member_id=s.member_id AND c.generation=s.generation WHERE s.kind=\'android\' AND s.token_hash=? AND s.expires_at>?').bind(hash,now).first();
 if(row)return {member:{id:row.id,nickname:row.nickname},sessionId:row.session_id,hash,generation:row.generation};
 const old=await env.DB.prepare('SELECT id,nickname FROM app_members WHERE token_hash=?').bind(hash).first();
 return old?{member:old,sessionId:'legacy',hash,generation:null}:null;
}
const err=(json,code,status)=>json({error:code},status);
async function newSession(env,member,generation,now,json){
 const token=newToken(),id=crypto.randomUUID();
 const row=await env.DB.prepare('INSERT INTO app_sessions(id,member_id,token_hash,generation,kind,created_at,expires_at) SELECT ?,member_id,?,generation,?,?,? FROM app_credentials WHERE member_id=? AND generation=? RETURNING id').bind(id,await digest(token),'android',now,now+TTL,member.id,generation).first();
 if(!row)return err(json,'credential_changed',409);
 return json({member,token});
}
export async function login(env,b,now,json){
 if(!MEMBER_IDS.includes(b?.memberId)||!passwordValid(b?.password))return err(json,'invalid_login',401);
 if(!await allowAttempt(env,'login:'+b.memberId,now))return err(json,'rate_limited',429);
 const member=await env.DB.prepare('SELECT id,nickname,activation_hash,activated_at FROM app_members WHERE id=?').bind(b.memberId).first();
 let credential=await env.DB.prepare('SELECT salt,password_hash,generation FROM app_credentials WHERE member_id=?').bind(b.memberId).first();
 if(credential){
  if(!same(await passwordHash(b.password,credential.salt),credential.password_hash))return err(json,'invalid_login',401);
 }else{
  // A previously issued and unused activation code may bootstrap this member only.
  if(!member||member.activated_at!==null||!secretValid(b.password)||!same(await digest(b.password),member.activation_hash))return err(json,'invalid_login',401);
  const c=await makeCredential(b.password,now);
  credential=await env.DB.prepare('INSERT INTO app_credentials(member_id,salt,password_hash,generation,updated_at) SELECT id,?,?,?,? FROM app_members WHERE id=? AND activated_at IS NULL AND activation_hash=? ON CONFLICT(member_id) DO NOTHING RETURNING generation').bind(c.salt,c.hash,c.generation,now,member.id,member.activation_hash).first();
  if(!credential)return err(json,'credential_changed',409);
 }
 return newSession(env,{id:member.id,nickname:member.nickname},credential.generation,now,json);
}
export async function account(req,env,a,b,now,json){
 const path=new URL(req.url).pathname,member=a.member;
 const c=await env.DB.prepare('SELECT salt,password_hash,generation FROM app_credentials WHERE member_id=?').bind(member.id).first();
 if(path==='/api/account'&&req.method==='GET'){
  const rows=c?(await env.DB.prepare('SELECT id,kind,created_at,expires_at FROM app_sessions WHERE kind=\'android\' AND member_id=? AND generation=? AND expires_at>? ORDER BY created_at DESC').bind(member.id,c.generation,now).all()).results:[];
  const legacy=await env.DB.prepare('SELECT activated_at FROM app_members WHERE id=? AND token_hash IS NOT NULL').bind(member.id).first();
  return json({passwordConfigured:!!c,currentSession:a.sessionId,sessions:[...rows,...(legacy?[{id:'legacy',kind:'legacy',created_at:legacy.activated_at,expires_at:null}]:[])]});
 }
 if(req.method!=='POST')return err(json,'not_found',404);
 if(path==='/api/account/password'){
  if(!passwordValid(b?.password))return err(json,'invalid_password',400);
  if(!await allowAttempt(env,'password:'+member.id,now,6))return err(json,'rate_limited',429);
  if(c&&(!passwordValid(b.currentPassword)||!same(await passwordHash(b.currentPassword,c.salt),c.password_hash)))return err(json,'invalid_password',401);
  const next=await makeCredential(b.password,now);
  let changed;
  if(c){
   // Compare-and-swap guards concurrent changes and revoked sessions.
   changed=await env.DB.prepare('UPDATE app_credentials SET salt=?,password_hash=?,generation=?,updated_at=? WHERE member_id=? AND generation=? AND EXISTS(SELECT 1 FROM app_sessions WHERE id=? AND token_hash=? AND member_id=? AND generation=? AND expires_at>?) RETURNING generation').bind(next.salt,next.hash,next.generation,now,member.id,c.generation,a.sessionId,a.hash,member.id,c.generation,now).first();
  }else{
   changed=await env.DB.prepare('INSERT INTO app_credentials(member_id,salt,password_hash,generation,updated_at) SELECT id,?,?,?,? FROM app_members WHERE id=? AND token_hash=? ON CONFLICT(member_id) DO NOTHING RETURNING generation').bind(next.salt,next.hash,next.generation,now,member.id,a.hash).first();
  }
  if(!changed)return err(json,'credential_changed',409);
  return newSession(env,member,next.generation,now,json);
 }
 if(path==='/api/account/revoke'||path==='/api/account/logout'){
  if(!c)return err(json,'password_required',409);
  const target=path.endsWith('/logout')?a.sessionId:b?.id;
  if(typeof target!=='string'||target.length>64)return err(json,'invalid_session',400);
  if(target==='legacy')await env.DB.prepare('UPDATE app_members SET token_hash=NULL WHERE id=?').bind(member.id).run();
  else await env.DB.prepare('DELETE FROM app_sessions WHERE member_id=? AND id=?').bind(member.id,target).run();
  return json({ok:true});
 }
 return err(json,'not_found',404);
}
