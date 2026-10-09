/* Current-service POS reads, foreground-only refresh, and bounded network waits. */
(()=>{'use strict';
 let timer,readGeneration=0,fallback=false;
 const day=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Vientiane',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
 const active=()=>!!liveProfile&&!document.hidden&&document.querySelector('#pos118')?.classList.contains('active');
 const network=e=>/failed to fetch|networkerror|network request failed|load failed|network request timed out/i.test(e.message)&&!/permission|access required|unauthorized|inactive/i.test(e.message);
 async function rpc(name,args){
  const controller=new AbortController();let timeout;
  try{let request=ojmDb.rpc(name,args);if(request.abortSignal)request=request.abortSignal(controller.signal);
   const out=await Promise.race([Promise.resolve(request),new Promise((_,reject)=>{timeout=setTimeout(()=>{controller.abort();reject(Error('Network request timed out'))},name==='pos_order118'?8000:6000)})]);
   if(out.error)throw Error(out.error.message);return out.data;
  }catch(e){if(controller.signal.aborted)throw Error('Network request timed out');throw e}
  finally{clearTimeout(timeout)}
 }
 function schedule(delay){clearTimeout(timer);timer=setTimeout(()=>{const s=window.pos118?.state;
  const older=s?.tab==='Sales'&&s.sub==='Receipts'&&s.orders.filter(o=>['paid','refunded'].includes(o.status)).length>100;
  if(active()&&s&&!s.sample&&s.loaded&&!s.working&&!older)pos118.load({background:true});else schedule(8000)},delay||8000)}
 function cacheKey(owner){return owner+':priority125'}
 async function load(s,hooks,{background=false}={}){
  if(s.busy||!liveProfile?.id||s.sample)return;
  const owner=liveProfile.id,epoch=sessionEpoch121,write=s.writeGeneration125||0,generation=++readGeneration;
  const valid=()=>owner===liveProfile?.id&&epoch===sessionEpoch121&&generation===readGeneration;
  s.busy=true;if(!background||!s.loaded){s.error='';pos118.render()}
  try{
   if(!navigator.onLine)throw Error('Network request failed');
   // Replay only when there are captured entries, not on every healthy poll.
   const pending=await posOffline119.queue(owner);if(!valid())return;
   if(pending.length)await pos118.syncPending();if(!valid())return;
   let data;
   try{data=await rpc('pos_cashier_snapshot125',{p_catalog_version:s.loaded&&s.owner===owner?s.catalogVersion125||null:null,p_receipt_date:s.receiptDate||day(),p_pending_ids:s.offlineQueue.map(e=>e.order.id).slice(0,1000)})}
   catch(e){if(/pos_cashier_snapshot125/.test(e.message)&&/schema cache|could not find|does not exist/i.test(e.message)){fallback=true;data=await rpc('pos_snapshot118',{})}else throw e}
   if(!valid()||write!==(s.writeGeneration125||0))return;
   if(!Array.isArray(data?.orders))throw Error('POS records are unavailable. Ask your administrator to check setup.');
   if(!data.schema125){s.balances125=null;s.schema125=false;s.catalogVersion125=null;s.summary125=null}Object.assign(s,data,{owner,loaded:true,offline:false});s.receiptDate||=day();
   s.offlineQueue=await posOffline119.queue(owner);if(!valid())return;hooks.overlayPending();
   s.error=fallback?'The fast POS database update is pending. Ask your administrator to apply migration 10.':'';
   if(!s.picked||!hooks.catalog().some(m=>m.id===s.picked))hooks.pick(hooks.catalog()[0]?.id,false);
   // Keep the compact snapshot separate from Inventory's complete ledger/cache.
   const snapshot={...data,menu:s.menu,ingredients:s.ingredients,items:s.items,categories:s.categories};
   await posOffline119.saveSnapshot(cacheKey(owner),snapshot);
   navigator.storage?.persist?.().catch(()=>{});
  }catch(e){if(!valid())return;
   if(network(e)){
    const cached=await posOffline119.getSnapshot(cacheKey(owner)).catch(()=>null);if(!valid())return;
    if(!s.loaded&&cached){Object.assign(s,cached.data,{loaded:true,owner});s.offlineQueue=await posOffline119.queue(owner);if(!valid())return;hooks.overlayPending();hooks.pick(hooks.catalog()[0]?.id,false)}
    s.offline=true;s.error=s.loaded?'Offline: sales remain on this device until synced.':'Connect once to prepare the POS on this device.';
   }else{s.loaded=false;s.offline=false;s.error=e.message;showCenterStatus(e.message,true)}
  }finally{if(valid()){s.busy=false;if(!background||!s.loaded||s.tab!=='Sales'||s.sub!=='New Order')pos118.render();else updateStatus(s);schedule(s.offline?30000:8000)}}
 }
 function updateStatus(s){const node=document.querySelector('.pos-sync118');if(node)node.textContent=s.offlineQueue.length?s.offlineQueue.length+' pending sync':s.offline?'Offline':'Synced';
  // Never replace focused input nodes, scroll positions or a current draft during polling.
  const bar=document.querySelector('.pos-mode118');if(bar){let warning=bar.querySelector('.pos-priority-warning125');if(s.error&&!warning){warning=document.createElement('span');warning.className='pos-priority-warning125';warning.setAttribute('role','status');bar.append(warning)}if(warning)warning.textContent=s.error}
 }
 async function accepted(s,order,usage){
  const owner=liveProfile.id,epoch=sessionEpoch121;
  const existing=s.orders.find(o=>o.id===order.id),wasPaid=existing&&['paid','refunded'].includes(existing.status);
  s.orders=[order,...s.orders.filter(o=>o.id!==order.id)];
  if(order.status==='paid'&&!wasPaid){
   if(s.balances125)for(const [id,quantity] of Object.entries(usage||{}))s.balances125[id]=Number(s.balances125[id]||0)-quantity;
   if(order.data.payment==='Cash')s.shiftExpected125=Number(s.shiftExpected125||0)+Number(order.data.total||0);
   if(s.summary125){s.summary125.received+=Number(order.data.total||0);s.summary125.paidCount++;if(existing?.status==='unpaid')s.summary125.openCount=Math.max(0,s.summary125.openCount-1)}
  }
  if(s.schema125){const keys=['schema125','catalogVersion125','config','configVersion','menu','ingredients','items','categories','moves','stock','orders','shifts','cash','balances125','acknowledged125','summary125','shiftExpected125','receiptCount125','refreshedAt125'];
   await posOffline119.saveSnapshot(cacheKey(owner),Object.fromEntries(keys.map(k=>[k,s[k]]))).catch(()=>{if(owner===liveProfile?.id&&epoch===sessionEpoch121)s.error='Payment recorded. Local offline storage could not be updated.'});
  }else if(order.status==='paid'&&!wasPaid)for(const [item_id,quantity] of Object.entries(usage||{}))s.stock.push({id:order.id+':'+item_id,order_id:order.id,item_id,quantity,kind:'sale',created_at:order.paid_at});
  if(owner===liveProfile?.id&&epoch===sessionEpoch121)schedule(200);
 }
 function allowed(tab,sub){return restaurantTabCan125('pos',restaurantPosTab125(tab,sub))}
 function clamp(s){if(s.sample||allowed(s.tab,s.sub))return;
  for(const [tab,sub] of [['Sales','New Order'],['Sales','Open Orders'],['Sales','Receipts'],['Sales','Online Orders'],['Overview','New Order'],['Management','New Order']])if(allowed(tab,sub)){s.tab=tab;s.sub=sub;return}
 }
 function overview(s){const m=v=>new Intl.NumberFormat('en-US',{maximumFractionDigits:2}).format(Number(v)||0)+' LAK',esc=shell113.esc,summary=s.summary125||{},shift=s.shifts.find(x=>x.cashier===liveProfile.id&&!x.closed_at),button=(title,a)=>`<button type="button" data-pos118="${a}">${title}</button>`;
  const pending=s.offlineQueue.filter(e=>e.action==='pay'&&e.data.payment==='Cash'&&!s.acknowledged125?.includes(e.order.id)).reduce((n,e)=>n+Number(e.order.data.total||0),0);
  return `<div class="pos-metrics118">${[['Net sales today',m(Number(summary.received||0)-Number(summary.refunds||0))],['Paid orders today',summary.paidCount||0],['Open orders',summary.openCount||0],['Refunds today',m(summary.refunds)]].map(([title,value])=>`<section class="pos-card118 pos-metric118"><div>${title}<strong>${value}</strong></div></section>`).join('')}</div><section class="pos-card118"><h2>Current shift</h2><p>${esc(liveProfile.full_name||'Cashier')}</p>${shift?`<p>Opening float: ${m(shift.opening)}</p><p>Expected drawer: ${m(Number(s.shiftExpected125||0)+pending)}${pending?' · includes pending local cash sales':''}</p>${button('Cash In / Out','cash')}${button('Close Shift','close-shift')}`:button('Open Shift','open-shift')}<p>${s.offline?'Last saved totals; reconnect to refresh.':'Totals cover all sales today, independently of the recent receipt list.'}</p></section>`;
 }
 async function report(from,to){if(!restaurantTabCan125('pos','pos-management')||!restaurantTabCan125('pos','pos-sales-receipts'))throw Error('Report access required');
  const owner=liveProfile.id,epoch=sessionEpoch121,rows=[];let before=null;
  do{const page=await rpc('pos_report_page125',{p_from:from,p_to:to,p_before_number:before});if(owner!==liveProfile?.id||epoch!==sessionEpoch121)throw Error('Account changed during report loading');rows.push(...page);if(page.length<250)break;before=page.at(-1).number}while(true);
  return rows;
 }
 async function moreReceipts(s){if(s.receiptLoading125)return;if(!navigator.onLine||s.offline)throw Error('Connect to load older receipts');
  const owner=liveProfile.id,epoch=sessionEpoch121,date=s.receiptDate||day(),numbers=s.orders.filter(o=>['paid','refunded'].includes(o.status)&&Number.isFinite(Number(o.number))).map(o=>Number(o.number));if(!numbers.length)return;
  s.receiptLoading125=true;try{const rows=await rpc('pos_receipt_page125',{p_date:date,p_before_number:Math.min(...numbers)});
   if(owner!==liveProfile?.id||epoch!==sessionEpoch121||date!==s.receiptDate)return;
   const ids=new Set(s.orders.map(o=>o.id));s.orders.push(...rows.filter(o=>!ids.has(o.id)));s.visibleOrders+=100;pos118.render();
  }finally{if(owner===liveProfile?.id&&epoch===sessionEpoch121)s.receiptLoading125=false}
 }
 window.restaurantPosAction125=el=>{const a=el.dataset.pos118,value=el.dataset.value118;
  if(a==='tab')return value==='Sales'?['New Order','Open Orders','Receipts','Online Orders'].some(sub=>allowed('Sales',sub)):allowed(value,'New Order');
  if(a==='sub')return allowed('Sales',value);
  if(['settings','options','links','seed','export','export-pdf'].includes(a))return allowed('Management','New Order');
  if(['open-shift','close-shift','cash','shift-view'].includes(a))return allowed('Overview','New Order');
  if(a==='refund')return allowed('Sales','Receipts');
  return true;
 };
 window.posPerformance125={rpc,load,accepted,allowed,clamp,overview,report,moreReceipts,schedule,network};
 document.addEventListener('visibilitychange',()=>{if(active())schedule(100)});
 addEventListener('focus',()=>{if(active())schedule(100)});
 addEventListener('offline',()=>{const s=window.pos118?.state;if(s&&!s.sample&&s.loaded){s.offline=true;updateStatus(s)}});
})();
