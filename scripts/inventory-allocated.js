/* Menu-first maintenance of saved POS stock allocations. */
window.inventoryAllocated = (() => {
 const {esc,fmt}=window.menuStore108;
 let query='', filter='all', lastOwner;
 const act=(label,action,attrs='')=>'<button type="button" data-allocation="'+action+'" '+attrs+'>'+label+'</button>';
 const lower=v=>String(v||'').toLocaleLowerCase();
 function recipeRows(menu,menus,ingredients){
  const rows=[];
  function collect(parts,factor,scope){
   for(const part of parts||[]){
    const ing=ingredients.get(part.itemId)?.data;
    if(ing?.active!==false&&ing?.inventoryItemId118)rows.push({id:ing.inventoryItemId118,name:ing.name,scope,quantity:Number(part.quantity)*Number(ing.inventoryFactor118??1)*factor});
   }
  }
  function visit(m,factor,seen){
   if(!m||seen.has(m.id))return;
   if(m.data.itemType==='bundle'){
    for(const part of m.data.recipe||[])visit(menus.get(part.itemId),factor*Number(part.quantity),new Set([...seen,m.id]));
   }else collect(m.data.recipe,factor,'Base recipe');
  }
  visit(menu,1,new Set());
  for(const g of menu.data.posOptions118||[])for(const opt of g.options||[])collect(opt.recipe,1,g.name+' · '+opt.name);
  return rows;
 }
 function mount(root){
  const store=window.menuStore108,s=store.state;
  if(lastOwner!==s.owner){lastOwner=s.owner;query='';filter='all'}
  const menus=new Map(s.menu.map(m=>[m.id,m])), ingredients=new Map(s.ingredients.map(r=>[r.id,r]));
  const stock=s.items.slice().sort((a,b)=>String(a.data.name).localeCompare(b.data.name));
  const stockById=new Map(stock.map(i=>[i.id,i]));
  const edit=catalogCan121('items','edit');
  root.innerHTML='<section class="ops-panel"><header><h2>Allocated</h2><button type="button" data-reload>Refresh</button></header><div class="ops-controls"><label>Search menu or stock<input type="search" data-search placeholder="Menu or stock name"></label><label>Show<select data-filter><option value="all">All menus</option><option value="linked">With allocations</option><option value="empty">Without allocations</option><option value="archived">Archived menus</option></select></label></div><p role="status"></p><div class="ops-scroll"><table><thead><tr><th>Menu</th><th>Allocated stock &amp; quantity per menu unit</th><th>Actions</th></tr></thead><tbody></tbody></table></div></section>';
  const search=root.querySelector('[data-search]'),select=root.querySelector('[data-filter]'),body=root.querySelector('tbody'),status=root.querySelector('[role=status]');
  search.value=query;select.value=filter;
  const entries=[...menus.values()].sort((a,b)=>String(a.data.name).localeCompare(b.data.name)).map(m=>{
   const derived=recipeRows(m,menus,ingredients),links=new Map();
   for(const r of derived)if(stockById.has(r.id)&&stockById.get(r.id).data.active!==false){if(!links.has(r.id))links.set(r.id,[]);links.get(r.id).push(r)}
   const rules=stock.flatMap(i=>(i.data.posMenuUse||[]).flatMap((r,index)=>r.menuId===m.id?[{i,r,index}]:[]));
   return {m,links,rules};
  });
  function paint(){
   let count=0;
   body.innerHTML=entries.map(({m,links,rules})=>{
    if((m.data.stage131==='archived')!==(filter==='archived'))return '';
    const named=new Set([...links.keys(),...rules.map(v=>v.i.id)]);
    const linked=rules.some(x=>x.i.data.active!==false)||[...links.keys()].some(id=>!stockById.get(id).data.posMenuExclude?.includes(m.id));
    if((filter==='linked'&&!linked)||(filter==='empty'&&linked)||![m.data.name,...[...named].map(id=>stockById.get(id).data.name)].some(v=>lower(v).includes(lower(query).trim())))return '';
    count++;
    const lines=[];
    for(const {i,r,index} of rules){
     const option=m.data.posOptions118?.find(g=>g.id===r.groupId)?.options.find(o=>o.id===r.optionId);
     const both=(r.stockMode|| (r.kind==='ingredient'?'all':'online'))==='all';
     lines.push('<div class="alloc-line"><div><strong>'+esc(i.data.name)+'</strong> · '+fmt(r.quantity)+' '+esc(i.data.unit||'units')+'<small>'+esc([r.kind,option?.name,both?'Automatic online and dine-in':'Automatic online · optional dine-in',i.data.active===false?'Inactive stock':''].filter(Boolean).join(' · '))+'</small></div>'+(edit?'<span>'+act('Edit','edit','data-stock="'+esc(i.id)+'" data-index="'+index+'"')+' '+act('Unlink','remove','data-stock="'+esc(i.id)+'" data-index="'+index+'"')+'</span>':'')+'</div>');
    }
    for(const [id,parts] of links){
     const i=stockById.get(id),off=i.data.posMenuExclude?.includes(m.id);
     const override=rules.some(v=>v.i.id===id&&['ingredient','supply'].includes(v.r.kind));
     lines.push('<div class="alloc-line"><div><strong>'+esc(i.data.name)+'</strong><small>'+esc(parts.map(r=>r.scope+' · '+r.name+' × '+fmt(r.quantity)+' '+(i.data.unit||'units')).join(' / '))+'</small>'+(off?'<small>Recipe link turned off for this menu</small>':override?'<small>Explicit ingredient or supply quantities take priority when applicable</small>':'')+'</div>'+(edit?act(off?'Link':'Unlink',off?'restore':'exclude','data-stock="'+esc(id)+'"'):'')+'</div>');
    }
    return '<tr data-menu="'+esc(m.id)+'"><td><strong>'+esc(m.data.name)+'</strong></td><td>'+ (lines.join('')||'No stock linked')+'</td><td>'+(edit?act('Add stock','add'):'—')+'</td></tr>';
   }).join('')||'<tr><td colspan="3">No matching menus.</td></tr>';
   status.textContent=count+' menu'+(count===1?'':'s');
  }
  search.oninput=()=>{query=search.value;paint()};select.onchange=()=>{filter=select.value;paint()};
  root.querySelector('[data-reload]').onclick=()=>store.load(true);
  function addForm(tr,m,existing,index){
   root.querySelector('[data-allocation-form]')?.remove();
   const form=document.createElement('form');form.dataset.allocationForm='';form.className='ops-controls alloc-form';
   const stocks=existing?[existing]:stock.filter(i=>i.data.active!==false&&i.data.stage131!=='archived');
   const choices=(m.data.posOptions118||[]).flatMap(g=>(g.options||[]).filter(o=>o.available!==false).map(o=>({g,o})));
   form.innerHTML='<label>Stock item<select name="stock" required><option value="">Select stock</option>'+stocks.map(i=>'<option value="'+esc(i.id)+'">'+esc(i.data.name+' · '+(i.data.unit||'units'))+'</option>').join('')+'</select></label><label>Quantity per menu unit<input name="qty" type="number" min="0" step="any" required value="1"></label><label>Link type<select name="kind"><option value="packaging">Packaging</option><option value="ingredient">Ingredient</option><option value="supply">Supply</option></select></label><label>Use stock<select name="mode"><option value="online">Online automatically · optional dine-in</option><option value="all">Online and dine-in automatically</option></select></label>'+(choices.length?'<label>Menu choice<select name="choice"><option value="">Every order</option>'+choices.map(({g,o},j)=>'<option value="'+j+'">'+esc(g.name+' · '+o.name)+'</option>').join('')+'</select></label>':'')+'<button type="submit">Save link</button>'+act('Cancel','cancel')+'<span role="alert"></span>';
   tr.cells[1].append(form);
   if(existing){
    const r=existing.data.posMenuUse[index],f=form.elements;f.stock.value=existing.id;f.stock.disabled=true;
    f.qty.value=r.quantity;f.kind.value=r.kind;f.mode.value=r.stockMode||(r.kind==='ingredient'?'all':'online');
    if(r.optionId&&f.choice){const j=choices.findIndex(({g,o})=>g.id===r.groupId&&o.id===r.optionId);if(j<0){const opt=document.createElement('option');opt.textContent='Original menu choice (unavailable)';opt.value='original';f.choice.append(opt);f.choice.value='original'}else f.choice.value=String(j)}
    f.qty.focus();
   }else form.elements.stock.focus();
   form.elements.kind.onchange=()=>{form.elements.mode.value=form.elements.kind.value==='ingredient'?'all':'online'};
   form.onsubmit=async e=>{
    e.preventDefault();const f=form.elements,i=stockById.get(f.stock.value),qty=Number(f.qty.value),out=form.querySelector('[role=alert]'),b=form.querySelector('[type=submit]');
    if(!i||!Number.isFinite(qty)||qty<=0){out.textContent='Choose stock and enter a quantity greater than zero.';return}
    const prior=existing?.data.posMenuUse[index]||{}, {groupId,optionId,...base}=prior;
    const choice=f.choice?.value?choices[Number(f.choice.value)]:null,rule={...base,menuId:m.id,kind:f.kind.value,quantity:qty,stockMode:f.mode.value,...(choice?{groupId:choice.g.id,optionId:choice.o.id}:f.choice?.value==='original'?{groupId,optionId}:{})};
    const rules=i.data.posMenuUse||[];
    if(rules.some((r,j)=>j!==index&&r.menuId===m.id&&r.kind===rule.kind&&(r.optionId||'')===(rule.optionId||'')&&(r.groupId||'')===(rule.groupId||''))){out.textContent='This stock already has that link type and menu choice.';return}
    b.disabled=true;try{await store.save('items',{...i.data,posMenuUse:existing?rules.map((r,j)=>j===index?rule:r):[...rules,rule]},i)}catch(err){out.textContent=err.message;b.disabled=false}
   };
  }
  body.onclick=async e=>{
   const b=e.target.closest('[data-allocation]');if(!b||!edit)return;
   const a=b.dataset.allocation,tr=b.closest('tr'),m=menus.get(tr.dataset.menu);
   if(a==='add')return addForm(tr,m);
   if(a==='edit')return addForm(tr,m,stockById.get(b.dataset.stock),Number(b.dataset.index));
   if(a==='cancel')return b.closest('form').remove();
   const i=stockById.get(b.dataset.stock),data={...i.data};
   if(a==='remove')data.posMenuUse=(data.posMenuUse||[]).filter((_,j)=>j!==Number(b.dataset.index));
   else{const ids=new Set(data.posMenuExclude||[]);if(a==='exclude')ids.add(m.id);else ids.delete(m.id);data.posMenuExclude=[...ids]}
   b.disabled=true;try{await store.save('items',data,i)}catch(err){status.textContent=err.message;b.disabled=false}
  };
  paint();
 }
 return {mount,recipeRows};
})();
