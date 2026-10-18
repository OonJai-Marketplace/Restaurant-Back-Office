const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');let count=0;
const check=async(name,fn)=>{await fn();console.log('PASS',name);count++};
const database=range=>({from:table=>{assert.equal(table,'inventory_items104');return {select:()=>({order:()=>({range})})}}});
const source=fs.readFileSync(root+'/scripts/pos-v118.js','utf8');
const links=source.slice(source.indexOf('async function links()'),source.indexOf('\nasync function exportRows('));
function context(){const c={console,setTimeout,clearTimeout,structuredClone,sessionEpoch121:1,liveProfile:{id:'admin'},isAdmin121:()=>true,admin:()=>true,S:{sample:false,items:[],ingredients:[{id:'ingredient',data:{name:'Rice',unit:'kg'}}]},n:Number,esc:String,document:{addEventListener(){}},addEventListener(){},dialog:(title,html)=>{c.html=html}};c.window=c;vm.createContext(c);vm.runInContext(fs.readFileSync(root+'/scripts/pos-performance125.js','utf8'),c);vm.runInContext(links,c);return c}
(async()=>{
 await check('Ingredient editor loads unlinked Inventory items outside the cashier snapshot and pages the complete list',async()=>{
  const c=context(),ranges=[];c.ojmDb=database(async(a,b)=>{ranges.push([a,b]);return {data:a===0?Array.from({length:1000},(_,i)=>({id:'stock-'+i,data:{name:'Item '+i,unit:'kg'}})):[{id:'last-stock',data:{name:'Last item',unit:'kg'}}]}});
  await c.links();assert.deepEqual(ranges,[[0,999],[1000,1999]]);assert(c.html.includes('value="stock-0"'));assert(c.html.includes('value="last-stock"'));assert.equal(c.S.items.length,0);
 });
 await check('Ingredient editor discards a response after account changes and rejects staff access',async()=>{
  const c=context();c.ojmDb=database(async()=>{c.liveProfile={id:'other'};return {data:[]}});await c.links();assert.equal(c.html,undefined);c.admin=()=>false;await assert.rejects(c.links(),/Administrator access/);
 });
 await check('Inventory read errors reach the UI action error handler without opening an empty editor',async()=>{
  const c=context();c.ojmDb=database(async()=>({error:{message:'Offline'},data:null}));await assert.rejects(c.links(),/Offline/);assert.equal(c.html,undefined);
 });
 await check('Setup notice counts unique required ingredients, bundle components and available options',async()=>{
  const c=context(),p=c.posPerformance125,s={loaded:true,sample:false,menu:[{id:'base',data:{currency:'LAK',recipe:[{itemId:'rice'},{itemId:'rice'},{itemId:'linked'}],posOptions118:[{options:[{recipe:[{itemId:'extra'}]},{available:false,recipe:[{itemId:'disabled'}]}]}]}},{id:'bundle',data:{currency:'LAK',itemType:'bundle',recipe:[{itemId:'base'}]}},{id:'nonstock',data:{currency:'LAK',posNoStock118:true,recipe:[]}},{id:'inactive',data:{active:false,currency:'LAK',recipe:[{itemId:'inactive-ingredient'}]}}],ingredients:[{id:'linked',data:{inventoryItemId118:'stock'}}]};
  assert.equal(p.missingLinks129(s),2);assert(p.setupNotice129(s).includes('2 recipe ingredients'));assert(p.setupNotice129(s).includes('data-pos118="links"'));c.isAdmin121=()=>false;assert(!p.setupNotice129(s).includes('<button'));assert(p.setupNotice129(s).includes('administrator'));assert.equal(p.setupNotice129({...s,sample:true}),'');assert.equal(p.setupNotice129({...s,loaded:false}),'');assert.equal(p.setupNotice129({...s,ingredients:[...s.ingredients,{id:'rice',data:{inventoryItemId118:'rice-stock'}},{id:'extra',data:{inventoryItemId118:'extra-stock'}}]}),'');
 });
 await check('Payment error accurately explains a missing Inventory link for online and offline orders',async()=>{
  const c=context();vm.runInContext(source.slice(source.indexOf('function recipeUsage124('),source.indexOf('\nfunction pendingStock(')),c);c.S.menu=[{id:'menu',data:{recipe:[{itemId:'ingredient',quantity:1}]}}];assert.throws(()=>c.recipeUsage124({lines:[{menuId:'menu',quantity:1}]}),/^Error: Link the selected ingredients to Inventory before payment$/);
 });
 console.log('COMPLETE',count);
})().catch(e=>{console.error(e);process.exit(1)});
