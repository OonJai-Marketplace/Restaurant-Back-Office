const assert=require('node:assert/strict');
const fs=require('node:fs');
const {JSDOM}=require('jsdom');
const read=name=>fs.readFileSync('scripts/'+name+'.js','utf8');
async function run(){
 const dom=new JSDOM('<body><div id="pos118"></div></body>',{url:'https://restaurant.test/pos/',runScripts:'outside-only'}),w=dom.window;
 try{
  w.HTMLElement.prototype.scrollIntoView=function(){};
  w.HTMLDialogElement.prototype.showModal=function(){this.setAttribute('open','')};
  w.HTMLDialogElement.prototype.close=function(){this.removeAttribute('open');this.dispatchEvent(new w.Event('close'))};
  const toast=read('restaurant-backoffice').split('function showCenterStatus(')[1].split('window.status118=')[0];
  w.eval('window.showCenterStatus=function showCenterStatus('+toast);
  Object.assign(w,{liveProfile:{id:'cashier',role:'staff'},sessionEpoch121:1,restaurantCan:()=>true,isAdmin121:()=>true,shell113:{esc:s=>String(s??'')},switchTab(){},logoutDemoUser(){},structuredClone,confirm:()=>true});
  let pending,posted,count=0;const settings={discountLimit:10,methods:['Cash'],discountPresets:[{id:'p',name:'Staff',type:'percent',value:50}],tables:[]};
  w.ojmDb={from:()=>({select(){return this},eq(){return this},single:async()=>({data:{data:settings,version:4}})}),rpc:(name,args)=>({abortSignal(){count++;posted=args;return new Promise(resolve=>pending=resolve)}})};
  w.eval(read('pos-setup154'));await w.PosSetup154.open();
  const d=w.document.querySelector('dialog'),q=s=>d.querySelector(s);assert(d.open);assert.doesNotMatch(d.textContent,/cashier discount limit/i);
  q('[data-add]').click();let f=q('form');f.elements.name.value='Family';f.elements.type.value='amount';f.elements.value.value='7000';f.dispatchEvent(new w.Event('submit',{cancelable:true}));
  const save=q('[data-save]'),tick=()=>new Promise(r=>setImmediate(r));
  save.click();assert(save.disabled);assert.equal(save.textContent,'Saving…');assert.equal(count,1);pending({error:{message:'Network unavailable'}});await tick();
  assert(d.open);assert(!save.disabled);assert.match(w.document.querySelector('#restaurantToast').textContent,/Could not save/);
  save.click();pending({data:{version:5}});await tick();
  assert.equal(posted.p_data.discountPresets[1].name,'Family');assert.equal(w.document.querySelector('dialog'),null);assert.equal(w.document.getElementById('restaurantToast').textContent,'POS settings saved.');
  const host=w.document.querySelector('#pos118');let src=read('pos-v118');
  src=src.slice(0,src.lastIndexOf('})();'))+'window.fixture={S,get order(){return draft},orderPanel,bindDiscount,wireSwipe,updateDraftPanel,configureItem,pick};})();';w.eval(src);w.pos118.fresh();
  const api=w.fixture,order=api.order,S=api.S;
  S.config=settings;S.menu=[{id:'soup',data:{name:'Miso seaweeds'}}];order.data.lines=[{name:'Miso seaweeds',menuId:'soup',quantity:2,unitPrice:10000}];
  host.innerHTML=api.orderPanel(order,true);api.bindDiscount(host,order);api.wireSwipe(host);
  const picker=host.querySelector('[data-discount-choice]'),input=host.querySelector('[data-discount-value]'),amount=value=>{input.value=value;input.dispatchEvent(new w.Event('input',{bubbles:true}))},choose=value=>{picker.value=value;picker.dispatchEvent(new w.Event('change',{bubbles:true}))};
  choose('preset:p');assert.equal(order.data.discount,50);assert(input.closest('label').hidden);assert.match(host.querySelector('.pos-totals118 .total').textContent,/10,000/);
  choose('amount');assert(!input.closest('label').hidden);amount('15,000');assert.equal(order.data.discount,15000);assert.match(host.querySelector('.pos-totals118 .total').textContent,/5,000/);
  amount('21000');assert(!input.validity.valid);amount('20000');assert(input.validity.valid);
  choose('percent');amount('100');assert(input.validity.valid);amount('101');assert(!input.validity.valid);choose('none');assert.equal(order.data.discount,0);assert(!host.querySelector('dialog'));
  const row=host.querySelector('.pos-swipe-row'),del=row.querySelector('[data-pos118=remove]');
  assert.equal(row.querySelector('.pos-line-name118 strong').textContent,'Miso seaweeds');assert(row.querySelector('.pos-line-name118 .pos-amount118'));assert.equal(row.querySelectorAll('.pos-line-values [data-pos118=qty]').length,2);
  const pointer=(kind,x)=>{const ev=new w.Event(kind,{bubbles:true});Object.assign(ev,{pointerId:1,clientX:x,clientY:20});row.dispatchEvent(ev)};
  pointer('pointerdown',120);pointer('pointerup',55);assert(row.classList.contains('revealed'));assert(!del.hidden);assert.equal(del.closest('.pos-line-values'),row.querySelector('.pos-qty118').parentNode);
  row.dispatchEvent(new w.KeyboardEvent('keydown',{key:'Escape',bubbles:true}));assert(del.hidden);
  w.escapeHtml=s=>String(s);w.posMoney={bind(){}};w.CSS={escape:value=>value};
  w.eval(read('restaurant-backoffice').split('\n').find(line=>line.startsWith('window.ui108=')));
  const groups=[['sauces','Sauces','tahini'],['veggies','Vegetables','carrots'],['grains154','Grains','quinoa']].map(([id,name,value])=>({id,name,min:0,max:1,options:[{id:value,name:value,price:0}]}));
  S.menu.push({id:'bowl',data:{name:'Veggie Pack',currency:'LAK',price:110000,storefrontManaged131:true,posCustom118:true,posOptions118:groups}});
  host.innerHTML='<div class="register-panes">'+api.orderPanel(order,true)+'</div>';
  api.pick('bowl',false);api.configureItem();
  const modal=w.document.querySelector('.pos-builder157'),header=modal.querySelector(':scope>header');
  assert.equal(header.lastElementChild.textContent,'Add to Order');assert(!modal.querySelector('.pos-builder-scroll [data-pos118=add]'));
  const selectIngredient=(group,value)=>{
   modal.querySelector('[data-builder-group="'+group+'"]').click();assert.equal(modal.querySelectorAll('fieldset').length,1);
   const input=modal.querySelector('[data-choice118="'+group+'"][value="'+value+'"]');assert.equal(input.closest('label').firstElementChild,input);input.click();
  };
  selectIngredient('sauces','tahini');selectIngredient('veggies','carrots');selectIngredient('grains154','quinoa');
  modal.querySelector('[data-builder-group=sauces]').click();assert(modal.querySelector('[value=tahini]').checked);
  header.lastElementChild.click();assert(!modal.isConnected);assert.deepEqual(Array.from(order.data.lines[1].choices.grains154),['quinoa']);
  const replaced=host.querySelector('[data-discount-choice]');replaced.value='preset:p';replaced.dispatchEvent(new w.Event('change'));assert.equal(order.data.discount,50);
  console.log('PASS top-right action, switching ingredient groups, grain on saved order, and working discount after adding an item');
  console.log('PASS save failure/retry/close and notification, inline discounts and totals, cashier at 100%, aligned row and swipe deletion');
 }finally{dom.window.close()}
}
run().catch(e=>{console.error(e);process.exitCode=1});
