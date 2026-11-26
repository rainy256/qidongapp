import {WxPusherProvider} from './push.mjs';
const headers={'Access-Control-Allow-Origin':'https://localhost','Access-Control-Allow-Headers':'Authorization, Content-Type','Access-Control-Allow-Methods':'POST, OPTIONS','Cache-Control':'no-store','Content-Type':'application/json; charset=utf-8'};
const json=(value,status=200)=>new Response(JSON.stringify(value),{status,headers});
async function hash(value){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value))),b=>b.toString(16).padStart(2,'0')).join('');}
export default {async fetch(req,env){
 const url=new URL(req.url);
 if(url.pathname==='/probe'&&req.method==='GET')return new Response('<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>启动！设备验证</title><h1>启动！设备验证</h1><p>这里没有任何成员数据。</p><a href="qidongapp://game/probe">打开测试 App</a></html>',{headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','Content-Security-Policy':"default-src 'none'; frame-ancestors 'none'"}});
 if(url.pathname!=='/api/probe')return json({error:'not_found'},404);
 if(req.method==='OPTIONS')return new Response(null,{status:204,headers});
 if(req.method!=='POST')return json({error:'method'},405);
 try{
  const auth=req.headers.get('Authorization')||'';
  if(!/^Bearer [A-Za-z0-9_-]{32,128}$/.test(auth))return json({error:'unauthorized'},401);
  const digest=await hash(auth.slice(7));
  const members=JSON.parse(env.PROBE_MEMBERS||'[]');
  if(!Array.isArray(members)||members.length!==3||new Set(members.map(m=>m.id)).size!==3)return json({error:'not_configured'},503);
  const member=members.find(m=>m.hash===digest&&/^m[123]$/.test(m.id));
  if(!member)return json({error:'unauthorized'},401);
  if(typeof member.spt!=='string'||!member.spt.startsWith('SPT_'))return json({error:'not_configured'},503);
  const body=await req.json().catch(()=>null);
  if(!body||!['scheme','https'].includes(body.mode))return json({error:'invalid_mode'},400);
  const now=Date.now();
  const r=await env.DB.prepare('INSERT INTO probe_rate(member_id,last_at) VALUES (?,?) ON CONFLICT(member_id) DO UPDATE SET last_at=excluded.last_at WHERE probe_rate.last_at<=?').bind(member.id,now,now-60000).run();
  if(r.meta.changes!==1)return json({error:'rate_limited'},429);
  const target=body.mode==='scheme'?'qidongapp://game/probe':url.origin+'/probe';
  const outcome=await new WxPusherProvider().sendDetailed({spt:member.spt,url:target});
  await env.DB.prepare('INSERT INTO probe_attempts(id,member_id,created_at,mode,status,provider_http,provider_code,reason,recipient_code) VALUES (?,?,?,?,?,?,?,?,?)').bind(crypto.randomUUID(),member.id,now,body.mode,outcome.status,outcome.http,outcome.code,outcome.reason,outcome.recipientCode??null).run();
  return json({status:outcome.status},outcome.status==='accepted'?200:502);
 }catch{return json({error:'request_failed'},500);}
}};
