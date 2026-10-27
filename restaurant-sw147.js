/* Immediate upgrade; cache static files without imposing a short network deadline. */
const CACHE='oonjai-pos-shell147-restaurant';
const ROOT=new URL('./',self.registration.scope),PREFIX=ROOT.pathname;
self.addEventListener('install',event=>event.waitUntil(self.skipWaiting()));
self.addEventListener('activate',event=>event.waitUntil(self.clients.claim()));
// Retain earlier caches for tabs still running an older release. No private stores are changed.
self.addEventListener('message',event=>{
 if(event.data?.type!=='CACHE_SHELL147')return;
 event.waitUntil((async()=>{const cache=await caches.open(CACHE);for(const file of ['./','back-office/','pos/','kitchen/','scripts/restaurant-core147.bundle.js'])try{const url=new URL(file,ROOT),response=await fetch(url,{cache:'reload'});if(response.ok)await cache.put(url,response)}catch{}})());
});
self.addEventListener('fetch',event=>{
 const request=event.request,url=new URL(request.url);
 if(request.method!=='GET'||url.origin!==ROOT.origin||!url.pathname.startsWith(PREFIX)||url.pathname.startsWith(new URL('public-restaurant/',ROOT).pathname))return;
 const staticAsset=/\.(?:css|js|png|jpg|jpeg|webp|svg|woff2?|webmanifest)$/i.test(url.pathname);
 if(!staticAsset&&request.mode!=='navigate')return;
 event.respondWith((async()=>{
  const cache=await caches.open(CACHE),hit=await cache.match(request);
  if(staticAsset){if(hit)return hit;for(const key of await caches.keys()){if(key!==CACHE&&key.startsWith('oonjai-pos-shell')&&key.endsWith('-restaurant')){const prior=await (await caches.open(key)).match(request);if(prior)return prior}}}
  try{const response=await fetch(request,staticAsset?{}:{cache:'no-cache'});if(response.ok){try{await cache.put(request,response.clone())}catch{/* Storage pressure must not break an otherwise successful download. */}}return response}
  catch(error){if(hit)return hit;
   if(request.mode==='navigate'){
    const relative=url.pathname.slice(PREFIX.length),entry=/^(?:index\.html)?$/.test(relative)?'./':/^(back-office|pos|kitchen)\/(?:index\.html)?$/.test(relative)?relative.split('/')[0]+'/':null;
    if(entry){const shell=await cache.match(new URL(entry,ROOT));if(shell)return shell}
   }
   throw error;
  }
 })());
});
