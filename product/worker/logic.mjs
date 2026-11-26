export const MEMBER_IDS=['m1','m2','m3'];
export const REPLIES=['ready','5','10','30','no'];
export const GAMES={apex:'Apex',gta:'GTA',tarkov:'塔科夫',custom:'自定义'};
export const SLOT_MS=1800000;
export const dayStart=(now)=>Math.floor((now+8*3600000-6*3600000)/86400000)*48-4; // Shanghai 06:00 UTC slot
export function normalizeSchedule(picks,now){
 if(!Array.isArray(picks)||picks.length>56)throw Error('invalid_schedule');
 const from=dayStart(now),to=from+7*48;
 const out=picks.map(x=>{
  if(!x||!Number.isSafeInteger(x.from)||!Number.isSafeInteger(x.to)||x.from<from||x.to>to||x.from>=x.to)throw Error('invalid_schedule');
  return {from:x.from,to:x.to};
 }).sort((a,b)=>a.from-b.from||a.to-b.to);
 const merged=[];for(const p of out){const last=merged.at(-1);if(last&&p.from<=last.to)last.to=Math.max(last.to,p.to);else merged.push(p);}
 return merged;
}
export function replyColumn(id){if(!MEMBER_IDS.includes(id))throw Error('invalid_member');return 'r'+id[1];}
export const mutationValid=(v)=>typeof v==='string'&&/^[a-zA-Z0-9_-]{16,80}$/.test(v);
export const secretValid=(v)=>typeof v==='string'&&/^[A-Za-z0-9_-]{32,128}$/.test(v);
export async function digest(value){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value))),v=>v.toString(16).padStart(2,'0')).join('');}
export function newToken(){return Array.from(crypto.getRandomValues(new Uint8Array(32)),v=>v.toString(16).padStart(2,'0')).join('');}
export function inviteView(row,now){return {...row,status:row.expires_at<=now?'expired':row.r1==='ready'&&row.r2==='ready'&&row.r3==='ready'?'assembled':'pending'};}
