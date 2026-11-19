/* Static assets only. Private records stay in account-scoped device storage. */
const CACHE='oonjai-pos-shell158-restaurant';
const ROOT=new URL('./',self.registration.scope),PREFIX=ROOT.pathname;
const ASSETS=__OFFLINE_ASSETS__;
self.addEventListener('install',event=>event.waitUntil(self.skipWaiting()));
self.addEventListener('activate',event=>event.waitUntil(self.clients.claim()));
let warming;
self.addEventListener('message',event=>{
 if(event.data?.type!=='CACHE_SHELL150')return;
 if(!warming)warming=(async()=>{const cache=await caches.open(CACHE),pending=ASSETS.slice();
  const previous=(await caches.keys()).filter(key=>key!==CACHE&&key.startsWith('oonjai-pos-shell')&&key.endsWith('-restaurant')).reverse();
  async function reuseVersioned(url){
   if(!url.searchParams.has('v')||!url.pathname.match(/\.(js|css)$/))return false;
   for(const key of previous){const saved=await (await caches.open(key)).match(url);if(saved){await cache.put(url,saved);return true}}
   return false;
  }
  async function next(){while(pending.length){const url=new URL(pending.shift(),ROOT);if(await cache.match(url)||await reuseVersioned(url))continue;const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),12000);try{const response=await fetch(url,{cache:'no-cache',signal:controller.signal});if(response.ok)await cache.put(url,response)}catch{}finally{clearTimeout(timer)}}}
  await Promise.all([next(),next()]);
 })().finally(()=>{warming=null});
 event.waitUntil(warming);
});
self.addEventListener('fetch',event=>{
 const request=event.request,url=new URL(request.url);
 if(request.method!=='GET'||url.origin!==ROOT.origin||!url.pathname.startsWith(PREFIX)||url.pathname.startsWith(new URL('public-restaurant/',ROOT).pathname))return;
 const staticAsset=/\.(?:css|js|png|jpg|jpeg|webp|svg|woff2?|webmanifest)$/i.test(url.pathname);
 if(!staticAsset&&request.mode!=='navigate')return;
 const response=(async()=>{
  const cache=await caches.open(CACHE);let hit=await cache.match(request);
  if(staticAsset&&!url.pathname.endsWith('.webmanifest')){
   if(hit)return hit;
   for(const key of await caches.keys())if(key!==CACHE&&key.startsWith('oonjai-pos-shell')&&key.endsWith('-restaurant')){const prior=await(await caches.open(key)).match(request);if(prior)return prior}
  }
  if(!hit&&request.mode==='navigate'){
   const relative=url.pathname.slice(PREFIX.length),entry=/^(?:index\.html)?$/.test(relative)?'./':/^(back-office|pos|kitchen)\/(?:index\.html)?$/.test(relative)?relative.split('/')[0]+'/':null;
   if(entry)hit=await cache.match(new URL(entry,ROOT));
  }
  const download=fetch(request,staticAsset&&!url.pathname.endsWith('.webmanifest')?{}:{cache:'no-cache'}).then(async result=>{if(result.ok){try{await cache.put(request,result.clone());if(request.mode==='navigate'){const clean=new URL(url);clean.search='';await cache.put(clean,result.clone())}}catch{}}return result});
  event.waitUntil(download.then(()=>{},()=>{}));
  if(!hit)return download;
  let timer;try{return await Promise.race([download.catch(()=>hit),new Promise(resolve=>{timer=setTimeout(()=>resolve(hit),2000)})])}finally{clearTimeout(timer)}
 })();event.respondWith(response);
});
