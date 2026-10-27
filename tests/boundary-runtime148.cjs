const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');let count=0;
const source=p=>fs.readFileSync(path.join(root,p),'utf8');
const check=async(name,fn)=>{await fn();count++;console.log('PASS',name)};
(async()=>{
 await check('Framed staff pages stop before loading authentication or registering a worker',async()=>{
  const children=[],c={URL,window:{self:{},top:{}},document:{baseURI:'https://example.test/Restaurant/',createElement:tag=>({tag}),body:{replaceChildren:(...nodes)=>children.push(...nodes)}}};
  vm.runInNewContext(source('scripts/restaurant-bootstrap148.js'),c);
  assert.equal(children.length,2);assert.match(children[0].textContent,/own browser tab/);assert.equal(children[1].rel,'noopener noreferrer');
 });
 await check('Authentication refuses a frame even when the bundle is loaded directly',async()=>{
  let calls=0;const c={URL,window:{self:{},top:{}},supabase:{createClient(){calls++}},OJM_SUPABASE_URL:'https://fixture.supabase.co',OJM_SUPABASE_ANON_KEY:'public'};
  vm.runInNewContext(source('scripts/restaurant-auth123.js'),c);
  await assert.rejects(c.window.restaurantAuth123.connect(),/own browser tab/);assert.equal(calls,0);
 });
 await check('Top-level staff authentication retains its existing session key and single client',async()=>{
  let calls=0,options;const w={},client={},c={URL,window:w,supabase:{createClient(_url,_key,o){calls++;options=o;return client}},OJM_SUPABASE_URL:'https://fixture.supabase.co',OJM_SUPABASE_ANON_KEY:'public'};w.self=w;w.top=w;
  vm.runInNewContext(source('scripts/restaurant-auth123.js'),c);
  assert.equal(await w.restaurantAuth123.connect(),client);assert.equal(await w.restaurantAuth123.connect(),client);assert.equal(calls,1);assert.equal(options.auth.storageKey,'oonjai-restaurant-fixture-auth123');
 });
 await check('Current HTML loads the new guard and bundle, while retaining the POS release',async()=>{
  for(const p of ['index.html','back-office/index.html']){const html=source(p);assert(html.includes(source('scripts/restaurant-bootstrap148.js')));assert(html.includes('2026-10-27-security-boundary-148'));}
  assert(source('scripts/restaurant-core148.bundle.js').includes("frame.setAttribute('sandbox','allow-scripts allow-forms allow-popups')"));
  assert(source('scripts/restaurant-modules125.js').includes('restaurant-pos147.bundle.js'));
 });
 await check('Public entry and scripts do not initialize staff authentication',async()=>{
  for(const p of ['public-restaurant/index.html','public-restaurant/storefront127.js','public-restaurant/promotions146.js'])assert(!/restaurantAuth123|restaurant-core\d+|createClient\(/.test(source(p)));
 });
 await check('New executable files parse',async()=>{
  for(const p of ['scripts/restaurant-bootstrap148.js','scripts/restaurant-core148.bundle.js','restaurant-sw148.js'])new vm.Script(source(p),{filename:p});
 });
 await check('The public form initializes with secure randomness when storage and randomUUID are unavailable',async()=>{
  const field=()=>({value:'',checked:false,textContent:'',style:{}}),fields={};
  for(const key of ['#message','#name','#hopeConsent183','statusMsg','wordCounter','submitBtn'])fields[key]=field();
  const form={querySelector:key=>fields[key],addEventListener(){}};
  let randomCalls=0;
  const c={window:{},Uint8Array,document:{getElementById:id=>id==='customForm'?form:fields[id]},crypto:{getRandomValues:a=>{randomCalls++;return require('crypto').webcrypto.getRandomValues(a)}},localStorage:{getItem(){throw Error('Sandboxed')},setItem(){throw Error('Sandboxed')}}};
  vm.runInNewContext(source('public-restaurant/hope183.js'),c);c.window.OonJaiHopePublic183.setup();
  assert.equal(randomCalls,2);assert.equal(fields.wordCounter.textContent,'0 / 1,500 characters');
 });
 console.log('COMPLETE',count);
})().catch(e=>{console.error(e);process.exit(1)});
