/* Shared administrator lists. Saved through the versioned POS configuration. */
window.PosSetup154=(()=>{
 'use strict';
 const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const labels={percent:'Percentage',amount:'Fixed amount',open:'Open amount'};
 const format=v=>new Intl.NumberFormat('en-US',{maximumFractionDigits:2}).format(Number(v)||0);
 function normalize(p){return {id:p.id||crypto.randomUUID(),name:String(p.name||'').trim(),type:p.type||'percent',value:Number(p.value)||0,enabled:p.enabled!==false}}
 function validate(discounts,tables){
  for(const [rows,label] of [[discounts,'discount'],[tables,'table']]){const names=new Set(),ids=new Set();for(const r of rows){const name=r.name.trim().toLocaleLowerCase();if(!name||r.name.length>80||names.has(name)||!r.id||ids.has(r.id))throw Error('Give each '+label+' a unique name.');names.add(name);ids.add(r.id)}}
  for(const d of discounts)if(!labels[d.type]||!Number.isFinite(d.value)||d.value<0||(d.type!=='open'&&d.value<=0)||(d.type==='percent'&&d.value>100))throw Error('Use a percentage from 0.01 to 100, or a positive fixed amount.');
 }
 async function mount(host,section='discounts'){
  if(!isAdmin121())throw Error('Administrator access required.');
  const owner=liveProfile.id,epoch=sessionEpoch121,valid=()=>host.isConnected&&isAdmin121()&&liveProfile?.id===owner&&sessionEpoch121===epoch;
  host.innerHTML='<div class="setup154"><p role="status">Loading POS settings…</p></div>';
  const result=await ojmDb.from('pos_config118').select('data,version').eq('id',true).single();
  if(!valid())return;
  if(result.error){host.innerHTML='<div class="setup154"><p role="alert">'+esc(result.error.message)+'</p><button data-retry>Retry</button></div>';host.querySelector('button').onclick=()=>mount(host,section);return}
  let config=result.data.data,version=result.data.version,discounts=(config.discountPresets||[]).map(normalize),tables=(config.tables||[]).map(t=>({...t})),saving=false,dirty=false,editing=null;
  const change=()=>{dirty=true;host.querySelector('[data-save-state]').textContent='Unsaved changes';host.querySelector('[data-save]').disabled=false};
  function draw(){
   host.innerHTML=`<section class="setup154"><header class="setup154-heading"><div><p class="setup154-eyebrow">CASHIER CONFIGURATION</p><h2>POS settings</h2><p>Keep everyday choices simple for your team.</p></div><span class="setup154-count">${discounts.filter(x=>x.enabled).length} discounts · ${tables.filter(x=>x.enabled!==false).length} tables</span></header><nav class="setup154-tabs" aria-label="POS settings sections">${[['discounts','Discounts'],['tables','Tables'],['payments','Payments & printing']].map(([id,name])=>`<button type="button" data-section="${id}" aria-current="${section===id?'page':'false'}">${name}</button>`).join('')}</nav><div class="setup154-content"></div><footer class="setup154-footer"><span data-save-state role="status">${dirty?'Unsaved changes':'All changes saved'}</span><button type="button" data-save class="setup154-primary" ${dirty?'':'disabled'}>Save changes</button></footer></section>`;
   const body=host.querySelector('.setup154-content');
   if(section==='payments'){body.innerHTML='<div class="setup154-empty"><h3>Payments & printing</h3><p>Manage accepted currencies, BCEL rates, receipt paper and printer preferences in the POS.</p><button type="button" data-payments>Open payment settings</button></div>';body.querySelector('button').onclick=async()=>{if(dirty&&!confirm('Leave without saving your list changes?'))return;host.closest('dialog')?.close();await restaurantModules125.ensure('pos');await pos118.load();pos118.openPaymentSettings154()}}
   else{
    const isDiscount=section==='discounts',rows=isDiscount?discounts:tables;
    body.innerHTML=`<div class="setup154-toolbar"><div><h3>${isDiscount?'Discount list':'Table list'}</h3><p>${isDiscount?'Cashiers choose one named discount per order.':'Create the table names used in your dining area.'}</p></div><button type="button" data-add>＋ Add ${isDiscount?'discount':'table'}</button></div><label class="setup154-search">Search ${isDiscount?'discounts':'tables'}<input type="search" data-search placeholder="Find by name…"></label><div data-list></div><div data-editor></div>`;
    const list=()=>{const q=body.querySelector('[data-search]').value.trim().toLocaleLowerCase(),filtered=rows.filter(r=>r.name.toLocaleLowerCase().includes(q));body.querySelector('[data-list]').innerHTML=filtered.length?`<div class="setup154-list">${filtered.map(r=>`<article class="setup154-row"><span class="setup154-symbol">${isDiscount?(r.type==='percent'?'%':'₭'):'▦'}</span><div class="setup154-row-name"><strong>${esc(r.name)}</strong><span>${isDiscount?(r.type==='open'?'Enter amount at checkout':r.type==='percent'?format(r.value)+'% off':'₭'+format(r.value)+' off'):'Available in the cashier table picker'}</span></div><span class="setup154-badge ${r.enabled===false?'is-paused':''}">${r.enabled===false?'Hidden':isDiscount?labels[r.type]:'Active'}</span><button type="button" data-edit="${esc(r.id)}" aria-label="Edit ${esc(r.name)}">Edit</button></article>`).join('')}</div>`:`<div class="setup154-empty"><h4>${q?'No matches':isDiscount?'Your discount list starts here':'Add your first table'}</h4><p>${q?'Try another name.':isDiscount?'Add percentage, fixed kip, or open amount discounts.':'Use names such as Table 1, Terrace or Garden.'}</p></div>`;body.querySelectorAll('[data-edit]').forEach(b=>b.onclick=()=>edit(rows.find(x=>x.id===b.dataset.edit),isDiscount))};
    body.querySelector('[data-search]').oninput=list;body.querySelector('[data-add]').onclick=()=>edit(null,isDiscount);list();
   }
   host.querySelectorAll('[data-section]').forEach(b=>b.onclick=()=>{if(editing&&!confirm('Discard this unfinished edit?'))return;editing=null;section=b.dataset.section;draw()});
   host.querySelector('[data-save]').onclick=save;
  }
  function edit(record,isDiscount){
   if(editing&&!confirm('Discard this unfinished edit?'))return;editing=record?.id||'new';
   const target=host.querySelector('[data-editor]'),d=record||{name:'',type:'percent',value:'',enabled:true};
   target.innerHTML=`<form class="setup154-editor"><header><h3>${record?'Edit':'Add'} ${isDiscount?'discount':'table'}</h3><button type="button" data-cancel aria-label="Close editor">×</button></header><div class="setup154-fields"><label>Name<input name="name" required maxlength="80" value="${esc(d.name)}" placeholder="${isDiscount?'For example: Staff discount':'For example: Terrace 1'}"></label>${isDiscount?`<label>Discount type<select name="type">${Object.entries(labels).map(([k,v])=>`<option value="${k}" ${k===d.type?'selected':''}>${v}${k==='amount'||k==='open'?' (LAK)':''}</option>`).join('')}</select></label><label data-value-label>Value<input name="value" data-pos-money inputmode="decimal" value="${esc(d.value)}"></label><p data-open-note hidden>The cashier will enter the amount when applying this discount.</p>`:''}<label class="setup154-check"><input type="checkbox" name="enabled" ${d.enabled!==false?'checked':''}>Show to cashiers</label></div><p role="alert"></p><footer>${record?'<button type="button" data-remove>Remove</button>':''}<button type="button" data-cancel>Cancel</button><button type="submit" class="setup154-primary">${record?'Update':'Add'} ${isDiscount?'discount':'table'}</button></footer></form>`;
   const f=target.querySelector('form');
   if(isDiscount){const update=()=>{const open=f.elements.type.value==='open';f.querySelector('[data-value-label]').hidden=open;f.querySelector('[data-open-note]').hidden=!open;f.elements.value.required=!open};f.elements.type.onchange=update;update();window.posMoney?.bind?.(f)}
   f.querySelectorAll('[data-cancel]').forEach(b=>b.onclick=()=>{editing=null;target.replaceChildren()});
   f.querySelector('[data-remove]')?.addEventListener('click',()=>{if(!confirm('Remove “'+record.name+'” from the cashier list? Existing receipts keep their details.'))return;if(isDiscount)discounts=discounts.filter(x=>x.id!==record.id);else tables=tables.filter(x=>x.id!==record.id);editing=null;change();draw()});
   f.onsubmit=e=>{e.preventDefault();try{const row={id:record?.id||crypto.randomUUID(),name:f.elements.name.value.trim(),enabled:f.elements.enabled.checked,...(isDiscount?{type:f.elements.type.value,value:f.elements.type.value==='open'?0:Number(f.elements.value.value.replaceAll(',',''))}:{})};let next=(isDiscount?discounts:tables).filter(x=>x.id!==row.id);const at=record?(isDiscount?discounts:tables).indexOf(record):next.length;next.splice(at,0,row);validate(isDiscount?next:discounts,isDiscount?tables:next);if(isDiscount)discounts=next;else tables=next;editing=null;change();draw();showCenterStatus('List updated. Select Save changes to finish.')}catch(err){f.querySelector('[role=alert]').textContent=err.message;showCenterStatus(err.message,true)}};
   target.scrollIntoView({block:'nearest'});f.elements.name.focus();
  }
  async function save(){
   if(saving)return;
   const button=host.querySelector('[data-save]'),status=host.querySelector('[data-save-state]');
   if(!dirty&&!editing)return;
   if(editing){status.textContent='Finish or cancel the open editor first.';showCenterStatus(status.textContent,true);return}
   const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),15000);
   saving=true;button.disabled=true;host.inert=true;button.textContent='Saving…';status.textContent='Saving changes…';
   try{
    if(!valid())throw Error('Account changed. Reopen settings.');
    validate(discounts,tables);
    const data={...config,discountPresets:discounts,tables};
    const result=await ojmDb.rpc('pos_manage118',{p_action:'config',p_version:version,p_data:data}).abortSignal(controller.signal);
    if(!valid())return;
    if(result.error||!Number.isInteger(result.data?.version))throw Error(result.error?.message||'Save was not confirmed.');
    config=data;version=result.data.version;dirty=false;
   }catch(e){
    if(valid()){
     status.textContent=controller.signal.aborted?'Save unconfirmed. Reopen settings to check before retrying.':(e.message||'Could not save settings.');
     showCenterStatus(controller.signal.aborted?'Save unconfirmed. Check settings.':'Could not save settings. '+status.textContent,true);
    }
    return;
   }finally{
    clearTimeout(timer);saving=false;host.inert=false;button.disabled=!dirty;button.textContent='Save changes';
   }
   const savedMessage=section==='tables'?'Table settings saved.':'POS settings saved.';
   status.textContent=savedMessage;
   host.closest('dialog.setup154-dialog')?.close();
   showCenterStatus(savedMessage);
   if(window.pos118?.state&&!pos118.state.sample){pos118.state.config=config;pos118.state.configVersion=version;pos118.render()}
   window.restaurantData144?.changed(['config'],'pos');
   if(window.posPerformance125?.cacheConfig)void posPerformance125.cacheConfig(owner,config,version).catch(()=>{
    if(owner===liveProfile?.id&&epoch===sessionEpoch121)showCenterStatus('Saved online. Sync POS to update the offline copy.',true)
   });
  }
  host.setupSaving154=()=>saving;
  host.setupDirty154=()=>dirty||!!editing;draw();
 }
 async function open(section='discounts'){
  if(!isAdmin121())throw Error('Administrator access required.');
  const dialog=document.createElement('dialog');dialog.className='setup154-dialog';dialog.setAttribute('aria-label','POS settings');dialog.innerHTML='<button class="setup154-close" aria-label="Close POS settings">×</button><div data-setup></div>';document.body.append(dialog);
  const host=dialog.querySelector('[data-setup]'),close=()=>{if(host.setupSaving154?.())return;if(!host.setupDirty154?.()||confirm('Discard unsaved changes?'))dialog.close()};dialog.querySelector('button').onclick=close;dialog.oncancel=e=>{e.preventDefault();close()};dialog.onclose=()=>dialog.remove();dialog.showModal();await mount(host,section);dialog.scrollTop=0;
 }
 return {mount,open,validate,normalize};
})();
