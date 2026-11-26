const HOST='qidong.apexdaishi.xyz';
const PREFIX='/app-api/';
const HEADERS={'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','Access-Control-Allow-Origin':'https://localhost','Access-Control-Allow-Headers':'Authorization, Content-Type','Access-Control-Allow-Methods':'GET, POST, OPTIONS','Vary':'Origin'};
const fail=(error,status)=>new Response(JSON.stringify({error}),{status,headers:HEADERS});
export default {async fetch(req,env){
 const u=new URL(req.url);
 if(u.hostname!==HOST||u.protocol!=='https:'||!u.pathname.startsWith(PREFIX))return fail('not_found',404);
 if(!['GET','POST','OPTIONS'].includes(req.method))return fail('method_not_allowed',405);
 const suffix=u.pathname.slice(PREFIX.length);
 if(!/^[a-zA-Z0-9_-]+(?:\/[a-zA-Z0-9_-]+)*$/.test(suffix)||suffix.startsWith('web/'))return fail('not_found',404);
 const target=new URL('https://qidongapp.apexdaishi.xyz/api/'+suffix);
 target.search=u.search;
 const h=new Headers();
 for(const k of ['Authorization','Content-Type','Origin','Access-Control-Request-Method','Access-Control-Request-Headers']){const v=req.headers.get(k);if(v!==null)h.set(k,v);}
 try{
  const response=await env.APP.fetch(new Request(target,{method:req.method,headers:h,body:req.method==='POST'?req.body:undefined,duplex:'half',redirect:'manual'}));
  const headers=new Headers(response.headers);headers.delete('Set-Cookie');headers.set('Cache-Control','no-store');
  return new Response(response.body,{status:response.status,headers});
 }catch{return fail('upstream_unavailable',503);}
}};
