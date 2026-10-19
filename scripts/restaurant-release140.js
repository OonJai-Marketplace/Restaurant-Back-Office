/* Versioned assets start independently of background offline-cache installation. */
(async()=>{'use strict';
 window.restaurantBootLoading126=true;
 const logo=document.querySelector('#restaurantLogin .login-brand-mark img');window.restaurantLogo139=logo?.getAttribute('src')||'assets/brand/oonjai-logo.png?v=140';
 document.addEventListener('error',event=>{const img=event.target;if(img?.tagName==='IMG'&&img.matches('.restaurant-brand-logo,#restaurantLogin .login-brand-mark img')&&img.src!==window.restaurantLogo139)img.src=window.restaurantLogo139},true);
 document.querySelectorAll('.restaurant-brand-logo').forEach(img=>img.src=window.restaurantLogo139);
 window.restaurantBootFailure140=error=>{
  const loading=document.getElementById('restaurantLoading132');if(loading)loading.hidden=true;
  const status=document.getElementById('loginStatus140');if(status)status.textContent='';
  const box=document.getElementById('loginError');if(box)box.textContent=error.message||'The application could not start. Please reload.';
  let retry=document.getElementById('restaurantBootRetry139');if(!retry){retry=document.createElement('button');retry.id='restaurantBootRetry139';retry.type='button';retry.textContent='Retry loading';retry.onclick=()=>location.reload();box?.after(retry)}
 };
 // Leave the existing login visible while startup files load.
 const loading=document.getElementById('restaurantLoading132');if(loading)loading.hidden=true;
 const sources=['vendor/supabase-2.118.0.js?v=140','scripts/supabase-config.js?v=140','scripts/workspace-config123.js?v=140','scripts/restaurant-auth123.js?v=140','scripts/restaurant-backoffice.js?v=140','scripts/restaurant-permissions125.js?v=140','scripts/restaurant-modules125.js?v=140','scripts/restaurant-shell122.js?v=140','scripts/workspace-links123.js?v=140','scripts/restaurant-accounting124.js?v=140','scripts/restaurant-home139.js?v=140'];
 if('serviceWorker' in navigator&&(location.protocol==='https:'||['localhost','127.0.0.1'].includes(location.hostname))){
  // Every executable asset is release-versioned; the old cache cannot serve a previous release for these URLs.
  try{navigator.serviceWorker.register(new URL('restaurant-sw140.js',document.baseURI).href,{scope:new URL('./',document.baseURI).href,updateViaCache:'none'}).catch(()=>{/* Network login remains available; retry cache installation on the next visit. */})}catch{}
 }
 for(const src of sources)await new Promise((resolve,reject)=>{
  const script=document.createElement('script');let timer,runtimeError;
  const capture=event=>{if(event.filename===new URL(src,document.baseURI).href)runtimeError=event.error||Error(event.message||'An application file failed to start.')};
  const finish=error=>{clearTimeout(timer);window.removeEventListener('error',capture);script.onload=null;script.onerror=null;if(error){script.remove();reject(error)}else resolve()};
  window.addEventListener('error',capture);script.src=src;script.onload=()=>finish(runtimeError);script.onerror=()=>finish(Error('A required application file could not load. Check your connection, then retry.'));
  timer=setTimeout(()=>finish(Error('Loading is taking too long. Check your connection, then retry.')),15000);document.body.append(script);
 });
 window.restaurantBootLoading126=false;document.dispatchEvent(new Event('restaurant:boot126'));await window.restaurantReady140;
})().catch(error=>window.restaurantBootFailure140?.(error));
