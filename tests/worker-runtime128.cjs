const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),scope='https://fixture.test/Restaurant-Back-Office/';let count=0;
const check=async(name,fn)=>{await fn();console.log('PASS',name);count++};
(async()=>{
 const events={},entries=new Map(),key=x=>String(x.url||x),cache={put:async(k,v)=>entries.set(key(k),v.clone()),match:async(k)=>entries.get(key(k))?.clone()};let offline=false,activated=false;
 const c={URL,Request,Response,AbortController,setTimeout,clearTimeout,console,caches:{open:async()=>cache,keys:async()=>['oonjai-pos-shell127-restaurant','oonjai-pos-shell137-restaurant'],delete:async()=>true},self:{registration:{scope},location:{origin:new URL(scope).origin},clients:{claim:async()=>{}},skipWaiting(){activated=true},addEventListener(n,fn){events[n]=fn}},fetch:async input=>{
  if(offline)throw Error('offline');const u=new URL(key(input));if(u.origin!==new URL(scope).origin)return new Response('external');
  const relative=u.pathname.slice(new URL(scope).pathname.length);const file=path.join(root,relative.endsWith('/')?relative+'index.html':relative||'index.html');
  if(!fs.existsSync(file))return new Response('Missing '+relative,{status:404});return new Response(fs.readFileSync(file));
 }};
 vm.createContext(c);vm.runInContext(fs.readFileSync(root+'/restaurant-sw137.js','utf8'),c);
 await check('The new worker installs only when every required local asset exists',async()=>{let promise;events.install({waitUntil:p=>promise=p});await promise;assert(activated);for(const page of ['','back-office/','pos/','kitchen/'])assert(entries.has(scope+page));});
 const navigate=async path=>{let promise;events.fetch({request:{url:scope+path,method:'GET',mode:'navigate'},respondWith:p=>promise=p});return promise};offline=true;
 await check('Offline Back Office keeps its correct asset base even with a workspace query',async()=>{const response=await navigate('back-office/?workspace=pos');assert((await response.text()).includes('<base href="../">'));});
 await check('Offline POS and Kitchen keep their intended workspace redirects',async()=>{for(const area of ['pos','kitchen']){const response=await navigate(area+'/');assert((await response.text()).includes('?workspace='+area));}});
 await check('Offline root and named index routes retain the correct shell',async()=>{assert(!(await (await navigate('index.html')).text()).includes('<base href="../">'));assert((await (await navigate('back-office/index.html')).text()).includes('<base href="../">'));});
 await check('Public website and database calls never receive the staff app fallback',async()=>{
  for(const url of [scope+'public-restaurant/',scope+'public-restaurant/storefront127.js','https://project.supabase.co/rest/v1/storefront_items127','https://project.supabase.co/auth/v1/user']){let handled=false;events.fetch({request:{url,method:'GET',mode:'navigate'},respondWith(){handled=true}});assert.equal(handled,false);}
 });
 await check('Unknown routes fail rather than displaying a broken staff shell',async()=>await assert.rejects(navigate('missing/page/'),/offline/));
 console.log('COMPLETE',count);
})().catch(e=>{console.error(e);process.exit(1)});
