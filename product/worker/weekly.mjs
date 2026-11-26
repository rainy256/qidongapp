import {dayStart,normalizeSchedule} from './logic.mjs';
const clip=(spans,from,to)=>spans.map(p=>({from:Math.max(from,p.from),to:Math.min(to,p.to)})).filter(p=>p.to>p.from);
const merge=spans=>{const out=[];for(const p of spans.sort((a,b)=>a.from-b.from||a.to-b.to)){const last=out.at(-1);if(last&&p.from<=last.to)last.to=Math.max(last.to,p.to);else out.push({...p});}return out;};
export const weekday=slot=>new Date(slot*1800000+28800000).getUTCDay();
export function normalizeTemplate(items){
 if(!Array.isArray(items)||items.length>56)throw Error('invalid_template');
 const out=[];for(let day=0;day<7;day++){
  const spans=items.filter(x=>x?.day===day).map(x=>{if(!Number.isInteger(x.from)||!Number.isInteger(x.to)||x.from<0||x.to>48||x.to<=x.from)throw Error('invalid_template');return {from:x.from,to:x.to};});
  out.push(...merge(spans).map(p=>({day,...p})));
 }if(items.some(x=>!x||!Number.isInteger(x.day)||x.day<0||x.day>6))throw Error('invalid_template');
 return out;
}
export function effectiveSchedule(row,now){
 const start=dayStart(now),picks=JSON.parse(row.schedule_json||'[]'),template=JSON.parse(row.template_json||'[]'),overrides=new Set(JSON.parse(row.override_days_json||'[]'));
 const out=[];for(let i=0;i<7;i++){const day=start+i*48;if(overrides.has(day)||clip(picks,day,day+48).length&&!row.template_json){out.push(...clip(picks,day,day+48));}else{out.push(...template.filter(x=>x.day===weekday(day)).map(x=>({from:day+x.from,to:day+x.to})));}}
 return merge(out);
}
export function updateOverrides(row,picks,now){
 const target=normalizeSchedule(picks,now),before=effectiveSchedule(row,now),start=dayStart(now),days=new Set(JSON.parse(row.override_days_json||'[]').filter(x=>x>=start&&x<start+336)),stored=JSON.parse(row.schedule_json||'[]');
 let out=[];for(let i=0;i<7;i++){const day=start+i*48,a=clip(before,day,day+48),b=clip(target,day,day+48);
 if(JSON.stringify(a)!==JSON.stringify(b)){days.add(day);out.push(...b);}else if(days.has(day)){out.push(...clip(stored,day,day+48));}}
 return {picks:merge(out),days:[...days].sort((a,b)=>a-b)};
}
export async function ownSchedule(env,id){return env.DB.prepare('SELECT m.schedule_json,m.schedule_revision,m.schedule_mutation,w.template_json,w.override_days_json FROM app_members m LEFT JOIN app_weekly w ON m.id=w.member_id WHERE m.id=?').bind(id).first();}
export async function writeWeekly(env,id,revision,mutation,template,days,picks){
 const db=env.DB;
 const result=await db.batch([
 db.prepare("UPDATE app_members SET schedule_json=?,schedule_revision=schedule_revision+1,schedule_mutation=? WHERE id=? AND schedule_revision=? AND COALESCE(schedule_mutation,'')<>? RETURNING schedule_revision").bind(JSON.stringify(picks),mutation,id,revision,mutation),
 db.prepare("UPDATE app_weekly SET template_json=?,override_days_json=? WHERE member_id=? AND EXISTS(SELECT 1 FROM app_members WHERE id=? AND schedule_revision=? AND schedule_mutation=?)").bind(JSON.stringify(template),JSON.stringify(days),id,id,revision+1,mutation)
 ]);
 return result[0].results[0]||null;
}
