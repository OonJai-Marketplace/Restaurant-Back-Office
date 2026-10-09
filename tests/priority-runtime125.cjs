const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('assert');const root=path.resolve(__dirname,'..');let checks=0;
async function serviceWorker(){const origin='https://fixture.example',scope=origin+'/Restaurant/',events={},entries=new Map();let networkCalls=0,failAsset=false,activated=false;
 const key=x=>String(x.url||x),cache={put:async(k,v)=>entries.set(key(k),v),match:async(k,{ignoreSearch=false}={})=>{const normalized=new URL(key(k));if(ignoreSearch)normalized.search='';for(const [url,response] of entries){const stored=new URL(url);if(ignoreSearch)stored.search='';if(stored.href===normalized.href)return response.clone()}},};
 const c={URL,Request,Response,AbortController,setTimeout,clearTimeout,console,caches:{open:async()=>cache,keys:async()=>[],delete:async()=>true},self:{registration:{scope},location:{origin},clients:{claim:async()=>{}},skipWaiting(){activated=true},addEventListener(n,f){events[n]=f}},fetch:async(url)=>{networkCalls++;url=key(url);if(failAsset&&url.includes('pos-performance125'))return new Response('missing',{status:404});if(new URL(url).pathname==='/Restaurant/')return new Response(fs.readFileSync(root+'/index.html'));return new Response('asset')}};
 vm.createContext(c);vm.runInContext(fs.readFileSync(root+'/pos-sw119.js','utf8'),c);let installation;events.install({waitUntil:p=>installation=p});await installation;
 assert(activated);assert([...entries.keys()].some(k=>k.endsWith('/scripts/restaurant-settings125.js')));assert([...entries.keys()].some(k=>k.endsWith('/scripts/preparation-waste124.js')));checks+=3;
 const before=networkCalls;let response;events.fetch({request:new Request(scope+'scripts/pos-v118.js?v=125'),respondWith:p=>response=p});assert.equal((await response).status,200);assert.equal(networkCalls,before);checks+=2;
 response=null;events.fetch({request:new Request('https://fixture.supabase.co/auth/v1/user'),respondWith:p=>response=p});assert.equal(response,null);checks++;
 response=null;events.fetch({request:new Request(scope+'scripts/pos-v118.js',{method:'POST'}),respondWith:p=>response=p});assert.equal(response,null);checks++;
 failAsset=true;activated=false;events.install({waitUntil:p=>installation=p});await assert.rejects(installation,/Missing application asset/);assert.equal(activated,false);checks+=2;
}
async function deadline(){const timers=[],context={window:{},console,AbortController,setTimeout:f=>{timers.push(f);return timers.length},clearTimeout(){},document:{addEventListener(){}},addEventListener(){},ojmDb:{rpc(){return {abortSignal(signal){return new Promise((_,reject)=>signal.addEventListener('abort',()=>reject(Error('AbortError'))))}}}}};
 vm.createContext(context);vm.runInContext(fs.readFileSync(root+'/scripts/pos-performance125.js','utf8'),context);
 const call=context.window.posPerformance125.rpc('pos_order118',{});timers[0]();await assert.rejects(call,/Network request timed out/);checks++;
}
(async()=>{await serviceWorker();await deadline();console.log(checks+' offline asset and request deadline checks passed')})().catch(e=>{console.error(e);process.exit(1)});
