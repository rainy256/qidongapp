import {MEMBER_IDS,GAMES,mutationValid,dayStart,replyColumn} from './logic.mjs';
const cols='id,creator,game,title,from_slot,to_slot,state,r1,r2,r3,revision,created_at,updated_at';
const ok=(value,status=200)=>({value,status});
const bad=(error,status=400)=>ok({error},status);
export async function reservationApi(env,me,path,b,now){
 const db=env.DB;
 if(path==='/api/reservations'){
  if(!mutationValid(b.mutation)||!Object.hasOwn(GAMES,b.game)||!Number.isSafeInteger(b.from)||!Number.isSafeInteger(b.to)||b.from*1800000<=now||b.to<=b.from||b.to>dayStart(now)+336)return bad('invalid_reservation');
  const title=b.game==='custom'&&typeof b.title==='string'?b.title.trim():GAMES[b.game];if(!title||title.length>32)return bad('invalid_title');
  const prev=await db.prepare('SELECT '+cols+' FROM app_reservations WHERE creator=? AND mutation=?').bind(me.id,b.mutation).first();if(prev)return ok({reservation:prev});
  const flags=MEMBER_IDS.map(id=>id===me.id?1:0);
  const row=await db.prepare("INSERT INTO app_reservations(id,creator,mutation,game,title,from_slot,to_slot,r1,r2,r3,created_at,updated_at) SELECT ?,?,?,?,?,?,?,?,?,?,?,? WHERE NOT EXISTS(SELECT 1 FROM app_reservations WHERE state<>'cancelled' AND from_slot<? AND to_slot>?) ON CONFLICT(creator,mutation) DO NOTHING RETURNING "+cols).bind(crypto.randomUUID(),me.id,b.mutation,b.game,title,b.from,b.to,...flags,now,now,b.to,b.from).first();
  if(row)return ok({reservation:row},201);
  const retry=await db.prepare('SELECT '+cols+' FROM app_reservations WHERE creator=? AND mutation=?').bind(me.id,b.mutation).first();return retry?ok({reservation:retry}):bad('reservation_conflict',409);
 }
 const m=path.match(/^\/api\/reservations\/([0-9a-f-]{36})\/(confirm|cancel|change)$/);if(!m)return bad('not_found',404);
 if(!Number.isSafeInteger(b.revision))return bad('invalid_revision');
 let row;
 if(m[2]==='confirm'){
  const col=replyColumn(me.id),others=MEMBER_IDS.filter(x=>x!==me.id).map(replyColumn);
  row=await db.prepare("UPDATE app_reservations SET "+col+"=1,state=CASE WHEN "+others.map(x=>x+'=1').join(' AND ')+" THEN 'confirmed' ELSE 'pending' END,revision=revision+1,updated_at=? WHERE id=? AND revision=? AND state='pending' AND "+col+"=0 AND from_slot*1800000>? RETURNING "+cols).bind(now,m[1],b.revision,now).first();
 }else if(m[2]==='cancel'){
  row=await db.prepare("UPDATE app_reservations SET state='cancelled',revision=revision+1,updated_at=? WHERE id=? AND revision=? AND state<>'cancelled' AND from_slot*1800000>? RETURNING "+cols).bind(now,m[1],b.revision,now).first();
 }else{
  if(!Number.isSafeInteger(b.from)||!Number.isSafeInteger(b.to)||b.from*1800000<=now||b.to<=b.from||b.to>dayStart(now)+336)return bad('invalid_reservation');
  const flags=MEMBER_IDS.map(id=>id===me.id?1:0);
  row=await db.prepare("UPDATE app_reservations SET from_slot=?,to_slot=?,state='pending',r1=?,r2=?,r3=?,revision=revision+1,updated_at=? WHERE id=? AND revision=? AND state<>'cancelled' AND from_slot*1800000>? AND NOT EXISTS(SELECT 1 FROM app_reservations other WHERE other.id<>app_reservations.id AND other.state<>'cancelled' AND other.from_slot<? AND other.to_slot>?) RETURNING "+cols).bind(b.from,b.to,...flags,now,m[1],b.revision,now,b.to,b.from).first();
 }
 return row?ok({reservation:row}):bad('revision_conflict_or_unavailable',409);
}
