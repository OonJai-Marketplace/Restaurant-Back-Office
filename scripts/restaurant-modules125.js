/* One site and one repository. Load working code only when its module is opened. */
(()=>{'use strict';
 const groups={
  promotions:{css:['promotions146.css'],js:['promotion-kit146.js','restaurant-promotions146.js']},
  readiness:{css:['restaurant-readiness144.css'],js:['restaurant-readiness144.js']},
  sales:{css:['restaurant-sales143.css'],js:['sales-math143.js','restaurant-sales143.js']},
  settings:{js:['restaurant-settings146.bundle.js']},
  inventory:{css:['inventory-menu-v104.css'],js:['restaurant-inventory144.bundle.js']},
  menu:{depends:['inventory'],js:['menu-v108.js']},
  kitchen:{depends:['inventory'],css:['preparation-waste124.css'],js:['preparation-waste124.js']},
  pos:{css:['pos-v118.css'],js:['restaurant-pos150.bundle.js']}
 };
 const promises=new Map(),ready=new Set(),files=new Set();let navigation=0;
 const pendingFiles=new Map();
 function asset(name,kind){
  if(files.has(name))return Promise.resolve();if(pendingFiles.has(name))return pendingFiles.get(name);
  const promise=new Promise((resolve,reject)=>{
   const node=document.createElement(kind==='js'?'script':'link');let timer,runtimeError;
   const url=new URL((kind==='js'?'scripts/':'styles/')+name+(/(?:14[467]|150)\.bundle/.test(name)?'':'?v=147'),document.baseURI).href;
   const capture=e=>{if(e.filename===url)runtimeError=e.error||Error(e.message)};
   const cleanup=()=>{clearTimeout(timer);window.removeEventListener('error',capture)};
   if(kind==='js'){node.src=url;window.addEventListener('error',capture)}else{node.rel='stylesheet';node.href=url}
   node.onload=()=>{cleanup();if(runtimeError){reject(runtimeError);return}files.add(name);resolve()};
   node.onerror=()=>{cleanup();node.remove();pendingFiles.delete(name);reject(Error('Could not download '+name+'. Open this area again to retry.'))};
   timer=setTimeout(()=>{cleanup();reject(Error('Loading '+name+' took too long. Reload the page to retry.'))},45000);
   if(kind==='js')document.body.append(node);else (document.getElementById('restaurantShellStyle142')||document.querySelector('[href*="restaurant-compact124.css"]')).before(node);
  });pendingFiles.set(name,promise);return promise;
 }
 const script=name=>asset(name,'js'),style=name=>asset(name,'css');
 async function ensure(group){if(ready.has(group))return;if(promises.has(group))return promises.get(group);const config=groups[group];if(!config)return;
  const promise=(async()=>{for(const dep of config.depends||[])await ensure(dep);for(const file of config.css||[])await style(file);for(const file of config.js||[])await script(file);ready.add(group)})();
  promises.set(group,promise);try{await promise}catch(e){promises.delete(group);throw e}
 }
 function groupFor(id){return id==='restaurant-promotions'?'promotions':id==='restaurant-sales143'?'sales':['inv-bulk132','inv-preparation124','inv-waste124'].includes(id)?'kitchen':id.startsWith('inv-')?'inventory':id.startsWith('menu-')?'menu':id==='pos118'?'pos':id==='restaurant-settings'?'settings':null}
 // POS uses its own current catalog. It does not load the Inventory ledger.
 window.menuStore108={state:{loaded:false,items:[],ingredients:[],moves:[],menu:[],categories:[]},
  async save(...args){await ensure('inventory');return window.menuStore108.save(...args)},
  async load(...args){await ensure('inventory');return window.menuStore108.load(...args)}};
 const base=switchTab;
 window.switchTab=function(id,...args){
  if(!restaurantRouteAllowed128(id)){if(liveProfile)showCenterStatus('This area is not included in your access.',true);return false;}
  const scope=scopes121(id);
  const group=groupFor(id);if(!['inventory','menu','kitchen'].includes(group))window.menuStore108.cancelLoad?.();if(group!=='kitchen')window.kitchen124?.cancelLoad?.();
  if(!group||ready.has(group)){navigation++;return base.call(this,id,...args)}
  const token=++navigation,owner=liveProfile.id,epoch=sessionEpoch121;
  const area=document.querySelector('.tab-content.active');if(area){let status=area.querySelector('.module-loading125');if(!status){status=document.createElement('p');status.className='module-loading125';status.setAttribute('role','status');area.prepend(status)}status.textContent='Opening '+(restaurantAreas[scope]?.[0]||'workspace')+'…'}
  return ensure(group).then(()=>{if(token!==navigation||liveProfile?.id!==owner||sessionEpoch121!==epoch)return false;document.querySelectorAll('.module-loading125').forEach(n=>n.remove());return window.switchTab(id,...args)}).catch(e=>{if(token===navigation){document.querySelectorAll('.module-loading125').forEach(n=>n.remove());showCenterStatus(e.message,true)}return false});
 };
 window.restaurantModules125={ensure,ready,groupFor};
})();
