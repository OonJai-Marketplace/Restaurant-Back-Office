/* Inventory / Consignment. Stock and partner terms are versioned by the server. */
(()=>{
 const esc=value=>shell113.esc(String(value??''));
 const fmt=value=>Number(value).toLocaleString('en-US',{maximumFractionDigits:2});
 const route='inv-consignment',root=()=>document.getElementById(route);
 let generation=0;
 async function open(){
  const el=root(),token=++generation,owner=liveProfile?.id,epoch=sessionEpoch121;
  if(!el||!owner)return;
  const valid=()=>generation===token&&owner===liveProfile?.id&&epoch===sessionEpoch121&&el.classList.contains('active');
  let model,busy=false;
  const can=action=>restaurantTabCan125('inventory','inv-items',action);
  const button=(label,action,id='')=>'<button type="button" data-cs="'+action+'" data-id="'+esc(id)+'">'+label+'</button>';
  function draw(){
   const {partners,products}=model;
   el.innerHTML='<section class="ops-panel"><header><h2>Consignment</h2><div>'+button('Refresh','refresh')+(can('edit')?' '+button('+ Partner','partner')+(partners.length?' '+button('+ Product','product'):''):'')+'</div></header><div data-editor></div><p role="status"></p><div data-partners></div></section>';
   el.querySelector('[data-partners]').innerHTML=partners.map(k=>{
    const items=products.filter(p=>p.partner===k.id);
    return '<section class="im-card104"><header><h3>'+esc(k.name)+'</h3>'+(can('edit')?button('Edit percentage','partner',k.id):'')+'</header><p>Partner '+fmt(k.percent)+'% · Oon Jai '+fmt(100-k.percent)+'% of original price · '+items.length+' products · '+fmt(items.reduce((sum,p)=>sum+p.quantity,0))+' units on hand</p><div class="ops-scroll"><table><thead><tr><th>Product</th><th>Units on hand</th><th>Original price (₭)</th><th>Sale price (₭)</th><th>Partner / unit (₭)</th><th>Oon Jai / unit (₭)</th><th>POS</th><th>Actions</th></tr></thead><tbody>'+items.map(p=>{
     const share=Math.round(p.original*k.percent)/100;
     return '<tr><th>'+esc(p.name)+'</th><td>'+fmt(p.quantity)+'</td><td>'+fmt(p.original)+'</td><td>'+fmt(p.price)+'</td><td>'+fmt(share)+'</td><td>'+fmt(p.price-share)+'</td><td>'+(p.published?'Shown':'Hidden')+'</td><td>'+(can('edit')?button('Edit','product',p.id):'')+(can('delete')?' '+button('Delete','remove',p.id):'')+'</td></tr>';
    }).join('')+'</tbody></table></div></section>';
   }).join('')||'<p>No consignment partners yet.</p>';
  }
  async function request(action,payload={}){
   if(busy||!valid())return;
   busy=true;const controls=[...el.querySelectorAll('button,input,select')].filter(x=>!x.disabled);
   controls.forEach(x=>x.disabled=true);
   try{
    const result=await ojmDb.rpc('restaurant_consignment166',{action,payload});
    if(!valid())return;if(result.error)throw Error(result.error.message);
    model=result.data;draw();
    if(action!=='list'){window.restaurantData144?.changed(['catalog','stock']);el.querySelector('[role=status]').textContent='Saved.'}
   }catch(error){if(valid())el.querySelector('[role=status]').textContent=error.message}
   finally{busy=false;controls.forEach(x=>x.disabled=false)}
  }
  function form(kind,id){
   const partner=kind==='partner',record=(partner?model.partners:model.products).find(x=>x.id===id)||{};
   const num=(label,key,value,step,max='')=>'<label>'+label+'<input type="number" name="'+key+'" min="0" step="'+step+'" '+(max?'max="'+max+'" ':'')+'value="'+esc(value??'')+'" required></label>';
   const slot=el.querySelector('[data-editor]');
   slot.innerHTML='<form class="ops-controls"><h3>'+(id?'Edit ':'New ')+(partner?'partner':'product')+'</h3><label>'+(partner?'Partner':'Product')+' name<input name="name" required maxlength="'+(partner?100:160)+'" value="'+esc(record.name||'')+'" '+(partner&&id?'readonly':'')+'></label>'+(partner?num('Partner share of original price (%)','percent',record.percent,'0.01',100):'<label>Partner<select name="partner">'+model.partners.map(k=>'<option value="'+esc(k.id)+'" '+(k.id===record.partner?'selected':'')+'>'+esc(k.name)+'</option>').join('')+'</select></label>'+num('Original price (₭)','original',record.original,'0.01',1000000000)+num('Sale price (₭)','price',record.price,'0.01',1000000000)+num('Units on hand','quantity',record.quantity,'1',2147483647)+'<label><input type="checkbox" name="published" '+(record.published?'checked':'')+'> Show in POS</label>')+'<button type="submit">Save</button>'+button('Cancel','cancel')+'</form>';
   const f=slot.querySelector('form'),key=record.id||crypto.randomUUID();f.elements.namedItem('name').focus();
   f.onsubmit=e=>{e.preventDefault();const data=Object.fromEntries(new FormData(f));if(!partner){data.published=f.elements.published.checked;if(Number(data.price)<Number(data.original)){el.querySelector('[role=status]').textContent='Sale price must cover the original price.';return}}request(kind,{...data,id:key,version:record.version||0})};
  }
  el.innerHTML='<section class="ops-panel"><header><h2>Consignment</h2>'+button('Refresh','refresh')+'</header><p role="status">Loading consignment inventory…</p></section>';
  el.onclick=async e=>{
   const b=e.target.closest('[data-cs]');if(!b||busy||!valid())return;
   const {cs,id}=b.dataset;
   if(cs==='refresh')return request('list');
   if(cs==='cancel')return draw();
   if(cs==='remove'){const p=model.products.find(x=>x.id===id);if(await ui117.confirm('Delete '+p.name+' from consignment inventory and POS? Past sales keep their recorded split.'))await request('remove',{id,version:p.version});return}
   form(cs,id);
  };
  await request('list');
 }
 const previous=window.switchTab;
 window.switchTab=function(id,...args){const result=previous.call(this,id,...args);if(result!==false&&id===route)open();return result};
})();
