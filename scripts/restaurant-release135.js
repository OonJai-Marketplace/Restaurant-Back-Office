/* Start this release only after the browser stops serving the old app cache. */
(async()=>{'use strict';
 window.restaurantBootLoading126=true;
 const sources=["vendor/supabase-2.118.0.js", "scripts/supabase-config.js?v=135", "scripts/workspace-config123.js?v=135", "scripts/restaurant-auth123.js?v=135", "scripts/restaurant-backoffice.js?v=135", "scripts/restaurant-permissions125.js?v=135", "scripts/restaurant-modules125.js?v=135", "scripts/restaurant-shell122.js?v=135", "scripts/workspace-links123.js?v=135", "scripts/restaurant-accounting124.js?v=135"];
 const expected=new URL('restaurant-sw135.js',document.baseURI).href;
 if('serviceWorker' in navigator&&(location.protocol==='https:'||['localhost','127.0.0.1'].includes(location.hostname))){
  try{
   const registration=navigator.serviceWorker.register(expected,{scope:new URL('./',document.baseURI).href,updateViaCache:'none'});
   registration.catch(()=>{});
   if(navigator.serviceWorker.controller&&navigator.serviceWorker.controller.scriptURL!==expected){
    await new Promise((resolve,reject)=>{let timer;const done=()=>{if(navigator.serviceWorker.controller?.scriptURL!==expected)return;clearTimeout(timer);navigator.serviceWorker.removeEventListener('controllerchange',done);resolve()};navigator.serviceWorker.addEventListener('controllerchange',done);timer=setTimeout(()=>{navigator.serviceWorker.removeEventListener('controllerchange',done);reject(Error('The application update could not finish. Reopen this page while connected.'))},12000);done()});
   }
  }catch(e){if(navigator.serviceWorker.controller&&navigator.serviceWorker.controller.scriptURL!==expected)throw e}
 }
 for(const src of sources)await new Promise((resolve,reject)=>{const script=document.createElement('script');script.src=src;script.onload=resolve;script.onerror=()=>reject(Error('The application could not load. Check your connection and reopen this page.'));document.body.append(script)});
window.restaurantBootLoading126=false;document.dispatchEvent(new Event('restaurant:boot126'));
})().catch(e=>{const box=document.getElementById('loginError');if(box)box.textContent=e.message});
