require('fs').mkdirSync(require('path').join(__dirname,'results'),{recursive:true});
const fs=require('fs'),http=require('http'),path=require('path'),assert=require('assert'),{chromium}=require('playwright');
const root=require('path').resolve(__dirname,'..');
const server=http.createServer((req,res)=>{const file=path.join(root,new URL(req.url,'http://localhost').pathname);try{const body=fs.readFileSync(file.endsWith('/')?file+'index.html':file);res.setHeader('Content-Type',file.endsWith('.css')?'text/css':file.endsWith('.js')?'text/javascript':'text/html');res.end(body)}catch{res.statusCode=404;res.end('Missing')}});
async function main(){await new Promise(r=>server.listen(8765,'127.0.0.1',r));const browser=await chromium.launch({headless:true,executablePath:process.env.RESTAURANT_CHROMIUM_PATH||(fs.existsSync('/tmp/chromium')?'/tmp/chromium':undefined),args:['--no-sandbox']});let checks=0;const context=await browser.newContext({serviceWorkers:'block',hasTouch:process.env.COMPACT_TOUCH==='1'});const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
await context.route('https://**',route=>route.fulfill({status:200,body:'',contentType:'text/javascript'}));
await context.route('**/scripts/restaurant-auth123.js*',route=>route.fulfill({body:'window.restaurantAuth123={shared:true,connect:async()=>window.mockDb};',contentType:'text/javascript'}));
await page.addInitScript(()=>{const owner='11111111-1111-4111-8111-111111111111';const item='22222222-2222-4222-8222-222222222222',cooked='88888888-8888-4888-8888-888888888888';const data={profiles:[{id:owner,full_name:'Test Cashier',role:'admin',status:'active'}],restaurant_members121:[],restaurant_presentation121:[],menu_categories104:[],menu_items104:[],pos_stock118:[],menu_ingredients105:[{id:'33333333-3333-4333-8333-333333333333',version:1,data:{code:'I',name:'Dry taco ingredients',currency:'LAK',unit:'kg',cost:30000,inventoryItemId118:item,inventoryFactor118:1}}],inventory_items104:[{id:item,data:{code:'I',name:'Dry taco ingredients',currency:'LAK',unit:'kg',cost:30000}},{id:cooked,data:{code:'C',name:'Cooked taco filling',currency:'LAK',unit:'kg',prepared124:true,cost:60000,fullPreparedCost124:80000}}],inventory_movements104:[{id:'receipt',data:{itemId:item,kind:'in',quantity:10,cost:30000},created_at:'2026-10-09T01:00:00Z'},{id:'production',data:{itemId:cooked,kind:'in',quantity:2,cost:60000},created_at:'2026-10-09T01:00:00Z'}],restaurant_batches124:[{id:'44444444-4444-4444-8444-444444444444',output_item_id:cooked,data:{name:'Taco filling',date:'2026-10-09',outputQuantity:2,stockUnit:'kg',currency:'LAK',ingredientTotal:120000,fullTotal:160000,ingredientUnitCost:60000,fullUnitCost:80000,cookingAdditionPercent:100/3,costMode:'actual'}}],restaurant_waste124:[]};window.mockFixtures=data;window.mockDb={auth:{onAuthStateChange(){},getSession:async()=>({data:{session:{user:{id:owner,email:'test@example.com'}}}}),signOut:async()=>({})},from(table){const q={select(){return q},order(){return q},eq(){return q},maybeSingle:async()=>({data:data[table]?.[0]||null}),single:async()=>({data:data[table]?.[0]||null}),then(resolve){return Promise.resolve({data:data[table]||[]}).then(resolve)}};return q},rpc:async()=>({error:{message:'failed to fetch'}})};window.supabase={};window.OJM_SUPABASE_URL='https://fixture.supabase.co';});
await page.goto('http://127.0.0.1:8765/');await page.waitForFunction(()=>document.querySelector('#restaurantApp')?.hidden===false);await page.evaluate(()=>switchTab('inv-preparation124'));await page.waitForFunction(()=>!!window.kitchen124);
const tabs=['restaurant-overview','inv-overview','inv-items','inv-stock-in','inv-stock-out','inv-adj','inv-val','inv-preparation124','inv-waste124','menu-ingredients','menu-recipe','menu-pricing','menu-categories','menu-costing','menu-engineering108','menu-avail','restaurant-settings'];
const touch=process.env.COMPACT_TOUCH==='1',results=[];
for(const [w,h,label] of [[1440,1000,'desktop'],[834,1194,'ipad'],[390,844,'phone']]){
 await page.setViewportSize({width:w,height:h});
 await page.waitForFunction(()=>innerWidth>1024||document.querySelector('#appSidebar').getBoundingClientRect().right<=0);
 async function inspect(name){
  await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
  const result=await page.evaluate(()=>{
   const active=document.querySelector('.tab-content.active'),r=active.getBoundingClientRect();
   const headings=[...active.querySelectorAll('h1,h2,h3')].filter(e=>e.getBoundingClientRect().height).map(e=>({text:e.textContent,size:parseFloat(getComputedStyle(e).fontSize)}));
   const bad=headings.filter(e=>e.size>20.1);
   const banner=active.querySelector('.area-banner113');
   return {overflow:document.documentElement.scrollWidth>innerWidth+1,activeOverflow:r.right>innerWidth+1,bad,heading:headings[0],banner:banner&&getComputedStyle(banner).display!=='none'?banner.getBoundingClientRect().height:0};
  });
  assert(!result.overflow,name+' page overflow at '+w);assert(!result.activeOverflow,name+' panel overflow at '+w);assert.equal(result.bad.length,0,name+' oversized headings');checks+=3;
  if(result.banner){assert(result.banner<=96.1,name+' tall banner');checks++}
  results.push({label,name,touch,...result});
 }
 for(const tab of tabs){await page.evaluate(id=>switchTab(id),tab);await inspect(tab)}
 for(const setting of ['branding','users','security']){await page.locator('[data-settings121="'+setting+'"]').click();await inspect('settings-'+setting)}
 await page.evaluate(()=>switchTab('pos118'));
 for(const tab of ['Overview','Management']){await page.evaluate(t=>{pos118.state.tab=t;pos118.render()},tab);await inspect('pos-'+tab)}
 await page.evaluate(()=>{pos118.state.tab='Sales';pos118.state.sub='New Order';pos118.render()});await inspect('pos-New Order');
 assert.equal(await page.locator('#menu-engineering108').count(),1);checks++;
 const add=page.locator('.pos-product118').first();assert(await add.isVisible());checks++;
 await add.click();await page.waitForSelector('[data-pos118="add"]');
 await page.locator('[data-pos118="add"]').click();
 if(touch){const size=await page.locator('.pos-qty118 button').first().boundingBox();assert(size.height>=44&&size.width>=44,'small touch quantity');checks++}
 await page.evaluate(()=>{document.activeElement?.blur();return new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(()=>{document.querySelector('.workspace-scroll').scrollTop=0;r()})))});const catalog=await page.locator('.pos-catalog118').boundingBox();assert(catalog.width>100,'catalog visible');checks++;
 if(touch||label==='desktop')await page.screenshot({path:path.join(__dirname,'results','compact-pos-'+label+(touch?'-touch':'')+'.png'),fullPage:true});
 if(label==='phone'){const layout=await page.evaluate(()=>({content:document.querySelector('.workspace-scroll').getBoundingClientRect().bottom,bar:document.querySelector('#workspaceTools108').getBoundingClientRect().top}));assert(layout.content<=layout.bar+1,'phone toolbar covers content');checks++}
 await page.locator('#posFullscreen122').click();await page.waitForSelector('[data-exit-focus122]');await inspect('pos-fullscreen');assert.equal(await page.locator('.module-header').isVisible(),false);checks++;await page.locator('[data-exit-focus122]').click();
 for(const sub of ['Open Orders','Receipts','Online Orders']){await page.evaluate(t=>{pos118.state.sub=t;pos118.render()},sub);await inspect('pos-'+sub)}
 await page.evaluate(()=>switchTab('inv-preparation124'));await page.evaluate(()=>{document.activeElement?.blur();return new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(()=>{document.querySelector('.workspace-scroll').scrollTop=0;r()})))});if(touch||label==='desktop')await page.screenshot({path:path.join(__dirname,'results','compact-preparation-'+label+(touch?'-touch':'')+'.png'),fullPage:true});
}
assert.deepEqual(errors,[]);checks++;console.log(checks+' compact layout checks passed ('+(touch?'touch':'mouse')+')');
fs.writeFileSync(path.join(__dirname,'results','compact-results'+(touch?'-touch':'')+'.json'),JSON.stringify({checks,status:'passed',results},null,2));
await browser.close();server.close()}
main().catch(e=>{console.error(e);server.close();process.exit(1)});
