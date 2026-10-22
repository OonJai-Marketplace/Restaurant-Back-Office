const fs=require('fs'),http=require('http'),path=require('path'),assert=require('node:assert/strict'),{chromium}=require('playwright');
const root=path.resolve(__dirname,'..');
const server=http.createServer((req,res)=>{const name=path.join(root,new URL(req.url,'http://localhost').pathname);try{const body=fs.readFileSync(name.endsWith('/')?name+'index.html':name);res.setHeader('Content-Type',name.endsWith('.js')?'text/javascript':name.endsWith('.css')?'text/css':'text/html');res.end(body)}catch{res.statusCode=404;res.end('Missing')}});
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch({headless:true,executablePath:'/tmp/chromium',args:['--no-sandbox']});
 try{
 const context=await browser.newContext({serviceWorkers:'block'});await context.route(/^https:\/\//,route=>route.fulfill({status:200,body:'{}',contentType:'application/json'}));
 const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:'+server.address().port+'/');await page.waitForFunction(()=>window.restaurantCoreReady143);
 await page.evaluate(()=>{
  liveProfile={id:'11111111-1111-4111-8111-111111111111',full_name:'Local test',role:'admin',status:'active'};
  const menu=[15000,33000,42000,null].map((cost,i)=>({id:'m'+i,data:{name:'Test item '+(i+1),currency:'LAK',price:50000,active:true,recipe:cost===null?[]:[{itemId:'i'+i,quantity:1}]}}));
  const ingredients=[15000,33000,42000].map((cost,i)=>({id:'i'+i,data:{name:'Ingredient '+i,currency:'LAK',cost}}));
  const records={menu_items104:menu,menu_ingredients105:ingredients,menu_categories104:[],restaurant_sales_plans143:[]};
  window.fixture143={records,orders:[],deny:false};
  ojmDb={from(name){let insert=null,update=null,filter=null,single=false;const q={select(){return q},maybeSingle(){single=true;return q},order(){return q},range(){return q},insert(v){insert=v;return q},update(v){update=v;return q},eq(k,v){if(k==='id')filter=v;return q},abortSignal(){return q},then(resolve){if(fixture143.deny)return resolve({error:{message:'Permission denied'}});if(insert){const row={...insert,id:'plan1',version:1};records[name].push(row);return resolve({data:[row]})}if(update){const row=records[name].find(r=>r.id===filter);Object.assign(row,update);return resolve({data:[row]})}return resolve({data:single?(name==='profiles'?liveProfile:null):(records[name]||[])})}};return q},rpc(){return {abortSignal(){return this},then(resolve){return resolve({data:fixture143.orders})}}}};
  document.getElementById('loginGate').hidden=true;document.getElementById('restaurantApp').hidden=false;syncNav121();
 });
 await page.locator('#nav-module-sales button').click();await page.waitForSelector('#salesBody143');assert.match(await page.locator('#salesBody143').innerText(),/No recorded sales/);
 await page.getByRole('button',{name:'Promotion planner',exact:true}).click();
 const body=page.locator('#salesBody143');assert.match(await body.innerText(),/1 meet target/);assert.match(await body.innerText(),/1 loss/);assert.match(await body.innerText(),/1 incomplete/);
 await body.locator('select[name=type]').selectOption('amount');await body.locator('input[name=value]').fill('10000');assert.match(await body.innerText(),/25,000 LAK/);
 await body.locator('input[name=query]').fill('Test item 4');assert.equal(await body.locator('tbody tr').count(),1);assert.match(await body.innerText(),/No saved recipe quantities/);await body.locator('input[name=query]').fill('');
 await body.locator('input[name=name]').fill('Local scenario');await body.getByRole('button',{name:'Save as new scenario'}).click();assert.match(await page.locator('#salesError143').innerText(),/Scenario saved/);
 await page.getByRole('button',{name:'Campaign comparison',exact:true}).click();assert.match(await body.innerText(),/Not available/);
 await page.getByRole('button',{name:'Restaurant returns',exact:true}).click();await body.locator('input[name=overhead]').fill('100000');await body.locator('input[name=capital]').fill('1000000');await body.locator('input[name=capital]').press('Tab');assert.match(await body.innerText(),/Not available/);
 await page.getByRole('button',{name:'Promotion planner',exact:true}).click();await body.locator('input[name=value]').fill('60000');assert.match(await body.innerText(),/Invalid offer/);
 await body.locator('input[name=value]').fill('10000');await page.setViewportSize({width:390,height:844});await page.evaluate(()=>closeMobileNavigation());await page.waitForFunction(()=>document.getElementById('appSidebar').getBoundingClientRect().right<=0);await page.locator('#salesPlannerResults143').scrollIntoViewIfNeeded();
 await page.screenshot({path:'/tmp/restaurant-sales143-mobile.png',fullPage:true});
 assert.equal(await page.locator('.sales-desktop-table143').isVisible(),false,'Desktop table is hidden on phones');
 const cards=page.locator('.sales-mobile-cards143');assert.equal(await cards.isVisible(),true);assert.equal(await cards.locator('.sales-mobile-card143').count(),4);
 const cellsFit=await cards.evaluate(el=>[...el.querySelectorAll('.sales-mobile-cell143')].every(cell=>cell.getBoundingClientRect().right<=el.getBoundingClientRect().right+2));assert.equal(cellsFit,true,'Phone cards retain every cost and result');
 const overflow=await page.locator('#restaurant-sales143').evaluate(el=>el.scrollWidth>el.clientWidth+2);assert.equal(overflow,false,'No workspace overflow outside the table');
 await page.setViewportSize({width:1440,height:1000});assert.equal(await cards.isVisible(),false);assert.equal(await page.locator('.sales-desktop-table143').isVisible(),true);await page.screenshot({path:'/tmp/restaurant-sales143-desktop.png',fullPage:true});
 await page.evaluate(()=>{liveProfile.role='staff';syncNav121()});assert.equal(await page.locator('#nav-module-sales').isVisible(),false);assert.equal(await page.evaluate(()=>restaurantRouteAllowed128('restaurant-sales143')),false);
 await page.evaluate(()=>clearRestaurantSession());assert.equal(await page.locator('#restaurant-sales143').innerHTML(),'');
 assert.deepEqual(errors,[]);console.log('PASS real app navigation, empty sales, discount modes, loss/missing-cost states, filtering, save, return gaps, mobile width, admin route and logout cleanup');
 }finally{await browser.close();server.close()}
})().catch(e=>{console.error(e);server.close();process.exit(1)});
