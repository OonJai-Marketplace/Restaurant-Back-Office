/* Inline entry: the visible form and controls never depend on a stylesheet download. */
(()=>{'use strict';
 if(window.self!==window.top){
  const message=document.createElement('p');message.textContent='For your security, open the back office in its own browser tab.';
  const link=document.createElement('a');link.href=new URL('back-office/',document.baseURI).href;link.target='_blank';link.rel='noopener noreferrer';link.textContent='Open back office';
  document.body.replaceChildren(message,link);return;
 }
 if(window.restaurantBootStarted150)return;window.restaurantBootStarted150=true;
 const form=document.getElementById('restaurantLogin'),forgot=document.getElementById('forgotPassword121'),status=document.getElementById('loginStatus140'),error=document.getElementById('loginError');
 let corePromise,queued=false;
 const logo=form.querySelector('.login-brand-mark img');window.restaurantLogo139=logo.getAttribute('src');
 document.addEventListener('error',event=>{const img=event.target;if(img?.tagName==='IMG'&&img.matches('.restaurant-brand-logo,#restaurantLogin .login-brand-mark img')&&img.src!==window.restaurantLogo139)img.src=window.restaurantLogo139},true);
 document.querySelectorAll('.restaurant-brand-logo').forEach(img=>img.src=window.restaurantLogo139);
 window.restaurantBootFailure140=err=>{document.getElementById('restaurantLoading132').hidden=true;status.textContent='';error.textContent=err.message||'The restaurant could not start.';let retry=document.getElementById('restaurantBootRetry139');if(!retry){retry=document.createElement('button');retry.id='restaurantBootRetry139';retry.type='button';retry.className='login-link-button';retry.textContent='Retry loading';retry.onclick=()=>location.reload();error.after(retry)}};
 // The new worker activates immediately: it does not wait behind a full-app pre-download.
 let registration;
 if('serviceWorker' in navigator&&(location.protocol==='https:'||['localhost','127.0.0.1'].includes(location.hostname)))try{registration=navigator.serviceWorker.register(new URL('restaurant-sw150.js',document.baseURI).href,{scope:new URL('./',document.baseURI).href,updateViaCache:'none'});registration.catch(()=>{})}catch{}
 async function waitForWorker150(){
  if(!registration)return;
  await Promise.race([registration.then(reg=>new Promise(resolve=>{if(reg.active?.scriptURL.endsWith('restaurant-sw150.js'))return resolve();const done=()=>{navigator.serviceWorker.removeEventListener('controllerchange',done);clearTimeout(timer);resolve()};const timer=setTimeout(done,8000);navigator.serviceWorker.addEventListener('controllerchange',done)})),new Promise(resolve=>setTimeout(resolve,8000))]).catch(()=>{});
 }
 function loadCore(){
  if(corePromise)return corePromise;
  corePromise=(async()=>{
   for(let attempt=0;attempt<2;attempt++)try{
    await new Promise((resolve,reject)=>{
     const script=document.createElement('script');let timer,runtimeError;
     const src=new URL('scripts/restaurant-core150.bundle.js',document.baseURI).href;
     const capture=e=>{if(e.filename===src)runtimeError=e.error||Error(e.message)};
     const done=err=>{clearTimeout(timer);window.removeEventListener('error',capture);script.onload=null;script.onerror=null;if(err)reject(err);else resolve()};
     window.addEventListener('error',capture);script.src=src;
     script.onload=()=>{if(runtimeError){runtimeError.noRetry=true;done(runtimeError)}else if(!window.restaurantCoreReady150){const e=Error('The restaurant application did not initialize. Please reload.');e.noRetry=true;done(e)}else done()};
     script.onerror=()=>{script.remove();done(Error('The restaurant application file could not download (restaurant-core150.bundle.js). Select Retry loading.'))};
     timer=setTimeout(()=>{const e=Error('The restaurant application download is taking too long. Select Retry loading.');e.noRetry=true;done(e)},45000);document.body.append(script);
    });return;
   }catch(err){if(err.noRetry||attempt===1)throw err;
    // Allow a newly registered worker to replace an old four-second request deadline.
    await waitForWorker150();
   }
  })();return corePromise;
 }
 const queue=async action=>{if(queued)return;queued=true;status.textContent='';error.textContent='';try{await loadCore();status.textContent='';if(action==='sign-in')form.requestSubmit();else forgot.click()}catch(err){window.restaurantBootFailure140(err)}finally{queued=false}};
 form.onsubmit=e=>{e.preventDefault();queue('sign-in')};forgot.onclick=()=>{if(form.email.reportValidity())queue('reset')};
 loadCore().then(()=>{
  document.getElementById('restaurantBootRetry139')?.remove();
  // Warm only the shell after startup, without gating sign-in or touching private data.
  if(registration)registration.then(reg=>{const send=()=>{const worker=navigator.serviceWorker.controller||reg.active;if(!worker?.scriptURL.endsWith('restaurant-sw150.js'))return false;worker.postMessage({type:'CACHE_SHELL150'});return true};if(!send())navigator.serviceWorker.addEventListener('controllerchange',send,{once:true})}).catch(()=>{});
 }).catch(window.restaurantBootFailure140);
})();
