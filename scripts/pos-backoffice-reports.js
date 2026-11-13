/* Interactive reports use the same recorded transactions and line allocations as exports. */
(() => {
 'use strict';
 const route='restaurant-pos-reports', root=()=>document.getElementById(route);
 const esc=value=>escapeHtml(String(value??'')), amount=v=>new Intl.NumberFormat('en-US',{maximumFractionDigits:2}).format(v/100);
 const cents=v=>Math.round(Number(v)*100), num=v=>new Intl.NumberFormat('en-US',{maximumFractionDigits:3}).format(v);
 const empty=()=>({gross:0,discount:0,refund:0,net:0,tip:0,qty:0,sales:0,returns:0});
 const totals=(a,b)=>{for(const k of Object.keys(empty()))a[k]+=b[k];return a};
 const add=(map,key,v)=>map.set(key,totals(map.get(key)||empty(),v));
 const itemKey=line=>String(line[4]||line[5]||'Unknown item');
 function measure(gross,net,qty,refund,tip=0){
  return {gross:refund?0:gross,discount:refund?0:gross-net,refund:refund?-net:0,net,tip,qty,sales:refund?0:1,returns:refund?1:0};
 }
 function prepare(events){
  return events.map(event=>{
   const {order,refund,at}=event,d=order.data, receipt=posReports.salesReport([event],false)[1];
   return {order,refund,at,day:posReports.day(at),shift:String((refund?d.refundShiftId:d.shiftId)||'unassigned'),payment:d.payment||'Unspecified',service:d.service||'Unspecified',lines:posReports.salesReport([event],true).slice(1),value:measure(cents(receipt[6]),cents(receipt[8]),receipt[5],refund,(refund?-1:1)*cents(d.tip||0))};
  });
 }
 function summarize(events,f){
  const items=new Map(),days=new Map(),shifts=new Map(),receipts=[],summary=empty();
  for(const e of events){
   if((f.shift&&e.shift!==f.shift)||(f.payment&&e.payment!==f.payment)||(f.service&&e.service!==f.service))continue;
   const lines=f.item?e.lines.filter(l=>itemKey(l)===f.item):e.lines;
   if(f.item&&!lines.length)continue;
   const lineSum=empty(),seen=new Set();
   for(const l of lines){
    const k=itemKey(l),v=measure(cents(l[10]),cents(l[12]),l[8],e.refund);
    totals(lineSum,v);
    if(seen.has(k)){v.sales=0;v.returns=0}seen.add(k);add(items,k,v);
   }
   const value=f.item?{...lineSum,sales:+!e.refund,returns:+e.refund}:e.value;
   totals(summary,value);add(days,e.day,value);add(shifts,e.shift,value);receipts.push({e,value,lines});
  }
  return {summary,items,days,shifts,receipts};
 }
 const fresh=()=>({dates:posReports.defaults(),view:'summary',metric:'net',service:'',payment:'',item:'',shift:'',find:'',page:0,events:[],shifts:new Map(),items:new Map(),loading:false,error:''});
 let state=fresh(),generation=0,owner=null,epoch=null;
 const active=()=>root()?.classList.contains('active')&&restaurantRouteAllowed128(route);
 const shiftName=id=>{const s=state.shifts.get(id);if(!s)return id==='unassigned'?'Unassigned shift':'Shift '+id;return [posReports.stamp(s.opened_at).slice(0,16),s.profile?.full_name||state.events.find(e=>!e.refund&&e.shift===id)?.order.data.cashier||'Name unavailable'].join(' · ')};
 const option=(value,name,selected)=>'<option value="'+esc(value)+'"'+(value===selected?' selected':'')+'>'+esc(name)+'</option>';
 const select=(label,key,choices,current)=>'<label>'+label+'<select aria-label="'+esc(label)+'" data-key="'+key+'">'+choices.map(([v,name])=>option(v,name,current)).join('')+'</select></label>';
 const btn=(label,key,value='',extra='')=>'<button type="button" data-op="'+key+'" data-value="'+esc(value)+'" '+extra+'>'+esc(label)+'</button>';
 async function load(){
  const g=++generation,id=liveProfile.id,session=sessionEpoch121;
  const check=()=>{if(g!==generation||liveProfile?.id!==id||session!==sessionEpoch121||!active())throw Error('Report changed')};
  state.loading=true;state.error='';state.events=[];state.shifts=new Map();state.items=new Map();state.page=0;render();
  try{
   const range=posReports.range(state.dates),cols='id,cashier,opened_at,closed_at,opening,expected,counted,profile:profiles(full_name)';
   const [events,shifts]=await Promise.all([posReports.transactions({sample:false},range,check),posReports.pages(()=>ojmDb.from('pos_shifts118').select(cols).gte('opened_at',range.start).lt('opened_at',range.end),check)]);
   check();const rows=prepare(events),map=new Map(shifts.map(s=>[String(s.id),s]));
   const unknown=[...new Set(rows.map(e=>e.shift).filter(v=>v!=='unassigned'&&!map.has(v)))];
   for(let i=0;i<unknown.length;i+=50){const result=await ojmDb.from('pos_shifts118').select(cols).in('id',unknown.slice(i,i+50));check();if(result.error)throw Error(result.error.message);for(const s of result.data)map.set(String(s.id),s)}
   const names=new Map();for(const e of rows)for(const l of e.lines)if(!names.has(itemKey(l)))names.set(itemKey(l),l[5]||'Unknown item');
   state.events=rows;state.shifts=map;state.items=names;
  }catch(err){if(g!==generation||!active()||liveProfile?.id!==id||sessionEpoch121!==session)return;state.error=err.message||'Could not load sales.'}
  if(g===generation&&active()){state.loading=false;render()}
 }
 const views={summary:'Summary',receipts:'By receipt',items:'By item',shifts:'By shift'};
 function controls(){
  const f=state.dates,period=select('Period','period',[['today','Today'],['monthly','Monthly'],['yearly','Yearly'],['custom','Custom']],f.period);
  const picker=f.period==='custom'?'<label>Date range'+btn(f.from+' – '+f.to,'range')+'</label>':f.period==='today'?'':f.period==='monthly'?'<label>Month<input type="month" data-key="month" value="'+esc(f.month)+'"></label>':select('Year','year',Array.from({length:Number(posReports.day(Date.now()).slice(0,4))-1998},(_,i)=>{const v=String(2000+i);return [v,v]}).reverse(),f.year);
  const values=k=>[...new Set(state.events.map(e=>e[k]))].sort().map(v=>[v,v]);
  const shifts=[...new Set([...state.shifts.keys(),...state.events.map(e=>e.shift)])].map(id=>[id,shiftName(id)]).sort((a,b)=>b[1].localeCompare(a[1]));
  return '<div class="ops-controls">'+select('Report','view',Object.entries(views),state.view)+period+picker+select('Dining option','service',[['','All dining options'],...values('service')],state.service)+select('Payment','payment',[['','All methods'],...values('payment')],state.payment)+select('Menu item','item',[['','All items'],...[...state.items].sort((a,b)=>a[1].localeCompare(b[1]))],state.item)+select('Shift','shift',[['','All shifts'],...shifts],state.shift)+'</div>';
 }
 function graph(model){
  const metric=state.metric,label={gross:'Gross sales',discount:'Discounts',refund:'Refunds',net:'Net sales'}[metric];
  let points=[],title=label+' by day',map=model.days;
  if(state.view==='items'||state.view==='shifts'){
   const item=state.view==='items';title=item?'Top menu items by '+label.toLowerCase():label+' by shift';
   points=[...(item?model.items:model.shifts)].sort((a,b)=>b[1][metric]-a[1][metric]).slice(0,10).map(([k,v])=>[item?state.items.get(k):shiftName(k),v[metric]]);
  }else{
   const r=posReports.range(state.dates),start=Date.parse(r.from+'T00:00:00Z'),end=Date.parse(r.to+'T00:00:00Z');
   if(end-start>62*86400000){
    title=label+' by month';map=new Map();for(const [day,v] of model.days)add(map,day.slice(0,7),v);
    for(let d=new Date(start);d<=end;){const key=d.toISOString().slice(0,7);points.push([key,map.get(key)?.[metric]||0]);d.setUTCDate(1);d.setUTCMonth(d.getUTCMonth()+1)}
   }else for(let t=start;t<=end;t+=86400000){const key=new Date(t).toISOString().slice(0,10);points.push([key,map.get(key)?.[metric]||0])}
  }
  if(!model.receipts.length)return '<section class="ops-chart"><h3>'+title+' (LAK)</h3><p>No paid receipts or refunds for these filters.</p></section>';
  const max=Math.max(1,...points.map(p=>Math.abs(p[1]))),trend=['summary','receipts'].includes(state.view);
  if(!trend)return '<section class="ops-chart"><h3>'+title+' (LAK)</h3>'+points.map(([k,v])=>'<div class="ops-rank"><span>'+esc(k)+'</span><i style="width:'+Math.max(0.4,100*Math.abs(v)/max)+'%" class="'+(v<0?'negative':'')+'"></i><b>'+amount(v)+'</b></div>').join('')+'</section>';
  const neg=points.some(p=>p[1]<0),top=points.some(p=>p[1]>0),baseline=neg&&top?50:neg?8:90,room=neg&&top?40:80;
  const width=Math.max(250,points.length*13),step=width/Math.max(1,points.length);
  const bars=points.map(([k,v],i)=>{const h=Math.abs(v)/max*room;return '<rect x="'+(i*step+step*.12)+'" y="'+(v>=0?baseline-h:baseline)+'" width="'+(step*.76)+'" height="'+Math.max(1,h)+'" fill="'+(v<0?'#a84e37':'#237057')+'"><title>'+esc(k+' · '+amount(v)+' LAK')+'</title></rect>'}).join('');
  return '<section class="ops-chart"><h3>'+title+' (LAK)</h3><svg viewBox="0 0 '+width+' 100" preserveAspectRatio="none" role="img" aria-label="'+title+'"><line x1="0" x2="'+width+'" y1="'+baseline+'" y2="'+baseline+'" stroke="#89978d"/>'+bars+'</svg><div class="ops-axis"><span>'+esc(points[0]?.[0])+'</span><span>'+esc(points.at(-1)?.[0])+'</span></div></section>';
 }
 const moneyCols=['Gross sales','Discounts','Refunds','Net sales'];
 const amounts=v=>[v.gross,v.discount,v.refund,v.net].map(amount);
 function listing(model,exporting=false){
  let headers,rows=[],q=state.find.trim().toLowerCase();
  const match=(...parts)=>parts.join(' ').toLowerCase().includes(q);
  if(state.view==='receipts'){
   headers=['Receipt','Date & time','Type','Dining option','Payment','Quantity',...moneyCols];
   model.receipts.forEach(({e,value,lines},j)=>{if(match(posReports.numberFor(e.order),e.day,e.order.data.cashier,...lines.map(l=>l[5])))rows.push([btn(posReports.numberFor(e.order),'receipt',j),esc(posReports.stamp(e.at)),e.refund?'Refund':'Sale',esc(e.service),esc(e.payment),num(value.qty),...amounts(value)])});
  }else if(state.view==='items'){
   headers=['Menu item','Sale receipts','Refunds (count)','Net quantity',...moneyCols];
   for(const [id,v] of [...model.items].sort((a,b)=>b[1].net-a[1].net)){const name=state.items.get(id);if(match(name))rows.push([btn(name,'item',id),v.sales,v.returns,num(v.qty),...amounts(v)])}
  }else if(state.view==='shifts'){
   const showCash=!state.item&&!state.payment&&!state.service;
   headers=['Shift opened · cashier','Closed','Sale receipts','Refunds (count)',...moneyCols,...(showCash?['Opening cash','Expected at close','Counted at close','Closing difference']:[])];
   const ids=new Set(model.shifts.keys());if(showCash)for(const id of state.shifts.keys())if(!state.shift||state.shift===id)ids.add(id);
   for(const id of [...ids].sort((a,b)=>String(state.shifts.get(b)?.opened_at||'').localeCompare(String(state.shifts.get(a)?.opened_at||'')))){const s=state.shifts.get(id),name=shiftName(id),v=model.shifts.get(id)||empty();if(match(name,id))rows.push([btn(name,'shift',id),s?(s.closed_at?esc(posReports.stamp(s.closed_at)):'Open'):'—',v.sales,v.returns,...amounts(v),...(showCash?[s?.opening,s?.closed_at?s.expected:null,s?.closed_at?s.counted:null,s?.closed_at&&s.counted!=null&&s.expected!=null?Number(s.counted)-Number(s.expected):null].map(x=>x==null?'—':amount(cents(x))):[])])}
  }else{
   headers=['Business date','Sale receipts','Refunds (count)','Net quantity',...moneyCols];
   for(const [d,v] of [...model.days].sort((a,b)=>b[0].localeCompare(a[0])))if(match(d))rows.push([esc(d),v.sales,v.returns,num(v.qty),...amounts(v)]);
  }
  if(exporting){
   const decode=value=>{if(typeof value!=='string')return value;const el=document.createElement('template');el.innerHTML=value;return el.content.textContent};
   return [headers,...rows.map(r=>r.map(decode))];
  }
  const size=30,last=Math.max(0,Math.ceil(rows.length/size)-1);state.page=Math.min(last,state.page);
  return '<div class="ops-scroll"><table><thead><tr>'+headers.map(h=>'<th scope="col">'+h+'</th>').join('')+'</tr></thead><tbody>'+ (rows.slice(state.page*size,(state.page+1)*size).map(row=>'<tr>'+row.map(c=>'<td>'+c+'</td>').join('')+'</tr>').join('')||'<tr><td colspan="'+headers.length+'">'+(q?'No matching rows.':'No records for these filters.')+'</td></tr>')+'</tbody></table></div><footer>'+rows.length+' rows'+(last?' · '+btn('Previous','page',-1,state.page===0?'disabled':'')+' '+(state.page+1)+' / '+(last+1)+' '+btn('Next','page',1,state.page===last?'disabled':''):'')+'</footer>';
 }
 function detail(record){
  if(!record)return;const {e}=record,d=e.order.data,dialog=document.createElement('dialog');dialog.className='ops-dialog';
  dialog.setAttribute('aria-label','Receipt '+posReports.numberFor(e.order));
  dialog.innerHTML='<header><h2>'+esc((e.refund?'Refund · receipt ':'Receipt ')+posReports.numberFor(e.order))+'</h2>'+btn('Close','close')+'</header><p>'+esc([posReports.stamp(e.at),e.payment,e.service,d.cashier].filter(Boolean).join(' · '))+'</p><div class="ops-scroll"><table><thead><tr><th>Menu item</th><th>Quantity</th><th>Unit price</th><th>Line total</th></tr></thead><tbody>'+e.lines.map(l=>'<tr><td>'+esc(l[5])+(l[6]?'<small>'+esc(l[6])+'</small>':'')+'</td><td>'+num(l[8])+'</td><td>'+amount(cents(l[9]))+'</td><td>'+amount(cents(l[12]))+'</td></tr>').join('')+'</tbody></table></div><p><b>Net sales · '+amount(e.value.net)+' LAK</b></p><p>Tip · '+amount(e.value.tip)+' LAK</p><p><b>Total collected · '+amount(e.value.net+e.value.tip)+' LAK</b></p>'+(d.fxTender?'<p>'+esc(posReports.fxDescription(d.fxTender))+'</p>':'')+(e.refund&&d.reason?'<p>Refund reason · '+esc(d.reason)+'</p>':'');
  dialog.querySelector('button').onclick=()=>dialog.close();dialog.onclick=ev=>{if(ev.target===dialog&&(ev.clientX<dialog.getBoundingClientRect().left||ev.clientX>dialog.getBoundingClientRect().right||ev.clientY<dialog.getBoundingClientRect().top||ev.clientY>dialog.getBoundingClientRect().bottom))dialog.close()};dialog.onclose=()=>dialog.remove();root().append(dialog);dialog.showModal();
 }
 async function manageDiscounts(){
  if(!isAdmin121())throw Error('Administrator access required.');
  const user=liveProfile.id,session=sessionEpoch121;
  const {data:config,error}=await ojmDb.from('pos_config118').select('data,version').eq('id',true).single();
  if(error)throw Error(error.message);
  if(!active()||session!==sessionEpoch121||liveProfile?.id!==user)return;
  const modal=ui108.modal('Discounts','<form class="discount-presets"><div data-presets></div><button type="button" data-add>Add discount</button><p role="alert"></p><button type="submit">Save discounts</button></form>',[]);
  const form=document.querySelector('.ui-overlay108:last-child .discount-presets'),overlay=form.closest('.ui-overlay108'),list=form.querySelector('[data-presets]');
  function row(p={}){
   const item=document.createElement('fieldset');item.dataset.id=p.id||crypto.randomUUID();
   item.innerHTML='<label>Name<input name="name" required maxlength="80" placeholder="Discount name"></label><label>Type<select name="type"><option value="percent">Percentage</option><option value="amount">Fixed amount (LAK)</option></select></label><label>Value<input name="value" type="number" required min="0.01" step="0.01"></label><button type="button" data-remove>Remove</button>';
   const name=item.querySelector('[name=name]'),type=item.querySelector('select'),value=item.querySelector('[name=value]');
   name.value=p.name||'';type.value=p.type||'percent';value.value=p.value??'';
   function limit(){if(type.value==='percent')value.max='100';else value.removeAttribute('max')}
   type.onchange=limit;limit();item.querySelector('[data-remove]').onclick=()=>item.remove();list.append(item);return name;
  }
  for(const p of config.data.discountPresets||[])row(p);
  form.querySelector('[data-add]').onclick=()=>row().focus();
  form.onsubmit=async e=>{
   e.preventDefault();const save=form.querySelector('[type=submit]');if(save.disabled)return;save.disabled=true;
   try{
    if(sessionEpoch121!==session||liveProfile?.id!==user||!isAdmin121())throw Error('Account changed. Reopen Discounts.');
    const discountPresets=[...list.children].map(item=>({id:item.dataset.id,name:item.querySelector('[name=name]').value.trim(),type:item.querySelector('select').value,value:Number(item.querySelector('[name=value]').value)}));
    const names=new Set();for(const p of discountPresets){const key=p.name.toLowerCase();if(!key||names.has(key))throw Error('Give each discount a different name.');names.add(key)}
    const data={...config.data,discountPresets};
    const result=await ojmDb.rpc('pos_manage118',{p_action:'config',p_version:config.version,p_data:data});if(result.error)throw Error(result.error.message);
    if(sessionEpoch121!==session||liveProfile?.id!==user)return;
    if(window.pos118){pos118.state.config=data;pos118.state.configVersion=result.data.version}
    overlay.resolve108(true);showCenterStatus('Discounts saved.');
   }catch(err){form.querySelector('[role=alert]').textContent=err.message}finally{save.disabled=false}
  };
  await modal;
 }
 function render(){
  if(!active())return;const el=root(),m=summarize(state.events,state),v=m.summary;
  el.innerHTML='<section class="ops-panel"><header><h2>POS sales reports</h2><div>'+(isAdmin121()?btn('Discounts','discounts')+' '+btn('Profitability','profit'):'')+' '+btn('Refresh','refresh')+' '+btn('Download CSV','download','',state.loading||state.error?'disabled':'')+'</div></header>'+controls()+(state.error?'<p role="alert">'+esc(state.error)+'</p>':state.loading?'<p role="status">Loading sales…</p>':'<div class="ops-kpis">'+moneyCols.map((label,j)=>'<button type="button" data-op="metric" data-value="'+['gross','discount','refund','net'][j]+'" aria-pressed="'+(state.metric===['gross','discount','refund','net'][j])+'"><small>'+label+' (LAK)</small><strong>'+amounts(v)[j]+'</strong></button>').join('')+(state.item?'':'<div><small>Net tips (LAK)</small><strong>'+amount(v.tip)+'</strong></div><div><small>Total collected (LAK)</small><strong>'+amount(v.net+v.tip)+'</strong></div>')+'</div><p class="ops-note">'+v.sales+' sale receipts · '+v.returns+' refunds · '+num(v.qty)+' net items. Refunds use the amount returned on the date issued.</p>'+graph(m)+'<div class="ops-table-head"><h3>'+views[state.view]+'</h3><input aria-label="Search report rows" type="search" placeholder="Search rows" value="'+esc(state.find)+'"></div><div data-list>'+listing(m)+'</div>')+'</section>';
  const query=el.querySelector('input[type=search]');if(query)query.oninput=()=>{state.find=query.value;state.page=0;el.querySelector('[data-list]').innerHTML=listing(m)};
  el.onchange=e=>{const k=e.target.dataset.key;if(!k)return;const v=e.target.value;if(['period','month','year'].includes(k)){
   if(!v)return;state.dates[k]=v;if(k==='period'&&v==='today')state.dates.from=state.dates.to=posReports.day(Date.now());state.find='';state.shift=state.item=state.payment=state.service='';load();
  }else{state[k]=v;state.find='';state.page=0;render()}};
  el.onclick=e=>{const b=e.target.closest('[data-op]');if(!b)return;const a=b.dataset.op,v=b.dataset.value;
   if(a==='download'){
    if(!active()||owner!==liveProfile?.id||epoch!==sessionEpoch121||state.loading||state.error)return;
    // Search narrows the visible list. Download all rows within the selected report filters.
    const search=state.find;let detail;try{state.find='';detail=listing(m,true)}finally{state.find=search}
    const range=posReports.range(state.dates);
    const events=m.receipts.map(({e,value})=>{
     if(!state.item)return e;
     const d=e.order.data,net=Math.abs(value.net)/100,subtotal=e.refund?net:value.gross/100;
     return {...e,order:{...e.order,data:{...d,subtotal,total:net,tip:0,fxTender:d.fxTender}}};
    });
    let summary=restaurantReportSummary.rows(events);
    if(state.item){summary=summary.slice(0,summary.findIndex(r=>r[0]==='Currency')).filter(r=>!['Net tips','Total collected after refunds'].includes(r[0])).map(r=>r.length===4?r.slice(0,2):r);summary.push(['Foreign tender and change are recorded per receipt. Clear the item filter for currency totals.'])}
    const criteria=[state.item?state.items.get(state.item):'',state.payment,state.service,state.shift?shiftName(state.shift):''].filter(Boolean);
    const rows=[['Oon Jai Restaurant',views[state.view],range.from,range.to,...criteria],...summary,[],['Details'],...detail];
    const url=URL.createObjectURL(new Blob(['\ufeff'+posReports.csv(rows)],{type:'text/csv;charset=utf-8'})),a=document.createElement('a');
    a.href=url;a.download='Restaurant-'+state.view+'-'+range.from+'-'+range.to+'.csv';document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);return;
   }
   if(a==='discounts'){manageDiscounts().catch(err=>showCenterStatus(err.message,true));return}
   if(a==='metric'){state.metric=v;render()}else if(a==='refresh')load();else if(a==='profit')switchTab('restaurant-sales143');else if(a==='range')posReports.openRange(b,state.dates,(from,to)=>{Object.assign(state.dates,{from,to});state.shift=state.item=state.payment=state.service='';load()});
   else if(a==='receipt')detail(m.receipts[Number(v)]);else if(a==='page'){state.page+=Number(v);render()}else if(a==='item'||a==='shift'){state[a]=v;state.view='receipts';state.find='';state.page=0;render()}
  };
 }
 const before=switchTab;window.switchTab=function(id,...args){const result=before.call(this,id,...args);if(result===false)return result;
  if(id===route&&active()){if(owner!==liveProfile.id||epoch!==sessionEpoch121){state=fresh();owner=liveProfile.id;epoch=sessionEpoch121}load()}else if(!active()){generation++;root()?.querySelector('dialog')?.close();if(root())root().replaceChildren()}
  return result;
 };
 const logout=window.logoutDemoUser;if(logout)window.logoutDemoUser=function(...args){generation++;state=fresh();owner=null;epoch=null;root()?.replaceChildren();return logout.apply(this,args)};
})();
