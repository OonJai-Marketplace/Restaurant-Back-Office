/* Cache static working code independently from private API data and authentication. */
const CACHE='oonjai-pos-shell140-restaurant';
const MODULES=["scripts/restaurant-integration132.js?v=140","scripts/public-content127.js?v=140","vendor/supabase-2.118.0.js?v=140", "scripts/restaurant-home139.js?v=140", "scripts/supabase-config.js?v=140", "scripts/workspace-config123.js?v=140", "scripts/restaurant-auth123.js?v=140", "scripts/restaurant-backoffice.js?v=140", "scripts/restaurant-permissions125.js?v=140", "scripts/restaurant-modules125.js?v=140", "scripts/restaurant-shell122.js?v=140", "scripts/workspace-links123.js?v=140", "scripts/restaurant-accounting124.js?v=140", "styles/pos-v118.css", "styles/inventory-menu-v104.css", "styles/preparation-waste124.css", "scripts/pos-offline-v119.js", "scripts/pos-performance125.js", "scripts/pos-v118.js", "scripts/restaurant-settings125.js", "scripts/inventory-menu-v104.js", "scripts/item-icons-v109.js", "scripts/menu-v108.js", "scripts/preparation-waste124.js"];
const external=['cdn.jsdelivr.net','i.postimg.cc','fonts.googleapis.com','fonts.gstatic.com'];
self.addEventListener('install',event=>event.waitUntil((async()=>{
 const cache=await caches.open(CACHE),root=new URL('./',self.registration.scope),page=await fetch(root,{cache:'reload'});
 if(!page.ok)throw Error('App shell unavailable');const html=await page.clone().text();await cache.put(root,page);
 const files=[...html.matchAll(/(?:src|href)="([^"]+)"/g)].map(m=>m[1].replaceAll('&amp;','&')).filter(v=>!v.startsWith('data:'));
 files.push(...MODULES,'back-office/','pos/','kitchen/');
 const queue=[...new Set(files.map(v=>/^(scripts|styles)\/.*\.(js|css)$/.test(v)?v+'?v=140':v))];
 async function worker(){while(queue.length){const url=new URL(queue.shift(),root);if(url.origin!==root.origin)continue;
  try{const result=await fetch(url,{cache:'reload'});if(result.ok||result.type==='opaque')await cache.put(url,result);else if(url.origin===root.origin)throw Error('Missing application asset')}
  catch(e){if(url.origin===root.origin)throw e}
 }}
 await Promise.all([worker(),worker(),worker()]);self.skipWaiting();
})()));
self.addEventListener('activate',event=>event.waitUntil((async()=>{
 await Promise.all((await caches.keys()).filter(k=>k.startsWith('oonjai-pos-shell')&&k!==CACHE).map(k=>caches.delete(k)));await self.clients.claim();
})()));
self.addEventListener('fetch',event=>{
 const request=event.request,url=new URL(request.url),local=url.origin===self.location.origin;
 if(url.pathname.startsWith(new URL('public-restaurant/',self.registration.scope).pathname))return;
 if(request.method!=='GET'||(!local&&!external.includes(url.hostname))||url.pathname.includes('/rest/v1/')||url.pathname.includes('/auth/v1/'))return;
 if(local&&!url.pathname.startsWith(new URL(self.registration.scope).pathname))return;
 const staticAsset=!local||/\.(?:css|js|png|jpg|jpeg|webp|svg|woff2?|webmanifest)$/i.test(url.pathname);
 event.respondWith((async()=>{
  const cache=await caches.open(CACHE),hit=await cache.match(request,{ignoreSearch:false});
  if(staticAsset&&hit)return hit;
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),4000);
  try{const response=await fetch(request,{signal:controller.signal});if(response.ok||response.type==='opaque')await cache.put(request,response.clone());return response}
  catch(e){
   if(hit)return hit;
   if(request.mode==='navigate'){
    const relative=url.pathname.slice(new URL(self.registration.scope).pathname.length);
    const entry=/^(?:index\.html)?$/.test(relative)?'./':/^(back-office|pos|kitchen)\/(?:index\.html)?$/.test(relative)?relative.split('/')[0]+'/':null;
    const shell=entry&&await cache.match(new URL(entry,self.registration.scope));if(shell)return shell;
   }
   throw e;
  }
  finally{clearTimeout(timer)}
 })());
});
