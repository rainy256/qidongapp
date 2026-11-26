import {decryptSpt} from './spt.mjs';
export class WxPusherProvider{
 constructor(fetcher=(...args)=>globalThis.fetch(...args)){this.fetcher=fetcher;}
 async send(spt,content,url){
  try{const res=await this.fetcher('https://wxpusher.zjiecode.com/api/send/message/simple-push',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({spt,content,summary:'启动！',contentType:1,...(url?{url}:{})}),signal:AbortSignal.timeout(10000)});
   if(res.status===429)return {status:'retry',http:429,code:null};
   if(!res.ok)return {status:'unknown',http:res.status,code:null};
   const j=await res.json();const code=Number.isInteger(j?.code)?j.code:null;
   return {status:code===1000&&j.success!==false&&(!Array.isArray(j.data)||j.data.every(x=>x.code===1000))?'accepted':code===null?'unknown':'rejected',http:res.status,code};
  }catch{return {status:'unknown',http:null,code:null};}
 }
}
export function quietNow(start,end,now){if(start==null||end==null)return false;const m=Math.floor((now+28800000)/60000)%1440;return start<end?m>=start&&m<end:m>=start||m<end;}
export async function drainPush(env,now=Date.now()){
 await env.DB.prepare("UPDATE app_push_jobs SET status='expired' WHERE status='queued' AND expires_at<=?").bind(now).run();
 await env.DB.prepare("UPDATE app_push_jobs SET status='unknown',finished_at=? WHERE status='sending' AND claimed_at<?").bind(now,now-120000).run();
 const jobs=await env.DB.prepare("SELECT id FROM app_push_jobs WHERE status='queued' AND due_at<=? AND expires_at>? ORDER BY due_at LIMIT 12").bind(now,now).all();
 for(const j of jobs.results){
  const at=Date.now();
  const job=await env.DB.prepare("UPDATE app_push_jobs SET status='sending',attempts=attempts+1,claimed_at=? WHERE id=? AND status='queued' AND due_at<=? AND expires_at>? AND NOT EXISTS(SELECT 1 FROM app_push_jobs q WHERE q.member_id=app_push_jobs.member_id AND q.id<>app_push_jobs.id AND q.status IN ('sending','accepted','confirmed','unknown','rejected') AND q.claimed_at>?) RETURNING *").bind(at,j.id,at,at,at-15000).first();
  if(!job)continue;
  let result={status:'unknown',http:null,code:null};
  try{
   const pref=await env.DB.prepare('SELECT quiet_start,quiet_end FROM app_push_preferences WHERE member_id=?').bind(job.member_id).first();
   const binding=await env.DB.prepare('SELECT spt_cipher FROM app_push_bindings WHERE member_id=?').bind(job.member_id).first();
   if(job.expires_at<=Date.now())result.status='expired';
   else if(job.kind!=='test'&&quietNow(pref?.quiet_start,pref?.quiet_end,Date.now()))result.status='muted';
   else if(!binding)result.status='unbound';
   else {const spt=await decryptSpt(env,job.member_id,binding.spt_cipher);const url=job.invite_id?'https://qidongapp.rainy256.workers.dev/game/'+job.invite_id:undefined;result=await new WxPusherProvider().send(spt,job.content,url);}
  }catch{result.status='unknown';}
  if(result.status==='retry'&&job.attempts<3&&Date.now()+60000<job.expires_at){
   await env.DB.prepare("UPDATE app_push_jobs SET status='queued',due_at=?,provider_http=?,provider_code=? WHERE id=? AND status='sending'").bind(Date.now()+60000*job.attempts,result.http,result.code,job.id).run();
  }else{
   await env.DB.prepare("UPDATE app_push_jobs SET status=?,finished_at=?,provider_http=?,provider_code=? WHERE id=? AND status='sending'").bind(result.status==='retry'?'rejected':result.status,Date.now(),result.http,result.code,job.id).run();
  }
 }
}
