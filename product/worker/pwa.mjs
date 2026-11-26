const ART=/^art\/(?:bg-wallpaper\.jpg|hero-runner\.png|game-(?:apex|gta|tarkov|custom)\.png)$/;
const ASSET=/^assets\/[A-Za-z0-9_.-]+\.(?:js|css|png|jpg|webp|svg|woff2?)$/;
const STATIC=new Set(['index.html','offline.html','manifest.webmanifest','sw.js','icons/icon-192.png','icons/icon-512.png']);
const CSP="default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; worker-src 'self'; manifest-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'; object-src 'none'";
const baseHeaders={'X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','Content-Security-Policy':CSP};
export function staticName(path){
 const p=path==='/app/'?'index.html':path.startsWith('/app/')?path.slice(5):path.startsWith('/art/')?path.slice(1):'';
 return STATIC.has(p)||ART.test(p)||ASSET.test(p)?p:null;
}
const types={html:'text/html; charset=utf-8',js:'application/javascript; charset=utf-8',css:'text/css; charset=utf-8',webmanifest:'application/manifest+json; charset=utf-8',png:'image/png',jpg:'image/jpeg',webp:'image/webp',svg:'image/svg+xml',woff:'font/woff',woff2:'font/woff2'};
export async function pwaStatic(req,env){
 const name=staticName(new URL(req.url).pathname);
 if(!name)return new Response('Not found',{status:404,headers:{...baseHeaders,'Cache-Control':'no-store'}});
 try{
  if(!env.PWA_ASSETS)return new Response('网页版资源尚未部署。',{status:503,headers:{...baseHeaders,'Content-Type':'text/plain; charset=utf-8','Cache-Control':'no-store'}});
  const {value,metadata}=await env.PWA_ASSETS.getWithMetadata(name,{type:'arrayBuffer'});
  if(!value)return new Response('资源不存在，请重新打开网页。',{status:404,headers:{...baseHeaders,'Content-Type':'text/plain; charset=utf-8','Cache-Control':'no-store'}});
  const headers={...baseHeaders,'Content-Type':metadata?.type||types[name.split('.').pop()]||'application/octet-stream','Cache-Control':ASSET.test(name)?'public, max-age=31536000, immutable':ART.test(name)?'public, max-age=86400':'no-store'};
  return new Response(value,{headers});
 }catch{return new Response('网页版资源读取失败，请重新连接。',{status:503,headers:{...baseHeaders,'Content-Type':'text/plain; charset=utf-8','Cache-Control':'no-store'}});}
}
export function pwaLanding(path){
 const invite=path.match(/^\/game\/([0-9a-f-]{36})$/)?.[1],page=path.match(/^\/open\/(schedule|me|messages)$/)?.[1];
 if(!invite&&!page)return null;
 const web=invite?'/app/?invite='+invite:'/app/?page='+page;
 const native='qidongapp://game/'+(invite||page);
 return new Response('<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>启动！</title><style>body{background:#fffbf4;color:#2f2622;font:17px system-ui;max-width:440px;margin:0 auto;padding:32px}a{display:block;margin:16px 0;padding:16px;border-radius:14px;background:#4e5cd6;color:white;text-align:center;text-decoration:none}a:last-of-type{background:#eef1ff;color:#3b47b0}</style><h1>启动！</h1><p>选择适合你的设备的打开方式。</p><a href="'+web+'">直接使用网页版（鸿蒙推荐）</a><a href="'+native+'">打开已安装的 Android App</a><p>请先绑定自己的身份。链接中不包含私人数据。</p></html>',{headers:{...baseHeaders,'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'}});
}
export function webCookie(req){const m=(req.headers.get('Cookie')||'').split(';').map(x=>x.trim()).find(x=>x.startsWith('__Secure-qidong_session='));return m?m.slice('__Secure-qidong_session='.length):'';}
export function sessionCookie(token){return '__Secure-qidong_session='+token+'; Path=/api; Max-Age=31536000; HttpOnly; Secure; SameSite=Strict';}
export function validWebWrite(req){return req.headers.get('Origin')===new URL(req.url).origin&&(req.headers.get('Content-Type')||'').split(';')[0].trim().toLowerCase()==='application/json';}
