// Input is the existing three-member recommendation engine's complete-cohort
// intervals. Merge adjacent intervals (including logical-day boundaries), then
// subtract non-cancelled reservations before selecting one hour per free run.
export function rebookOptions(candidates,reservations,now,limit=3){
 const first=Math.floor(now/1800000)+1;
 const spans=candidates.filter(c=>c.missingPlayers===0&&c.memberIds.length===3).map(c=>({from:Math.max(first,c.firstStart),to:c.availableUntil})).filter(s=>s.to>s.from).sort((a,b)=>a.from-b.from||a.to-b.to);
 const merged=[];
 for(const s of spans){const last=merged.at(-1);if(last&&s.from<=last.to)last.to=Math.max(last.to,s.to);else merged.push({...s});}
 const blocked=reservations.filter(r=>r.state!=='cancelled').sort((a,b)=>a.from_slot-b.from_slot);
 const choices=[];
 for(const s of merged){
  let cursor=s.from;
  for(const b of blocked){
   if(b.to_slot<=cursor)continue;
   if(b.from_slot>=s.to)break;
   if(b.from_slot-cursor>=2)choices.push({from:cursor,to:cursor+2});
   cursor=Math.max(cursor,b.to_slot);
   if(cursor>=s.to)break;
  }
  if(s.to-cursor>=2)choices.push({from:cursor,to:cursor+2});
 }
 return choices.slice(0,limit);
}
