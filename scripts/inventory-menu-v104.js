/* Inventory and Menu: administrator records stored in Supabase; stock ledger is append-only. */
(function(){
 'use strict';
 const state={owner:null,loaded:false,ledgerLoaded144:false,busy:false,error:'',ingredients:[],items:[],moves:[],menu:[],categories:[]};
 const editors=new Map();
 const editorView=()=>document.querySelector('.tab-content.active')?.id;
 Object.defineProperty(state,'editing',{
  get(){return editors.get(editorView())||null},
  set(value){const view=editorView();if(value)editors.set(view,value);else editors.delete(view)}
 });
 let readController125=null,readEpoch125=0,loadJob132=null;
 function cancelLoad(){loadJob132=null;readEpoch125++;readController125?.abort();state.busy=false}
 const tables={ingredients:'menu_ingredients105',items:'inventory_items104',moves:'inventory_movements104',menu:'menu_items104',categories:'menu_categories104'};
 const invViews=['inv-overview','inv-items','inv-allocated','inv-stock-in','inv-stock-out','inv-adj','inv-val'];
 const menuViews=['menu-ingredients','menu-details','menu-recipe','menu-pricing','menu-categories','menu-costing','menu-avail','menu-engineering108'];
 const all=[...invViews,...menuViews],esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const n=x=>Number(x)||0,fmt=x=>new Intl.NumberFormat('en-US',{maximumFractionDigits:3}).format(n(x));
 const workingRows=kind=>state[kind].filter(r=>r.data.stage131!=='archived');
 const ingredient=id=>state.ingredients.find(r=>r.id===id);
 const item=id=>state.items.find(r=>r.id===id),menu=id=>state.menu.find(r=>r.id===id);
 const stock=id=>state.moves.filter(r=>r.data?.itemId===id).reduce((sum,r)=>sum+(r.data.kind==='in'||r.data.kind==='adjust-in'?1:-1)*n(r.data.quantity),0)+(window.kitchen124?.pendingDelta(id)||0)-(window.pos118?.pendingStock?.(id)||0);
 const cost=id=>{const incoming=state.moves.filter(r=>r.data?.itemId===id&&['in','adjust-in'].includes(r.data.kind)&&n(r.data.cost)>0).sort((a,b)=>String(b.created_at).localeCompare(String(a.created_at))||String(b.id).localeCompare(String(a.id)))[0];return n(incoming?.data.cost)||n(item(id)?.data.cost)};
 const cur=id=>item(id)?.data.currency||'LAK';
 const currencies=()=>{const available=typeof CurrencyStore!=='undefined'?(CurrencyStore.currencies||[]).filter(c=>c.is_active!==false&&c.active!==false).map(c=>c.code):[];return available.length?available:['LAK','USD','THB']};
 const options=(rows,current='')=>rows.map(([value,label])=>`<option value="${esc(value)}" ${String(current)===String(value)?'selected':''}>${esc(label)}</option>`).join('');
 const field=(label,name,value='',type='text',attrs='')=>`<label>${esc(label)}<input name="${esc(name)}" type="${type}" value="${esc(value)}" ${attrs}></label>`;
 const card=(title,body,action='')=>`<section class="im-card104"><header><h3>${esc(title)}</h3>${action?'<div class="im-toolbar-actions">'+action+'</div>':''}</header><div class="im-body104">${body}</div></section>`;
 const itemLabel=(entry,label)=>`<span data-row-kind="items" data-row-id="${esc(entry.id)}">${esc(label)}</span>`;
 const table=(headers,rows)=>`<div class="im-scroll104"><table><thead><tr>${headers.map(h=>`<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows.length?rows.map(cells=>`<tr>${cells.map(c=>`<td>${c}</td>`).join('')}</tr>`).join(''):`<tr><td colspan="${headers.length}">No records yet.</td></tr>`}</tbody></table></div>`;
 const btn=(label,action,id='',style='')=>`<button type="button" data-im-action="${action}" data-im-id="${esc(id)}" class="${style}">${esc(label)}</button>`;
 const notice=()=>state.error?`<div class="im-error104" role="alert">${esc(state.error)}${state.error.includes('schema cache')||state.error.includes('does not exist')||state.error.includes('install_catalog106')?' Apply the <a href="setup/106-install.sql" download>Inventory and Menu database setup</a> in the project SQL Editor.':''}</div>`:'';
 const header=(title,subtitle)=>`<div class="im-title104"><h2>${title}</h2><p>${subtitle}</p>${notice()}</div>`;
 function rendered(){return all.includes(document.querySelector('.tab-content.active')?.id)}
 function catalogOnly144(){const id=typeof document==='undefined'?'':document.querySelector('.tab-content.active')?.id||'';return id==='inv-allocated'||id.startsWith('menu-')&&id!=='menu-integration132';}
 function load(force=false,{catalogOnly=catalogOnly144()}={}){const owner=liveProfile?.id,epoch=sessionEpoch121;if(loadJob132?.owner===owner&&loadJob132.epoch===epoch){const job=loadJob132;return !catalogOnly&&job.catalogOnly?job.promise.then(()=>load(false,{catalogOnly:false})):job.promise;}const job={owner,epoch,catalogOnly,promise:null};loadJob132=job;job.promise=loadCore132(force,catalogOnly).finally(()=>{if(loadJob132===job)loadJob132=null});return job.promise}
 // Supabase caps unpaginated reads; a partial ledger is not a stock balance.
 async function readRows137(table,read,valid){const rows=[],size=500;for(let start=0;;start+=size){const r=await read(ojmDb.from(table).select('*').order('created_at',{ascending:false}).order('id',{ascending:true}).range(start,start+size-1));if(!valid())throw Error('Catalog load superseded');if(r.error)throw r.error;const page=r.data||[];rows.push(...page);if(page.length<size)return rows;}}
 async function loadCore132(force=false,catalogOnly=false){
  if(!liveProfile||!ojmDb)return;if(!restaurantCan('inventory')&&!restaurantCan('menu'))return;if(state.busy||state.loaded&&state.owner===liveProfile.id&&(catalogOnly||state.ledgerLoaded144)&&!force)return;
  state.busy=true;const requestOwner=liveProfile.id,requestEpoch=sessionEpoch121,readEpoch=++readEpoch125;readController125=new AbortController();const controller=readController125,read=query=>{let timer;return Promise.race([Promise.resolve(query.abortSignal?query.abortSignal(controller.signal):query),new Promise((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(Error('Inventory download timed out. Use Reload to retry.'))},30000)})]).finally(()=>clearTimeout(timer))},valid=()=>liveProfile?.id===requestOwner&&sessionEpoch121===requestEpoch&&readEpoch===readEpoch125;state.owner=requestOwner;
  try{
   const result=await Promise.all(Object.entries(tables).filter(([key])=>!catalogOnly||key!=='moves').map(async([key,table])=>[key,await readRows137(table,read,valid)]));
   const pos=catalogOnly?[]:await readRows137('pos_stock118',read,valid);if(!valid())return;
   const next=Object.fromEntries(result);next.moves=catalogOnly?state.moves:next.moves;next.moves.push(...pos.map(r=>({id:r.id,created_at:r.created_at,data:{date:r.created_at.slice(0,10),itemId:r.item_id,kind:Number(r.quantity)>0?'out':'adjust-in',quantity:Math.abs(Number(r.quantity)),reference:'POS '+r.order_id,note:r.kind==='return'?'Refund restock':'POS sale',pos118:true}})));
   Object.assign(state,next,{error:'',loaded:true,ledgerLoaded144:!catalogOnly});window.restaurantIntegration132?.invalidatePlan?.();
  }catch(e){if(!valid())return;state.error=e.message||'Inventory records could not be loaded';state.loaded=false}
  finally{if(valid()){state.busy=false;if(rendered())render()}}
 }
 async function save(kind,data,record,editor){if(!catalogCan121(kind,'edit',data))throw Error('This action is not included in your access.');if(!ojmDb)throw Error('Sign in before saving.');const owner=liveProfile.id,epoch=sessionEpoch121,db=ojmDb.from(tables[kind]);let query=record?db.update({data,version:record.version+1}).eq('id',record.id).eq('version',record.version):db.insert({data});const result=await query.select('*');if(result.error)throw result.error;if(!result.data?.length)throw Error('Record changed. Reload and try again.');if(liveProfile?.id!==owner||epoch!==sessionEpoch121)throw Error('Account changed during save.');state[kind]=[result.data[0],...state[kind].filter(x=>x.id!==result.data[0].id)];state.error='';if(editor&&editors.get(editor.view)===editor)editors.delete(editor.view);window.restaurantIntegration132?.invalidatePlan?.();window.restaurantData144?.changed([kind==='moves'?'stock':'catalog'],'catalog');render();showCenterStatus('Saved successfully.')}
 async function submit(event,kind){event.preventDefault();const f=event.currentTarget,b=f.querySelector('[type=submit]');if(b.disabled)return;b.disabled=true;try{const record=f.catalogRecord||state[kind].find(x=>x.id===f.dataset.id);const data={...record?.data,...Object.fromEntries(new FormData(f))};
  if(kind==='moves'){data.quantity=n(data.quantity);data.cost=n(data.cost);if(!item(data.itemId)||!(data.quantity>0))throw Error('Choose an item and a positive quantity.');if(['out','adjust-out'].includes(data.kind)&&data.quantity>stock(data.itemId))throw Error('Insufficient stock.');data.currency=cur(data.itemId);data.itemName=item(data.itemId).data.name;data.date=data.date||new Date().toISOString().slice(0,10)}
  if(kind==='items'||kind==='ingredients'){data.cost=n(data.cost);data.reorder=n(data.reorder);data.active=!!f.elements.active?.checked;if(!(data.cost>=0&&data.reorder>=0))throw Error('Cost and reorder point must be nonnegative.')}
  if(kind==='ingredients'){data.purchaseQuantity=n(data.purchaseQuantity);data.purchasePrice=n(data.purchasePrice);if(data.purchaseQuantity<=0||data.purchasePrice<0)throw Error('Enter a purchase quantity greater than zero and a nonnegative price.');data.cost=data.purchasePrice/data.purchaseQuantity;if(data.unitReview135&&data.active&&data.unit==='g/ml')throw Error('Confirm grams or milliliters and update the linked Inventory unit before activating this ingredient.');if(data.unitReview135&&data.unit!=='g/ml'){const linked=item(data.inventoryItemId118);if(linked&&linked.data.unit==='g/ml')throw Error('Update the linked Inventory item to its actual unit first, then confirm this ingredient.');data.unitReview135=false;}}
  if(kind==='menu'){delete data.sourceReviewed135;if(f.elements.price)data.price=data.price===''||data.price==null?null:n(data.price);if(f.elements.active)data.active=f.elements.active.checked;data.recipe=[...f.querySelectorAll('.im-recipe-row104')].map(row=>({itemId:row.querySelector('[name=ingredientId]').value,quantity:n(row.querySelector('[name=ingredientQuantity]').value)})).filter(x=>x.itemId&&x.quantity>0);if(f.elements.sourceReviewed135?.checked){
    const missing=recipeLinesForDisplay(record.data).filter(l=>l.quantity==null&&!data.recipe.some(row=>row.itemId===l.itemId));
    if(missing.length)throw Error('Enter the quantity for '+missing.map(l=>ingredient(l.itemId).data.name).join(', ')+'.');
    data.recipeReview135=[];data.sourceReviewedAt135=new Date().toISOString();
   }
   if(data.itemType==='bundle'&&!data.recipe.length)throw Error('Choose the products in this bundle.');if(data.recipe.some(x=>data.itemType==='bundle'?!menu(x.itemId)||menu(x.itemId).data.itemType==='bundle'||x.itemId===record?.id:!ingredient(x.itemId)))throw Error('Choose valid components. Bundles contain individual products only.');if(data.price<0)throw Error('Price must be nonnegative.');if(f.elements.photo)data.photoData=record?.data.photoData||'';if(data.removePhoto)data.photoData='';const photo=f.elements.photo?.files?.[0];if(photo){if(!['image/png','image/jpeg','image/webp'].includes(photo.type)||photo.size>8*1024*1024)throw Error('Choose a PNG, JPG or WebP under 8 MB.');const bitmap=await createImageBitmap(photo),canvas=document.createElement('canvas'),scale=Math.min(1,800/Math.max(bitmap.width,bitmap.height));canvas.width=Math.round(bitmap.width*scale);canvas.height=Math.round(bitmap.height*scale);canvas.getContext('2d').drawImage(bitmap,0,0,canvas.width,canvas.height);bitmap.close?.();data.photoData=canvas.toDataURL('image/jpeg',.85)}delete data.photo;delete data.removePhoto;}
  if(kind==='items'&&f.saleLinks){if(f.querySelector('[data-link-menu]').value)throw Error('Add the selected POS link or clear the menu selection before saving.');data.posMenuUse=f.saleLinks}
  await save(kind,data,record,f.catalogEditor);
 }catch(e){state.error=e.message;let message=f.querySelector('.im-form-error104');if(!message){message=document.createElement('p');message.className='im-form-error104';message.setAttribute('role','alert');f.prepend(message)}message.textContent=state.error}finally{b.disabled=false}}
 function stockMatch(term,name){
  const clean=v=>String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
  const a=clean(term),b=clean(name);if(!a||b.includes(a))return true;
  if(a.length<3)return false;
  return [b,...b.split(/\s+/)].some(word=>{
   if(Math.abs(word.length-a.length)>1)return false;
   let i=0,j=0,errors=0;
   while(i<a.length&&j<word.length){
    if(a[i]===word[j]){i++;j++;continue}
    if(++errors>1)return false;
    if(a.length>=word.length)i++;if(word.length>=a.length)j++
   }
   return errors+a.length-i+word.length-j<=1
  })
 }
 function stockLinkForm(){return `<fieldset class="im-sale-links"><legend>POS stock links</legend>
  <label>Find ingredient or menu<input type="search" data-link-search placeholder="Type an ingredient or menu name"></label>
  <div data-link-matches></div><div data-chosen-ingredient></div>
  <div class="im-link-fields"><label>Menu<select data-link-menu></select></label>
  <label>Use as<select data-link-kind><option value="supply">Supply</option><option value="ingredient">Ingredient</option><option value="packaging">Packaging</option></select></label>
  <label>Apply to<select data-link-choice></select></label>
  <label>Stock deduction<select data-link-mode><option value="online">Online automatic · choose for dine-in</option><option value="all">Automatic for online and dine-in</option></select></label>
  <label>Stock units per menu unit<input type="number" data-link-quantity value="1" min="0.000001" step="any"></label></div>
  <button type="button" data-link-add>Add link</button><p data-link-message role="status"></p><div data-link-list></div><div data-menu-stock-list></div></fieldset>`}
 async function bindStockLinks(f,record){
  const $=s=>f.querySelector(s),search=$('[data-link-search]'),picker=$('[data-link-menu]'),choice=$('[data-link-choice]'),message=$('[data-link-message]');
  if(!search)return;
  const rules=structuredClone(record?.data.posMenuUse||[]);f.saleLinks=rules;
  const menus=workingRows('menu'),byIngredient=new Map(state.ingredients.map(i=>[i.id,i.data.name])),worksheets=new Map();
  let matchedName='';
  function ingredientsOf(m){
   const base=m.data.itemType==='bundle'?[]:(m.data.recipe||[]).map(r=>byIngredient.get(r.itemId));
   const opts=(m.data.posOptions118||[]).flatMap(g=>g.options.flatMap(o=>[o.name,...(o.recipe||[]).map(r=>byIngredient.get(r.itemId))]));
   return [...new Set([...base,...opts,...(worksheets.get(m.id)||[])].filter(Boolean))]
  }
  let lastMenu='';
  function menuStockList(menuId){
   const panel=$('[data-menu-stock-list]');
   const menu=state.menu.find(m=>m.id===menuId);if(!menu){panel.innerHTML='';return}
   const items=workingRows('items').filter(i=>i.data.active!==false&&i.id!==record?.id)
     .map(i=>({name:i.data.name,unit:i.data.unit,links:i.data.posMenuUse||[]}));
   items.push({name:f.elements.name.value.trim()||'This item',unit:f.elements.unit?.value,links:rules});
   const entries=items.flatMap(i=>i.links.filter(r=>r.menuId===menuId).map(r=>{
    const opt=menu.data.posOptions118?.find(g=>g.id===r.groupId)?.options.find(o=>o.id===r.optionId);
    return '<li>'+esc(i.name)+' · '+esc(String(r.quantity))+' '+esc(i.unit||'units')+(opt?' · '+esc(opt.name):'')+'</li>'
   }));
   panel.innerHTML='<strong>Online stock links · '+esc(menu.data.name)+'</strong>'+(entries.length?'<ul>'+entries.join('')+'</ul>':'<p>No explicit stock links yet.</p>')
  }
  function paintChoices(){
   if(picker.value)lastMenu=picker.value;menuStockList(picker.value||lastMenu);
   const groups=menus.find(m=>m.id===picker.value)?.data.posOptions118||[];
   choice.innerHTML='<option value="">Every order of this menu</option>'+groups.flatMap(g=>g.options.filter(o=>o.available!==false).map(o=>`<option data-group="${esc(g.id)}" value="${esc(o.id)}">${esc(g.name+' · '+o.name)}</option>`)).join('');
   const matching=[...choice.options].filter(o=>o.value&&o.textContent.split(' · ').at(-1).toLowerCase()===matchedName.toLowerCase());
   if(matchedName&&matching.length===1)choice.value=matching[0].value
  }
  function showMatch(){
   $('[data-chosen-ingredient]').innerHTML=matchedName?'Ingredient · <b>'+esc(matchedName)+'</b> <button type="button" data-clear-match>Clear</button>':'';
  }
  function filter(){
   const q=search.value.trim(),prior=picker.value;
   const matches=menus.filter(m=>stockMatch(q,m.data.name)||ingredientsOf(m).some(i=>stockMatch(q,i)));
   picker.innerHTML='<option value="">Choose a menu</option>'+matches.map(m=>`<option value="${esc(m.id)}">${esc(m.data.name)}</option>`).join('');
   if(matches.some(m=>m.id===prior))picker.value=prior;
   const names=new Set(menus.flatMap(ingredientsOf).filter(name=>q&&stockMatch(q,name)));
   $('[data-link-matches]').innerHTML=Array.from(names).sort().slice(0,12).map(name=>`<button type="button" data-match-name="${esc(name)}">${esc(name)}</button>`).join('');
   paintChoices()
  }
  function paintRules(){
   $('[data-link-list]').innerHTML=rules.map((r,i)=>{const m=state.menu.find(m=>m.id===r.menuId);const opt=m?.data.posOptions118?.find(g=>g.id===r.groupId)?.options.find(o=>o.id===r.optionId);
    return `<div><span>${esc(m?.data.name||'Unavailable menu')} · ${esc(r.ingredientName||r.kind)} × ${esc(String(r.quantity))} · ${(r.stockMode|| (r.kind==='ingredient'?'all':'online'))==='all'?'Automatic for both':'Choose for dine-in'}${opt?' · '+esc(opt.name):''}</span><button type="button" data-remove-link="${i}">Remove</button></div>`}).join('')
  }
  function similarItems(){
   const q=f.elements.name.value.trim();const matches=workingRows('items').filter(r=>r.id!==record?.id&&q&&stockMatch(q,r.data.name)).slice(0,6);
   $('[data-similar-stock]').textContent=matches.length?'Existing inventory names · '+matches.map(r=>r.data.name).join(', '):''
  }
  $('[data-link-kind]').onchange=()=>{$('[data-link-mode]').value=$('[data-link-kind]').value==='ingredient'?'all':'online'};
  similarItems();f.elements.name.addEventListener('input',similarItems);search.oninput=()=>{matchedName='';showMatch();filter()};picker.onchange=paintChoices;filter();paintRules();
  $('[data-link-matches]').onclick=e=>{const b=e.target.closest('[data-match-name]');if(b){matchedName=b.dataset.matchName;search.value=matchedName;$('[data-link-kind]').value='ingredient';$('[data-link-kind]').onchange();showMatch();filter()}};
  $('[data-chosen-ingredient]').onclick=()=>{matchedName='';search.value='';showMatch();filter()};
  $('[data-link-list]').onclick=e=>{const b=e.target.closest('[data-remove-link]');if(b){rules.splice(Number(b.dataset.removeLink),1);paintRules();menuStockList(picker.value||lastMenu)}};
  $('[data-link-add]').onclick=()=>{
   const menuId=picker.value,quantity=Number($('[data-link-quantity]').value);
   if(!menuId||!Number.isFinite(quantity)||quantity<=0){message.textContent='Choose a menu and a positive stock quantity.';return}
   if(rules.some(r=>r.menuId===menuId)){message.textContent='This stock item already has a link for that menu. Remove it to change the rule.';return}
   const kind=$('[data-link-kind]').value,ingredient=state.ingredients.find(i=>i.data.name.toLowerCase()===matchedName.toLowerCase());
   rules.push({menuId,quantity,kind,stockMode:$('[data-link-mode]').value,...(kind==='ingredient'&&matchedName?{ingredientName:matchedName,...(ingredient?{ingredientId:ingredient.id}:{})}:{}),...(choice.value?{groupId:choice.selectedOptions[0].dataset.group,optionId:choice.value}:{})});
   picker.value='';paintChoices();paintRules();message.textContent='Link added. Save item to keep it.'
  };
  const owner=liveProfile?.id;
  try{const {data,error}=await ojmDb.from('restaurant_kitchen_worksheets').select('menu_id,sections');
   if(!f.isConnected||owner!==liveProfile?.id)return;
   if(error)throw error;
   for(const row of data||[])worksheets.set(row.menu_id,row.sections.filter(g=>g.kind!=='components').flatMap(g=>g.rows.map(r=>r.name)));
   if(!picker.value)filter()
  }catch{if(f.isConnected)message.textContent='Kitchen worksheet names could not load. Menu and catalog ingredient search is available.'}
 }
 function form(kind,record){const d=record?.data||{itemType:record?.itemType},id=record?.id||'',common=`data-im-form="${kind}" data-id="${esc(id)}"`;
  if(kind==='items'||kind==='ingredients')return `<form ${common} class="im-form104">${field('Item code','code',d.code,'text','required')}${field('Name','name',d.name,'text','required')}${kind==='items'?'<small data-similar-stock></small>':''}${d.unitReview135?'<p class="im-warning120">Choose grams or milliliters and match the linked inventory unit.</p>':''}${field('Unit (kg, L, each...)','unit',d.unit||'each','text','required')}${field('Category','category',d.category)}${kind==='ingredients'?field('Purchase quantity (in the unit above)','purchaseQuantity',d.purchaseQuantity||1,'number','step="any" min="0.001" required')+field('Purchase price','purchasePrice',d.purchasePrice??d.cost??0,'number','step="any" min="0" required')+'<output class="im-unit106"></output>':field('Last unit cost','cost',d.cost||0,'number','step="0.001" min="0"')+field('Reorder point','reorder',d.reorder||0,'number','step="0.001" min="0"')}<label>Currency<select name="currency">${options(currencies().map(x=>[x,x]),d.currency||'LAK')}</select></label><label class="im-check104"><input type="checkbox" name="active" ${d.active!==false?'checked':''}> Active</label>${kind==='items'?stockLinkForm():''}<div class="im-actions104"><button type="submit">Save item</button>${btn('Cancel','cancel')}</div></form>`;
  if(kind==='moves'){const movement=record?.moveKind||'in',label={in:'Stock In',out:'Stock Out','adjust-in':'Stock Adjustment · increase','adjust-out':'Stock Adjustment · decrease'}[movement];return `<form ${common} class="im-form104"><input type="hidden" name="kind" value="${movement}"><label>Item<select name="itemId" required><option value="">Select item</option>${options(state.items.filter(x=>x.data.active!==false).map(x=>[x.id,x.data.code+' · '+x.data.name]))}</select></label>${field('Date','date',new Date().toISOString().slice(0,10),'date','required')}${field('Quantity','quantity','','number','min="0.001" step="0.001" required')}${movement==='in'?field('Unit cost','cost','','number','min="0" step="0.001"'):''}${field('Reference','reference','','text','required')}${field('Note','note','')}<div class="im-actions104"><button type="submit">Save ${label}</button>${btn('Cancel','cancel')}</div></form>`}
  if(kind==='categories')return `<form ${common} class="im-form104">${field('Category code','code',d.code,'text','required')}${field('Category name','name',d.name,'text','required')}${field('Description','description',d.description)}<div class="im-actions104"><button type="submit">Save category</button>${btn('Cancel','cancel')}</div></form>`;
  if(kind==='menu'){
   const shared=!!d.storefrontManaged131,lines=recipeLinesForDisplay(d);
   const display=shared?(isAdmin121()?btn('Edit display details','menu-display',id):''):`${field('Menu name','name',d.name,'text','required')}<label>Category<select name="category"><option value="">Uncategorized</option>${options(state.categories.map(x=>[x.id,x.data.name]),d.category)}</select></label>${field('Selling price','price',d.price??'','number','min="0" step="0.01"')}<label>Currency<select name="currency">${options(currencies().map(x=>[x,x]),d.currency||'LAK')}</select></label>${field('Description','description',d.description)}<label>Menu photo<input type="file" name="photo" accept="image/png,image/jpeg,image/webp"></label>${/^data:image\/(png|jpeg|webp);base64,/i.test(d.photoData||'')?`<div><img class="im-photo105" src="${esc(d.photoData)}" alt="Menu photo"><label><input type="checkbox" name="removePhoto"> Remove photo</label></div>`:''}<label class="im-check104"><input type="checkbox" name="active" ${d.active!==false?'checked':''}> Available</label>`;
   const verify=d.recipeReview135?.length?'<label class="im-check104"><input type="checkbox" name="sourceReviewed135"> Recipe quantities and yield verified</label>':'';
   return `<form ${common} class="im-form104">${field('Menu code','code',d.code,'text','required')}<label>Item type<select name="itemType">${options([['single','Individual product'],['bundle','Bundle / promotion']],d.itemType||'single')}</select></label>${display}${d.bulkUnit135?field('Order unit','bulkUnit135',d.bulkUnit135):''}${verify}<div class="im-recipe104"><strong class="recipeLabel108">${d.itemType==='bundle'?'Products in this bundle':'Ingredients per serving'}</strong><div class="im-recipe-lines104">${(lines.length?lines:[{}]).map(row=>recipeRow(row,d.itemType,record?.id)).join('')}</div>${btn('Add ingredient','add-ingredient')}</div><div class="im-actions104"><button type="submit">${shared?'Save recipe':'Save menu item'}</button>${btn('Cancel','cancel')}</div></form>`
  }
 }
 function recipeRow(row,type='single',exclude=''){const sources=type==='bundle'?state.menu.filter(m=>m.data.itemType!=='bundle'&&m.id!==exclude):state.ingredients;return `<div class="im-recipe-row104"><select name="ingredientId" aria-label="Ingredient or product"><option value="">Select ingredient</option>${options(sources.filter(x=>x.data.active!==false||x.id===row.itemId).map(x=>[x.id,x.data.name+' · '+(x.data.unit||x.data.currency)]),row.itemId)}</select><input name="ingredientQuantity" type="number" min="0.001" step="0.001" value="${esc(row.quantity||'')}" placeholder="Qty" aria-label="Quantity per serving"><output class="im-line106"></output><button type="button" data-im-action="remove-ingredient" aria-label="Remove ingredient">×</button></div>`}
 function editCard(kind){
  const editor=state.editing;if(editor?.kind!==kind)return '';
  const record=state[kind].find(x=>x.id===editor.id);
  const title=kind==='menu'&&record?'Edit recipe · '+record.data.name:editor.id?'Edit record':'New record';
  return card(title,editor.form?'<div data-recipe-draft></div>':form(kind,record||editor));
 }
 function ingredientCost(d,visited=new Set()){const lines=d.recipe||[];let total=0,mixed=false,missing=!lines.length||!!d.recipeReview135?.length;for(const line of lines){const source=d.itemType==='bundle'?menu(line.itemId):ingredient(line.itemId);if(!source||!(n(line.quantity)>0)||visited.has(line.itemId)){missing=true;continue}if(source.data.currency!==d.currency)mixed=true;if(d.itemType==='bundle'){const child=ingredientCost(source.data,new Set([...visited,line.itemId]));total+=child.amount*n(line.quantity);missing||=child.missing;mixed||=child.mixed}else{if(!(n(source.data.cost)>0)||source.data.unitReview135)missing=true;total+=n(source.data.cost)*n(line.quantity)}}return {amount:total,mixed,missing}}
 function inventory(view){const items=state.items.filter(x=>x.data.active!==false),low=items.filter(x=>stock(x.id)<=n(x.data.reorder));let body=header('Inventory','Items, stock movements and values by currency.');
  if(view==='inv-overview'){const values={};items.forEach(x=>{const c=x.data.currency||'LAK';values[c]=(values[c]||0)+stock(x.id)*cost(x.id)});body+=card('At a Glance',`<div class="inventory-metrics117"><div><small>Stock value</small><strong>${Object.entries(values).map(([c,v])=>`${fmt(v)} <small>${esc(c)}</small>`).join('<br>')||'0'}</strong></div><div><small>Active items</small><strong>${items.length}</strong></div><div><small>Need replenishment</small><strong>${low.length}</strong></div><div><small>Out of stock</small><strong>${items.filter(x=>stock(x.id)<=0).length}</strong></div><div><small>Stock movements</small><strong>${state.moves.length}</strong></div></div>`,btn('Add item','new-item'))+card('Replenishment',table(['Item','Available','Reorder point','Shortfall'],low.map(x=>[itemLabel(x,x.data.name),fmt(stock(x.id))+' '+esc(x.data.unit),fmt(x.data.reorder),fmt(Math.max(0,n(x.data.reorder)-stock(x.id)))])))+card('Recent activity',table(['Date','Item','Movement','Quantity','Reference'],[...state.moves].sort((a,b)=>String(b.data.date).localeCompare(String(a.data.date))).slice(0,12).map(x=>[esc(x.data.date),esc(item(x.data.itemId)?.data.name||x.data.itemName),esc(x.data.kind),fmt(x.data.quantity),esc(x.data.reference)])))+editCard('items')}
  if(view==='inv-items')body+=card('Items',table(['Code','Name','Unit','Category','On hand','Unit cost','Currency','Action'],state.items.map(x=>[esc(x.data.code),esc(x.data.name),esc(x.data.unit),esc(x.data.category||'—'),fmt(stock(x.id)),fmt(cost(x.id)),esc(x.data.currency),btn('Edit','edit-item',x.id)])),btn('Reload','reload')+btn('Add item','new-item'))+editCard('items');
  if(['inv-stock-in','inv-stock-out','inv-adj'].includes(view)){const kinds=view==='inv-stock-in'?['in']:view==='inv-stock-out'?['out']:['adjust-in','adjust-out'];body+=card({ 'inv-stock-in':'Stock In','inv-stock-out':'Stock Out','inv-adj':'Stock Adjustment'}[view],table(['Date','Item','Movement','Quantity','Unit cost','Value','Reference','Note','Action'],state.moves.filter(x=>kinds.includes(x.data.kind)).map(x=>[esc(x.data.date),esc(item(x.data.itemId)?.data.name||x.data.itemName),esc(x.data.kind),fmt(x.data.quantity)+' '+esc(item(x.data.itemId)?.data.unit),esc(x.data.currency)+' '+fmt(x.data.cost),esc(x.data.currency)+' '+fmt(n(x.data.cost)*n(x.data.quantity)),esc(x.data.reference),esc(x.data.note),state.moves.some(m=>m.data.reverses108===x.id)?'Reversed':btn('Reverse','reverse-move',x.id)])),kinds.map(k=>btn(k==='adjust-in'?'Increase stock':k==='adjust-out'?'Decrease stock':'Record '+k,'new-move',k)).join(''))+editCard('moves')}
  if(view==='inv-val')body+=card('Inventory valuation · last recorded unit cost',table(['Code','Item','On hand','Cost per unit','Currency','Extended value','Status'],state.items.map(x=>[esc(x.data.code),esc(x.data.name),fmt(stock(x.id))+' '+esc(x.data.unit),fmt(cost(x.id)),esc(x.data.currency),fmt(stock(x.id)*cost(x.id)),stock(x.id)<=n(x.data.reorder)?'<span class="im-low104">Reorder</span>':'Available'])));return body}
 function recipeLinesForDisplay(d){
  const lines=(d.recipe||[]).slice();
  if(!d.recipeReview135?.length||d.itemType==='bundle')return lines;
  for(const raw of d.recipeSource135?.rows||[]){
   if(raw.quantity!=null||!raw.name)continue;
   const match=state.ingredients.find(r=>r.data.code==='BAKERY135-ING-'+raw.key)
    ||state.ingredients.find(r=>r.data.name?.toLowerCase()===raw.name.toLowerCase());
   if(match&&!lines.some(l=>l.itemId===match.id))lines.push({itemId:match.id,quantity:null});
  }
  return lines;
 }
 function recipeDetails134(m,editable=false){const d=m.data,lines=recipeLinesForDisplay(d),c=ingredientCost(d),valid=!c.mixed&&!c.missing,price=n(d.price);return `${d.recipeSource135?.yieldLabel?'<p><strong>Batch yield</strong> '+esc(d.recipeSource135.yieldLabel)+'</p>':''}${d.bulkUnit135?'<p><strong>Quantities per '+esc(d.bulkUnit135)+'</strong></p>':''}${d.description?'<p>'+esc(d.description)+'</p>':''}${(d.posOptions118||[]).map(g=>'<p><strong>'+esc(g.name)+':</strong> '+esc(g.options.map(o=>o.name).join(', '))+(g.included!=null?' · '+g.included+' included'+(g.extraPrice?' · extra LAK '+fmt(g.extraPrice):''):'')+'</p>').join('')}${d.photoData&&/^data:image\/(png|jpeg|webp);base64,/i.test(d.photoData)?`<img class="im-photo105" src="${esc(d.photoData)}" alt="${esc(d.name)}">`:''}${!(d.recipe||[]).length?'<div data-worksheet-menu="'+esc(m.id)+'"></div>':''}${lines.length?table(['Ingredient','Quantity','Cost per unit','Line cost'],lines.map(line=>{const source=(d.itemType==='bundle'?menu(line.itemId):ingredient(line.itemId))?.data,unitCost=d.itemType==='bundle'&&source?ingredientCost(source).amount:source?.cost;return [source?(editable?`<button type="button" class="im-link117" data-jump117="${d.itemType==='bundle'?'recipe':'ingredient'}" data-id="${esc(line.itemId)}">${esc(source.name)}</button>`:esc(source.name)):'Missing ingredient',line.quantity>0?fmt(line.quantity)+' '+esc(source?.unit||''):'—',unitCost>0?esc(source.currency)+' '+fmt(unitCost):'—',unitCost>0&&line.quantity>0?esc(source.currency)+' '+fmt(unitCost*n(line.quantity)):'—']})):''}<footer><span>Food cost ${valid&&price>0?fmt(c.amount/price*100)+'%':'—'} · Gross margin ${valid&&price>0?fmt((price-c.amount)/price*100)+'%':'—'} · Markup ${valid&&c.amount>0?fmt((price-c.amount)/c.amount*100)+'%':'—'}</span>${editable?btn('Edit recipe','edit-menu',m.id):''}</footer>`}
 async function showMenuWorksheet(target,id){
  const owner=liveProfile?.id,epoch=sessionEpoch121;
  if(!owner||target.dataset.loading||target.dataset.loaded)return;
  target.dataset.loading='true';target.textContent='Loading recipe worksheet…';
  try{
   const result=await ojmDb.from('restaurant_kitchen_worksheets').select('sections').eq('menu_id',id).maybeSingle();
   if(!target.isConnected||liveProfile?.id!==owner||sessionEpoch121!==epoch)return;
   if(result.error)throw result.error;
   const groups=result.data?.sections||[];
   target.innerHTML=groups.map(g=>'<section><h4>'+esc(g.title)+'</h4>'+table(g.kind==='components'?['Combo components']:['Ingredient','Quantity per order','Portion note'],(g.rows||[]).map(r=>g.kind==='components'?[esc(r.name)]:[esc(r.name),r.quantity!=null?fmt(r.quantity)+' '+esc(r.unit):r.note?'—':'Quantity not entered',esc(r.note||'—')]))+'</section>').join('')||'<p>No recipe quantities have been recorded for this menu.</p>';
   target.dataset.loaded='true';
  }catch(err){if(target.isConnected&&liveProfile?.id===owner&&sessionEpoch121===epoch)target.textContent='Could not load the recipe worksheet. Close and reopen this recipe to retry.'}
  finally{delete target.dataset.loading}
 }
 function menuView(view){if(['menu-costing','menu-engineering108'].includes(view)&&window.menuView108)return window.menuView108(view)+(view==='menu-costing'?editCard('menu'):'');let body=header('Menu','Recipes use the separate ingredient list. Costs are calculated per serving.');
  if(view==='menu-ingredients')body+=card(state.showIngredientArchives133?'Archived ingredients':'Ingredient master list',table(['Code','Ingredient','Purchase quantity','Purchase price','Cost per unit','Currency','Action'],(state.showIngredientArchives133?state.ingredients.filter(r=>r.data.stage131==='archived'):workingRows('ingredients')).map(x=>[esc(x.data.code),`<span data-ingredient117="${esc(x.id)}">${esc(x.data.name)}</span>`,fmt(x.data.purchaseQuantity||1)+' '+esc(x.data.unit),Number(x.data.cost)>0?fmt(x.data.purchasePrice??x.data.cost):'Not configured',Number(x.data.cost)>0?fmt(x.data.cost)+' / '+esc(x.data.unit):'Not configured',esc(x.data.currency),btn('Edit','edit-ingredient',x.id)])),btn(state.showIngredientArchives133?'Current ingredients':'Archived ingredients','ingredient-archives')+btn('Add ingredient','new-ingredient'))+editCard('ingredients');
  if(view==='menu-categories')body+=card('Categories',table(['Code','Name','Description','Menu items','Action'],state.categories.map(x=>[esc(x.data.code),esc(x.data.name),esc(x.data.description),String(state.menu.filter(m=>m.data.category===x.id).length),btn('Edit','edit-category',x.id)])),btn('Add category','new-category'))+editCard('categories');
  if(view==='menu-details'||view==='menu-recipe')body+=`<section class="im-card104 im-menu-collection113"><header><h3>${state.showMenuArchives?'Archived menus':'Menus and Recipes'}</h3><div class="im-toolbar-actions">${btn('Import online menu','import-online')}${btn(state.showMenuArchives?'Current menus':'Archived menus','menu-archives')}${btn('Add menu','new-menu')}</div></header><div class="im-body104">${(state.showMenuArchives?state.menu.filter(m=>m.data.stage131==='archived'):workingRows('menu')).map(m=>{const d=m.data,c=ingredientCost(d),valid=!c.mixed&&!c.missing,price=n(d.price);return `<details class="im-menu106" data-menu117="${esc(m.id)}"><summary><strong>${esc(d.name)}</strong><span>${d.price==null?'Price not set':esc(d.currency)+' '+fmt(price)}</span><span class="recipe-cost132">${valid?'Cost '+fmt(c.amount):c.mixed?'Mixed currencies':'Recipe cost incomplete'}</span><span class="recipe-expand132">View recipe ⌄</span></summary><div class="im-menu-body106">${recipeDetails134(m,true)}</div></details>`}).join('')||'<p>No menu items yet.</p>'}</div></section>`+editCard('menu');
  if(view==='menu-pricing')body+=card('Menu pricing',table(['Code','Menu item','Selling price','Minimum price','Margin indicator','Currency','Action'],workingRows('menu').map(m=>[esc(m.data.code),`<button class="im-link117" data-jump117="recipe" data-id="${esc(m.id)}">${esc(m.data.name)}</button>`,m.data.price==null?'Not set':fmt(m.data.price),window.menuMath108&& !ingredientCost(m.data).missing&&!ingredientCost(m.data).mixed?fmt(menuMath108.minimum(ingredientCost(m.data).amount,m.data.currency)):'—',window.menuBadge108?.(m.data)||'—',esc(m.data.currency),btn('Edit','edit-menu',m.id)])),btn('Add menu item','new-menu'))+editCard('menu');
  if(view==='menu-costing')body+=card('Recipe costing',table(['Menu item','Ingredient cost','Selling price','Gross profit','Food cost %','Gross margin %','Markup %','Currency','Status'],workingRows('menu').map(m=>{const c=ingredientCost(m.data),price=n(m.data.price),valid=!c.mixed&&!c.missing&&(m.data.recipe||[]).length>0,profit=price-c.amount,pct=value=>fmt(value)+'%',status=c.missing?'Missing ingredient':c.mixed?'Mixed currencies · review rates':!valid?'No recipe':'Calculated';return[esc(m.data.name),valid?fmt(c.amount):'—',fmt(price),valid?fmt(profit):'—',valid&&price>0?pct(c.amount/price*100):'—',valid&&price>0?pct(profit/price*100):'—',valid&&c.amount>0?pct(profit/c.amount*100):'—',esc(m.data.currency),esc(status)]})));
  if(view==='menu-avail')body+=card('Menu availability',table(['Menu item','Status','Ingredient costing','Action'],workingRows('menu').map(m=>[esc(m.data.name),m.data.active===false?'Unavailable':'Available',!(m.data.recipe||[]).length?'No recipe':(m.data.recipe||[]).every(line=>ingredient(line.itemId))?'Recipe available':'Missing ingredient',btn(m.data.active===false?'Make available':'Pause','toggle-menu',m.id)])));return body}
 function render(){const active=document.querySelector('.tab-content.active');if(!active||!all.includes(active.id))return;if(active.id==='inv-allocated'&&state.loaded&&state.owner===liveProfile?.id&&window.inventoryAllocated){window.inventoryAllocated.mount(active);return}active.innerHTML=state.owner!==liveProfile?.id||!state.loaded||(active.id.startsWith('inv-')&&!state.ledgerLoaded144)?`<section class="im-card104"><header><h3>${active.id.startsWith('inv-')?'Inventory':'Menu'}</h3></header><div class="im-body104"><p>${state.busy?'Loading records…':'Records are not available yet. Use Reload to try again.'}</p>${notice()}${btn('Reload','reload')}</div></section>`:(active.id.startsWith('inv-')?inventory(active.id):menuView(active.id));active.querySelectorAll('[data-worksheet-menu]').forEach(target=>{const details=target.closest('details[data-menu117]');if(details)details.addEventListener('toggle',()=>{if(details.open)showMenuWorksheet(target,target.dataset.worksheetMenu)})});const draftSlot=active.querySelector('[data-recipe-draft]'),draft=state.editing?.form;
   active.querySelectorAll('[data-im-form]').forEach(f=>{const outer=f.closest('.im-card104'),first=active.querySelector('.im-card104');if(outer!==first)first?.querySelector(':scope>header')?.after(outer);const editor=state.editing;
   if(editor){editor.view=active.id;f.catalogEditor=editor;f.catalogRecord=state[editor.kind]?.find(r=>r.id===editor.id);if(editor.kind==='menu')editor.form=f;}
   if(!f.dataset.id)window.armNewForm108?.(f,()=>{state.editing=null;render()});if(f.dataset.imForm==='items')bindStockLinks(f,item(f.dataset.id));const type=f.elements.itemType;if(type)type.onchange=()=>{f.querySelector('.im-recipe-lines104').innerHTML=recipeRow({},type.value,f.dataset.id);f.querySelector('.recipeLabel108').textContent=type.value==='bundle'?'Products in this bundle':'Ingredients per serving';actionButtons(f.querySelector('.im-recipe-lines104'));};f.addEventListener('submit',e=>submit(e,f.dataset.imForm));f.addEventListener('input',()=>updateCosts(f));f.addEventListener('change',()=>updateCosts(f));updateCosts(f)});window.bindMenu108?.(active);actionButtons(active);
   if(draftSlot&&draft){const outer=draftSlot.closest('.im-card104'),first=active.querySelector('.im-card104');if(outer!==first)first?.querySelector(':scope>header')?.after(outer);draftSlot.replaceWith(draft);}
   const edit=active.querySelector('.im-card104:has(> .im-body104 [data-im-form])');if(edit){const overlay=document.createElement('div');overlay.className='im-edit-overlay112';overlay.setAttribute('role','presentation');edit.before(overlay);overlay.append(edit);overlay.addEventListener('click',e=>{if(e.target===overlay){state.editing=null;render()}});edit.setAttribute('role','dialog');edit.setAttribute('aria-modal','true');edit.setAttribute('aria-label',edit.querySelector('h3')?.textContent||'Edit record');requestAnimationFrame(()=>edit.querySelector('input:not([type=hidden]),select')?.focus({preventScroll:true}))}}
 function updateCosts(f){const unit=f.querySelector('.im-unit106');if(unit){const q=n(f.elements.purchaseQuantity.value),price=n(f.elements.purchasePrice.value);unit.textContent=q>0?'Cost per '+f.elements.unit.value+': '+f.elements.currency.value+' '+fmt(price/q):'Enter purchase quantity';}f.querySelectorAll('.im-recipe-row104').forEach(row=>{const id=row.querySelector('[name=ingredientId]').value,source=(f.elements.itemType?.value==='bundle'?menu(id):ingredient(id))?.data;row.querySelector('.im-line106').textContent=source?source.currency+' '+fmt((f.elements.itemType?.value==='bundle'?ingredientCost(source).amount:n(source.cost))*n(row.querySelector('[name=ingredientQuantity]').value)):'—'})}
 async function action(type,id,node){
 if(type==='reverse-move'){const r=state.moves.find(x=>x.id===id);if(!r)return;if(r.data.pos118)return showCenterStatus('Use the POS receipt refund workflow to return stock from a sale.',true);if(r.data.preparation124||r.data.waste124)return showCenterStatus('Use Preparation & Waste to correct its records; do not reverse only one stock movement.',true);if(!await ui108.confirm('Reverse stock movement','Create an opposite stock adjustment for this movement? The original remains in history.'))return;try{await save('moves',{...r.data,kind:['in','adjust-in'].includes(r.data.kind)?'adjust-out':'adjust-in',date:new Date().toISOString().slice(0,10),reverses108:r.id,reference:'Reversal of '+r.data.reference,note:'Correction of movement '+r.id},null)}catch(e){await ui108.modal('Could not reverse',`<p>${esc(e.message)}</p>`)}return}
 if(type==='menu-archives'){state.showMenuArchives=!state.showMenuArchives;return render()}
 if(type==='ingredient-archives'){state.showIngredientArchives133=!state.showIngredientArchives133;return render()}
 if(type==='delete'){return window.deleteCatalog108(id)}
 if(type==='new-ingredient'||type==='edit-ingredient'){state.editing={kind:'ingredients',id:id||null};return render()}
if(type==='menu-display'){await restaurantModules125.ensure('settings');return publicContent127.open(id)}if(type==='import-online'){if(!await ui108.confirm('Import online menu','Refresh shared menu prices, descriptions and choices from Menu Display? Private recipe quantities are retained. Stock is deducted for linked items.'))return;try{const r=await ojmDb.rpc('pos_sync_public_catalog131');if(r.error)throw r.error;await load(true);showCenterStatus('Online menu imported. Linked stock is deducted on payment.')}catch(e){showCenterStatus(e.message,true)}return}if(type==='cancel'){state.editing=null;return render()}if(type==='reload')return load(true);if(type==='go-items')return switchTab('inv-items');if(type==='go-menu')return switchTab('menu-details');if(type==='add-ingredient'){const lines=node.closest('form').querySelector('.im-recipe-lines104');lines.insertAdjacentHTML('beforeend',recipeRow({},node.closest('form').elements.itemType?.value,node.closest('form').dataset.id));return actionButtons(lines.lastElementChild)}if(type==='remove-ingredient'){node.closest('.im-recipe-row104').remove();return}if(type==='toggle-menu'){const record=menu(id);if(record.data.storefrontManaged131){await restaurantModules125.ensure('settings');return publicContent127.open(id)}try{await save('menu',{...record.data,active:record.data.active===false},record)}catch(e){state.error=e.message;render()}return}
  if(type==='new-item'||type==='edit-item')state.editing={kind:'items',id:id||null};if(type==='new-category'||type==='edit-category')state.editing={kind:'categories',id:id||null};if(type==='new-menu'||type==='edit-menu')state.editing={kind:'menu',id:id||null};if(type==='new-bundle')state.editing={kind:'menu',id:null,itemType:'bundle'};
  if(type==='new-move')state.editing={kind:'moves',id:null,moveKind:id};render();document.querySelector('.tab-content.active [data-im-form]')?.scrollIntoView({block:'nearest'});if(type==='new-move'){const active=document.querySelector('.tab-content.active'),form=active?.querySelector('[data-im-form=moves]');if(form){form.querySelector('[name=kind]').value=id;form.querySelector('[type=submit]').textContent='Save '+id}}}
 function actionButtons(form){form.querySelectorAll('[data-im-action]').forEach(b=>b.addEventListener('click',()=>action(b.dataset.imAction,b.dataset.imId,b)))}
 window.menuStore108={async editCatalog(kind,id){
  const views={items:'inv-items',ingredients:'menu-ingredients',categories:'menu-categories',menu:'menu-recipe'};
  if(!views[kind]||!catalogCan121(kind,'edit')||!restaurantRouteAllowed128(views[kind]))return;
  const owner=liveProfile.id,epoch=sessionEpoch121;
  await switchTab(views[kind]);await load();
  if(epoch!==sessionEpoch121||owner!==liveProfile?.id||!state[kind].some(entry=>entry.id===id))return;
  state.editing={kind,id};render();
 },clearEditors:()=>editors.clear(),recipeDetails134,state,workingRows,save,load,cancelLoad,render,stock,unitCost:cost,cost:ingredientCost,table,card,btn,esc,fmt,tables,edit:id=>{state.editing={kind:'menu',id};render()}};
 const oldSwitch=switchTab;switchTab=function(id,...args){const result=oldSwitch(id,...args);if(result!==false&&all.includes(id)){render();load()}return result};
 const ready=()=>{if(rendered()){render();load()}};if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',ready,{once:true});else ready();
})();
