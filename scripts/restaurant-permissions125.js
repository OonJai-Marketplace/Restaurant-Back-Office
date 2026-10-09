/* Tab grants complement the existing module/action grants. Missing tabs preserve
   legacy access; once a module has a tabs map, only checked tabs are allowed. */
window.restaurantTabs125={
 inventory:{'inv-overview':'Overview','inv-items':'Master List','inv-stock-in':'Stock In','inv-stock-out':'Stock Out','inv-adj':'Adjustments','inv-val':'Valuation','inv-preparation124':'Preparation & Costs','inv-waste124':'Wastage'},
 menu:{'menu-ingredients':'Ingredients','menu-recipe':'Menus & Recipes','menu-pricing':'Pricing','menu-categories':'Categories','menu-costing':'Costing & Promotions','menu-engineering108':'Menu Engineering','menu-avail':'Availability'},
 pos:{'pos-overview':'Overview & Shift','pos-sales-new':'Sales · New Order','pos-sales-open':'Sales · Open Orders','pos-sales-receipts':'Sales · Receipts','pos-sales-online':'Sales · Online Orders','pos-management':'Management'},
 settings:{appearance:'Banners & Quotations',branding:'Logo & Theme',security:'Password & Recovery'}
};
permissionOptions121.inventory.prepare='Record cooking batches';
function restaurantTabCan125(scope,tab,action='view'){
 if(!restaurantCan(scope,action))return false;
 if(isAdmin121())return true;
 const tabs=restaurantMember?.permissions?.[scope]?.tabs;
 return !tabs||tabs[tab]===true;
}
window.restaurantTabCan125=restaurantTabCan125;
window.restaurantTabId125=(id)=>id==='menu-details'?'menu-recipe':id;
window.restaurantPosTab125=(tab,sub)=>tab==='Overview'?'pos-overview':tab==='Management'?'pos-management':({'New Order':'pos-sales-new','Open Orders':'pos-sales-open','Receipts':'pos-sales-receipts','Online Orders':'pos-sales-online'}[sub]||'pos-sales-new');
window.restaurantFirstTab125=scope=>Object.keys(restaurantTabs125[scope]||{}).find(id=>restaurantTabCan125(scope,id));
window.restaurantStart125=()=>{
 if(isAdmin121())return 'restaurant-overview';
 if(restaurantFirstTab125('pos'))return 'pos118';
 return restaurantFirstTab125('inventory')||restaurantFirstTab125('menu')||(restaurantFirstTab125('settings')?'restaurant-settings':'restaurant-overview');
};
const oldPermissionForm125=permissionForm121;
permissionForm121=function(p={}){
 let html=oldPermissionForm125(p);
 for(const [scope,tabs] of Object.entries(restaurantTabs125)){
  const controls='<details class="permission-tabs125" '+(p[scope]?.view?'open':'')+'><summary>Allowed tabs</summary>'+Object.entries(tabs).map(([id,label])=>`<label class="check121"><input type="checkbox" name="${scope}.tabs.${id}" ${p[scope]?.tabs?p[scope].tabs[id]===true?'checked':'':p[scope]?.view?'checked':''}>${escapeHtml(label)}</label>`).join('')+'</details>';
  const marker=`<fieldset><legend>${scope==='pos'?'Point of Sale & Online Orders':scope[0].toUpperCase()+scope.slice(1)}</legend>`;
  const start=html.indexOf(marker),end=html.indexOf('</fieldset>',start);
  if(start>=0&&end>=0)html=html.slice(0,end)+controls+html.slice(end);
 }
 return html;
};
window.restaurantCollectPermissions125=(form)=>Object.fromEntries(Object.entries(permissionOptions121).map(([scope,actions])=>[scope,{
 ...Object.fromEntries(Object.keys(actions).map(action=>[action,form.elements[scope+'.'+action]?.checked===true])),
 tabs:Object.fromEntries(Object.keys(restaurantTabs125[scope]||{}).map(tab=>[tab,form.elements[scope+'.view']?.checked===true&&form.elements[scope+'.tabs.'+tab]?.checked===true]))
}]));
window.restaurantBindPresets125=(form)=>{
 const label=document.createElement('label');label.className='wide121';label.textContent='Start with a role';
 const select=document.createElement('select');select.innerHTML='<option value="">Custom access</option><option value="cashier">Cashier</option><option value="head">Head cook</option><option value="assistant">Assistant cook</option><option value="waste">Waste recorder</option>';label.append(select);form.querySelector('.permission-grid121').before(label);
 const presets={
  cashier:{pos:{actions:['view','sell'],tabs:['pos-overview','pos-sales-new','pos-sales-open','pos-sales-receipts','pos-sales-online']},settings:{actions:['view'],tabs:['security']}},
  head:{inventory:{actions:['view','prepare','stock_in','stock_out'],tabs:['inv-overview','inv-items','inv-stock-in','inv-preparation124','inv-waste124']},menu:{actions:['view'],tabs:['menu-ingredients','menu-recipe']},settings:{actions:['view'],tabs:['security']}},
  assistant:{inventory:{actions:['view','stock_out'],tabs:['inv-items','inv-waste124']},menu:{actions:['view'],tabs:['menu-recipe']},settings:{actions:['view'],tabs:['security']}},
  waste:{inventory:{actions:['view','stock_out'],tabs:['inv-waste124']},settings:{actions:['view'],tabs:['security']}}
 };
 select.onchange=()=>{const preset=presets[select.value];if(!preset)return;form.querySelectorAll('.permission-grid121 input').forEach(input=>{const [scope,key,tab]=input.name.split('.');input.checked=key==='tabs'?!!preset[scope]?.tabs.includes(tab):!!preset[scope]?.actions.includes(key)});form.querySelectorAll('fieldset').forEach(field=>{const scope=field.querySelector('input')?.name.split('.')[0];const details=field.querySelector('details');if(details)details.open=form.elements[scope+'.view']?.checked===true})};
};

const catalogPermissionBase125=catalogCan121;
catalogCan121=function(kind,action='edit',data={}){
 if(!catalogPermissionBase125(kind,action,data))return false;if(isAdmin121())return true;
 if(kind==='moves'){const a=data.kind==='in'?'stock_in':data.kind==='out'?'stock_out':'adjust';return restaurantTabCan125('inventory',a==='stock_in'?'inv-stock-in':a==='stock_out'?'inv-stock-out':'inv-adj',a)}
 if(kind==='items')return restaurantTabCan125('inventory','inv-items',action);
 const tab={ingredients:'menu-ingredients',categories:'menu-categories',menu:'menu-recipe',sales:'menu-engineering108'}[kind];return !tab||restaurantTabCan125('menu',tab,kind==='sales'&&action==='edit'?'sales':action);
};window.catalogCan121=catalogCan121;
