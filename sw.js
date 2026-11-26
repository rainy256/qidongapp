const CACHE='qidong-pwa-offline-v1';
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.add('/app/offline.html')).then(()=>self.skipWaiting())));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('qidong-pwa-')&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',event=>{
 const r=event.request,u=new URL(r.url);
 if(r.method!=='GET'||u.origin!==self.location.origin||!u.pathname.startsWith('/app/'))return;
 if(r.mode==='navigate'){event.respondWith(fetch(r).catch(()=>caches.match('/app/offline.html').then(x=>x||Response.error())));}
 // Do not cache API responses, credentials, HTML or personal data. Assets use ordinary HTTP caching.
});
