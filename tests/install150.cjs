/* Synthetic accounts only. External services are blocked throughout. */
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..');
const server=http.createServer((req,res)=>{
 const url=new URL(req.url,'http://localhost');let file=path.join(root,url.pathname.replace(/^\/Restaurant\//,''));
 if(file.endsWith('/'))file+='index.html';
 try{res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':file.endsWith('.webmanifest')?'application/manifest+json':file.endsWith('.png')?'image/png':'text/html');res.end(fs.readFileSync(file));}catch{res.writeHead(404);res.end('Missing');}
});
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port+'/Restaurant/';
 const browser=await chromium.launch({executablePath:'/tmp/scanner-chrome/chromium',headless:true,args:['--no-sandbox']});
 try{
  for(const [name,userAgent] of [['Android','Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36'],['iPhone','Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1']]){
   const ctx=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,userAgent});
   await ctx.route(/^https:\/\//,r=>r.fulfill({status:200,contentType:'application/json',body:'{}'}));
   const page=await ctx.newPage(),errors=[],scripts=[];page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(r.url().endsWith('.js'))scripts.push(r.url());});
   await page.goto(base+'pos/');await page.waitForFunction(()=>window.restaurantCoreReady150);
   assert.equal(new URL(page.url()).pathname,'/Restaurant/pos/');assert.equal(new URL(page.url()).searchParams.get('workspace'),'pos');
   const manifestURL=await page.locator('link[rel=manifest]').evaluate(el=>el.href);
   const manifest=await (await ctx.request.get(manifestURL)).json();
   assert.equal(new URL(manifest.id,manifestURL).pathname,'/Restaurant/pos/');
   assert.equal(manifest.short_name,'POS');assert.equal(manifest.display,'standalone');
   assert.equal(new URL(manifest.start_url,manifestURL).pathname,'/Restaurant/pos/');
   assert.equal(await page.locator('meta[name=apple-mobile-web-app-title]').getAttribute('content'),'POS');
   for(const icon of manifest.icons)assert.equal((await ctx.request.get(new URL(icon.src,manifestURL).href)).status(),200);
   await page.evaluate(async()=>{
    const owner='11111111-1111-4111-8111-111111111111';
    ojmDb={from(name){const q={select(){return q},eq(){return q},maybeSingle(){return q},order(){return q},range(){return q},abortSignal(){return q},then(resolve){resolve({data:name==='profiles'?{id:owner,full_name:'Synthetic cashier',role:'admin',status:'active'}:name==='restaurant_members121'?null:[]});}};return q;},rpc(){const q={abortSignal(){return q},then(resolve){resolve({data:[]});}};return q;}};
    await hydrateCore132({user:{id:owner,email:'fixture@example.test'}});
   });
   await page.waitForSelector('#pos118.active',{state:'attached'});
   assert(scripts.some(s=>s.includes('restaurant-pos150.bundle.js')));
   assert(!scripts.some(s=>/restaurant-(inventory|settings|sales|readiness).*\.js/.test(s)),'POS launch does not download administration modules');
   await page.waitForFunction(()=>navigator.serviceWorker.controller?.scriptURL.endsWith('restaurant-sw150.js'));
   await page.waitForFunction(async()=>{const c=await caches.open('oonjai-pos-shell150-restaurant');return !!await c.match(new URL('pos/',document.baseURI));});
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+2),false);
   await ctx.setOffline(true);await page.reload();await page.waitForFunction(()=>window.restaurantCoreReady150);
   assert.equal(new URL(page.url()).pathname,'/Restaurant/pos/');
   assert.deepEqual(errors,[]);console.log('PASS '+name+' launch metadata, independent identity, cashier route, lazy modules and cached offline shell');await ctx.close();
  }
  const office=JSON.parse(fs.readFileSync(path.join(root,'manifest.webmanifest')));
  assert.notEqual(new URL(office.id,base+'manifest.webmanifest').pathname,new URL('./',base+'pos/manifest.webmanifest').pathname);
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);server.close();process.exitCode=1;});
