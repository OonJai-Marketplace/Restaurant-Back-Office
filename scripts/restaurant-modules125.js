/* One site and one repository. Load working code only when its module is opened. */
(()=>{'use strict';
 if('serviceWorker' in navigator&&(location.protocol==='https:'||['localhost','127.0.0.1'].includes(location.hostname)))navigator.serviceWorker.register('pos-sw119.js',{scope:'./'}).catch(()=>{});
 const groups={
  settings:{js:['restaurant-settings125.js']},
  inventory:{css:['inventory-menu-v104.css'],js:['inventory-menu-v104.js','item-icons-v109.js']},
  menu:{depends:['inventory'],js:['menu-v108.js']},
  kitchen:{depends:['inventory'],css:['preparation-waste124.css'],js:['preparation-waste124.js']},
  pos:{css:['pos-v118.css'],js:['pos-offline-v119.js','pos-performance125.js','pos-v118.js']}
 };
 const promises=new Map(),ready=new Set(),files=new Set();let navigation=0;
 function script(name){if(files.has(name))return Promise.resolve();return new Promise((resolve,reject)=>{const node=document.createElement('script');node.src='scripts/'+name+'?v=125';node.onload=()=>{files.add(name);resolve()};node.onerror=()=>{node.remove();reject(Error('This area could not load. Check the connection and try again.'))};document.body.append(node)})}
 function style(name){if(files.has(name))return Promise.resolve();return new Promise((resolve,reject)=>{const node=document.createElement('link');node.rel='stylesheet';node.href='styles/'+name+'?v=125';node.onload=()=>{files.add(name);resolve()};node.onerror=()=>{node.remove();reject(Error('The workspace style could not load. Try again.'))};document.querySelector('[href*="restaurant-compact124.css"]').before(node)})}
 async function ensure(group){if(ready.has(group))return;if(promises.has(group))return promises.get(group);const config=groups[group];if(!config)return;
  const promise=(async()=>{for(const dep of config.depends||[])await ensure(dep);for(const file of config.css||[])await style(file);for(const file of config.js||[])await script(file);ready.add(group)})();
  promises.set(group,promise);try{await promise}catch(e){promises.delete(group);throw e}
 }
 function groupFor(id){return ['inv-preparation124','inv-waste124'].includes(id)?'kitchen':id.startsWith('inv-')?'inventory':id.startsWith('menu-')?'menu':id==='pos118'?'pos':id==='restaurant-settings'?'settings':null}
 // POS uses its own current catalog. It does not load the Inventory ledger.
 window.menuStore108={state:{loaded:false,items:[],ingredients:[],moves:[],menu:[],categories:[]},
  async save(...args){await ensure('inventory');return window.menuStore108.save(...args)},
  async load(...args){await ensure('inventory');return window.menuStore108.load(...args)}};
 const base=switchTab;
 window.switchTab=function(id,...args){
  if(!liveProfile)return false;
  const scope=scopes121(id),tab=restaurantTabId125(id);
  if(scope!=='restaurant'&&id!=='pos118'&&id!=='restaurant-settings'&&!restaurantTabCan125(scope,tab)){showCenterStatus('This tab is not included in your access.',true);return false}
  const group=groupFor(id);if(!['inventory','menu','kitchen'].includes(group))window.menuStore108.cancelLoad?.();if(group!=='kitchen')window.kitchen124?.cancelLoad?.();
  if(!group||ready.has(group)){navigation++;return base.call(this,id,...args)}
  const token=++navigation,owner=liveProfile.id,epoch=sessionEpoch121;
  const area=document.querySelector('.tab-content.active');if(area){let status=area.querySelector('.module-loading125');if(!status){status=document.createElement('p');status.className='module-loading125';status.setAttribute('role','status');area.prepend(status)}status.textContent='Opening '+(restaurantAreas[scope]?.[0]||'workspace')+'…'}
  return ensure(group).then(()=>{if(token!==navigation||liveProfile?.id!==owner||sessionEpoch121!==epoch)return false;document.querySelectorAll('.module-loading125').forEach(n=>n.remove());return window.switchTab(id,...args)}).catch(e=>{if(token===navigation){document.querySelectorAll('.module-loading125').forEach(n=>n.remove());showCenterStatus(e.message,true)}return false});
 };
 window.restaurantModules125={ensure,ready,groupFor};
})();
