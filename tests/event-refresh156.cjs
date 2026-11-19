/* Trigger and idle regression checks using the production modules and synthetic records. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const {JSDOM} = require('jsdom');
const read = path => fs.readFileSync(path, 'utf8');
const flush = async () => { for (let i=0;i<20;i++) await Promise.resolve(); };

async function storefront(){
 const dom=new JSDOM('<div id="tab-home" class="tab-pane active"></div><div class="cart-total"></div><span id="totalPrice"></span>',{runScripts:'outside-only',url:'https://restaurant.test',pretendToBeVisual:true});
 const w=dom.window, timers=new Map(),fetches=[];let id=0;
 w.setInterval=()=>{throw Error('Storefront installed a polling loop')};
 w.setTimeout=(fn,ms)=>{timers.set(++id,{fn,ms});return id};w.clearTimeout=id=>timers.delete(id);
 w.App={promotionCart146:()=>[],_reRenderStore(){},switchMainTab(){},executeWA(){},executeMessenger(){},_buildOrderMsg(){}};
 w.OJM_SUPABASE_URL='https://fixture.test';w.OJM_SUPABASE_ANON_KEY='public';
 w.eval(read('scripts/promotion-kit146.js'));let rows=[];
 w.fetch=async url=>{fetches.push(url);return {ok:true,json:async()=>rows}};
 w.eval(read('public-restaurant/promotions146.js'));await new Promise(resolve=>setImmediate(resolve));await flush();
 assert.equal(fetches.length,1);assert.equal(timers.size,0,'no timers when there are no offers');
 w.App._reRenderStore();w.App._reRenderStore();await flush();assert.equal(timers.size,0);
 const end=new Date(Date.now()+120000).toISOString();
 rows=[{id:'one',version:1,data:{...w.PromotionKit146.defaults(),title:'Lunch',placement:'popup',delay:10,ends:end}}];
 w.dispatchEvent(new w.Event('online'));w.dispatchEvent(new w.Event('online'));await flush();
 assert.equal(fetches.length,2,'overlapping reconnect requests are shared');
 assert.equal(timers.size,1);assert([...timers.values()][0].ms<=10001,'one timer for the scheduled popup');
 Object.defineProperty(w.document,'hidden',{configurable:true,value:true});w.document.dispatchEvent(new w.Event('visibilitychange'));assert.equal(timers.size,0);
 dom.window.close();console.log('PASS storefront idle, cart, reconnect, delayed offer and hidden-tab behavior');
}

async function register(){
 const jobs=new Map(),notices=[],reads=[],renders=[];let serial=0,respond,hold=false;
 const state={loaded:true,owner:'one',menu:[{id:'a'}],items:[],ingredients:[],categories:[],orders:[],offlineQueue:[],schema125:true,catalogVersion125:'old',tab:'Sales',sub:'New Order',picked:'a'};
 const ctx={liveProfile:{id:'one'},sessionEpoch121:1,navigator:{onLine:true},AbortController,Date,Intl,
  document:{hidden:false,activeElement:null,addEventListener(){},querySelector:q=>q==='#pos118'?{classList:{contains:()=>true}}:null},addEventListener(){},
  setTimeout(fn,ms){jobs.set(++serial,{fn,ms});return serial},clearTimeout(id){jobs.delete(id)},
  posOffline119:{queue:async()=>[],saveSnapshot:async()=>{}},
  restaurantHome139:{invalidate:()=>notices.push('home')},restaurantSales143:{invalidate:()=>notices.push('sales')},
  BroadcastChannel:class{constructor(){ctx.channel=this}postMessage(v){ctx.messages.push([...v.scopes])}},messages:[],
  ojmDb:{rpc(name,args){if(name!=='pos_cashier_snapshot125')return Promise.resolve({data:{}});reads.push(args.p_catalog_version);return new Promise(resolve=>{respond=()=>resolve({data:{orders:[],schema125:true,catalogVersion125:'v'+reads.length,menu:[{id:'a'}]}});if(!hold)respond()})}},
  pos118:{state,render(){renders.push(true)},prepareReceiptNumbers:async()=>{}}
 };
 ctx.window=ctx;vm.createContext(ctx);for(const name of ['restaurant-data144','pos-performance125'])vm.runInContext(read('scripts/'+name+'.js'),ctx);
 const api=ctx.posPerformance125,hooks={overlayPending(){},catalog:()=>state.menu,pick(){}};
 ctx.pos118.load=opts=>api.load(state,hooks,opts);
 async function next(){const pending=[...jobs.entries()].filter(([,t])=>t.ms===200);assert.equal(pending.length,1);const [id,t]=pending[0];jobs.delete(id);t.fn();await flush()}
 const emit=(scope)=>ctx.channel.onmessage({data:{scopes:scope}});
 await api.rpc('pos_order118',{p_action:'save'});assert.deepEqual(ctx.messages.pop(),['orders']);assert.equal(notices.length,0);
 await api.rpc('pos_order118',{p_action:'pay'});assert.deepEqual(ctx.messages.pop(),['orders','sales','stock']);assert(notices.includes('home'));
 await api.rpc('pos_order118',{p_action:'refund',p_data:{restock:false}});assert.deepEqual(ctx.messages.pop(),['orders','sales']);
 await api.rpc('pos_manage118',{p_action:'config'});assert.deepEqual(ctx.messages.pop(),['config']);
 emit(['website']);assert.equal(jobs.size,0);
 emit(['catalog']);emit(['config']);hold=true;await next();assert.deepEqual(reads,[null]);
 emit(['catalog']);respond();await flush();assert.equal(state.catalogVersion125,null);
 hold=false;await next();assert.deepEqual(reads,[null,null]);assert.equal(jobs.size,0);assert(!api.stale(state));
 ctx.document.hidden=true;emit(['stock']);assert.equal(jobs.size,0);assert(api.stale(state));
 console.log('PASS register writes, coalesced reads, edits during a read, and hidden register');
}

async function kitchen(){
 const src=read('scripts/preparation-waste124.js');let history=0,stock=0,dirty=false;
 const ctx={Date,Intl,AbortController,Set,Promise,sessionEpoch121:1,liveProfile:{id:'one'},navigator:{onLine:true},restaurantCan:()=>true,
  menuStore108:{state:{loaded:true,ledgerLoaded144:true,owner:'one'},async load(force){if(force||dirty)stock++;dirty=false}},
  queueFor:async()=>[],readHistory141:async()=>{history++;return []},local:async()=>{},render(){}};
 ctx.window=ctx;vm.createContext(ctx);
 const vars=src.slice(src.indexOf('const M='),src.indexOf('const localDate='));
 const auth=src.slice(src.indexOf('const current='),src.indexOf('async function sync()'));
 const load=src.slice(src.indexOf('async function load('),src.indexOf('function batchPreview'));
 vm.runInContext(vars+auth+load+';globalThis.k={load,K,reset,invalidate}',ctx);
 await ctx.k.load();assert.equal(history,2);await ctx.k.load();assert.equal(history,2);assert.equal(stock,1);
 dirty=true;ctx.k.invalidate(new Set(['stock']));await ctx.k.load();assert.equal(stock,2);assert.equal(history,2);
 ctx.k.invalidate(new Set(['kitchen','stock']));await ctx.k.load();assert.equal(history,4);
 await ctx.k.load(true);assert.equal(history,6);ctx.k.reset();assert.equal(ctx.k.K.owner,null);assert.equal(ctx.k.K.loaded,false);
 console.log('PASS Kitchen re-entry, stock-only changes, new history, explicit refresh, and logout');
}
(async()=>{await storefront();await register();await kitchen()})().catch(e=>{console.error(e);process.exitCode=1});
