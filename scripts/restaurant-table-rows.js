/* Shared row selection for the signed-in restaurant workspace and its dialogs. */
window.restaurantTableRows=(()=>{
 const controls='button,a[href],input,select,textarea,label,[contenteditable="true"]';
 const scopes='[role=dialog],dialog,.restaurant-dialog,.restaurant-modal,.im-edit-overlay112,.tab-content,#restaurantApp,body';
 const selectedClass='restaurant-row-selected';
 let selection=null,lastTap=null,openDialog=null;
 function rowKey(row){
  const identity=row.getAttributeNames().filter(k=>k.startsWith('data-')).map(k=>[k,row.getAttribute(k)]);
  if(!identity.length){
   const record=row.querySelector('[data-im-id],[data-row-id],[data-id],[data-id118]');
   if(record)identity.push(['record',record.dataset.imId||record.dataset.rowId||record.dataset.id||record.dataset.id118]);
  }
  const cells=[...row.cells].map(cell=>cell.textContent.trim());
  return JSON.stringify([row.parentElement.tagName,identity.length?identity:cells]);
 }
 function context(row){
  const table=row.closest('table'),scope=table?.closest(scopes);
  if(!scope||!liveProfile||!row.cells.length)return null;
  const tables=[...scope.querySelectorAll('table')],key=rowKey(row);
  return {scope,table,tableIndex:tables.indexOf(table),row,key,epoch:sessionEpoch121,owner:liveProfile.id};
 }
 function resolve(s){
  if(!s||s.epoch!==sessionEpoch121||s.owner!==liveProfile?.id||!s.scope.isConnected)return null;
  if(s.row.isConnected&&rowKey(s.row)===s.key)return s.row;
  const table=s.scope.querySelectorAll('table')[s.tableIndex];
  if(!table)return null;
  const matches=[...table.rows].filter(row=>rowKey(row)===s.key);
  return matches.length===1?matches[0]:null;
 }
 function highlight(s){
  if(selection?.row!==s.row)selection?.row.classList.remove(selectedClass);
  selection=s;s.row.classList.add(selectedClass);
 }
 function restore(){
  if(!selection)return;
  if(selection.epoch!==sessionEpoch121||selection.owner!==liveProfile?.id){reset();return}
  if(selection.row.isConnected)return;
  const row=resolve(selection);
  if(row){selection.row=row;row.classList.add(selectedClass)}
  else selection=null;
 }
 function reset(){selection?.row.classList.remove(selectedClass);selection=null;lastTap=null;openDialog?.close()}
 function available(button){
  return !button.disabled&&!button.closest('[hidden],[inert]')&&button.getClientRects().length&&actionPermission121(button);
 }
 function sources(row){
  const own=[...row.querySelectorAll('button,a[href]')].filter(b=>b.closest('tr')===row);
  const order=row.dataset.order118;
  if(order&&window.pos118?.state.selected===order){
   const panel=row.closest('.pos-grid118')?.querySelector(':scope>section:last-child');
   if(panel)own.push(...panel.querySelectorAll('[data-pos118]'));
  }
  return own.filter(available);
 }
 function open(s){
  if(openDialog?.open)return;
  const row=resolve(s);if(!row)return;
  const d=document.createElement('dialog');d.className='restaurant-row-dialog';
  d.setAttribute('aria-label','Row details and actions');
  d.innerHTML='<header><h3>Row details</h3><button type="button" aria-label="Close row details">×</button></header><dl></dl><footer></footer>';
  const headings=[...(row.closest('table').tHead?.rows[0]?.cells||[])];
  const body=d.querySelector('dl'),footer=d.querySelector('footer');
  for(const [i,cell] of [...row.cells].entries()){
   const copy=cell.cloneNode(true);
   copy.querySelectorAll('button,input,select,textarea,table,[hidden]').forEach(el=>el.remove());
   const value=copy.textContent.trim()||[...cell.querySelectorAll('select,input:not([type=password]):not([type=hidden]),textarea')].filter(el=>!el.closest('[hidden]')).map(el=>el.selectedOptions?.[0]?.textContent??(el.type==='checkbox'?(el.checked?'Yes':'No'):el.value)).join(', ');
   if(!value)continue;
   const term=document.createElement('dt'),detail=document.createElement('dd');
   term.textContent=headings[i]?.textContent.trim()||'Column '+(i+1);detail.textContent=value;body.append(term,detail);
  }
  function choice(label,action){
   const button=document.createElement('button');button.type='button';button.textContent=label;
   button.onclick=async()=>{
    const current=resolve(s);
    if(!current){d.close();showCenterStatus('The row changed. Select it again.',true);return}
    d.close();
    try{await action(current)}catch(error){showCenterStatus(error.message,true)}
   };
   footer.append(button);
  }
  const buttons=sources(row);
  const label=b=>b.getAttribute('aria-label')||b.title||b.textContent.trim();
  for(const button of buttons){
   const text=label(button);if(!text)continue;
   const fingerprint=b=>JSON.stringify([b.tagName,label(b),{...b.dataset},b.getAttribute('href')]);
   const fingerprintAtOpen=fingerprint(button);
   choice(text,current=>{
    const match=sources(current).find(b=>fingerprint(b)===fingerprintAtOpen);
    if(!match)throw Error('This action is no longer available.');
    match.click();
   });
  }
  const edit=row.querySelector('[data-im-action^="edit-"]');
  const tagged=row.querySelector('[data-row-kind][data-row-id]');
  const menuRecord=row.querySelector('[data-m108="promotion"],[data-im-action="toggle-menu"]');
  const kind=tagged?.dataset.rowKind||({'edit-item':'items','edit-ingredient':'ingredients','edit-category':'categories','edit-menu':'menu'})[edit?.dataset.imAction]||(menuRecord?'menu':null);
  const id=tagged?.dataset.rowId||edit?.dataset.imId||menuRecord?.dataset.id||menuRecord?.dataset.imId;
  if(kind&&id){
   if(!edit&&catalogCan121(kind,'edit'))choice('Edit',()=>window.menuStore108.editCatalog(kind,id));
   if(catalogCan121(kind,'delete')&&!buttons.some(b=>b.dataset.imAction==='delete')){
    choice('Delete',async()=>{
     await restaurantModules125.ensure('menu');
     if(s.epoch===sessionEpoch121&&s.owner===liveProfile?.id&&catalogCan121(kind,'delete'))await window.deleteCatalog108(kind+'|'+id);
    });
   }
  }
  d.querySelector('header button').onclick=()=>d.close();
  d.onclick=e=>{if(e.target===d){const b=d.getBoundingClientRect();if(e.clientX<b.left||e.clientX>b.right||e.clientY<b.top||e.clientY>b.bottom)d.close()}};
  d.onclose=()=>{d.remove();if(openDialog===d)openDialog=null};
  document.body.append(d);openDialog=d;d.showModal();
 }
 function target(event){
  const row=event.target.closest?.('tr');
  return row&&context(row);
 }
 document.addEventListener('click',e=>{
  const s=target(e);if(!s)return;
  highlight(s);
  if(e.target.closest(controls)){lastTap=null;return}
  const now=performance.now();
  const twice=lastTap&&lastTap.scope===s.scope&&lastTap.tableIndex===s.tableIndex&&lastTap.key===s.key&&now-lastTap.at<475&&Math.hypot(e.clientX-lastTap.x,e.clientY-lastTap.y)<18;
  lastTap={...s,at:now,x:e.clientX,y:e.clientY};
  if(twice){lastTap=null;e.preventDefault();e.stopPropagation();open(s)}
 },true);
 document.addEventListener('dblclick',e=>{
  if(e.target.closest?.(controls))return;
  const s=target(e);if(s){e.preventDefault();e.stopPropagation();highlight(s);open(s)}
 },true);
 return {restore,reset};
})();
