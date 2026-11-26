import {mutationValid} from './logic.mjs';

export function availabilityDeadline(choice, previous, now) {
 if(choice==='end')return null;
 const start=Math.max(now,previous??0);
 if(choice==='1h'||choice==='2h')return start+(choice==='1h'?3600000:7200000);
 if(choice==='tonight'){
  const tonight=Math.floor((now+28800000)/86400000)*86400000-28800000+23*3600000;
  if(tonight>start)return tonight;
 }
 throw Error('invalid_availability');
}

const view=(row,now)=>({available_until:row.available_until>now?row.available_until:null,availability_revision:row.availability_revision,now});
export async function availabilityApi(env,me,b,now){
 if(!mutationValid(b.mutation)||!Number.isSafeInteger(b.revision)||b.revision<0)return {status:400,value:{error:'invalid_availability'}};
 const read=()=>env.DB.prepare('SELECT available_until,availability_revision,availability_mutation FROM app_members WHERE id=?').bind(me.id).first();
 const current=await read();
 if(current.availability_mutation===b.mutation)return {status:200,value:view(current,now)};
 if(current.availability_revision!==b.revision)return {status:409,value:{error:'availability_conflict'}};
 let until;
 try{until=availabilityDeadline(b.choice,current.available_until,now);}catch{return {status:400,value:{error:'invalid_availability'}};}
 const saved=await env.DB.prepare('UPDATE app_members SET available_until=?,availability_revision=availability_revision+1,availability_mutation=? WHERE id=? AND availability_revision=? RETURNING available_until,availability_revision').bind(until,b.mutation,me.id,b.revision).first();
 if(saved)return {status:200,value:view(saved,now)};
 const latest=await read();
 return latest.availability_mutation===b.mutation?{status:200,value:view(latest,now)}:{status:409,value:{error:'availability_conflict'}};
}
