import {WxPusherProvider} from './push.mjs';
const page=(body,status=200)=>new Response('<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>启动！延时通知测试</title><style>body{background:#fffbf4;color:#352b25;font:17px/1.7 system-ui,sans-serif;max-width:440px;margin:36px auto;padding:20px}main{background:white;border:1px solid #e9dfcc;border-radius:24px;padding:24px}input,button{box-sizing:border-box;width:100%;padding:12px;font:inherit;border:1px solid #c7bba9;border-radius:12px;margin:10px 0}button{background:#4e5cd6;color:white;border:0}a{color:#4e5cd6}</style><main><h1>启动！延时通知测试</h1>'+body+'</main></html>',{status,headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','Referrer-Policy':'no-referrer','Content-Security-Policy':"default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'"}});
const hash=async(value)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value))),b=>b.toString(16).padStart(2,'0')).join('');
export function configuredMembers(env){try{const m=JSON.parse(env.PROBE_MEMBERS||'[]');return Array.isArray(m)&&m.length===3&&new Set(m.map(x=>x.id)).size===3?m:[];}catch{return [];}}
export async function delayPage(req,env){
 if(req.method==='GET')return page('<p>提交后至少 60 秒，由云端每分钟调度，不需要保持启动 App 或此网页运行。请退出 App、清除其后台并锁屏，保留 WxPusher 正常运行。</p><form method="post" action="/delay" autocomplete="off"><label>个人测试凭证<input name="token" type="password" required minlength="32" maxlength="128" autocomplete="off"></label><button>预约一次延时测试</button></form>');
 if(req.method!=='POST')return page('<p>请求方式无效。</p>',405);
 try {
  const token=String((await req.formData()).get('token')||'');
  if(!/^[A-Za-z0-9_-]{32,128}$/.test(token))return page('<p>凭证无效。</p><a href="/delay">返回</a>',401);
  const digest=await hash(token),member=configuredMembers(env).find(m=>m.hash===digest&&/^m[123]$/.test(m.id)&&typeof m.spt==='string'&&m.spt.startsWith('SPT_'));
  if(!member)return page('<p>凭证无效或未配置推送。</p><a href="/delay">返回</a>',401);
  const now=Date.now();
  await env.DB.prepare("UPDATE probe_delayed SET status='expired' WHERE member_id=? AND status='queued' AND expires_at<=?").bind(member.id,now).run();
  const row=await env.DB.prepare("INSERT OR IGNORE INTO probe_delayed(id,member_id,created_at,due_at,expires_at,status) VALUES (?,?,?,?,?,'queued') RETURNING id").bind(crypto.randomUUID(),member.id,now,now+60000,now+300000).first();
  if(!row)return page('<p>已有一条等待发送的测试任务，请勿重复预约。</p>',429);
  return page('<h2>已预约，尚未发送</h2><p>现在可以关闭网页、清除启动 App 后台并锁屏。通常约 1–2 分钟后由云端尝试发送，调度可能延迟；5 分钟后未执行则过期。</p><p>请留意 WxPusher 的「启动！延时测试」通知。</p>',202);
 }catch{return page('<p>预约未确认，请勿连续提交。</p>',500);}
}
export async function runDelayed(env,now=Date.now()){
 await env.DB.prepare("UPDATE probe_delayed SET status='expired' WHERE status='queued' AND expires_at<=?").bind(now).run();
 await env.DB.prepare("UPDATE probe_delayed SET status='unknown',reason='interrupted' WHERE status='sending' AND claimed_at<=?").bind(now-120000).run();
 const rows=await env.DB.prepare("SELECT id,member_id FROM probe_delayed WHERE status='queued' AND due_at<=? AND expires_at>? ORDER BY due_at LIMIT 3").bind(now,now).all();
 for(const row of rows.results){
  const claimed=await env.DB.prepare("UPDATE probe_delayed SET status='sending',claimed_at=? WHERE id=? AND status='queued' AND due_at<=? AND expires_at>? RETURNING id").bind(Date.now(),row.id,now,Date.now()).first();
  if(!claimed)continue;
  const member=configuredMembers(env).find(x=>x.id===row.member_id);
  let result={status:'rejected',http:null,code:null,reason:'not_configured'};
  if(member&&typeof member.spt==='string'&&member.spt.startsWith('SPT_')){
   result=await new WxPusherProvider().sendDetailed({spt:member.spt,url:'https://qidongapp-probe.rainy256.workers.dev/probe',delayed:true});
  }
  await env.DB.prepare("UPDATE probe_delayed SET status=?,provider_http=?,provider_code=?,reason=?,finished_at=? WHERE id=? AND status='sending'").bind(result.status,result.http,result.code,result.reason,Date.now(),row.id).run();
 }
}
