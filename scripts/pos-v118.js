/* POS: shared restaurant catalog and server-priced orders. */
(function(){'use strict';
const $=s=>document.querySelector(s),esc=v=>shell113.esc(v),n=v=>Number(typeof v==='string'?v.replaceAll(',',''):v)||0,fmt=v=>new Intl.NumberFormat('en-US',{maximumFractionDigits:2}).format(n(v)),money=v=>fmt(v)+' LAK',uuid=()=>crypto.randomUUID();
const S={tab:'Overview',sub:'New Order',sample:false,loaded:false,owner:null,busy:false,error:'',query:'',category:'All',classification:'All',filter:'All',selected:null,picked:null,choices:{},note:'',orders:[],shifts:[],cash:[],stock:[],menu:[],ingredients:[],items:[],moves:[],categories:[],config:{methods:['Cash','BCEL QR','Bank'],cashiers:[],receiptWidth:56,receiptFooter:'Thank you for visiting.'},configVersion:1,offline:false,offlineQueue:[],syncError:'',visibleOrders:50,visibleMenu:40};let draft,previewData;
const today=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Vientiane',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const date=d=>new Date(d).toLocaleDateString('en-GB',{timeZone:'Asia/Vientiane'}),time=d=>new Date(d).toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit',timeZone:'Asia/Vientiane'});
const admin=()=>typeof liveProfile!=='undefined'&&liveProfile?.role==='admin';
const catalog=()=>S.menu.filter(r=>r.data.storefrontManaged131===true&&r.data.active!==false&&r.data.currency==='LAK').sort((a,b)=>n(a.data.publicPosition131)-n(b.data.publicPosition131));
const currentUser=()=>liveProfile?.full_name||'Cashier';
const categoryName=id=>S.categories.find(x=>x.id===id)?.data.name||id;
const groupPrice=(g,ids)=>g.options.filter(o=>ids.includes(o.id)).reduce((a,o)=>a+n(o.price),0)+(g.included!=null?n(g.extraPrice||0)*Math.max(0,ids.length-n(g.included)):0);
const itemPrice=d=>n(d.price)+(d.posOptions118||[]).reduce((sum,g)=>sum+groupPrice(g,S.choices[g.id]||[]),0);
function tabDraftKey(){return 'restaurant-draft:'+OJM_SUPABASE_URL+':'+offlineOwner()}
function rememberDraft(){
 if(S.sample||!offlineOwner())return;
 try{
  if(draft.data.lines.length){
   sessionStorage.setItem(tabDraftKey(),JSON.stringify(draft,(key,value)=>key==='photoData'?undefined:value));
  }else sessionStorage.removeItem(tabDraftKey());
 }catch{showCenterStatus('Draft could not be backed up in this tab. Use Save Order before leaving.',true)}
}
function restoreDraft(){
 try{const copy=JSON.parse(sessionStorage.getItem(tabDraftKey()));if(copy?.id&&Array.isArray(copy.data?.lines)&&!['paid','refunded','cancelled'].includes(copy.status))draft=copy}catch{}
}
function fresh(){draft={id:uuid(),version:0,data:{lines:[],service:'Dine in',customer:'',note:'',discount:0,discountType:'percent'}};S.selected=null}
function lineAmount(line){return Math.round((n(line.unitPrice)*n(line.quantity)+Number.EPSILON)*100)/100}
function total(d){
 const subtotalCents=d.lines.reduce((sum,line)=>sum+Math.round(lineAmount(line)*100),0);
 const discountCents=d.discountType==='percent'?Math.round(subtotalCents*n(d.discount)/100):Math.round(n(d.discount)*100);
 return {subtotal:subtotalCents/100,discount:discountCents/100,total:Math.max(0,subtotalCents-discountCents)/100};
}
function photo(d){if(/^data:image\/(png|jpeg|webp);base64,/i.test(d?.photoData||''))return `<span class="pos-photo118"><img alt="${esc(d.name)}" src="${esc(d.photoData)}"></span>`;if(/^(https:\/\/[^\s<>"']+|public-restaurant\/assets\/images\/[a-zA-Z0-9._/-]+)$/.test(d?.photoUrl||''))return `<span class="pos-photo118"><img alt="${esc(d.name)}" loading="lazy" src="${esc(d.photoUrl)}"></span>`;return `<span class="pos-photo118 no-photo" role="img" aria-label="No photo">${esc((d?.name||'Menu').slice(0,1))}</span>`}
function pick(id,draw=true){S.picked=id;S.note='';const d=catalog().find(m=>m.id===id)?.data;S.choices=Object.fromEntries((d?.posOptions118||[]).map(g=>[g.id,g.min>0?g.options.filter(o=>o.available!==false).slice(0,g.min).map(o=>o.id):[]]));if(draw)selectTile(id)}
function optionAvailable(option){return option.available!==false}
function menuStockRules(menuId,choices={}){
 return S.items.filter(item=>item.data.active!==false).flatMap(item=>(item.data.posMenuUse||[])
  .filter(rule=>rule.menuId===menuId&&(!rule.groupId||choices[rule.groupId]?.includes(rule.optionId)))
  .map(rule=>({item,rule})));
}
function lineStock(line,service){
 const stockRows=new Map();
 function put(id,allocated,initial){
  const item=S.items.find(i=>i.id===id&&i.data.active!==false);
  if(!item||!(allocated>0))return;
  const row=stockRows.get(id)||{item,allocated:0,initial:0};
  row.allocated+=allocated;row.initial+=initial;stockRows.set(id,row)
 }
 function ingredients(id,quantity,seen=[]){
  if(seen.includes(id)||seen.length>12)throw Error('Circular menu recipe');
  const d=S.menu.find(m=>m.id===id)?.data;if(!d)throw Error('Menu unavailable');
  if(d.itemType==='bundle')return (d.recipe||[]).flatMap(r=>ingredients(r.itemId,n(r.quantity)*quantity,[...seen,id]));
  return (d.recipe||[]).map(r=>({...r,quantity:n(r.quantity)*quantity}))
 }
 const d=S.menu.find(m=>m.id===line.menuId)?.data;let recipe=ingredients(line.menuId,1);
 for(const g of d.posOptions118||[]){
  const selected=line.choices?.[g.id]||[];
  if(selected.length)recipe=recipe.filter(r=>!(g.replaces||[]).includes(r.itemId));
  for(const id of selected){const o=g.options.find(o=>o.id===id);if(!o)throw Error('Menu choice unavailable');recipe.push(...(o.recipe||[]))}
 }
 const rules=menuStockRules(line.menuId,line.choices),overrides=new Set(rules.filter(x=>x.rule.kind==='ingredient'||x.rule.kind==='supply').map(x=>x.item.id));
 for(const r of recipe){
  const ing=S.ingredients.find(i=>i.id===r.itemId)?.data,id=ing?.inventoryItemId118;
  if(!id||ing.active===false||overrides.has(id)||S.items.find(i=>i.id===id)?.data.posMenuExclude?.includes(line.menuId))continue;
  const qty=n(r.quantity)*n(ing.inventoryFactor118??1)*line.quantity;put(id,qty,qty)
 }
 for(const {item,rule} of rules){
  const allocated=n(rule.quantity)*line.quantity;
  const automatic=rule.stockMode?rule.stockMode==='all':rule.kind==='ingredient';
  const legacyCount=rule.kind==='packaging'?n(line.packaging?.[item.id]):0;
  put(item.id,allocated,automatic?allocated:n(rule.quantity)*legacyCount)
 }
 return [...stockRows.values()].map(row=>{
  const id=row.item.id,extra=n(line.onlineStockExtra?.[id]);
  const used=service==='Online'?row.allocated+extra:n(line.stockUsed?.[id]??row.initial);
  return {...row,used,extra}
 })
}
function recipeUsage124(data){
 const uses={};
 for(const line of data.lines||[])for(const {item,used} of lineStock(line,data.service)){
  if(used>0)uses[item.id]=(uses[item.id]||0)+used
 }
 return uses
}
function linkedStockFields(line,index,service){
 const rows=lineStock(line,service);if(!rows.length)return '';
 const online=service==='Online';
 return '<fieldset data-stock-index="'+index+'"><legend>'+esc(line.name)+' × '+fmt(line.quantity)+'</legend>'+rows.map(({item,allocated,used})=>{
  const id=esc(item.id),unit=esc(item.data.unit||'units'),name=esc(item.data.name);
  const selection=online?'':'<input type="checkbox" data-stock-select aria-label="Use '+name+'" '+(used>0?'checked':'')+'>';
  return '<div class="pos-adjust-row" data-stock-row="'+id+'" data-allocated="'+allocated+'"><label>'+selection+' '+name+'<small>Allocated '+fmt(allocated)+' '+unit+'</small></label><label>Total used ('+unit+')<input type="number" step="any" min="'+(online?allocated:0)+'" value="'+used+'" data-stock-amount required '+(!online&&used===0?'disabled':'')+'></label></div>';
 }).join('')+'</fieldset>'
}
function checkoutStock(form,service,fields){
 const online=service==='Online';
 const section=form.querySelector('[data-adjustment]');
 section.innerHTML=fields||'<p>No inventory is linked to the items in this order.</p>';
 section.onchange=e=>{
  const input=e.target;if(!input.matches('[data-stock-select]'))return;
  const row=input.closest('[data-stock-row]'),qty=row.querySelector('[data-stock-amount]');
  qty.disabled=!input.checked;qty.value=input.checked?row.dataset.allocated:0;
 };
 return ()=>{
  for(const row of section.querySelectorAll('[data-stock-row]')){
   const input=row.querySelector('[data-stock-amount]'),line=draft.data.lines[Number(row.closest('[data-stock-index]').dataset.stockIndex)];
   const id=row.dataset.stockRow,qty=input.disabled?0:input.valueAsNumber;
   if(!input.disabled&&!input.checkValidity()){section.hidden=false;form.closest('.pos-dialog118').querySelector('[data-toggle-adjustment]').setAttribute('aria-expanded','true');input.reportValidity();return false}
   const key=online?'onlineStockExtra':'stockUsed';
   line[key]={...line[key],[id]:online?Math.max(0,qty-Number(row.dataset.allocated)):qty};
  }
  return true
 };
}
function pendingStock(id){if(S.sample||S.owner!==offlineOwner())return 0;return S.offlineQueue.filter(e=>e.owner===offlineOwner()&&e.action==='pay'&&!S.stock.some(s=>s.order_id===e.order.id)&&!S.acknowledged125?.includes(e.order.id)).reduce((a,e)=>{try{return a+n((e.data.offlineUsage124||recipeUsage124(e.data))[id])}catch{return a}},0)}
function stock(id){if(S.balances125)return n(S.balances125[id])-pendingStock(id)+(window.kitchen124?.pendingDelta(id)||0);return S.moves.filter(r=>r.data.itemId===id).reduce((a,r)=>a+(['in','adjust-in'].includes(r.data.kind)?1:-1)*n(r.data.quantity),0)-S.stock.filter(r=>r.item_id===id).reduce((a,r)=>a+n(r.quantity),0)-pendingStock(id)+(window.kitchen124?.pendingDelta(id)||0)}
async function rpc(name,args){if(window.posPerformance125)return posPerformance125.rpc(name,args);const out=await ojmDb.rpc(name,args);if(out.error)throw Error(out.error.message);return out.data}
function offlineOwner(){return liveProfile?.id}
async function prepareReceiptNumbers(){
 if(S.sample||S.offline||!navigator.onLine||!restaurantCan('pos','sell'))return;
 const owner=offlineOwner(),epoch=sessionEpoch121;
 if(!owner||!S.shifts.some(shift=>!shift.closed_at&&shift.cashier===owner))return;
 const year=posReceiptBook.yearOf(Date.now());
 const reserve=(name,args)=>{
  if(owner!==offlineOwner()||sessionEpoch121!==epoch)throw Error('Account changed.');
  return rpc(name,args);
 };
 // Prepare the next business year as well, so a New Year outage does not interrupt checkout.
 await posReceiptBook.prepare(owner,year,reserve);
 await posReceiptBook.prepare(owner,year+1,reserve);
}

async function pending(){S.offlineQueue=await posOffline119.queue(offlineOwner());return S.offlineQueue}
function overlayPending(){
 if(draft&&S.offlineQueue.some(e=>e.action==='pay'&&e.order.id===draft.id)){fresh();rememberDraft()}
 for(const entry of S.offlineQueue){const order={...entry.order,offlinePending:true};S.orders=[order,...S.orders.filter(o=>o.id!==order.id)]}}
function matchesPayment(saved,sent){
 if(sent.tip==null)return true;
 if(saved?.payment!==sent.payment||!['tip','tendered','collectedTotal'].every(key=>saved[key]!=null&&Number(saved[key])===Number(sent[key])))return false;
 const expected=sent.fxTender,actual=saved.fxTender;
 if(!expected||!actual)return !expected&&!actual;
 return actual.currency===expected.currency&&['amount','rate','equivalentLak','changeLak'].every(key=>actual[key]!=null&&Number(actual[key])===Number(expected[key]));
}
function matchesReceipt(order,ticket){
 if(!ticket)return true;
 if(ticket.localRef)return order?.data?.localReceiptRef===ticket.localRef&&(order.data.receiptCode===ticket.localRef||/^OJM[0-9]{2}-4[A-Z][0-9]{3}$/.test(order.data.receiptCode));
 return order?.data?.receiptCode===ticket.code;
}
async function syncPending(){if(S.sample||!navigator.onLine||!offlineOwner())return;const owner=offlineOwner(),epoch=sessionEpoch121,valid=()=>owner===offlineOwner()&&epoch===sessionEpoch121;const entries=await posOffline119.queue(owner);if(!valid())return;S.offlineQueue=entries;S.syncError='';for(const entry of entries){if(!valid())return;try{
 let version=entry.order.version||0;
 if(!version&&entry.data.checkoutSaveNonce){
  const prior=await ojmDb.from('pos_orders118').select('id,version,status,data->>offlineNonce').eq('id',entry.order.id).maybeSingle();
  if(prior.error)throw Error(prior.error.message);
  if(prior.data?.status==='unpaid'&&prior.data.offlineNonce===entry.data.checkoutSaveNonce)version=prior.data.version;
 }

 const acknowledged=await rpc('pos_order118',{p_id:entry.order.id,p_version:version,p_action:entry.action,p_data:entry.data});
 if(!valid())return;
 if(entry.action==='pay'&&!matchesPayment(acknowledged?.data,entry.data)||acknowledged?.id!==entry.order.id||acknowledged.status!==(entry.action==='pay'?'paid':'unpaid')||acknowledged.data?.offlineNonce!==entry.data.offlineNonce||!matchesReceipt(acknowledged,entry.data.receiptTicket))throw Error('Receipt differs from this device. The local copy is retained for review.');
 await posOffline119.acknowledge(entry,acknowledged);
 if(valid()&&entry.action==='pay')S.orders=[acknowledged,...S.orders.filter(o=>o.id!==acknowledged.id)];
 if(valid()&&draft?.id===entry.order.id&&acknowledged.status==='unpaid'){draft.version=acknowledged.version;draft.number=acknowledged.number}
 }catch(e){if(valid())S.syncError='Sync pending · '+(entry.order.data.receiptCode||entry.order.number||entry.order.id)+': '+e.message;if(!navigator.onLine||window.posPerformance125?.network(e))break}}const left=await posOffline119.queue(owner);if(valid())S.offlineQueue=left}
let loadJob132=null;
function load(options={}){const owner=liveProfile?.id,epoch=sessionEpoch121;if(loadJob132?.owner===owner&&loadJob132.epoch===epoch)return loadJob132.promise;const job={owner,epoch,promise:null};loadJob132=job;job.promise=loadCore132(options).finally(()=>{if(loadJob132===job)loadJob132=null});return job.promise}
async function loadCore132(options={}){if(window.posPerformance125)return posPerformance125.load(S,{catalog,pick,overlayPending},options);if(S.busy||!offlineOwner())return;const owner=offlineOwner(),epoch=sessionEpoch121,valid=()=>owner===offlineOwner()&&epoch===sessionEpoch121;S.busy=true;S.error='';render();try{if(navigator.onLine)await syncPending();if(!valid())return;const data=await rpc('pos_snapshot118',{});if(!valid())return;if(!data||!Array.isArray(data.orders))throw Error('POS database setup is required. Apply the separate v118 POS SQL.');Object.assign(S,data,{loaded:true,owner,offline:false});await posOffline119.saveSnapshot(owner,data);if(!valid())return;navigator.storage?.persist?.().catch(()=>{});const entries=await posOffline119.queue(owner);if(!valid())return;S.offlineQueue=entries;overlayPending();const m=menuStore108.state;Object.assign(m,{menu:S.menu,ingredients:S.ingredients,items:S.items,categories:S.categories,moves:[...S.moves,...virtualMoves()],owner,loaded:true});if(!S.picked||!catalog().some(x=>x.id===S.picked))pick(catalog()[0]?.id,false)}catch(e){if(!valid())return;const connectionFailure=(!navigator.onLine||/failed to fetch|networkerror|network request failed|load failed/i.test(e.message))&&!/permission|access required|unauthorized|inactive/i.test(e.message);const cached=connectionFailure?await posOffline119.getSnapshot(owner).catch(()=>null):null;if(!valid())return;if(cached){Object.assign(S,cached.data,{loaded:true,owner,offline:true});const entries=await posOffline119.queue(owner);if(!valid())return;S.offlineQueue=entries;overlayPending();if(!S.picked||!catalog().some(x=>x.id===S.picked))pick(catalog()[0]?.id,false);Object.assign(menuStore108.state,{menu:S.menu,ingredients:S.ingredients,items:S.items,categories:S.categories,moves:[...S.moves,...virtualMoves()],owner,loaded:true});S.error='Offline: using the last saved Menu and shift. Sales remain on this device until synced.'}else{S.loaded=false;S.error=connectionFailure?'No offline copy is ready on this device. Connect once while signed in to prepare POS.':e.message;showCenterStatus(S.error,true)}}finally{if(valid()){S.busy=false;render()}}}

function virtualMoves(){return S.stock.map(r=>({id:r.id,created_at:r.created_at,data:{date:r.created_at.slice(0,10),kind:n(r.quantity)>0?'out':'adjust-in',itemId:r.item_id,quantity:Math.abs(n(r.quantity)),reference:'POS '+(S.orders.find(o=>o.id===r.order_id)?.number||r.order_id),note:r.kind==='return'?'Refund restock':'POS sale',pos118:true}}))}
async function task(message,fn){if(S.working)return;const owner=offlineOwner(),epoch=sessionEpoch121;S.working=true;status118.pending(message);try{return await fn()}catch(e){if(owner===offlineOwner()&&epoch===sessionEpoch121)showCenterStatus(e.message,true);throw e}finally{if(owner===offlineOwner()&&epoch===sessionEpoch121){S.working=false;render()}}}
function storedTotals(d){
 return {...total(d),discountType:'amount',discountInput:n(d.discount),discountInputType:d.discountType||'amount'};
}
function editableOrder(order){
 const copy=structuredClone(order),d=copy.data;
 if(d.discountInput!=null){d.discount=n(d.discountInput);d.discountType=d.discountInputType||'amount'}
 return copy;
}
function discountLabel(d){
 if(!n(d.discount))return 'None';
 return (d.discountName?d.discountName+' · ':'')+(d.discountType==='percent'?fmt(d.discount)+'%':money(d.discount));
}
function discountEditor(d){
 if(d.promotionClaim146||!restaurantCan('pos','sell'))return '<p class="muted">Discount · '+esc(discountLabel(d))+'</p>';
 const presets=(S.config.discountPresets||[]).filter(p=>p.enabled!==false);
 const current=presets.find(p=>p.id===d.discountPresetId&&(p.type==='open'||p.type===d.discountType&&Number(p.value)===Number(d.discount)));
 const manual=!!(n(d.discount)||d.discountName)&&!current;
 const stale=manual&&!!d.discountPresetId;
 const selected=current?'preset:'+current.id:stale?'previous':manual?d.discountType==='percent'?'percent':'amount':'none';
 const option=(key,label)=>'<option value="'+esc(key)+'"'+(selected===key?' selected':'')+'>'+esc(label)+'</option>';
 const options=option('none','No discount')+presets.map(p=>option('preset:'+p.id,p.name+' · '+(p.type==='open'?'Enter amount':p.type==='percent'?fmt(p.value)+'%':'₭'+fmt(p.value)))).join('')+(stale?option('previous',discountLabel(d)):'')+option('amount','Fixed amount · enter LAK')+option('percent','Percentage · enter %');
 const entry=selected==='amount'||selected==='percent'||current?.type==='open';
 return '<div class="pos-inline-discount" data-discount-editor><label>Discount<select data-discount-choice>'+options+'</select></label><label data-discount-value-label'+(entry?'':' hidden')+'><span>'+ (selected==='percent'?'Percentage (%)':'Amount (LAK)')+'</span><input data-discount-value inputmode="decimal" autocomplete="off" placeholder="0" value="'+(entry&&n(d.discount)?esc(fmt(d.discount)):'')+'"></label><small role="status" data-discount-error></small></div>';
}
function bindDiscount(host,order,onApply){
 const box=host?.querySelector('[data-discount-editor]');if(!box)return;
 const select=box.querySelector('select'),input=box.querySelector('input'),label=box.querySelector('[data-discount-value-label]'),error=box.querySelector('[data-discount-error]');
 function apply(selecting,validateOnly=false){
  if(order!==draft||order.data.promotionClaim146||!restaurantCan('pos','sell'))return;
  const d=order.data,key=select.value,p=(S.config.discountPresets||[]).find(x=>x.enabled!==false&&'preset:'+x.id===key);
  if(key==='previous')return;
  const type=key==='percent'||p?.type==='percent'?'percent':'amount';
  const entry=key==='amount'||key==='percent'||p?.type==='open';
  label.hidden=!entry;label.querySelector('span').textContent=type==='percent'?'Percentage (%)':'Amount (LAK)';
  if(selecting){input.value='';box.querySelector('option[value=previous]')?.remove()}
  const raw=input.value.trim(),validNumber=/^(?:\d+|\d{1,3}(?:,\d{3})+)?(?:\.\d{0,2})?$/.test(raw)&&raw!=='.';
  const value=entry?Number(raw.replaceAll(',','')):Number(p?.value||0);
  const problem=entry&&(!validNumber||!Number.isFinite(value)||value<0)?'Enter a positive number with up to two decimal places.':type==='percent'&&value>100?'Enter a percentage up to 100%.':type==='amount'&&value>total(d).subtotal?'Discount exceeds the order subtotal.':'';
  error.textContent=problem;input.setCustomValidity(entry?problem:'');select.setCustomValidity(entry?'':problem);
  if(validateOnly||!validNumber&&entry||!Number.isFinite(value))return;
  Object.assign(d,{discount:value,discountType:type,discountName:p?.name||(entry?'Open discount':''),discountPresetId:p?.id||''});
  updateDraftPanel();onApply?.();
  if(selecting&&entry)input.focus();
 }
 box.checkDiscount157=()=>apply(false,true);box.checkDiscount157();
 select.onchange=()=>apply(true);input.oninput=()=>apply(false);
 input.onblur=()=>{if(input.value&&input.validity.valid)input.value=fmt(Number(input.value.replaceAll(',','')))};
}
function validateDiscountEditor(host){
 const el=host?.querySelector('[data-discount-editor] :invalid');
 if(el){el.reportValidity();throw Error(el.validationMessage)}
}
function totalsHtml(d){const t=total(d);return `<div class="pos-totals118"><div><span>Subtotal</span><span>${money(t.subtotal)}</span></div><div><span>Discount</span><span>${money(t.discount)}</span></div><div class="total"><span>Total</span><span>${money(t.total)}</span></div></div>`}
const button=(label,action,cls='',attrs='')=>`<button type="button" class="${cls}" data-pos118="${action}" ${attrs}>${label}</button>`;
function orderLine(order,line,index,editable){
 const menu=S.menu.find(r=>r.id===line.menuId)?.data;
 const image={...line,photoData:line.photoData||menu?.photoData,photoUrl:line.photoUrl||menu?.photoUrl};
 const canDelete=!order.data.promotionClaim146&&restaurantCan('pos','sell')&&(editable||order.status==='unpaid');
 const qty=editable?`<div class="pos-qty118">${button('−','qty','','data-index118="'+index+'" data-delta118="-1" aria-label="Reduce quantity"')}<span>${line.quantity}</span>${button('+','qty','','data-index118="'+index+'" data-delta118="1" aria-label="Increase quantity"')}</div>`:'<small>Qty '+line.quantity+'</small>';
 return `<div class="pos-swipe-row" data-menu-id="${esc(line.menuId)}" ${canDelete?'tabindex="0" data-swipe-item aria-label="'+esc(line.name)+' · show delete action"':''}>
 <div class="pos-line118">${photo(image)}<div class="pos-line-main157"><div class="pos-line-name118"><strong>${esc(line.name)}</strong><span class="pos-amount118">${money(lineAmount(line))}</span>
 ${line.options?.length||line.note?'<small class="muted">'+esc([...(line.options||[]),line.note].filter(Boolean).join(' · '))+'</small>':''}
 ${editable&&menu?.posOptions118?.length?button('Edit choices','edit-line','','data-index118="'+index+'"'):''}</div>
 <div class="pos-line-values">${qty}${canDelete?button('Delete','remove','pos-swipe-delete','hidden data-index118="'+index+'" data-order-id="'+esc(order.id)+'" data-version="'+(order.version||0)+'" aria-label="Delete '+esc(line.name)+'"'):''}</div></div></div>
</div>`;
}
function wireSwipe(host){
 let gesture,swipedRow=null;
 function reveal(row,show){
  for(const item of host.querySelectorAll('.pos-swipe-row.revealed')){
   item.classList.remove('revealed');item.querySelector('.pos-swipe-delete').hidden=true;
  }
  if(row&&show){row.classList.add('revealed');row.querySelector('.pos-swipe-delete').hidden=false}
 }
 host.addEventListener('pointerdown',e=>{
  const row=e.target.closest('[data-swipe-item]');
  swipedRow=null;
  if(!row||e.target.closest('.pos-swipe-delete')){if(!row)reveal(null,false);return}
  gesture={row,x:e.clientX,y:e.clientY,id:e.pointerId};
 });
 function trackSwipe(e){
  if(!gesture||gesture.id!==e.pointerId||gesture.revealed)return;
  const dx=e.clientX-gesture.x,dy=Math.abs(e.clientY-gesture.y);
  if(dy>12&&dy>Math.abs(dx)){gesture=null;return}
  if(Math.abs(dx)<16||Math.abs(dx)<=dy)return;
  gesture.revealed=true;swipedRow=gesture.row;
  reveal(gesture.row,dx<0);
  if(e.type==='pointermove')gesture.row.setPointerCapture(e.pointerId);
 }
 host.addEventListener('pointermove',trackSwipe);
 host.addEventListener('pointerup',e=>{trackSwipe(e);gesture=null});
 host.addEventListener('pointercancel',()=>gesture=null);
 host.addEventListener('click',e=>{if(swipedRow?.contains(e.target)){e.preventDefault();e.stopImmediatePropagation();swipedRow=null}},true);
 host.addEventListener('contextmenu',e=>{const row=e.target.closest('[data-swipe-item]');if(row){e.preventDefault();reveal(row,true)}});
 host.addEventListener('keydown',e=>{const row=e.target.closest('[data-swipe-item]');if(!row)return;
  if(e.target===row&&['ArrowLeft','Delete','Enter'].includes(e.key)){e.preventDefault();reveal(row,true);row.querySelector('.pos-swipe-delete').focus()}
  else if(e.key==='Escape'){reveal(row,false);row.focus()}
 });
}
function updateDraftPanel(removedIndex){
 rememberDraft();
 const panel=$('#pos118 .order-pane');
 if(!panel?.querySelector('.pos-order-note118'))return;
 panel.querySelector('[data-discount-editor]')?.checkDiscount157?.();
 if(removedIndex!==undefined){
  panel.querySelectorAll('.pos-swipe-row')[removedIndex]?.remove();
  panel.querySelectorAll('.pos-swipe-row').forEach((row,index)=>{
   for(const button of row.querySelectorAll('[data-index118]'))button.dataset.index118=index;
  });
  if(!draft.data.lines.length)panel.querySelector('.pos-order-note118').insertAdjacentHTML('beforebegin',emptyOrder());
 }
 const footer=panel.querySelector('.pos-order-footer118');
 footer.querySelector('.pos-totals118').outerHTML=totalsHtml(draft.data);
 footer.querySelector('[data-pos118=charge]').disabled=!draft.data.lines.length;

}
function emptyOrder(){return '<div class="pos-empty-order" role="status"><strong>No order yet</strong><p>Double-tap or double-click a menu item to start an order.</p></div>'}
function tableNameField(customer){
 const options=(S.config.tables||[]).filter(table=>table.enabled!==false).map(table=>'<option value="'+esc(table.name)+'"></option>').join('');
 return `<input aria-label="Table or customer name" placeholder="Table / name" data-draft118="customer" value="${esc(customer)}"${options?' list="pos-order-tables"':''}>${options?'<datalist id="pos-order-tables">'+options+'</datalist>':''}`;
}
function orderPanel(order=draft,editable=true){const d=order.data;return `<section class="pos-card118 gold order-pane" data-order-id="${esc(order.id)}"><header><h2>Current Order</h2><div><strong>${order.offlinePending?'Pending sync':order.number?'#OJ-'+order.number:'New order'}</strong><div class="muted">${esc(d.service)} · ${esc(d.customer||'No table / name')}</div></div></header><div class="pos-order-body">${editable?`<div class="pos-order-meta118"><select aria-label="Order type" data-draft118="service">${['Dine in','Takeaway','Delivery','Online'].map(v=>`<option ${d.service===v?'selected':''}>${v}</option>`).join('')}</select>${tableNameField(d.customer)}</div>`:`<span class="status-pill118 ${order.status}">${esc(order.status)}</span> <span class="muted">${time(order.created_at)}</span>`}${d.lines.map((l,i)=>orderLine(order,l,i,editable)).join('')||emptyOrder()}${editable?`<textarea rows="1" class="pos-order-note118" aria-label="Order note" data-draft118="note" placeholder="Add note (e.g. no onion, extra sauce…)">${esc(d.note)}</textarea>${discountEditor(d)}`:''}</div><div class="pos-order-footer118">${d.promotion146?'<p class="muted">Offer '+esc(d.promotion146.name)+' · '+esc(d.promotion146.code)+'</p>':''}${totalsHtml(d)}<div class="pos-actions118">${editable?button('Save Unpaid','save'):button('▷ Resume Order','resume')}${button('Checkout','charge','primary',d.lines.length?'':'disabled')}</div><div class="pos-bottom118">${button(editable?'Receipt preview':'Print Bill','preview')}<span class="muted">Cash · BCEL QR · Bank</span></div>${!editable?`<div class="pos-actions118">${button('Cancel Order','cancel','danger')}</div>`:''}</div></section>`}
function customization(activeGroup){
 const d=catalog().find(r=>r.id===S.picked)?.data;if(!d)return '';
 const groups=d.posOptions118||[],group=groups.find(g=>g.id===activeGroup)||groups[0];
 const tabs=groups.map(g=>'<button type="button" data-builder-group="'+esc(g.id)+'" aria-pressed="'+(g===group)+'">'+esc(g.name)+'</button>').join('');
 let choices='';
 if(group){
  const g=group,ids=S.choices[g.id]||[],single=g.max===1&&(g.min===1||g.id==='grains154');
  const tiles=g.options.map(o=>{
   const checked=ids.includes(o.id),available=optionAvailable(o),disabled=!available||(!single&&!checked&&ids.length>=g.max);
   return '<label class="choice-tile131 '+(checked?'selected ':'')+(disabled?'unavailable':'')+'"><input type="'+(single?'radio':'checkbox')+'" name="choice-'+esc(g.id)+'" data-choice118="'+esc(g.id)+'" value="'+esc(o.id)+'" '+(checked?'checked':'')+' '+(disabled?'disabled':'')+'><span>'+esc(o.name)+(o.price?' +'+fmt(o.price):'')+(!available?' · unavailable':'')+'</span></label>';
  }).join('');
  choices='<fieldset class="pos-builder-options"><legend>'+esc(g.name)+'</legend><p class="choice-count131">'+ids.length+' selected · '+(g.included!=null?g.included+' included'+(n(g.extraPrice)?' · extra '+money(g.extraPrice)+' each':' · maximum '+g.max):'Choose '+g.min+'–'+g.max)+'</p><div class="choice-grid131">'+tiles+'</div>'+(single&&!g.min&&ids.length?'<button type="button" data-clear-group>Clear selection</button>':'')+'</fieldset>';
 }
 return '<section class="pos-custom118" aria-label="Customize selected item"><header><div><strong>'+esc(d.name)+'</strong><small>Item total · <span aria-live="polite">'+money(itemPrice(d))+'</span></small></div>'+button(S.editLine!=null?'Update item':'Add to Order','add','primary')+'</header><div class="pos-builder-scroll">'+(d.description?'<p>'+esc(d.description)+'</p>':'')+(tabs?'<nav class="pos-builder-tabs" aria-label="Ingredient categories">'+tabs+'</nav>':'')+choices+'<label class="pos-note131">Preparation note / allergy information<input class="wide" data-item-note118 placeholder="Add a note" value="'+esc(S.note)+'"></label></div></section>';
}

function configureItem(){
 const root=dialog('Order options',customization()),body=root.querySelector('.ui-body108');
 const panel=root.querySelector('.pos-dialog118'),header=panel.querySelector('header'),close=header.querySelector('[data-close]');
 panel.classList.add('pos-builder157');
 function syncHeader(){
  const itemHeader=body.querySelector('.pos-custom118>header');
  header.replaceChildren(close,...itemHeader.children);
  itemHeader.remove();
 }
 syncHeader();
 header.addEventListener('click',e=>{
  if(e.target.closest('[data-pos118="add"]'))try{add();root.resolve108(true)}catch(err){showCenterStatus(err.message,true)}
 });
 let active=body.querySelector('[data-builder-group]')?.dataset.builderGroup;
 function paint(focus,reset=false){
  const scroll=body.querySelector('.pos-builder-scroll').scrollTop,offset=body.querySelector('.pos-builder-tabs')?.scrollLeft||0;
  body.innerHTML=customization(active);syncHeader();
  body.querySelector('.pos-builder-scroll').scrollTop=reset?0:scroll;
  const tabs=body.querySelector('.pos-builder-tabs');if(tabs)tabs.scrollLeft=offset;
  const next=body.querySelector(focus);next?.focus({preventScroll:true});if(next?.hasAttribute('data-builder-group'))next.scrollIntoView({block:'nearest',inline:'nearest'});
 }
 body.oninput=e=>{if(e.target.matches('[data-item-note118]'))S.note=e.target.value};
 body.onchange=e=>{const t=e.target;if(!t.matches('[data-choice118]'))return;active=t.dataset.choice118;
  S.choices[active]=[...body.querySelectorAll('[data-choice118]:checked')].map(i=>i.value);
  paint('[data-choice118][value="'+CSS.escape(t.value)+'"]')
 };
 body.onclick=e=>{const tab=e.target.closest('[data-builder-group]');
  if(tab){active=tab.dataset.builderGroup;paint('[data-builder-group="'+CSS.escape(active)+'"]',true);return}
  if(e.target.closest('[data-clear-group]')){S.choices[active]=[];paint('[data-builder-group="'+CSS.escape(active)+'"]');return}
 };
}
async function menuDetails(id){
 const m=catalog().find(x=>x.id===id);if(!m)return;
 const names=arr=>arr.map(x=>esc(x)).join(', ');
 const norm=name=>String(name).toLowerCase().replace(/^the /,'').replace(/[^a-z0-9]/g,'').replace(/s$/,'');
 function parts(record){
  return (record?.data.recipe||[]).flatMap(r=>{
   const source=(record.data.itemType==='bundle'?S.menu:S.ingredients).find(x=>x.id===r.itemId)?.data;
   return source?[source.name+(Number(r.quantity)>0?' · '+fmt(r.quantity)+' '+(source.unit||'pcs'):'')]:[]
  })
 }
 const sections=(m.worksheetNames||[]).map(g=>{
  const list=g.kind==='components'?g.names.map(name=>{
   const item=S.menu.find(r=>norm(r.data.name)===norm(name));
   const ingredients=parts(item);const detail=ingredients.length?ingredients:[...new Set((item?.worksheetNames||[]).filter(s=>s.kind==='recipe').flatMap(s=>s.names))];
   return '<li><strong>'+esc(name)+'</strong>'+(detail.length?' · '+names(detail):'')+'</li>'
  }).join(''):g.names.map(n=>'<li>'+esc(n)+'</li>').join('');
  return '<section><h4>'+esc(g.kind==='components'?'Combo contents':g.title)+'</h4><ul>'+list+'</ul></section>'
 }).join('');
 const base=parts(m),opts=(m.data.posOptions118||[]).map(g=>'<p><b>'+esc(g.name)+'</b> · '+names(g.options.filter(o=>o.available!==false).map(o=>o.name))+'</p>').join('');
 const picture=photo(m.data);
 const root=dialog(m.data.name,'<div class="pos-customer-menu">'+(picture.includes('<img')?picture:'')+'<div class="pos-customer-recipe"><p><strong>'+money(m.data.price)+'</strong></p>'+(m.data.description?'<p>'+esc(m.data.description)+'</p>':'')+(base.length?'<p><b>Ingredients or components</b> · '+names(base)+'</p>':'')+'<div data-customer-sections>'+sections+'</div>'+opts+(!base.length&&!sections&&!opts?'<p>Ingredient details have not been recorded.</p>':'')+'</div></div>');
 root.querySelector('.pos-dialog118').classList.add('pos-menu-detail-dialog');
 if(!sections||!ojmDb||!navigator.onLine)return;
 const owner=liveProfile?.id,epoch=sessionEpoch121;
 try{
  const result=await ojmDb.from('restaurant_kitchen_worksheets').select('sections').eq('menu_id',m.id).maybeSingle();
  if(result.error||!root.isConnected||liveProfile?.id!==owner||epoch!==sessionEpoch121)return;
  const groups=result.data?.sections;
  if(!groups?.length||groups.some(g=>g.kind==='components'))return;
  root.querySelector('[data-customer-sections]').innerHTML=groups.map(g=>'<section><h4>'+esc(g.title)+'</h4><ul>'+g.rows.map(r=>{
   const portion=[r.quantity!=null?fmt(r.quantity)+' '+(r.unit||''):'',r.note].filter(Boolean).join(' · ');
   return '<li>'+esc(r.name)+(portion?' · '+esc(portion):'')+'</li>'
  }).join('')+'</ul></section>').join('')
 }catch{/* The cashier snapshot already supplies ingredient names offline. */}
}
function selectTile(id){
 const menu=$('#pos118 .pos-catalog118');
 if(!menu)return;
 menu.querySelector('.pos-product118.active')?.classList.remove('active');
 menu.querySelector('.pos-product118[data-id118="'+CSS.escape(id)+'"]')?.classList.add('active');
}
function searchText154(value){return String(value??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').trim()}
function filteredItems(){const terms=searchText154(S.query).split(/\s+/).filter(Boolean);return catalog().filter(r=>(S.classification==='All'||(S.classification==='Customizable')===!!r.data.posCustom118)&&(S.category==='All'||r.data.category===S.category)&&terms.every(term=>searchText154([r.data.name,r.data.code,categoryName(r.data.category),r.data.sourceCategory131==='bakery'?'bread breads bakery buns rolls':'',r.data.description].join(' ')).includes(term)))}
function catalogTiles(items){return `${items.slice(0,S.visibleMenu).map(r=>`<div class="pos-menu-tile"><button type="button" class="pos-product118 ${S.picked===r.id?'active':''}" data-pos118="pick" data-id118="${esc(r.id)}">${photo(r.data)}<strong>${esc(r.data.name)}</strong><small>${money(r.data.price)}</small><small>${r.data.posCustom118?'Customize':'Standard'}</small></button>${button('ⓘ','details','pos-info','data-id118="'+esc(r.id)+'" aria-label="Details for '+esc(r.data.name)+'"')}</div>`).join('')||'<p>No matching items.</p>'}`}
function refreshCatalog(){
 const grid=$('#pos118 .pos-catalog118');
 if(!grid)return;
 const items=filteredItems();
 grid.innerHTML=catalogTiles(items);
 const status=grid.parentElement.querySelector('[data-search-status154]');if(status)status.textContent=items.length+' menu items'+(S.query.trim()?' matching “'+S.query.trim()+'”':'');
 grid.parentElement.querySelector('[data-pos118="more-menu"]')?.remove();
 if(items.length>S.visibleMenu)grid.insertAdjacentHTML('afterend',button('Show more menu items','more-menu'));
 for(const filter of grid.parentElement.querySelectorAll('[data-pos118="classification"],[data-pos118="category"]')){
  filter.classList.toggle('active',S[filter.dataset.pos118]===filter.dataset.value118);
 }
}
function newOrder(){const items=filteredItems();return `<div class="pos-grid118 register-panes"><section class="pos-card118 menu-pane"><div class="pos-filter118"><input type="search" data-search118 placeholder="Search menu, code or category…" aria-label="Search menu" value="${esc(S.query)}"><div class="pos-pills118">${['All','Standard','Customizable'].map(c=>button(c,'classification',S.classification===c?'active':'','data-value118="'+c+'"')).join('')}</div><div class="pos-pills118">${['All',...new Set(catalog().map(r=>r.data.category||'Other'))].map(c=>button(esc(categoryName(c)),'category',S.category===c?'active':'','data-value118="'+esc(c)+'"')).join('')}</div></div><p class="pos-search-status154" data-search-status154 role="status">${items.length} menu items</p><div class="pos-catalog118">${catalogTiles(items)}</div>${items.length>S.visibleMenu?button('Show more menu items','more-menu'):''}</section>${orderPanel()}</div>`}
function selectedOrder(){return S.orders.find(o=>o.id===S.selected)}
function openOrders(online=false){const orders=S.orders.filter(o=>o.status==='unpaid'&&(!online||o.data.service==='Online')&&(S.filter==='All'||o.data.service===S.filter)&&JSON.stringify([o.number,o.data.customer]).toLowerCase().includes(S.query.toLowerCase()));const selected=orders.find(o=>o.id===S.selected)||orders[0];if(selected)S.selected=selected.id;return `<div class="pos-grid118 register-panes"><section class="pos-card118 menu-pane"><header><h2>${online?'Online Orders':'Open Orders'}</h2><input data-search118 placeholder="Search order, table or name…" aria-label="Search orders" value="${esc(S.query)}"></header>${online?'<p class="muted">Promotion orders are available in Offer orders. Other messaging orders are entered manually.</p>':''}<div class="pos-pills118">${['All','Dine in','Takeaway','Delivery','Online'].map(v=>button(v,'filter',S.filter===v?'active':'','data-value118="'+v+'"')).join('')}</div><table><thead><tr>${['Order','Table / Name','Time','Items','Total','Status'].map(v=>'<th>'+v+'</th>').join('')}</tr></thead><tbody>${orders.slice(0,S.visibleOrders).map(o=>`<tr data-order118="${o.id}" class="${o===selected?'selected':''}" tabindex="0"><td>OJ-${o.number}</td><td>${esc(o.data.customer||o.data.service)}</td><td>${time(o.created_at)}</td><td>${o.data.lines.reduce((a,l)=>a+n(l.quantity),0)}</td><td>${money(o.data.total)}</td><td><span class="status-pill118 unpaid">Unpaid</span></td></tr>`).join('')||'<tr><td colspan="6">No open orders.</td></tr>'}</tbody></table><div class="pos-table-footer118">${orders.length} open orders · ${money(orders.reduce((a,o)=>a+n(o.data.total),0))}${orders.length>S.visibleOrders?button('Show more','more'):''}</div></section>${selected?orderPanel(selected,false):'<section class="pos-card118"><h2>Current Order</h2><div class="pos-empty-order" role="status"><strong>No open order selected</strong><p>Select an order from the list or start a new one.</p></div>'+button('New Order','new','primary')+'</section>'}</div>`}
const paperPreferenceKey=()=>'restaurant-receipt-width:'+OJM_SUPABASE_URL;
function devicePaper(){
 try{
  const saved=localStorage.getItem(paperPreferenceKey());
  return ['56','58','80'].includes(saved)?saved:'restaurant';
 }catch{return 'restaurant'}
}
function paperWidth(){
 const preference=devicePaper();
 if(preference==='restaurant')return [56,58,80].includes(Number(S.config.receiptWidth))?Number(S.config.receiptWidth):56;
 return [56,58,80].includes(Number(preference))?Number(preference):56;
}
function printerSetup(){
 if(!restaurantRouteAllowed128('pos118'))throw Error('POS access required.');
 const capability=posPrinter.capabilities();
 const root=dialog('Receipt printer',`<div class="pos-printer-settings">
 <label>Roll width on this device<select name="devicePaper"><option value="56">56 mm · 5.6 cm</option><option value="58">58 mm</option><option value="80">80 mm</option><option value="restaurant">Restaurant setting (${n(S.config.receiptWidth)} mm)</option></select></label>
 <h4>Printer connection</h4><p><strong>${esc(capability.platform)}</strong> · ${capability.usb?'Direct USB available':capability.system?'System printing available':'Native printer connection required'}</p><p data-printer-status role="status"></p>
 <div class="pos-actions118"><button type="button" data-find-usb ${capability.usb?'':'hidden'}>Find USB printer</button><button type="button" data-system-printer ${capability.system?'':'hidden'}>Use system printing</button></div>
 <p>${esc(capability.guide)}</p>
 ${capability.usb?'<section aria-label="Permitted USB printers"><h4>Permitted USB printers</h4><button type="button" data-refresh-printers>Refresh devices</button><div data-printer-list role="status">Tap Refresh devices to see connected printers you already allowed. Tap Find USB printer to grant permission to another printer.</div></section>':''}
 <details><summary>Bluetooth or Wi-Fi printer?</summary><p>USB discovery only lists USB connections. Pairing a Bluetooth printer in tablet settings does not give this website access to it. Direct Bluetooth or Wi-Fi printing requires a supported printer connection for that model; it is not enabled by this USB setting.</p></details>
 <p>Keep your existing printer driver. If another app or driver controls the USB connection, use System printing. In its print window, choose the thermal printer and matching paper size; the tablet may otherwise select Letter or A4.</p>
 <button type="button" data-test-paper>Print sample receipt</button><p>A sample is marked TEST · NOT A SALE. No payment, sale, receipt number or stock movement is recorded.</p>
 <output role="status"></output><small data-receipt-stock></small></div>`,null,{explicitClose:true});
 const picker=root.querySelector('[name=devicePaper]'),status=root.querySelector('output'),connection=root.querySelector('[data-printer-status]');
 const refresh=()=>{connection.textContent=posPrinter.status()};refresh();
 const find=root.querySelector('[data-find-usb]'),system=root.querySelector('[data-system-printer]'),test=root.querySelector('[data-test-paper]');
 const run=async job=>{root.querySelectorAll('[data-find-usb],[data-system-printer],[data-test-paper],[data-refresh-printers],[data-use-printer]').forEach(b=>b.disabled=true);status.textContent='';try{status.textContent=await job()||''}catch(error){status.textContent=error.name==='NotFoundError'?'No printer selected. Connect your printer, then try again.':error.message}finally{root.querySelectorAll('[data-find-usb],[data-system-printer],[data-test-paper],[data-refresh-printers],[data-use-printer]').forEach(b=>b.disabled=false);refresh()}};
 find.onclick=()=>run(async()=>{const name=await posPrinter.select();return name+' connected. Print a sample to check the paper.'});
 system.onclick=()=>run(async()=>{await posPrinter.useSystem();return 'System printing selected on this device.'});
 const refreshDevices=root.querySelector('[data-refresh-printers]');
 if(refreshDevices)refreshDevices.onclick=()=>run(async()=>{
  const devices=await posPrinter.authorized(),list=root.querySelector('[data-printer-list]');list.replaceChildren();
  if(!devices.length){list.textContent='No permitted USB printer is currently connected. Connect its USB cable, then tap Find USB printer and allow access.';return}
  for(const device of devices){const button=document.createElement('button');button.type='button';button.dataset.usePrinter='';button.textContent='Connect · '+(device.productName||'USB receipt printer');button.onclick=()=>run(async()=>{const name=await posPrinter.select(device);return name+' connected. Print a sample to check the paper.'});list.append(button)}
 });
 picker.value=devicePaper();
 if(offlineOwner()&&!S.sample)posReceiptBook.ready(offlineOwner(),posReceiptBook.yearOf(Date.now())).then(ready=>{
  if(root.isConnected)root.querySelector('[data-receipt-stock]').textContent=ready?'This register is ready to issue receipts offline.':'Open a shift online once to prepare offline receipts on this register.';
 }).catch(()=>{});
 picker.onchange=()=>{
  try{localStorage.setItem(paperPreferenceKey(),picker.value);status.textContent=paperWidth()+' mm saved on this device.';showCenterStatus(status.textContent);render()}
  catch{picker.value=devicePaper();status.textContent='Could not save the paper width on this device.';showCenterStatus(status.textContent,true)}
 };
 test.onclick=()=>run(async()=>{
  const width=paperWidth();
  const content='<article class="pos-thermal-paper"><div class="paper-brand"><img src="assets/brand/oonjai-logo.png" alt="Oon Jai Marketplace"><strong>Printer test</strong><b>TEST · NOT A SALE</b></div><hr><div class="receipt-row118"><span>Roll width</span><b>'+width+' mm</b></div><div class="receipt-row118"><strong>Left edge</strong><strong>Right edge</strong></div><hr><p>Sample item · 10,000 LAK</p><p class="receipt-foot118">End of test</p></article>';
  return await printPaper(width,'Printer test',content);
 });
 const onStatus=()=>{if(root.isConnected)refresh();else window.removeEventListener('restaurant:printer-status',onStatus)};
 window.addEventListener('restaurant:printer-status',onStatus);
}
async function previewNumber(order){
 if(!order.data.lines.length||['paid','refunded'].includes(order.status))return;
 const owner=offlineOwner(),epoch=sessionEpoch121,stamp=Date.now();
 if(S.sample){
  order.previewCode='OJM'+String(posReceiptBook.yearOf(stamp)).slice(-2)+'-4A'+String(((Number(order.number)||1)-1)%999+1).padStart(3,'0');
 }else{
  const ticket=await posReceiptBook.issue(owner,order.id,stamp,rpc,!S.offline&&navigator.onLine);
  if(owner!==offlineOwner()||epoch!==sessionEpoch121)throw Error('The signed-in cashier changed.');
  order.previewCode=ticket.code;
 }
}
function receipt(o,kitchen=false,checkout=false,fx=o.data.fxTender,tip=n(o.data.tip)){
 const d=o.data,paid=['paid','refunded'].includes(o.status);
 const t=checkout||o===draft||d.total==null?total(d):d;
 const printedAt=paid?o.paid_at:o.created_at||new Date();
 const reference=paid?posReports.numberFor(o):o.previewCode||(Number(o.number)?'OJ-'+o.number:'');
 const row=(label,value)=>'<div class="receipt-row118"><span>'+label+'</span><span>'+value+'</span></div>';
 const tendered=d.tendered==null||d.tendered===''?null:Number(d.tendered);
 const collected=(Math.round(t.total*100)+Math.round(tip*100))/100;
 return `<article class="pos-thermal-paper" style="--receipt-width:${paperWidth()}mm"><div class="paper-brand"><img src="assets/brand/oonjai-logo.png" alt="Oon Jai Marketplace"><strong>${kitchen?'Kitchen ticket':'Oon Jai Marketplace'}</strong>${!paid&&!kitchen?'<b>UNPAID BILL · NOT A PAYMENT RECEIPT</b>':''}${S.sample?'<b>SAMPLE · NOT A SALE</b>':o.offlinePending&&paid?'<b>LOCAL COPY · PENDING SYNC</b>':''}</div><hr>
 <div class="receipt-row118 paper-meta"><span>${esc(d.service)}</span><strong${reference.startsWith('R-L')?' class="paper-local-ref"':''}>${esc(reference)}</strong></div>
 ${d.localReceiptRef&&d.localReceiptRef!==reference?'<div class="paper-local-ref">Offline ref: '+esc(d.localReceiptRef)+'</div>':''}
 <div>Cashier: ${esc(d.cashier||currentUser())}</div>${d.customer?'<div>'+esc(d.customer)+'</div>':''}<hr>
 ${d.lines.map(l=>row('<b>'+fmt(l.quantity)+' × '+esc(l.name)+'</b>',kitchen?'':fmt(lineAmount(l)))+
 (l.options?.length?'<div>+ '+esc(l.options.join(', '))+'</div>':'')+(l.note?'<div><b>Note:</b> '+esc(l.note)+'</div>':'')).join('')}
 ${d.note?'<p><b>Order note:</b> '+esc(d.note)+'</p>':''}${d.promotion146?'<p>Offer: '+esc(d.promotion146.name)+'<br>Reference: '+esc(d.promotion146.code)+(d.promotion146.voucher?'<br>Voucher: '+esc(d.promotion146.voucher):'')+'</p>':''}
 ${kitchen?'':('<hr>'+row('Subtotal',fmt(t.subtotal))+row(d.discountName?'Discount · '+esc(d.discountName):'Discount',fmt(t.discount))+
 (tip?row('Tip',fmt(tip)):'')+'<hr>'+row('<b>TOTAL</b>','<b>'+money(collected)+'</b>')+
 (paid?'<hr><div>'+esc(o.status==='refunded'?'REFUNDED':'Paid · '+d.payment)+'</div>':'')+
 (paid&&Number.isFinite(tendered)&&(d.payment==='Cash'||d.tip!=null||fx)?row('Amount received',money(tendered))+row('Change',money((Math.round(tendered*100)-Math.round(collected*100))/100)):'')+
 fxSummary(fx)+(d.paymentReference?'<div>Reference: '+esc(d.paymentReference)+'</div>':'')+'<p class="receipt-foot118">'+esc(d.receiptFooter??S.config.receiptFooter)+'</p>')}
 <small class="paper-timestamp">${date(printedAt)} · ${time(printedAt)}</small></article>`;
}
function receiptStyleText(){
 const sheet=document.querySelector('link[href*="/pos-receipt.css"],link[href^="styles/pos-receipt.css"]')?.sheet;
 if(!sheet)throw Error('Receipt layout is still loading. Tap Print again.');
 return Array.from(sheet.cssRules,rule=>rule.cssText).join('\n');
}
function isolateReceiptPreviews(root){
 const papers=[...root.querySelectorAll('article.pos-thermal-paper')];
 if(!papers.length)return;
 const css=receiptStyleText();
 for(const paper of papers){
  const host=document.createElement('div');host.className='pos-paper-preview';
  const shadow=host.attachShadow({mode:'open'}),style=document.createElement('style');
  style.textContent=':host{all:initial;display:block;direction:ltr;color:#171d18;font:16px/normal Georgia,serif;text-align:left}'+css;
  paper.replaceWith(host);shadow.append(style,paper);
 }
}
function availableCurrencies(){
 const common=['USD','THB','EUR','CNY','GBP','AUD','JPY','VND','PHP'];
 return [...new Set([...common,...(Intl.supportedValuesOf?.('currency')||[])])].filter(c=>c!=='LAK');
}
function acceptedCurrencies(config=S.config){
 const known=new Set(availableCurrencies());
 return [...new Set(Array.isArray(config.fxCurrencies)?config.fxCurrencies:['USD','THB'])].filter(c=>known.has(c));
}
function currencyAmount(value,currency){
 const symbol={USD:'$',LAK:'₭',THB:'฿'}[currency];
 if(symbol)return symbol+fmt(value);
 try{return new Intl.NumberFormat('en-US',{style:'currency',currency,maximumFractionDigits:2}).format(n(value))}catch{return fmt(value)+' '+currency}
}
function fxSummary(fx){
 if(!fx)return '';
 return '<p class="receipt-fx"><span>FX payment: '+esc(currencyAmount(fx.amount,fx.currency))+' = '+esc(currencyAmount(fx.equivalentLak,'LAK'))+'</span><span>'+(fx.changeLak<0?'Still due: ':'Change: ')+esc(currencyAmount(Math.abs(fx.changeLak),'LAK'))+'</span></p>';
}
function receipts(){const rows=S.orders.filter(o=>['paid','refunded'].includes(o.status)&&(S.sample||!S.receiptDate||new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Vientiane'}).format(new Date(o.paid_at))===S.receiptDate)&&(S.filter==='All'||S.filter==='Refunds'&&o.status==='refunded'||o.data.payment===S.filter)&&[posReports.numberFor(o),restaurantReportSummary.localReference(o)].some(ref=>ref.toLowerCase().includes(S.query.toLowerCase().replace(/^#/,''))));const selected=rows.find(o=>o.id===S.selected)||rows[0];if(selected)S.selected=selected.id;return `<div class="pos-grid118"><section class="pos-card118"><header><h2>Receipts</h2><input type="date" aria-label="Receipt date" data-receipt-date118 value="${esc(S.receiptDate||'')}"></header><div class="pos-filter118"><input data-search118 placeholder="Search receipt number…" aria-label="Search receipt number" value="${esc(S.query)}"><div class="pos-pills118">${['All','Cash','BCEL QR','Bank','Refunds'].map(v=>button(v,'filter',S.filter===v?'active':'','data-value118="'+v+'"')).join('')}</div></div><table><thead><tr><th>Receipt</th><th>Time</th><th>Payment</th><th>Status</th><th>Amount</th></tr></thead><tbody>${rows.slice(0,S.visibleOrders).map(o=>`<tr tabindex="0" data-order118="${o.id}" class="${o===selected?'selected':''}"><td>${esc(posReports.numberFor(o))}</td><td>${time(o.paid_at)}</td><td>${esc(o.data.payment)}</td><td><span class="status-pill118 ${o.status}">${o.status==='paid'?'● Paid':'● Refunded'}</span></td><td>${money((o.data.collectedTotal??o.data.total))}</td></tr>`).join('')||'<tr><td colspan="5">No receipts for this selection.</td></tr>'}</tbody></table><div class="pos-table-footer118">${S.schema125?'Showing '+rows.length+' of '+n(S.receiptCount125)+' receipts · ':''}${rows.filter(o=>o.status==='paid').length} paid receipts · ${money(rows.filter(o=>o.status==='paid').reduce((a,o)=>a+n((o.data.collectedTotal??o.data.total)),0))}　|　Refunds · ${money(rows.filter(o=>o.status==='refunded').reduce((a,o)=>a+n((o.data.collectedTotal??o.data.total)),0))}${(rows.length>S.visibleOrders||S.schema125&&S.receiptCount125>S.orders.filter(o=>['paid','refunded'].includes(o.status)).length)?button('Show more','more'):''}</div></section><section class="pos-card118 gold"><h2>Receipt Preview</h2>${selected?`<div class="receipt-wrap118">${receipt(selected)}</div><div class="pos-actions118">${button('Reprint Receipt','print','primary')}${button('Save PDF','pdf')}${button('Refund','refund','danger',selected.status==='paid'&&restaurantCan('pos','refund')?'':'disabled')}</div><p class="muted">PDF uses your browser’s Save as PDF option. Refunds require administrator access.</p>`:'<p>Select a receipt.</p>'}</section></div>`}
function overview(){if(S.schema125&&!S.sample)return posPerformance125.overview(S);const relevant=S.orders.filter(o=>S.sample||date(o.paid_at||o.created_at)===date(new Date())),paid=relevant.filter(o=>['paid','refunded'].includes(o.status)),refunds=S.orders.filter(o=>o.status==='refunded'&&(S.sample||date(o.refunded_at)===date(new Date()))),refTotal=refunds.reduce((a,o)=>a+n(o.data.total),0),net=paid.reduce((a,o)=>a+n(o.data.total),0)-refTotal,open=S.orders.filter(o=>o.status==='unpaid'),shift=S.shifts.find(s=>(S.sample||s.cashier===liveProfile?.id)&&!s.closed_at),cashNet=paid.filter(o=>o.data.payment==='Cash').reduce((a,o)=>a+n(o.data.total),0)-refunds.filter(o=>o.data.payment==='Cash').reduce((a,o)=>a+n(o.data.total),0),pop={};paid.filter(o=>o.status==='paid').forEach(o=>o.data.lines.forEach(l=>{pop[l.menuId]??={...l,sold:0};pop[l.menuId].sold+=n(l.quantity)}));let popular=Object.values(pop).sort((a,b)=>b.sold-a.sold).slice(0,5);const alerts=S.items.filter(i=>i.data.active!==false&&stock(i.id)<=n(i.data.reorder));return `<header class="pos-top118"><h2>Today at a glance</h2><span>${S.sample?'28 Sep 2026':date(new Date())}</span>${button('Shift: '+(shift?'Open':'Closed'),'shift-view')}${button('⊕ New Order','new','primary')}</header><div class="pos-metrics118">${[['▥','Net Sales',money(net)],['♧','Paid Orders',paid.filter(o=>o.status==='paid').length],['▤','Open Orders',open.length],['↶','Refunds',money(refTotal)]].map(([icon,label,value])=>`<section class="pos-card118 pos-metric118"><span>${icon}</span><div>${label}<strong>${value}</strong></div></section>`).join('')}</div><div class="pos-overview118"><section class="pos-card118"><h2>Payment summary</h2><table><thead><tr><th>Method</th><th>Received</th><th>Refunded</th><th>Net</th></tr></thead><tbody>${S.config.methods.map(method=>{const received=paid.filter(o=>o.data.payment===method).reduce((a,o)=>a+n(o.data.total),0),refunded=refunds.filter(o=>o.data.payment===method).reduce((a,o)=>a+n(o.data.total),0);return `<tr><td>${esc(method)}</td><td>${money(received)}</td><td>${money(refunded)}</td><td>${money(received-refunded)}</td></tr>`}).join('')}</tbody></table><div class="pos-totals118"><div class="total"><span>Net sales</span><strong>${money(net)}</strong></div></div></section><section class="pos-card118"><header><h2>Current Shift</h2><span class="status-pill118">${shift?'● Open':'Closed'}</span></header>${shift?`<div class="pos-shift118"><div><span>Cashier</span><span>${esc(currentUser())}</span></div><div><span>Opened at</span><span>${time(shift.opened_at)}</span></div><div><span>Opening float</span><span>${money(shift.opening)}</span></div><hr><div><span>Cash in / out</span><span>${money(S.cash.filter(c=>c.shift_id===shift.id).reduce((a,c)=>a+n(c.amount),0))}</span></div><div><span>Expected kip drawer</span><strong>${money(shiftExpected(shift))}</strong></div></div><div class="pos-actions118">${button('Cash In / Out','cash')}${button('Close Shift','close-shift','primary')}</div>`:`<p>Enter the opening cash float before taking payments.</p>${button('Open Shift','open-shift','primary')}`}</section><section class="pos-card118"><h2>Popular items today</h2><div class="pos-popular118">${popular.map(l=>`<div>${photo(l)}<strong>${esc(l.name)}</strong><small>${l.sold} sold</small></div>`).join('')||'<p>No paid orders today.</p>'}</div></section><section class="pos-card118"><header><h2>Inventory alerts</h2>${button('View Inventory ›','inventory')}</header>${S.sample?'<div class="pos-setting-row118"><strong>Tofu</strong><span class="status-pill118 refunded">Low stock</span></div><div class="pos-setting-row118"><strong>Avocado</strong><span class="status-pill118 refunded">Low stock</span></div>':alerts.map(i=>`<div class="pos-setting-row118"><strong>${esc(i.data.name)}</strong><span>${fmt(stock(i.id))} ${esc(i.data.unit)} · Low stock</span></div>`).join('')||'<p>Stock levels are above configured reorder points.</p>'}</section></div>`}
function shiftExpected(s){if(S.schema125&&!S.sample)return n(S.shiftExpected125);return posShifts.sampleReport(S,s).cash.find(c=>c.currency==='LAK')?.expected||0}
function management(){const row=(name,value,action)=>`<div class="pos-setting-row118"><span>${name}</span><small>${value}</small>${button('›',action,'','aria-label="'+name+'"')}</div>`,card=(title,body)=>`<section class="pos-card118 gold"><h2>${title}</h2>${body}</section>`;return `<div class="pos-management118">${card('Menu & Categories',row('Menu items','Shared with Menu','menu')+row('Categories','Shared with Menu','categories')+row('Prices & display','Shared website and POS menu','menu-display')+button('Open Menu','menu','wide')+(isAdmin121()?button('Menu Display','menu-display','wide'):''))}${card('Customizations',(restaurantRouteAllowed128('inv-allocated')?button('Allocated stock by menu','allocated-stock','wide'):'')+row('Base & protein','Required choices','options')+row('Toppings & extras','Portions and add-on prices','options')+row('Ingredient links','Connected to Inventory','links')+button('Manage Options','options','wide'))}${card('Discounts & tables',row('Named discounts','Percentage, fixed or open amount','manage-discounts')+row('Table list',(S.config.tables||[]).length+' tables','manage-tables')+button('Manage discounts','manage-discounts','wide')+button('Manage tables','manage-tables','wide'))}${card('Printing',row('Receipt printer',esc(posPrinter.status()),'printer-setup')+row('Kitchen ticket','Selected options and notes','kitchen')+row('Receipt layout',paperWidth()+' mm','printer-setup')+`<div class="pos-actions118">${button('Configure Printing','printer-setup')}${button('Preview Layout','preview')}</div>`)}${card('Payments & Access',row('Payment methods',S.config.methods.join(', '),'settings')+row('Foreign currencies',acceptedCurrencies().join(', ')||'None enabled','settings')+row('Refunds & voids','Reason recorded','settings')+button('Payment Settings','settings','wide'))}${card('Reports & Export',(restaurantRouteAllowed128('restaurant-pos-reports')?button('View sales reports','backoffice-sales','wide'):'')+posReports.controls(S.reportFilter ||= posReports.defaults(),button))}</div>`}
function patchOpenOrder(host,html){
 const template=document.createElement('template');template.innerHTML=html;
 const oldPanel=host.querySelector('.order-pane'),nextPanel=template.content.querySelector('.order-pane');
 if(!oldPanel||!nextPanel||oldPanel.dataset.orderId!==nextPanel.dataset.orderId){host.replaceChildren(template.content);return}
 const body=oldPanel.querySelector('.pos-order-body'),nextBody=nextPanel.querySelector('.pos-order-body');
 const groups=new Map();
 for(const row of body.querySelectorAll('.pos-swipe-row')){
  const key=row.dataset.menuId;const rows=groups.get(key)||[];rows.push(row);groups.set(key,rows);
 }
 const pairs=[...nextBody.querySelectorAll('.pos-swipe-row')].map(next=>({next,row:groups.get(next.dataset.menuId)?.shift()}));
 for(const rows of groups.values())for(const unused of rows)unused.remove();
 let anchor=body.querySelector('.pos-swipe-row');
 for(const {next,row} of pairs){
  if(!row){body.insertBefore(next,anchor);continue}
  if(row!==anchor)body.insertBefore(row,anchor);
  const oldPhoto=row.querySelector('.pos-photo118'),newPhoto=next.querySelector('.pos-photo118');
  if(!oldPhoto.isEqualNode(newPhoto))oldPhoto.replaceWith(newPhoto);
  const oldText=row.querySelector('.pos-line118>div'),newText=next.querySelector('.pos-line118>div');
  if(!oldText.isEqualNode(newText))oldText.replaceWith(newText);
  row.classList.remove('revealed');anchor=row.nextElementSibling;
 }
 oldPanel.querySelector('header').replaceWith(nextPanel.querySelector('header'));
 oldPanel.querySelector('.pos-order-footer118').replaceWith(nextPanel.querySelector('.pos-order-footer118'));
 host.querySelector('.menu-pane').replaceWith(template.content.querySelector('.menu-pane'));
 for(const nav of ['.pos-main-tabs118','.pos-subtabs118'])host.querySelector(nav)?.replaceWith(template.content.querySelector(nav));
}
function render(){S.deferRender156=false;window.posPerformance125?.clamp(S);const host=$('#pos118');if(!host||!host.classList.contains('active'))return;host.classList.add('pos118');$('#categoryTabShell')?.setAttribute('hidden','');const sameView=host.dataset.posView===S.tab+'-'+S.sub;
 const scroll=sameView?[...host.querySelectorAll('.menu-pane,.order-pane')].map(n=>n.scrollTop):[];
 host.dataset.posView=S.tab+'-'+S.sub;
 const count=S.orders.filter(o=>o.status==='unpaid').length;const html=`<nav class="pos-main-tabs118" aria-label="POS sections">${['Overview','Sales','Management'].filter(t=>!window.posPerformance125||(t==='Sales'?['New Order','Open Orders','Receipts','Online Orders'].some(sub=>posPerformance125.allowed(t,sub)):posPerformance125.allowed(t,'New Order'))).map(t=>button(t,'tab',S.tab===t?'active':'','data-value118="'+t+'"')).join('')}${restaurantRouteAllowed128('restaurant-pos-reports')?button('Back Office','backoffice-sales'):''}<span class="pos-tab-actions132">${button('Printer','printer-setup','','aria-label="Configure Printing"')}${restaurantTabCan125('pos','pos-overview')?button('Shift receipts','shift-receipts'):''}${restaurantTabCan125('pos','pos-overview','sell')?button(S.shifts.some(x=>(S.sample||x.cashier===liveProfile?.id)&&!x.closed_at)?'Close shift':'Open shift',S.shifts.some(x=>(S.sample||x.cashier===liveProfile?.id)&&!x.closed_at)?'close-shift':'open-shift'):''}${!S.sample?button('Sync'+(S.offlineQueue.length?' · '+S.offlineQueue.length:''),'sync','','aria-label="Sync pending POS orders"'):''}</span></nav>${S.tab!=='Sales'?`<div class="pos-mode118"><span>Live operation</span><span class="pos-sync118" role="status">${S.offlineQueue.length?S.offlineQueue.length+' pending sync':S.offline?'Offline':'Synced'}</span></div>`:''}${S.sample?'<div class="pos-alert118 pos-sample118">Reference samples · isolated from live sales, stock and bookkeeping. Switch to Live operation when ready.</div>':''}${S.error?'<div class="pos-alert118" role="alert">'+esc(S.error)+'</div>':''}${S.syncError?'<div class="pos-alert118" role="alert">'+esc(S.syncError)+'</div>':''}${S.busy&&!S.loaded?'<p role="status">Loading POS…</p>':!S.sample&&!S.loaded?'<p>Connect the POS database to use live operation.</p>'+button('Retry','reload','primary'):S.tab==='Sales'?`<nav class="pos-subtabs118" aria-label="Sales views">${['New Order','Open Orders','Receipts','Online Orders'].filter(t=>!window.posPerformance125||posPerformance125.allowed('Sales',t)).map(t=>button(t+(t==='Open Orders'?` <span class="count118">${count}</span>`:''),'sub',S.sub===t?'active':'','data-value118="'+t+'"')).join('')}</nav>${S.sub==='New Order'?newOrder():S.sub==='Receipts'?receipts():openOrders(S.sub==='Online Orders')}`:S.tab==='Overview'?overview():management()}`;
 if(sameView&&S.sub==='Open Orders'&&S.tab==='Sales'&&S.loaded&&!S.error&&!S.syncError&&host.querySelector('.menu-pane')&&!host.querySelector('[role=alert]'))patchOpenOrder(host,html);else host.innerHTML=html;
 isolateReceiptPreviews(host);
 bindDiscount(host,draft);window.restaurantBannerForPos?.(host);window.PosPromotions146?.decorate(host);if(S.tab==='Management')posReports.populate(host,S.reportFilter,S);else posReports.clear();host.querySelectorAll('.menu-pane,.order-pane').forEach((el,i)=>{if(scroll[i])el.scrollTop=scroll[i]});}
function add(){if(draft.data.promotionClaim146)throw Error('Cancel the promotion order before changing its basket.');if(!restaurantCan('pos','sell'))throw Error('Sales access required');const record=catalog().find(r=>r.id===S.picked);if(!record)return;const d=record.data;let price=n(d.price),names=[];if(d.posCustom118&&(d.posOptions118||[]).filter(g=>g.id!=='wellness').every(g=>!(S.choices[g.id]||[]).length))throw Error('Select at least one ingredient.');for(const g of d.posOptions118||[]){const choices=S.choices[g.id]||[];if(choices.length<n(g.min)||choices.length>n(g.max))throw Error('Select '+g.min+'–'+g.max+' choices for '+g.name);price+=groupPrice(g,choices);for(const id of choices){const o=g.options.find(o=>o.id===id);if(!o||!optionAvailable(o))throw Error('Selected option is unavailable');names.push(o.name)}}const editing=S.editLine!=null;const line={menuId:record.id,name:d.name,photoData:d.photoData,photoUrl:d.photoUrl,photo118:d.photo118,quantity:S.editLine!=null?draft.data.lines[S.editLine].quantity:1,unitPrice:price,choices:structuredClone(S.choices),options:names,note:S.note};if(S.editLine!=null){const previous=draft.data.lines[S.editLine];line.packaging=previous.packaging||{};line.stockUsed=previous.stockUsed||{};line.onlineStockExtra=previous.onlineStockExtra||{};draft.data.lines[S.editLine]=line;}else {
 const same=!d.posCustom118&&!d.posOptions118?.length&&draft.data.lines.find(l=>l.menuId===line.menuId&&l.unitPrice===price&&(l.note||'')===(line.note||'')&&!Object.values(l.choices||{}).some(ids=>ids.length));
 if(same){if(same.quantity>=999)throw Error('Maximum 999 per order line');same.quantity++}else draft.data.lines.push(line)
 }S.editLine=null;rememberDraft();
 const current=$('#pos118 .register-panes>.gold');
 if(current&&S.sub==='New Order'){
  const scroll=current.scrollTop;
  current.outerHTML=orderPanel();bindDiscount($('#pos118 .order-pane'),draft);window.PosPromotions146?.decorate($('#pos118'));
  $('#pos118 .order-pane').scrollTop=scroll;
 }else render();
 showCenterStatus(editing?d.name+' updated.':d.name+' added to the order.')}
async function save(action='save',extra={},order=draft,checkout=false){if(order.data.promotionClaim146&&(!navigator.onLine||S.offline))throw Error('Connect before redeeming a promotion or voucher.');const saveOwner=offlineOwner(),saveEpoch=sessionEpoch121;
 if(order===draft&&!checkout&&action==='save')validateDiscountEditor(document.querySelector('#pos118 .order-pane'));
 const startNextOrder=action==='save' && !checkout && order===draft;
 const nonce=extra.offlineNonce||uuid();extra={...extra,offlineNonce:nonce};
 const data={...order.data,...extra};
 // A receipt can carry a stored empty or old FX field. Only this checkout's explicit choice is tender.
 if(action==='pay')data.shiftId=S.shifts.find(x=>!x.closed_at&&(S.sample||x.cashier===liveProfile?.id))?.id;
 if(action!=='pay'||!extra.fxTender)delete data.fxTender;
 if(!restaurantCan('pos','sell'))throw Error('Sales access required');if(S.working)throw Error('Another order action is still saving. Please retry.');if(!order.data.lines.length)throw Error('Add an item first');if(total(order.data).discount>total(order.data).subtotal)throw Error('Discount exceeds subtotal');return task(action==='pay'?'Recording payment and stock…':'Saving order…',async()=>{S.writeGeneration125=(S.writeGeneration125||0)+1;const usage125=!S.sample&&action==='pay'?recipeUsage124(order.data):{};let result;if(S.sample){result={...structuredClone(order),number:order.number||Math.max(1053,...S.orders.map(o=>Number(o.number)||0))+1,status:action==='pay'?'paid':'unpaid',created_at:order.created_at||new Date().toISOString(),paid_at:action==='pay'?new Date().toISOString():null,data:{...structuredClone(data),...storedTotals(order.data),cashier:currentUser(),...(action==='pay'?{receiptCode:order.previewCode}:{}),shiftId:S.shifts.find(s=>!s.closed_at)?.id}};S.orders=[result,...S.orders.filter(o=>o.id!==result.id)];
 if(action==='pay'&&extra.payment!=='Cash'&&extra.tendered>extra.collectedTotal){
  const shift=S.shifts.find(x=>!x.closed_at);if(shift)S.cash.push({id:uuid(),shift_id:shift.id,amount:extra.collectedTotal-extra.tendered,reason:'Change · '+result.number,kind:'change',currency:'LAK'})
 }
 }else{
 let issuedAt;
 if(action==='pay'){
  issuedAt=new Date().toISOString();
  const ticket=await posReceiptBook.issue(saveOwner,order.id,issuedAt,rpc,!S.offline&&navigator.onLine);
  if(saveOwner!==offlineOwner()||saveEpoch!==sessionEpoch121)throw Error('Account changed before payment.');
  if(order.previewCode&&ticket.code!==order.previewCode)throw Error('The receipt year changed. Reopen checkout to review the new receipt number.');
  Object.assign(data,{receiptTicket:ticket,receiptIssuedAt:issuedAt,receiptFooter:S.config.receiptFooter,
   offlineNonce:'paid-'+order.id+':'+(ticket.localRef||ticket.token+':'+ticket.ordinal)});
 }
 const offline=async()=>{if(order.data.promotionClaim146)throw Error('Promotion or voucher payment needs a live connection. Nothing was recorded locally; reconnect and retry.');const captureOwner=offlineOwner(),captureEpoch=sessionEpoch121,usage=action==='pay'?recipeUsage124(order.data):{};if(action==='pay')for(const [id,q] of Object.entries(usage))if(q>stock(id))throw Error('Insufficient stock on this device');if(action==='pay'&&!S.shifts.some(x=>x.cashier===liveProfile?.id&&!x.closed_at))throw Error('Open your shift online before accepting offline payments.');result={...structuredClone(order),number:order.number||'LOCAL',status:action==='pay'?'paid':'unpaid',created_at:order.created_at||new Date().toISOString(),paid_at:action==='pay'?issuedAt:null,offlinePending:true,data:{...structuredClone(data),...(action==='pay'?{receiptCode:data.receiptTicket.code}:{}),...storedTotals(order.data),cashier:currentUser()}};await posOffline119.save(captureOwner,result,action,{...data,...(order.data.offlineNonce?.startsWith('checkout-')?{checkoutSaveNonce:order.data.offlineNonce}:{}),offlineUsage124:usage,offlineNonce:data.offlineNonce,...(action==='pay'?{offlineCapturedAt:result.paid_at,offlineTotal:result.data.total}:{})});if(captureOwner!==offlineOwner()||captureEpoch!==sessionEpoch121)throw Error('Account changed during local capture');await pending();S.orders=[result,...S.orders.filter(o=>o.id!==result.id)];S.offline=true};if(S.offline||!navigator.onLine)await offline();else try{result=await rpc('pos_order118',{p_id:order.id,p_version:order.version||0,p_action:action,p_data:data});
 if(action==='pay'&&!matchesPayment(result?.data,data)||result?.id!==order.id||result.status!==(action==='pay'?'paid':'unpaid')||result.data?.offlineNonce!==data.offlineNonce||!matchesReceipt(result,data.receiptTicket))throw Error('This order changed. Review its saved receipt before continuing.');
 if(saveOwner!==offlineOwner()||saveEpoch!==sessionEpoch121)return;if(window.posPerformance125)await posPerformance125.accepted(S,result,usage125);else await load()}catch(e){if(saveOwner!==offlineOwner()||saveEpoch!==sessionEpoch121)return;if(window.posPerformance125?posPerformance125.network(e):!navigator.onLine||/failed to fetch|networkerror|network request failed|load failed/i.test(e.message))await offline();else throw e}}if(saveOwner!==offlineOwner()||saveEpoch!==sessionEpoch121)return;if(order===draft||draft.id===order.id)draft=editableOrder(result);S.selected=result.id;if(checkout&&!result.offlinePending)showCenterStatus('');else showCenterStatus(S.sample?'Sample order updated. No live records changed.':result.offlinePending?'Saved on this device. Pending sync before shift close.':action==='pay'?'Payment recorded and stock updated.':'Order saved unpaid.');if(action==='pay'){if(!S.sample)prepareReceiptNumbers().catch(()=>{});fresh();rememberDraft();S.sub=window.posPerformance125?'New Order':'Receipts';S.selected=result.id}else if(startNextOrder && draft.id===order.id){
  fresh();
  rememberDraft();
  S.sub='New Order';
 }else {
  rememberDraft();
  if(!checkout && !startNextOrder)S.sub='Open Orders';
 }
 return result})}
function fitReceiptViewport(root,closed){
 const viewport=window.visualViewport;
 root.classList.add('pos-receipt-overlay');
 if(!viewport)return;
 function resize(){
  for(const [name,value] of Object.entries({width:viewport.width,height:viewport.height,left:viewport.offsetLeft,top:viewport.offsetTop})){
   root.style.setProperty('--view-'+name+'118',value+'px');
  }
 }
 resize();
 viewport.addEventListener('resize',resize);
 viewport.addEventListener('scroll',resize);
 closed.finally(()=>{
  viewport.removeEventListener('resize',resize);
  viewport.removeEventListener('scroll',resize);
 });
}
function dialog(title,body,submit,{explicitClose=false,keepOpen=false}={}){const promise=ui108.modal(title,body,[],false,{explicitClose});const root=$('.ui-overlay108:last-child');root.querySelector('.ui-dialog108').classList.add('pos-dialog118');if(root.querySelector('.pos-thermal-paper')||explicitClose)fitReceiptViewport(root,promise);isolateReceiptPreviews(root);posMoney.bind(root);if(submit){const f=root.querySelector('form');f.onsubmit=async e=>{e.preventDefault();if(!f.reportValidity())return;const b=e.submitter||root.querySelector('[type=submit]');if(b.disabled)return;b.disabled=true;try{f.querySelector('.form-error118')?.remove();await submit(posMoney.formData(f),f);if(!keepOpen)root.resolve108(true)}catch(e){let out=f.querySelector('.form-error118');if(!out){out=document.createElement('p');out.className='form-error118';out.setAttribute('role','alert');(f.querySelector('.pos-payment-controls')||f).prepend(out)}out.textContent=e.message;out.scrollIntoView({block:'nearest'});showCenterStatus(e.message,true)}finally{b.disabled=false}}}return root}
function field(label,name,value='',type='text',attrs=''){
 const decimal=type==='number'&&/^(amount|tip|rate|value|oprice|gextra)/.test(name);
 return `<label>${label}<input name="${name}" type="${decimal?'text':type}" value="${esc(value)}" ${decimal?'data-pos-money="'+(name==='rate'?6:2)+'" inputmode="decimal"':''} ${attrs}></label>`;
}
function cashierFxRate(currency,config=S.config){
  const item=config?.fxRateSettings?.[currency];
  if(!item||!Number.isFinite(Number(item.bcelRate))||Number(item.bcelRate)<=0)return null;
  const buffer=Number(item.bufferPercent);
  if(!Number.isFinite(buffer)||buffer<0||buffer>20)return null;
  const unit=currency==='USD'?10:currency==='THB'?1:0.01;
  const adjusted=Math.floor((Number(item.bcelRate)*(1-buffer/100)+1e-9)/unit)*unit;
  return adjusted>0?{rate:Number(adjusted.toFixed(6)),bcelRate:Number(item.bcelRate),buffer,date:item.date||'',rateType:item.rateType||'NOTE'}:null;
 }
 function foreignPayment(previous,payment,totalLak,apply){
 const currencies=[...new Set([...acceptedCurrencies(),...(previous?.currency?[previous.currency]:[])])];
 if(!currencies.length)throw Error('No foreign currencies are enabled. Add them in Management → Payments & Access → Payment Settings.');
 const root=dialog('Foreign currency payment',`<form class="pos-fx-form">
 <label>Payment method<select name="method">${S.config.methods.map(v=>'<option>'+esc(v)+'</option>').join('')}</select></label>
 <label>Currency received<select name="currency">${currencies.map(v=>'<option>'+esc(v)+'</option>').join('')}</select></label>
 ${field('Amount received','amount',previous?.amount??'','number','min="0.01" max="9999999999.99" step="0.01" required inputmode="decimal"')}
 ${field('Cashier exchange rate · LAK per 1 foreign unit','rate',previous?.rate??'','number','min="0.000001" max="99999999.999999" step="0.000001" required inputmode="decimal"')}<p data-fx-rate-info role="status" aria-live="polite"></p>
 <dl><div><dt>Total including tip</dt><dd>${currencyAmount(totalLak,'LAK')}</dd></div><div><dt>Received in kip</dt><dd data-converted>—</dd></div><div><dt data-balance-label>Change in kip</dt><dd data-balance aria-live="polite">—</dd></div></dl>
 <div>${previous?'<button type="button" data-clear-fx>Clear FX</button>':''}<button type="submit">Use FX payment</button></div></form>`,async()=>{
  const result=calculate();
  if(!result||result.changeLak<0)throw Error('The converted payment must cover the discounted total.');
  apply(result,form.elements.method.value);
 },{explicitClose:true});
 root.querySelector('.pos-dialog118').classList.add('pos-fx-dialog');
 const form=root.querySelector('form'),fields=form.elements;
 fields.method.value=payment;fields.currency.value=previous?.currency||currencies[0];
  const rateInfo=form.querySelector('[data-fx-rate-info]');
  function useConfiguredRate(){
   const code=fields.currency.value,locked=code==='USD'||code==='THB',setting=cashierFxRate(code);
   if(locked){
    fields.rate.readOnly=true;
    fields.rate.setAttribute('aria-readonly','true');
    if(previous?.currency===code&&Number(previous.rate)>0){
     fields.rate.value=String(previous.rate);
     rateInfo.textContent='Existing payment rate retained. Close and start a new FX payment to use updated settings.';
    }else if(setting){
     fields.rate.value=String(setting.rate);
     rateInfo.textContent='BCEL '+setting.rateType+' '+(setting.date||'date not recorded')+' · '+setting.bcelRate.toLocaleString('en-US')+' LAK − '+setting.buffer+'% buffer = '+setting.rate.toLocaleString('en-US')+' LAK. Administrator controlled.';
    }else{
     fields.rate.value='';
     rateInfo.textContent='No valid '+code+' BCEL reference rate is saved. Ask an administrator to configure the currency before accepting it.';
    }
   }else{
    fields.rate.readOnly=false;
    fields.rate.removeAttribute('aria-readonly');
    fields.rate.value=previous?.currency===code?String(previous.rate||''):'';
    rateInfo.textContent='For this currency, enter the approved exchange rate manually.';
   }
   refresh();
  }
  fields.currency.addEventListener('change',useConfiguredRate);
  useConfiguredRate();
 function calculate(){
  const amount=posMoney.value(fields.amount),rate=posMoney.value(fields.rate);const amountText=posMoney.raw(fields.amount.value),rateText=posMoney.raw(fields.rate.value);const approved=fields.currency.value==='USD'||fields.currency.value==='THB'?(previous?.currency===fields.currency.value&&Number(previous.rate)>0?Number(previous.rate):cashierFxRate(fields.currency.value)?.rate):null;if((fields.currency.value==='USD'||fields.currency.value==='THB')&&(!approved||Math.abs(rate-approved)>0.000001))return null;
  if(!fields.amount.validity.valid||!fields.rate.validity.valid)return null;
  // Multiply decimal input as integers, then round once to LAK cents.
  const units=(v,digits)=>{const [whole,fraction='']=v.split('.');return BigInt(whole+(fraction+'0'.repeat(digits)).slice(0,digits))};
  if(!/^\d+(?:\.\d{0,2})?$/.test(amountText)||!/^\d+(?:\.\d{0,6})?$/.test(rateText))return null;
  const cents=Number((units(amountText,2)*units(rateText,6)+500000n)/1000000n);
  if(!Number.isSafeInteger(cents))return null;
  return {currency:fields.currency.value,amount,rate,equivalentLak:cents/100,changeLak:(cents-Math.round(totalLak*100))/100};
 }
 function refresh(){
  const fx=calculate();form.querySelector('[data-converted]').textContent=fx?currencyAmount(fx.equivalentLak,'LAK'):'—';
  form.querySelector('[data-balance-label]').textContent=fx&&fx.changeLak<0?'Still due in kip':'Change in kip';
  form.querySelector('[data-balance]').textContent=fx?currencyAmount(Math.abs(fx.changeLak),'LAK'):'—';
 }
 const clear=form.querySelector('[data-clear-fx]');
 if(clear)clear.onclick=()=>{apply(null,fields.method.value);root.resolve108(true)};
 form.oninput=refresh;refresh();
}
async function charge(){
 validateDiscountEditor(document.querySelector('#pos118 .order-pane'));
 if(S.working||document.getElementById('posChargeDialog'))return;
 if(!S.sample&&(S.offline||!navigator.onLine)&&!S.shifts.some(x=>x.cashier===liveProfile?.id&&!x.closed_at))throw Error('Open your shift online before accepting offline payments.');
 if(S.sub!=='New Order'){const o=selectedOrder();if(!o)return;draft=editableOrder(o)}
 if(!draft.data.lines.length)throw Error('Add an item first');
 if(!draft.offlinePending||!S.offline&&navigator.onLine){
  const id=draft.id,owner=offlineOwner(),epoch=sessionEpoch121;
  // Always review the server-priced basket, including edits to a resumed order.
  await save('save',{offlineNonce:!draft.version?'checkout-'+id:'checkout-'+id+':'+uuid()},draft,true);
  if(epoch!==sessionEpoch121||owner!==offlineOwner()||draft.id!==id||!document.querySelector('#pos118.active'))return;
 }
 const order=draft;
 await previewNumber(order);
 if(order!==draft||!document.querySelector('#pos118.active')||document.getElementById('posChargeDialog'))return;
 if(!S.sample&&!(S.offline||!navigator.onLine))prepareReceiptNumbers().catch(()=>{});
 const checkoutKey=tabDraftKey()+':payment:'+order.id;
 let savedInputs={};try{savedInputs=JSON.parse(sessionStorage.getItem(checkoutKey))||{}}catch{}
 let t=total(order.data);
 const stockFields=draft.data.lines.map((line,i)=>linkedStockFields(line,i,draft.data.service)).join('');
 let fx=null,manual=false;
 const root=dialog('Confirm payment',`<form id="pos-charge-form">
  <div class="pos-payment-preview118">${receipt(draft,false,true,fx)}</div><div class="pos-payment-controls">
  <div class="pos-charge-fields"><label>Payment method<select name="payment">${S.config.methods.map(v=>'<option>'+esc(v)+'</option>').join('')}</select></label>
  ${field('Tip (LAK)','tip',savedInputs.tip||0,'number','min="0" max="9999999999.99" step="0.01" inputmode="decimal"')}
  ${field('Amount received (LAK)','tendered','','text','data-pos-money="2" inputmode="decimal" autocomplete="off"')}
  <label data-change-label><span>Change (LAK)</span><output name="change" aria-live="polite"></output></label></div>
  ${discountEditor(order.data)}
  <section id="checkout-adjustment" data-adjustment hidden></section>
  </div><button type="submit">Paid</button></form>`,async d=>{
   const close=box.querySelector('[data-close]');
   if(order!==draft)throw Error('This order changed. Close checkout and review the order.');

   const tendered=fx?.equivalentLak??received();
   if(!Number.isFinite(tendered)||tendered<amountDue())throw Error('Amount received must cover the total including tip.');
   if(!applyAdjustment())throw Error('Check the quantities in Adjustment.');
   close.disabled=true;
   try{
    const result=await save('pay',{payment:d.payment,paymentReference:'',tip:posMoney.value(tip),collectedTotal:amountDue(),
     offlineNonce:paymentNonce,reviewedTotal:t.total,...(fx?{fxTender:fx}:{}),tendered,confirmed:true},order);
    if(!result||!root.isConnected)return;
    try{sessionStorage.removeItem(checkoutKey)}catch{}
    const title='Paid · '+posReports.numberFor(result);
    box.setAttribute('aria-label',title);box.querySelector('header h3').textContent=title;
    toggle.remove();fxButton.remove();submit.remove();
    form.replaceWith(document.createRange().createContextualFragment('<div class="pos-payment-preview118">'+receipt(result)+'</div>'));
    isolateReceiptPreviews(box);
    printButton.disabled=false;printButton.textContent='Print receipt';printButton.focus({preventScroll:true});
    printButton.onclick=()=>runPrintButton(printButton,()=>print(result));
   }finally{close.disabled=false}
  },{explicitClose:true,keepOpen:true});
 const box=root.querySelector('.pos-dialog118'),form=box.querySelector('form'),method=form.elements.payment,cash=form.elements.tendered,tip=form.elements.tip;
 box.id='posChargeDialog';box.classList.add('pos-charge-dialog');
 const paymentNonce=(Number(order.number)&&!S.offline&&navigator.onLine?'pay-':'receipt-')+order.id+':'+uuid();
 const submit=form.querySelector('[type=submit]'),printButton=document.createElement('button');
 printButton.type='button';printButton.textContent='Print bill';printButton.dataset.printReceipt='';
 printButton.onclick=()=>runPrintButton(printButton,()=>printPaper(paperWidth(),'Unpaid bill',receipt(order,false,true,fx,n(tip.value)))) ;
 submit.setAttribute('form',form.id);box.querySelector('[data-close]').before(submit,printButton);
 const toggle=document.createElement('button');toggle.type='button';toggle.textContent='Adjustment';toggle.dataset.toggleAdjustment='';
 toggle.setAttribute('aria-controls','checkout-adjustment');toggle.setAttribute('aria-expanded','false');submit.before(toggle);
 const fxButton=document.createElement('button');fxButton.type='button';fxButton.dataset.fxPayment='';fxButton.textContent='Foreign FX';submit.before(fxButton);
 const amountDue=()=>(Math.round(t.total*100)+Math.round(n(tip.value)*100))/100;
 const received=()=>fx?.equivalentLak??(manual&&cash.value!==''?Number(cash.value.replaceAll(',','')):amountDue());
 function rememberInputs(){
  if(S.sample)return;
  try{sessionStorage.setItem(checkoutKey,JSON.stringify({payment:method.value,manual,tendered:cash.value,tip:tip.value,fx}))}catch{}
 }
 function setFx(value,payment){
  fx=value;method.value=payment;cash.readOnly=!!fx;manual=false;
  fxButton.setAttribute('aria-pressed',String(!!fx));fxButton.textContent=fx?'FX · '+fx.currency:'Foreign FX';
  refreshTotals();rememberInputs();
 }
 fxButton.onclick=()=>foreignPayment(fx,method.value,amountDue(),setFx);
 bindDiscount(form,order,()=>{
  const editor=document.querySelector('#pos118 .order-pane [data-discount-editor]');
  if(editor){editor.outerHTML=discountEditor(order.data);bindDiscount(document.querySelector('#pos118 .order-pane'),order)}
  refreshTotals()
 });
 const section=form.querySelector('[data-adjustment]');
 const applyAdjustment=checkoutStock(form,draft.data.service,stockFields);
 toggle.onclick=()=>{section.hidden=!section.hidden;toggle.setAttribute('aria-expanded',String(!section.hidden))};
 form.addEventListener('invalid',e=>{if(section.contains(e.target)){section.hidden=false;toggle.setAttribute('aria-expanded','true')}},true);
 box.style.setProperty('--receipt-width',paperWidth()+'mm');
 function update(){
  const raw=cash.value.replaceAll(',',''),value=received();
  const valid=(!raw||/^\d+(?:\.\d{0,2})?$/.test(raw))&&Number.isSafeInteger(Math.round(value*100));
  const difference=Math.round(value*100)-Math.round(amountDue()*100);
  cash.setCustomValidity(valid&&difference>=0?'':valid?'Amount received is below the total.':'Enter a valid amount.');
  form.querySelector('[data-change-label] span').textContent=difference>0?'Change (LAK)':'Amount due (LAK)';
  form.elements.change.value=valid?posMoney.display(Math.abs(difference)/100):'—';
 }
 function refreshTotals(){
  t=total(order.data);
  if(fx)fx.changeLak=(Math.round(fx.equivalentLak*100)-Math.round(amountDue()*100))/100;
  if(!manual)cash.value=posMoney.display(fx?.equivalentLak??amountDue());
  cash.placeholder=posMoney.display(amountDue());

  form.querySelector('.pos-payment-preview118').innerHTML=receipt(order,false,true,fx,n(tip.value));
  isolateReceiptPreviews(form);
  update();
 }
 tip.onfocus=()=>{if(!n(tip.value))tip.select()};
 tip.oninput=refreshTotals;
 cash.addEventListener('focus',()=>{if(!manual&&!fx)cash.select()});
 cash.addEventListener('click',()=>{if(!manual&&!fx)cash.select()});
 cash.addEventListener('blur',()=>{if(!cash.value){manual=false;refreshTotals();rememberInputs()}});
 cash.addEventListener('input',()=>{manual=posMoney.raw(cash.value)!=='';update()});
 if(S.config.methods.includes(savedInputs.payment)){
  method.value=savedInputs.payment;manual=savedInputs.manual===true;
  if(manual)cash.value=savedInputs.tendered||'';
  if(savedInputs.fx&&Number.isFinite(savedInputs.fx.equivalentLak))setFx(savedInputs.fx,method.value);
 }
 form.addEventListener('input',rememberInputs);
 method.addEventListener('change',()=>{if(fx)setFx(null,method.value);else update();rememberInputs()});refreshTotals();
}

async function runPrintButton(button,job){
 if(button.disabled)return;button.disabled=true;
 try{const message=await job();if(message)showCenterStatus(message)}catch(error){showCenterStatus(error.message,true)}finally{button.disabled=false}
}
async function print(o,kitchen=false,pdf=false,report=null){
 const width=paperWidth(),orders=Array.isArray(o)?o:[o];
 const title=kitchen?'Kitchen ticket':'Receipt '+(orders.length===1?posReports.numberFor(orders[0]):'');
 const content=(report?'<article class="pos-thermal-paper"><h3>Oon Jai Restaurant · Sales summary</h3><p>'+esc(report.period)+(report.sample?' · SAMPLE':'')+'</p>'+restaurantReportSummary.table(report.rows,esc)+'</article>':'')+orders.map(r=>receipt(r,kitchen)).join('');
 const message=await printPaper(width,title,content,{system:pdf});
 if(pdf)showCenterStatus('Choose Save as PDF in the print dialog.');
 return message;
}
async function printPaper(width,title,content,{system=false}={}){
 if(!system&&posPrinter.preference().mode==='unconfigured'){
  if(!document.querySelector('.pos-printer-settings'))printerSetup();
  throw Error('Choose Find USB printer for direct printing. System printing opens the tablet’s print preview.');
 }
 const frame=document.createElement('iframe');
 frame.title=title;
 // Keep the browser's layout viewport stable. Focusing a receipt-width, one-pixel
 // iframe can make mobile Chrome magnify it and leave the POS magnified afterward.
 const layoutWidth=Math.max(320,document.documentElement.clientWidth||window.innerWidth||1024);
 const layoutHeight=Math.max(320,document.documentElement.clientHeight||window.innerHeight||768);
 frame.tabIndex=-1;frame.setAttribute('aria-hidden','true');
 frame.style.cssText='position:fixed;inset:0;width:'+layoutWidth+'px;height:'+layoutHeight+'px;border:0;opacity:0;pointer-events:none;z-index:-1';
 document.body.append(frame);
 try{
  const doc=frame.contentDocument;doc.open();
  const paperCss=receiptStyleText();
  doc.write('<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><base href="'+esc(document.baseURI)+'"><title>'+esc(title)+'</title><style>html,body{margin:0;padding:0;-webkit-text-size-adjust:100%;text-size-adjust:100%}body{--receipt-width:'+width+'mm}article:not(:last-child){break-after:page}'+paperCss+'</style></head><body>'+content+'</body></html>');doc.close();
  await Promise.race([Promise.all([...doc.images].map(img=>img.decode?.().catch(()=>{}))),new Promise(resolve=>setTimeout(resolve,1500))]);
  if(!system&&posPrinter.preference().mode==='usb'){
   try{return await posPrinter.printDocument(doc,width)}finally{frame.remove()}
  }
  if(/; wv\)/.test(navigator.userAgent))throw Error('This Android app does not provide a system print connection. Open this POS in Chrome to configure a USB printer or use the installed print service.');
  const css=doc.createElement('style');
  css.textContent=[...doc.querySelectorAll('article')].map((article,i)=>{
   const height=Math.ceil(article.getBoundingClientRect().height*25.4/96)+1;
   return '@page receipt'+i+'{size:'+width+'mm '+height+'mm;margin:0}article:nth-of-type('+(i+1)+'){page:receipt'+i+'}'+(i===0?'@page{size:'+width+'mm '+height+'mm;margin:0}':'')
  }).join('');
  doc.head.append(css);
  frame.contentWindow.addEventListener('afterprint',()=>frame.remove(),{once:true});
  // Printing does not require transferring focus away from the cashier's dialog.
  frame.contentWindow.print();
  // A missing afterprint must not accumulate hidden documents indefinitely.
  setTimeout(()=>frame.remove(),300000);
  return 'System print window opened. Check the selected printer and paper size.';
 }catch(error){frame.remove();throw error}
}
function settings(){if(!restaurantCan('pos','manage'))throw Error('Administrator access required');const c=S.config;let selectedCurrencies=acceptedCurrencies(c);const existingRates=c.fxRateSettings||{};const fxSettings=['USD','THB'].map(code=>{
  const item=existingRates[code]||{},initialBuffer=item.bufferPercent??(code==='USD'?0.5:1);
  return '<div class="pos-fx-setting"><h4>'+code+' · BCEL buying rate</h4>'+
  '<label>BCEL reference rate (LAK per 1 '+code+')<input type="number" name="fxRate'+code+'" min="0" max="99999999" step="any" inputmode="decimal" value="'+esc(item.bcelRate??'')+'" placeholder="Enter BCEL rate"></label>'+
  '<label>Safety buffer (%)<input type="number" name="fxBuffer'+code+'" min="0" max="20" step="0.01" required inputmode="decimal" value="'+esc(initialBuffer)+'"></label>'+
  '<label>Rate type<select name="fxType'+code+'"><option value="NOTE" '+((item.rateType||'NOTE')==='NOTE'?'selected':'')+'>Banknotes / cash (NOTE)</option><option value="EFT" '+(item.rateType==='EFT'?'selected':'')+'>Electronic transfer (EFT)</option></select></label>'+
  '<label>BCEL rate date<input type="date" name="fxDate'+code+'" value="'+esc(item.date||'')+'"></label>'+
  '<p data-fx-preview="'+code+'"></p></div>';
 }).join('');
 const root=dialog('Payment settings',`<form><section><h3>Payment methods</h3>${['Cash','BCEL QR','Bank'].map(m=>`<label class="check"><input type="checkbox" name="methods" value="${m}" ${c.methods.includes(m)?'checked':''}>${m}</label>`).join('')}<fieldset class="pos-currency-settings"><legend>Foreign currencies at checkout</legend><p>Choose the currencies you accept. Kip (₭) remains the base currency.</p><div data-currency-list></div><div class="pos-currency-add"><label>Add currency<select data-currency-choice aria-label="Add currency"></select></label><button type="button" data-add-currency>Add</button></div></fieldset><fieldset class="pos-currency-settings"><legend>BCEL reference rates & safety buffers</legend><p>Enter the BCEL buying rate manually. USD starts at 0.5% and THB at 1%. Cashiers use the automatically adjusted rates.</p><div class="pos-fx-settings-grid">${fxSettings}</div></fieldset></section><section><h3>Printing</h3><label>Receipt paper<select name="receiptWidth"><option value="56" ${n(c.receiptWidth)===56?'selected':''}>56 mm · 5.6 cm</option><option value="80" ${n(c.receiptWidth)===80?'selected':''}>80 mm</option><option value="58" ${n(c.receiptWidth)===58?'selected':''}>58 mm</option></select></label>${field('Receipt footer','receiptFooter',c.receiptFooter)}<p>Open Configure Printing to select a USB printer, print a sample without a sale, or set this device’s paper width.</p></section><button type="submit">Save payment settings</button></form>`,async(d,f)=>{const rates={...existingRates};for(const code of ['USD','THB']){const raw=String(d['fxRate'+code]??'').trim(),b=Number(d['fxBuffer'+code]);if(!Number.isFinite(b)||b<0||b>20)throw Error('The '+code+' buffer must be between 0% and 20%.');if(raw&&(!Number.isFinite(Number(raw))||Number(raw)<=0))throw Error('Enter a positive '+code+' BCEL rate.');rates[code]={bcelRate:raw?Number(raw):null,bufferPercent:b,rateType:d['fxType'+code]==='EFT'?'EFT':'NOTE',date:d['fxDate'+code]||''}}const values={...c,...d,fxRateSettings:rates,fxCurrencies:[...selectedCurrencies],receiptWidth:n(d.receiptWidth),methods:new FormData(f).getAll('methods'),cashiers:c.cashiers||[]};if(!values.methods.length)throw Error('Enable at least one payment method');if(S.sample)S.config=values;else{await rpc('pos_manage118',{p_action:'config',p_data:values,p_version:S.configVersion});await load()}showCenterStatus(S.sample?'Sample settings updated.':'POS settings saved.');render()},{explicitClose:true});
 root.querySelector('.pos-dialog118').classList.add('pos-settings-dialog');
 const list=root.querySelector('[data-currency-list]'),choice=root.querySelector('[data-currency-choice]');
 function drawCurrencies(){
  list.innerHTML=selectedCurrencies.map(code=>'<span class="pos-currency-chip">'+esc(code)+'<button type="button" data-remove-currency="'+esc(code)+'" aria-label="Remove '+esc(code)+'">×</button></span>').join('')||'<p>No foreign currencies enabled.</p>';
  choice.innerHTML='<option value="">Choose currency…</option>'+availableCurrencies().filter(c=>!selectedCurrencies.includes(c)).map(code=>'<option>'+esc(code)+'</option>').join('');
 }
 root.querySelector('[data-add-currency]').onclick=()=>{if(choice.value&&!selectedCurrencies.includes(choice.value)){selectedCurrencies.push(choice.value);drawCurrencies()}};
 list.onclick=e=>{const b=e.target.closest('[data-remove-currency]');if(b){selectedCurrencies=selectedCurrencies.filter(c=>c!==b.dataset.removeCurrency);drawCurrencies()}};
 drawCurrencies();
 const form=root.querySelector('form');
 function drawFxPreview(){
  for(const code of ['USD','THB']){
   const raw=form.elements['fxRate'+code].value,buffer=Number(form.elements['fxBuffer'+code].value),out=form.querySelector('[data-fx-preview="'+code+'"]');
   if(!raw||Number(raw)<=0||!Number.isFinite(buffer)||buffer<0||buffer>20){out.textContent='Cashier rate: enter a valid BCEL rate and buffer.';continue}
   const unit=code==='USD'?10:1,rate=Math.floor((Number(raw)*(1-buffer/100)+1e-9)/unit)*unit;
   out.textContent='Cashier rate: ₭'+rate.toLocaleString('en-US')+' per '+code;
  }
 }
 form.addEventListener('input',drawFxPreview);drawFxPreview();
}
function shiftHooks(){return {state:S,dialog,esc,render,load,rpc,currentUser,owner:offlineOwner,currencies:acceptedCurrencies,paperWidth,printPaper,runPrintButton,pending:()=>posOffline119.queue(offlineOwner()),status:showCenterStatus}}
async function shift(action){return posShifts.open(action,shiftHooks())}

function refund(cancel=false){const o=selectedOrder();if(!o)return;if(!restaurantCan('pos',cancel?'void':'refund'))throw Error('Administrator approval required');dialog(cancel?'Cancel unpaid order':'Refund paid order',`<form><p>${cancel?'Cancel':'Record a full refund for'} ${esc(cancel?'OJ-'+o.number:posReports.numberFor(o))} · ${money(o.data.collectedTotal??o.data.total)}</p>${field('Reason','reason','','text','required minlength="3"')}${cancel?'':'<label class="check"><input type="checkbox" name="restock">Return all consumed ingredients to usable stock</label><p>Leave unchecked for prepared food that cannot be reused. Confirm the actual refund in your payment system separately.</p>'}<button type="submit">${cancel?'Cancel order':'Confirm refund'}</button></form>`,async(d,f)=>{if(S.sample){o.status=cancel?'cancelled':'refunded';o.refunded_at=new Date().toISOString();if(!cancel)o.data.refundShiftId=S.shifts.find(s=>!s.closed_at)?.id}else await rpc('pos_order118',{p_id:o.id,p_version:o.version,p_action:cancel?'cancel':'refund',p_data:{reason:d.reason,restock:!!f.elements.restock?.checked}});if(!S.sample)await load();showCenterStatus(cancel?'Order cancelled.':'Refund recorded.');render()})}
function options(){if(!admin()&&!S.sample)throw Error('Administrator access required');let selected=S.picked||catalog()[0]?.id;if(!selected)throw Error('Add a menu item first');const root=dialog('Customization options','<div id="posOptionsEditor118"></div>');const host=root.querySelector('#posOptionsEditor118');let groups,nonstock,record;
function draw(){record=catalog().find(r=>r.id===selected);groups=structuredClone(record.data.posOptions118||[]);nonstock=record.data.posNoStock118===true;paint()}
function ingredientsFor(selected){
 const ids=new Set(selected);
 const choices=S.ingredients.map(r=>[r.id,r.data.name]);
 for(const id of ids)if(!choices.some(([value])=>value===id))choices.push([id,'Unavailable ingredient · '+id]);
 return choices.map(([id,name])=>'<option value="'+esc(id)+'" '+(ids.has(id)?'selected':'')+'>'+esc(name)+'</option>').join('');
}
function recipeFields(option,i,j){
 const rows=option.recipe?.length?option.recipe:[{}];
 return '<div data-option-recipe="'+i+'_'+j+'">'+rows.map((part,k)=>'<div data-recipe-part><label>Ingredient<select data-part-item><option value="">No ingredient</option>'+ingredientsFor(part.itemId?[part.itemId]:[])+'</select></label><label>Quantity<input data-part-quantity type="number" min="0" step="any" value="'+esc(part.quantity??'')+'"></label><button type="button" data-remove-part="'+i+','+j+','+k+'">Remove ingredient</button></div>').join('')+'<button type="button" data-add-part="'+i+','+j+'">Add ingredient</button></div>';
}
function paint(){host.innerHTML=`<form><label>Menu item<select name="menu">${catalog().map(r=>`<option value="${r.id}" ${r.id===selected?'selected':''}>${esc(r.data.name)}</option>`).join('')}</select></label><label class="check"><input name="nonstock" type="checkbox" ${nonstock?'checked':''}>Non-stock item (no recipe or inventory consumption)</label><p>Required groups set a minimum above zero. Substitutions replace the specified base-recipe ingredient when a choice is selected. Quantities use the ingredient’s recipe unit.</p>${groups.map((g,i)=>`<section class="choice-edit118" data-group-edit118="${i}"><div class="fields118">${field('Group name','gname'+i,g.name)}${field('Minimum choices','gmin'+i,g.min,'number','min="0" max="20" required')}${field('Maximum choices','gmax'+i,g.max,'number','min="1" max="20" required')}${g.included!=null?field('Included choices','gincluded'+i,g.included,'number','min="0" max="20" required')+field('Each extra choice (LAK)','gextra'+i,g.extraPrice||0,'number','min="0" step="any" required'):''}<label>Base ingredients replaced (optional)<select multiple name="replace${i}">${ingredientsFor(g.replaces||[])}</select></label></div>${g.options.map((o,j)=>`<div class="option-grid118">${field('Choice','oname'+i+'_'+j,o.name,'text','required')}${field('Extra LAK','oprice'+i+'_'+j,o.price||0,'number','min="0" step="any" required')}${recipeFields(o,i,j)}<button type="button" data-remove-option118="${i},${j}" aria-label="Remove option">×</button></div><label class="check"><input type="checkbox" name="available${i}_${j}" ${o.available!==false?'checked':''}>Available</label>`).join('')}<button type="button" data-add-option118="${i}">Add choice</button> <button type="button" data-remove-group118="${i}">Remove group</button></section>`).join('')}<div class="pos-actions118"><button type="button" data-add-group118>Add option group</button><button type="submit">Save customizations</button></div></form>`;
const f=host.querySelector('form');if(catalog().find(r=>r.id===selected)?.data.storefrontManaged131){const note=document.createElement('p');note.textContent='Shared choice names, allowances and prices are managed in Menu Display. Set recipe quantities and Inventory ingredients here.';f.prepend(note);f.querySelectorAll('[name^=gname],[name^=gmin],[name^=gmax],[name^=gincluded],[name^=gextra],[name^=oname],[name^=oprice],[data-add-group118],[data-add-option118],[data-remove-group118],[data-remove-option118]').forEach(el=>el.disabled=true);}f.elements.menu.onchange=()=>{selected=f.elements.menu.value;draw()};function capture(){nonstock=f.elements.nonstock.checked;groups.forEach((g,i)=>{g.name=f.elements['gname'+i].value;g.min=n(f.elements['gmin'+i].value);g.max=n(f.elements['gmax'+i].value);if(g.included!=null){g.included=n(f.elements['gincluded'+i].value);g.extraPrice=posMoney.value(f.elements['gextra'+i])}g.replaces=Array.from(f.elements['replace'+i].selectedOptions,el=>el.value);g.options.forEach((o,j)=>{o.name=f.elements['oname'+i+'_'+j].value;o.price=posMoney.value(f.elements['oprice'+i+'_'+j]);o.available=f.elements['available'+i+'_'+j].checked;const rows=f.querySelector('[data-option-recipe="'+i+'_'+j+'"]').querySelectorAll('[data-recipe-part]');
 const prior=o.recipe||[];
 o.recipe=Array.from(rows,(row,k)=>({...prior[k],itemId:row.querySelector('[data-part-item]').value,quantity:n(row.querySelector('[data-part-quantity]').value)}))})})}
host.querySelectorAll('[data-remove-part]').forEach(b=>b.onclick=()=>{capture();const [i,j,k]=b.dataset.removePart.split(',').map(Number);groups[i].options[j].recipe.splice(k,1);paint()});
host.querySelectorAll('[data-part-item]').forEach(select=>select.onchange=()=>{if(!select.value)select.closest('[data-recipe-part]').querySelector('[data-part-quantity]').value=''});
host.querySelectorAll('[data-add-part]').forEach(b=>b.onclick=()=>{capture();const [i,j]=b.dataset.addPart.split(',').map(Number);groups[i].options[j].recipe.push({itemId:'',quantity:0});paint()});
host.querySelector('[data-add-group118]').onclick=()=>{capture();groups.push({id:uuid(),name:'New group',min:0,max:1,replaces:[],options:[]});paint()};host.querySelectorAll('[data-add-option118]').forEach(b=>b.onclick=()=>{capture();groups[n(b.dataset.addOption118)].options.push({id:uuid(),name:'New option',price:0,recipe:[]});paint()});host.querySelectorAll('[data-remove-option118]').forEach(b=>b.onclick=()=>{capture();const [i,j]=b.dataset.removeOption118.split(',').map(Number);groups[i].options.splice(j,1);paint()});host.querySelectorAll('[data-remove-group118]').forEach(b=>b.onclick=()=>{capture();groups.splice(n(b.dataset.removeGroup118),1);paint()});f.onsubmit=async e=>{e.preventDefault();capture();try{for(const g of groups){for(const o of g.options)o.recipe=o.recipe.filter(r=>r.itemId||r.quantity);if(!g.name.trim()||g.min>g.max||g.max>g.options.length||g.min<0||(g.included!=null&&(g.included>g.max||g.extraPrice<0))||g.options.some(o=>!o.name.trim()||o.recipe.some(r=>!r.itemId||r.quantity<=0)))throw Error('Review group limits, option names and ingredient quantities')}const data={...record.data,posOptions118:groups,posNoStock118:nonstock};if(S.sample)record.data=data;else{await menuStore108.save('menu',data,record);await load()}pick(selected,false);root.resolve108(true);showCenterStatus(S.sample?'Sample customizations updated.':'Customizations saved to Menu.');render()}catch(e){showCenterStatus(e.message,true)}}}draw()}
async function links(){if(!admin()&&!S.sample)throw Error('Administrator access required');if(S.sample){dialog('Ingredient links','<p>In Live operation, each Menu ingredient is linked to an Inventory item, with an explicit unit conversion. The selected base, protein, toppings and extras determine the stock used.</p><p>Switch to Live operation to configure your actual ingredients.</p>');return}const owner=liveProfile?.id,epoch=sessionEpoch121,valid=()=>owner===liveProfile?.id&&epoch===sessionEpoch121&&admin();const inventory=[];for(let offset=0;;offset+=1000){const result=await ojmDb.from('inventory_items104').select('id,data,version').order('id').range(offset,offset+999);if(!valid())return;if(result.error)throw Error(result.error.message);inventory.push(...result.data);if(result.data.length<1000)break}inventory.sort((a,b)=>String(a.data.name||'').localeCompare(String(b.data.name||'')));const ingredients=structuredClone(S.ingredients);dialog('Menu ingredient → Inventory',`<form><p>Enter the Inventory quantity consumed by one recipe unit. Example: ingredient unit g and Inventory unit kg → factor 0.001.</p><table><thead><tr><th>Menu ingredient</th><th>Inventory item</th><th>Factor</th></tr></thead><tbody>${ingredients.map((r,i)=>`<tr><td>${esc(r.data.name)} (${esc(r.data.unit)})</td><td><select name="item${i}"><option value="">Not linked</option>${inventory.map(t=>`<option value="${t.id}" ${r.data.inventoryItemId118===t.id?'selected':''}>${esc(t.data.name)} (${esc(t.data.unit)})</option>`).join('')}</select></td><td><input aria-label="Conversion factor for ${esc(r.data.name)}" name="factor${i}" type="number" min="0.000001" step="any" value="${n(r.data.inventoryFactor118||1)}" required></td></tr>`).join('')}</tbody></table><button type="submit">Save ingredient links</button></form>`,async d=>{if(!valid())throw Error('Account changed. Reopen ingredient links.');await restaurantModules125.ensure('inventory');
 if(!valid())throw Error('Account changed. Reopen ingredient links.');
 const edits=[];
 for(const [i,r] of ingredients.entries()){
  const id=d['item'+i],factor=n(d['factor'+i]);
  if(id===(r.data.inventoryItemId118||'')&&factor===n(r.data.inventoryFactor118||1))continue;
  const item=inventory.find(stock=>stock.id===id);
  if(id&&!item)throw Error('Inventory item unavailable for '+r.data.name);
  if(item&&item.data.currency!==r.data.currency)throw Error('Ingredient and inventory currencies must match for '+r.data.name);
  const updated=item?restaurantIntegrationMath132.stockLinkData137(r.data,item,factor):{...r.data,inventoryItemId118:'',inventoryFactor118:factor};
  if(!item)delete updated.fullPreparedCost124;
  edits.push({record:r,data:updated});
 }
 let saved=0;try{for(const edit of edits){
  if(!valid())throw Error('Account changed. Reopen ingredient links.');
  await menuStore108.save('ingredients',edit.data,edit.record);saved++;
 }await load();showCenterStatus('Ingredient links saved.')}catch(e){throw Error(e.message+' '+saved+' links were saved; reload before retrying.')}})}
async function exportRows(pdf=false){
 if(S.exporting)return;
 S.exporting=true;
 try{await posReports.download({...S.reportFilter},S,pdf,print)}
 finally{S.exporting=false;const host=$('#pos118.active');if(host&&S.tab==='Management')posReports.populate(host,S.reportFilter,S)}
}
async function action(action,b){if(b&&!actionPermission121(b))throw Error('This action is not included in your access.');const value=b?.dataset.value118,id=b?.dataset.id118,i=n(b?.dataset.index118);if(action==='printer-setup')return printerSetup();if(action==='manage-discounts')return PosSetup154.open('discounts');if(action==='manage-tables')return PosSetup154.open('tables');if(action==='allocated-stock')return switchTab('inv-allocated');if(action==='backoffice-sales')return switchTab('restaurant-pos-reports');if(action==='tab'){S.visibleOrders=50;S.tab=value;if(value==='Sales')S.sub='New Order';S.query='';S.filter='All';render()}else if(action==='sub'){S.visibleOrders=50;S.sub=value;S.query='';S.filter='All';S.selected=null;render();window.posPerformance125?.schedule(100)}else if(action==='pick'){S.editLine=null;pick(id)}else if(action==='browse-menu')$('#pos118 .pos-catalog118')?.scrollIntoView({block:'start',behavior:'smooth'});else if(action==='classification'){S.classification=value;S.visibleMenu=40;refreshCatalog()}else if(action==='category'){S.category=value;S.visibleMenu=40;refreshCatalog()}else if(action==='more-menu'){S.visibleMenu+=40;refreshCatalog()}else if(action==='filter'){S.filter=value;S.visibleOrders=50;render()}else if(action==='more'){if(S.schema125&&S.sub==='Receipts'&&S.visibleOrders>=S.orders.filter(o=>['paid','refunded'].includes(o.status)).length)await posPerformance125.moreReceipts(S);else{S.visibleOrders+=50;render()}}else if(action==='details')menuDetails(id);else if(action==='quick-add'){S.editLine=null;pick(id);const d=catalog().find(m=>m.id===id)?.data;if(!d)return;if(d.posCustom118||d.posOptions118?.length)configureItem();else add()}else if(action==='add')add();else if(action==='remove'){
 const editing=S.sub==='New Order',order=editing?draft:selectedOrder();
 if(!order||order.id!==b.dataset.orderId||(order.version||0)!==Number(b.dataset.version))throw Error('Order changed. Select the item again.');
 if(order.data.promotionClaim146||!restaurantCan('pos','sell'))throw Error('This order cannot be edited.');
 if(editing){order.data.lines.splice(i,1);updateDraftPanel(i)}
 else if(order.status==='unpaid'){
  if(order.data.lines.length===1){if(!restaurantCan('pos','void'))throw Error('Removing the last item requires permission to cancel the open order.');refund(true);return}
  const changed=editableOrder(order);changed.data.lines.splice(i,1);await save('save',{},changed);
 }
 }else if(action==='qty'){if(draft.data.promotionClaim146)throw Error('Cancel the offer order before editing.');const l=draft.data.lines[i];l.quantity=Math.max(1,Math.min(999,l.quantity+n(b.dataset.delta118)));for(const key of Object.keys(l.packaging||{}))l.packaging[key]=Math.min(l.quantity,l.packaging[key]);const row=b.closest('.pos-swipe-row');row.querySelector('.pos-qty118 span').textContent=l.quantity;row.querySelector('.pos-amount118').textContent=money(lineAmount(l));updateDraftPanel()}else if(action==='edit-line'){if(draft.data.promotionClaim146)throw Error('Cancel the offer order before editing.');const l=draft.data.lines[i];pick(l.menuId,false);S.editLine=i;S.choices=structuredClone(l.choices);S.note=l.note;configureItem()}else if(action==='save')await save();else if(action==='charge')await charge();else if(action==='resume'){draft=editableOrder(selectedOrder());rememberDraft();S.sub='New Order';render();}else if(action==='new'){if(draft.data.lines.length&&!await ui117.confirm('Start a new order? Save the current unpaid order first if you need it.'))return;fresh();rememberDraft();S.tab='Sales';S.sub='New Order';render()}else if(['preview','print','pdf','kitchen'].includes(action)){let o=S.tab==='Sales'&&S.sub!=='New Order'?selectedOrder():draft;if(S.tab==='Management'&&(!o||!o.data.lines.length)){o=selectedOrder()}if(!o||!o.data.lines.length)throw Error('Choose an order or receipt first.');if(action==='preview'){await previewNumber(o);const root=dialog('Receipt preview',receipt(o),null,{explicitClose:true}),printButton=document.createElement('button');printButton.type='button';printButton.className='pos-preview-print';printButton.textContent=o.status==='paid'?'Print receipt':'Print bill';root.querySelector('[data-close]').before(printButton);printButton.onclick=()=>runPrintButton(printButton,()=>print(o))}else return print(o,action==='kitchen',action==='pdf')}else if(action==='refund')refund();else if(action==='cancel')refund(true);else if(action==='settings')settings();else if(action==='options')options();else if(action==='links')await links();else if(action==='menu-display'){if(!isAdmin121())throw Error('Administrator access required');await restaurantModules125.ensure('settings');await publicContent127.open()}else if(action==='menu')switchTab('menu-recipe');else if(action==='categories')switchTab('menu-categories');else if(action==='inventory')switchTab('inv-overview');else if(action==='shift-view'){S.tab='Overview';render()}else if(action==='sync'){posReports.clear();await load()}else if(action==='reload'){await load()}else if(action==='open-shift')await shift('open');else if(action==='close-shift')await shift('close');else if(action==='cash')await shift('cash');else if(action==='shift-receipts')await posShifts.history(shiftHooks());else if(action==='export')await exportRows();else if(action==='export-pdf')await exportRows(true)}
function mount(){if($('#pos118'))return;const host=document.createElement('div');host.id='pos118';host.dataset.module='pos';host.className='tab-content';$('#menu-recipe').parentElement.append(host);/* The restaurant shell owns the sidebar; do not inject a second POS link. */fresh();wireSwipe(host);let lastPick=null;host.addEventListener('click',e=>{const rangeButton=e.target.closest('[data-report-range]');
 if(rangeButton){posReports.openRange(rangeButton,S.reportFilter,(from,to)=>{
  Object.assign(S.reportFilter,{from,to});render();host.querySelector('[data-report-range]')?.focus();
 });return}
 const picker=e.target.closest('input[data-report-field]');
 if(picker?.showPicker){try{picker.showPicker();e.preventDefault()}catch{/* The native input remains available. */}return}
 const b=e.target.closest('[data-pos118]');if(b?.dataset.pos118==='pick'){const now=performance.now(),id=b.dataset.id118;const double=e.detail>0&&lastPick&&lastPick.id===id&&now-lastPick.at<=500&&Math.hypot(e.clientX-lastPick.x,e.clientY-lastPick.y)<18;lastPick=double||e.detail===0?null:{id,at:now,x:e.clientX,y:e.clientY};if(double||e.detail===0){action('quick-add',b).catch(err=>showCenterStatus(err.message,true))}else if(S.picked!==id||S.editLine!=null){action('pick',b).catch(err=>showCenterStatus(err.message,true))}return}lastPick=null;if(b){action(b.dataset.pos118,b).catch(e=>showCenterStatus(e.message,true));return}const tr=e.target.closest('[data-order118]');if(tr){S.selected=tr.dataset.order118;render()}});host.addEventListener('keydown',e=>{if(['Enter',' '].includes(e.key)&&e.target.matches('[data-order118]')){e.preventDefault();S.selected=e.target.dataset.order118;render()}});host.addEventListener('input',e=>{const t=e.target;if(t.matches('[data-search118]')){S.visibleOrders=50;S.visibleMenu=40;const pos=t.selectionStart;S.query=t.value;if(host.querySelector('.pos-catalog118')){if(S.query.trim()){S.category='All';S.classification='All';}refreshCatalog();return}render();const input=host.querySelector('[data-search118]');input?.focus();input?.setSelectionRange(pos,pos)}if(t.matches('[data-item-note118]'))S.note=t.value;if(t.matches('[data-draft118]')){draft.data[t.dataset.draft118]=t.type==='number'?n(t.value):t.value;rememberDraft()}});host.addEventListener('change',async e=>{const t=e.target;try{if(t.dataset.reportField){
  const key=t.dataset.reportField;
  S.reportFilter[key]=t.value;
  if(key==='type'||key==='period'){
   const controls=t.closest('.pos-report-controls');
   controls.outerHTML=posReports.controls(S.reportFilter,button);
   host.querySelector('[data-report-field="'+key+'"]').focus({preventScroll:true});
  }
  posReports.populate(host,S.reportFilter,S);return;
 }if(t.matches('[data-choice118]')){const key=t.dataset.choice118,value=t.value;S.choices[key]=t.type==='checkbox'?[...host.querySelectorAll('[data-choice118="'+CSS.escape(key)+'"]:checked')].map(n=>n.value):t.value?[t.value]:[];render();host.querySelector('[data-choice118="'+CSS.escape(key)+'"][value="'+CSS.escape(value)+'"]')?.focus({preventScroll:true})}else if(t.matches('[data-draft118]'))render();else if(t.matches('[data-receipt-date118]')){S.receiptDate=t.value;if(window.posPerformance125&&!S.sample)await load({background:true});render()}}catch(e){showCenterStatus(e.message,true)}})}
const previous=switchTab;window.switchTab=function(id,...args){mount();const result=previous.call(this,id,...args);if(result!==false&&id==='pos118'){if(!S.modeChosen&&liveProfile?.id){S.modeChosen=true;if(restaurantPosMode128()==='live'){S.sample=false;S.loaded=false;S.orders=[];S.shifts=[];S.cash=[];S.picked=null;fresh();restoreDraft();S.tab='Sales';S.sub='New Order'}}if(S.owner&&S.owner!==liveProfile?.id){S.sample=false;S.loaded=false;S.owner=null;S.modeChosen=false;S.orders=[];S.shifts=[];S.cash=[];fresh()}if(!S.sample&&(!S.loaded||window.posPerformance125?.stale(S)))load({background:S.loaded});render();document.body.dataset.area113='pos'}return result};
const logout=logoutDemoUser;window.logoutDemoUser=async function(...args){posReports.clear();S.loaded=false;S.owner=null;S.modeChosen=false;S.sample=false;S.menu=[];S.ingredients=[];S.items=[];S.stock=[];S.balances125=null;S.schema125=false;S.catalogVersion125=null;S.summary125=null;S.offlineQueue=[];S.orders=[];S.shifts=[];S.cash=[];fresh();return logout.apply(this,args)};
window.pos118={openPaymentSettings154:settings,searchMenu154(query){S.query=query;S.category='All';S.classification='All';S.tab='Sales';S.sub='New Order';render()},printerSetup,prepareReceiptNumbers,clearReport(){posReports.clear()},setDraft146(order){draft=structuredClone(order);rememberDraft();S.selected=order.id;S.tab='Sales';S.sub='New Order';render()},openOptions132:options,state:S,catalog,render,load,syncPending,total,stock,get draft(){return draft},fresh,save,receipt,virtualMoves,pendingStock};function resumeRegister156(reconnected){
 if(S.sample||!liveProfile||!S.modeChosen)return;
 const active=!document.hidden&&document.getElementById('pos118')?.classList.contains('active');
 if(reconnected&&S.offlineQueue.length||active&&(!S.loaded||reconnected||window.posPerformance125?.stale(S)))load({background:S.loaded});
}
window.addEventListener('online',()=>resumeRegister156(true));document.addEventListener('visibilitychange',()=>{if(!document.hidden)resumeRegister156(false)});if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount);else mount();
})();
