const invitePattern=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const pages=new Set(['schedule','messages','me']);
export function nativeLinkForPath(path) {
 const invite=path.startsWith('/game/')?path.slice(6):'';
 const page=path.startsWith('/open/')?path.slice(6):'';
 if(invitePattern.test(invite))return 'qidongapp://game/'+invite;
 if(pages.has(page))return 'qidongapp://game/'+page;
 return null;
}
export function parseNativeLaunch(raw) {
 try {
  const u=new URL(raw);
  if(u.protocol!=='qidongapp:'||u.host!=='game'||u.username||u.password||u.search||u.hash)return null;
  const value=u.pathname.slice(1);
  if(invitePattern.test(value))return {kind:'invite',id:value};
  if(pages.has(value))return {kind:'page',page:value};
 }catch{}
 return null;
}
