/* Versioned assets start independently of background offline-cache installation. */
(async()=>{'use strict';
 window.restaurantBootLoading126=true;
 const logo=document.querySelector('#restaurantLogin .login-brand-mark img');window.restaurantLogo139=logo?.getAttribute('src')||'assets/brand/oonjai-logo.png?v=139';
 document.addEventListener('error',event=>{const img=event.target;if(img?.tagName==='IMG'&&img.matches('.restaurant-brand-logo,#restaurantLogin .login-brand-mark img')&&img.src!==window.restaurantLogo139)img.src=window.restaurantLogo139},true);
 document.querySelectorAll('.restaurant-brand-logo').forEach(img=>img.src=window.restaurantLogo139);
 const loading=document.getElementById('restaurantLoading132');if(loading){loading.hidden=false;loading.querySelector('p').textContent='Opening your restaurant…'}
 const sources=['vendor/supabase-2.118.0.js?v=139','scripts/supabase-config.js?v=139','scripts/workspace-config123.js?v=139','scripts/restaurant-auth123.js?v=139','scripts/restaurant-backoffice.js?v=139','scripts/restaurant-permissions125.js?v=139','scripts/restaurant-modules125.js?v=139','scripts/restaurant-shell122.js?v=139','scripts/workspace-links123.js?v=139','scripts/restaurant-accounting124.js?v=139','scripts/restaurant-home139.js?v=139'];
 if('serviceWorker' in navigator&&(location.protocol==='https:'||['localhost','127.0.0.1'].includes(location.hostname))){
  // Every executable asset is release-versioned; the old cache cannot serve a previous release for these URLs.
  try{navigator.serviceWorker.register(new URL('restaurant-sw139.js',document.baseURI).href,{scope:new URL('./',document.baseURI).href,updateViaCache:'none'}).catch(()=>{/* Network login remains available; retry cache installation on the next visit. */})}catch{}
 }
 for(const src of sources)await new Promise((resolve,reject)=>{const script=document.createElement('script');let timer;const finish=error=>{clearTimeout(timer);script.onload=null;script.onerror=null;if(error){script.remove();reject(error)}else resolve()};script.src=src;script.onload=()=>finish();script.onerror=()=>finish(Error('A required application file could not load. Check your connection, then retry.'));timer=setTimeout(()=>finish(Error('Loading is taking too long. Check your connection, then retry.')),30000);document.body.append(script)});
 window.restaurantBootLoading126=false;document.dispatchEvent(new Event('restaurant:boot126'));
})().catch(e=>{document.getElementById('restaurantLoading132').hidden=true;const box=document.getElementById('loginError');if(box)box.textContent=e.message;let retry=document.getElementById('restaurantBootRetry139');if(!retry){retry=document.createElement('button');retry.id='restaurantBootRetry139';retry.type='button';retry.textContent='Retry loading';retry.onclick=()=>location.reload();box?.after(retry)}});
