/* Reports use recorded menu lines and the restaurant's business dates. */
var posReports = globalThis.posReports || (() => {
 const dayFormat = new Intl.DateTimeFormat('en-CA', {timeZone:'Asia/Vientiane', year:'numeric', month:'2-digit', day:'2-digit'});
 const clock = new Intl.DateTimeFormat('en-GB', {timeZone:'Asia/Vientiane', hour:'2-digit', minute:'2-digit', second:'2-digit', hourCycle:'h23'});
 const day = value => dayFormat.format(new Date(value));
 const stamp = value => value ? day(value)+' '+clock.format(new Date(value)) : '';
 const cents = amount => Math.round((Number(amount) + Number.EPSILON) * 100);
 const types = {receipts:'By receipt', items:'By item', shifts:'By shift'};
 const receiptId=number=>number==null?'':'R-'+number;
 function defaults() {
  const today = day(Date.now());
  return {type:'receipts', period:'monthly', month:today.slice(0,7), year:today.slice(0,4), from:today, to:today};
 }
 function range(filter) {
  let {from,to} = filter;
  if (filter.period === 'monthly') {
   if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(filter.month)) throw Error('Choose a month.');
   from = filter.month+'-01';
   const end = new Date(from+'T00:00:00Z');
   end.setUTCMonth(end.getUTCMonth()+1,0);
   to = end.toISOString().slice(0,10);
  } else if (filter.period === 'yearly') {
   if (!/^\d{4}$/.test(filter.year)) throw Error('Choose a year.');
   from = filter.year+'-01-01';
   to = filter.year+'-12-31';
  }
  if (![from,to].every(v => /^\d{4}-\d{2}-\d{2}$/.test(v)) || from>to) throw Error('Choose a start date on or before the end date.');
  const start = from+'T00:00:00+07:00';
  const end = new Date(Date.parse(to+'T00:00:00+07:00')+86400000).toISOString();
  return {from,to,start,end};
 }
 function controls(f,button) {
  const select = (label,key,options) => '<label>'+label+'<select data-report-field="'+key+'">'+Object.entries(options).map(([v,name])=>'<option value="'+v+'"'+(v===f[key]?' selected':'')+'>'+name+'</option>').join('')+'</select></label>';
  const input = (label,key,type) => '<label>'+label+'<input data-report-field="'+key+'" type="'+type+'" value="'+shell113.esc(f[key])+'"></label>';
  let picker;
  if (f.period==='monthly') picker=input('Month','month','month');
  else if (f.period==='yearly') {
   const years={};
   for(let y=Number(day(Date.now()).slice(0,4))+1;y>=2000;y--) years[y]=String(y);
   picker=select('Year','year',years);
  } else picker='<label>Date range<button type="button" data-report-range aria-haspopup="dialog">'+shell113.esc(f.from)+' – '+shell113.esc(f.to)+'</button></label>';
  return '<div class="pos-report-controls"><div class="pos-report-fields">'+select('Report','type',types)+select('Period','period',{monthly:'Monthly',yearly:'Yearly',custom:'Custom'})+picker+'</div>'+
   '<div class="pos-report-summary" role="status">Loading summary…</div><div class="pos-actions118">'+button('Export CSV','export')+button('Export PDF','export-pdf')+'</div></div>';
 }
 function openRange(trigger,f,apply) {
  const dialog=document.createElement('dialog');
  dialog.className='pos-range-dialog';
  dialog.setAttribute('aria-label','Choose report dates');
  dialog.innerHTML='<header><strong>Choose report dates</strong><button type="button" data-dismiss aria-label="Close">×</button></header><div class="pos-calendar-nav"><button type="button" data-prev aria-label="Previous month">‹</button><strong data-month></strong><button type="button" data-next aria-label="Next month">›</button></div><div class="pos-calendar-days"></div><p role="status"></p><form><label>Start date<input type="date" name="start" required></label><label>End date<input type="date" name="end" required></label><button type="submit">Apply dates</button></form>';
  const form=dialog.querySelector('form'), grid=dialog.querySelector('.pos-calendar-days');
  const start=form.elements.start,end=form.elements.end;
  let month=new Date(f.from.slice(0,7)+'-01T00:00:00Z'), awaitingEnd=false;
  start.value=f.from;end.value=f.to;
  function draw(){
   const y=month.getUTCFullYear(),m=month.getUTCMonth();
   dialog.querySelector('[data-month]').textContent=month.toLocaleDateString('en-GB',{timeZone:'UTC',month:'long',year:'numeric'});
   grid.replaceChildren();
   for(const label of ['Mo','Tu','We','Th','Fr','Sa','Su']){const el=document.createElement('small');el.textContent=label;grid.append(el)}
   for(let i=0;i<(month.getUTCDay()+6)%7;i++)grid.append(document.createElement('span'));
   const last=new Date(Date.UTC(y,m+1,0)).getUTCDate();
   for(let d=1;d<=last;d++){
    const iso=new Date(Date.UTC(y,m,d)).toISOString().slice(0,10),b=document.createElement('button');
    b.type='button';b.dataset.day=iso;b.textContent=d;b.setAttribute('aria-label',iso);
    b.classList.toggle('endpoint',iso===start.value||iso===end.value);
    b.classList.toggle('in-range',iso>start.value&&iso<end.value);
    grid.append(b);
   }
   dialog.querySelector('[role=status]').textContent=awaitingEnd?'Choose the end date.':'Choose the start date.';
  }
  function finish(){
   if(!form.reportValidity())return;
   if(start.value>end.value){end.setCustomValidity('Choose an end date on or after the start date.');end.reportValidity();return}
   const from=start.value,to=end.value;
   dialog.close();apply(from,to);
  }
  grid.onclick=e=>{
   const value=e.target.closest('[data-day]')?.dataset.day;if(!value)return;
   end.setCustomValidity('');
   if(!awaitingEnd){start.value=value;end.value='';awaitingEnd=true;draw();grid.querySelector('[data-day="'+value+'"]').focus()}
   else {const first=start.value;start.value=value<first?value:first;end.value=value<first?first:value;finish()}
  };
  form.oninput=()=>{end.setCustomValidity('');awaitingEnd=false;if(start.value)month=new Date(start.value.slice(0,7)+'-01T00:00:00Z');draw()};
  form.onsubmit=e=>{e.preventDefault();finish()};
  dialog.querySelector('[data-prev]').onclick=()=>{month.setUTCMonth(month.getUTCMonth()-1);draw()};
  dialog.querySelector('[data-next]').onclick=()=>{month.setUTCMonth(month.getUTCMonth()+1);draw()};
  dialog.querySelector('[data-dismiss]').onclick=()=>dialog.close();
  dialog.onclick=e=>{if(e.target===dialog){const b=dialog.getBoundingClientRect();if(e.clientX<b.left||e.clientX>b.right||e.clientY<b.top||e.clientY>b.bottom)dialog.close()}};
  dialog.onclose=()=>{dialog.remove();if(trigger.isConnected)trigger.focus()};
  document.body.append(dialog);draw();dialog.showModal();
 }
 async function pages(query,check) {
  const rows=[];
  let cursor=null;
  for (;;) {
   check();
   let request=query().order('id').limit(250);
   if(cursor) request=request.gt('id',cursor);
   const {data,error}=await request;
   check();
   if(error) throw Error(error.message);
   rows.push(...data);
   if(data.length<250) return rows;
   cursor=data[data.length-1].id;
  }
 }
 const inRange=(value,r)=>value && day(value)>=r.from && day(value)<=r.to;
 async function transactions(s,r,check,onlySales=false) {
  const read=(field,refund)=>{
   if(s.sample) return s.orders.filter(o=>['paid','refunded'].includes(o.status) && (!refund||o.status==='refunded') && inRange(o[field],r));
   return pages(()=>ojmDb.from('pos_orders118').select('id,number,status,data,created_at,paid_at,refunded_at')
    .in('status',refund?['refunded']:['paid','refunded']).gte(field,r.start).lt(field,r.end),check);
  };
  const [sales,refunds]=await Promise.all([read('paid_at',false),onlySales?[]:read('refunded_at',true)]);
  return [...sales.map(order=>({order,refund:false,at:order.paid_at})),...refunds.map(order=>({order,refund:true,at:order.refunded_at}))]
   .sort((a,b)=>Date.parse(b.at)-Date.parse(a.at)||Number(b.order.number)-Number(a.order.number));
 }
 function fxDescription(fx){
  const fmt=v=>new Intl.NumberFormat('en-US',{maximumFractionDigits:6}).format(v);
  return fx?'FX payment: '+fmt(fx.amount)+' '+fx.currency+' × '+fmt(fx.rate)+' LAK = '+fmt(fx.equivalentLak)+' LAK · Change: '+fmt(fx.changeLak)+' LAK':'';
 }
 const receiptHeader=['Date','Receipt number','Receipt type','Shift ID','Description','Quantity','Gross sales (LAK)','Discount (LAK)','Total collected (LAK)','Payment method','Payment reference','Sale cashier','Customer','Dining option','Note','Refund reason','Status','Original payment date','Refund date','Original tender currency','Foreign amount received','LAK per foreign unit','Original tender equivalent (LAK)','Original change (LAK)'];
 const itemHeader=['Date','Receipt number','Receipt type','Shift ID','Menu item ID','Menu item','Modifiers','Item note','Quantity','Unit price (LAK)','Gross sales (LAK)','Allocated discount (LAK)','Line total (LAK)','Payment method','Ingredients restocked'];
 function salesReport(events,items) {
  const rows=[items?itemHeader:receiptHeader];
  for(const {order,refund,at} of events) {
   const d=order.data,lines=d.lines||[],sign=refund?-1:1;
   const common=[stamp(at),receiptId(order.number),refund?'Refund':'Sale',refund?d.refundShiftId:d.shiftId];
   const gross=lines.map(l=>cents(Number(l.quantity)*Number(l.unitPrice)));
   const grossSum=gross.reduce((sum,x)=>sum+x,0);
   const paid=cents(d.total), subtotal=d.subtotal==null?grossSum:cents(d.subtotal);
   if(!items) {
    rows.push([...common,lines.map(l=>l.quantity+' × '+l.name).join(', '),sign*lines.reduce((sum,l)=>sum+Number(l.quantity),0),
     sign*subtotal/100,sign*(subtotal-paid)/100,sign*paid/100,d.payment,d.paymentReference,d.cashier,d.customer,d.service,d.note,refund?d.reason:'',order.status,stamp(order.paid_at),stamp(order.refunded_at),d.fxTender?.currency??'',d.fxTender?.amount??'',d.fxTender?.rate??'',d.fxTender?.equivalentLak??'',d.fxTender?.changeLak??'']);
    continue;
   }
   // Allocate the recorded receipt total across lines. Cumulative rounding keeps the sum exact.
   let runningGross=0,previousNet=0;
   lines.forEach((line,i)=>{
    runningGross+=gross[i];
    const cumulativeNet=i===lines.length-1?paid:grossSum?Math.round(paid*runningGross/grossSum):0;
    const net=cumulativeNet-previousNet;
    previousNet=cumulativeNet;
    rows.push([...common,line.menuId,line.name,(line.options||[]).join(', '),line.note,sign*Number(line.quantity),
     Number(line.unitPrice),sign*gross[i]/100,sign*(gross[i]-net)/100,sign*net/100,d.payment,refund&&d.restocked!=null?(d.restocked?'Yes':'No'):'']);
   });
  }
  return rows;
 }
 const shiftHeader=['Shift ID','Cashier','Opened at','Closed at','Status','Sale receipts','Refunds','Sales collected (LAK)','Refund amount (LAK)','Net collected (LAK)','Opening cash (LAK)','Cash sales (LAK)','Cash refunds (LAK)','Paid in (LAK)','Paid out (LAK)','Expected cash (LAK)','Counted cash (LAK)','Difference (LAK)'];
 async function shiftsReport(s,r,check) {
  const shifts=s.sample?s.shifts.filter(v=>inRange(v.opened_at,r)):await pages(()=>ojmDb.from('pos_shifts118')
   .select('id,cashier,opened_at,closed_at,opening,expected,counted,profile:profiles(full_name)').gte('opened_at',r.start).lt('opened_at',r.end),check);
  shifts.sort((a,b)=>Date.parse(b.opened_at)-Date.parse(a.opened_at));
  const rows=[shiftHeader];
  for(let i=0;i<shifts.length;i+=25) {
   const batch=shifts.slice(i,i+25),ids=batch.map(v=>v.id);
   const payments=(key,refund)=>{
    if(s.sample) return s.orders.filter(o=>ids.includes(o.data[key]) && (refund?o.status==='refunded':['paid','refunded'].includes(o.status)))
     .map(o=>({shift:o.data[key],amount:o.data.total,method:o.data.payment}));
    return pages(()=>ojmDb.from('pos_orders118').select('id,shift:data->>'+key+',amount:data->>total,method:data->>payment')
     .in('data->>'+key,ids).in('status',refund?['refunded']:['paid','refunded']),check);
   };
   const [sales,refunds,moves]=await Promise.all([payments('shiftId',false),payments('refundShiftId',true),
    s.sample?s.cash:pages(()=>ojmDb.from('pos_cash118').select('id,shift_id,amount').in('shift_id',ids),check)]);
   const sum=values=>values.reduce((a,b)=>a+cents(b.amount),0)/100;
   for(const shift of batch) {
    const paid=sales.filter(v=>v.shift===shift.id),returned=refunds.filter(v=>v.shift===shift.id),cash=moves.filter(v=>v.shift_id===shift.id);
    const cashSales=sum(paid.filter(v=>v.method==='Cash')),cashRefunds=sum(returned.filter(v=>v.method==='Cash'));
    const added=sum(cash.filter(v=>v.amount>0)),removed=-sum(cash.filter(v=>v.amount<0));
    const expected=shift.expected??(Number(shift.opening)+cashSales-cashRefunds+added-removed);
    rows.push([shift.id,shift.profile?.full_name||shift.cashier,stamp(shift.opened_at),stamp(shift.closed_at),shift.closed_at?'Closed':'Open',
     paid.length,returned.length,sum(paid),sum(returned),cents(sum(paid)-sum(returned))/100,Number(shift.opening),cashSales,cashRefunds,added,removed,
     cents(expected)/100,shift.counted??'',shift.counted==null?'':cents(Number(shift.counted)-expected)/100]);
   }
  }
  return rows;
 }
 function csv(rows) {
  return rows.map(row=>row.map(value=>{
   let v=String(value??'');
   if(typeof value==='string' && /^(?:\s*[=+@-]|[\t\r\n])/.test(v)) v="'"+v;
   return '"'+v.replaceAll('"','""')+'"';
  }).join(',')).join('\r\n');
 }
 function reportCheck(state) {
  const epoch=sessionEpoch121,owner=liveProfile?.id,sample=state.sample;
  return ()=>{
   if(!owner||owner!==liveProfile?.id||epoch!==sessionEpoch121||sample!==state.sample) throw Error('The POS session changed. Open the report again.');
   if(!restaurantTabCan125('pos','pos-management')||!restaurantTabCan125('pos','pos-sales-receipts')) throw Error('Report access required.');
  };
 }
 async function readReport(type,state,r,check){
  const events=type==='shifts'?[]:await transactions(state,r,check);
  const rows=type==='shifts'?await shiftsReport(state,r,check):salesReport(events,type==='items');
  check();return {rows,events};
 }
 let cached=null;
 function clear(){cached=null}
 function selected(filter,state){
  const check=reportCheck(state);check();
  const r=range(filter),key=JSON.stringify([liveProfile.id,sessionEpoch121,state.sample,state.writeGeneration125,filter.type,r.from,r.to]);
  if(!cached||cached.key!==key) {
   const entry={key,job:readReport(filter.type,state,r,check)};
   cached=entry;entry.job.catch(()=>{if(cached===entry)clear()});
  }
  return cached.job;
 }
 function summary(rows,type){
  const data=rows.slice(1),index={items:12,receipts:8,shifts:9}[type];
  const net=data.reduce((sum,row)=>sum+cents(row[index]),0)/100;
  const count=type==='items'?new Set(data.map(row=>row[4]||row[5])).size:data.length;
  const name={items:'menu items',receipts:'receipts',shifts:'shifts'}[type];
  const details=type==='items'?' · '+data.length+' item lines':'';
  return (count?count+' '+name+details:'No '+name+' in this period')+' · Net total '+net.toLocaleString('en-US',{maximumFractionDigits:2})+' LAK';
 }
 async function populate(root,filter,state){
  const el=root.querySelector('.pos-report-summary');if(!el)return;
  const key=JSON.stringify(filter);el.dataset.selection=key;
  try{
   const {rows}=await selected(filter,state);
   if(el.isConnected&&el.dataset.selection===key)el.textContent=summary(rows,filter.type);
  }catch(error){if(el.isConnected&&el.dataset.selection===key)el.textContent=error.message}
 }
 function printTable(type,rows,r,sample){
  const cols=type==='items'?[0,1,2,5,6,8,9,11,12]:[2,3,1,4,5,6,9,15,16,17];
  const esc=shell113.esc,frame=document.createElement('iframe');frame.style.cssText='position:fixed;width:0;height:0;border:0';document.body.append(frame);
  const doc=frame.contentDocument,title='Oon Jai Marketplace · '+types[type];
  doc.open();doc.write('<!doctype html><meta charset="utf-8"><title>'+title+'</title><style>@page{size:A4 landscape;margin:10mm}body{font:11px Arial;color:#203b30}table{width:100%;border-collapse:collapse}th,td{text-align:left;border-bottom:1px solid #ccc;padding:5px}thead{display:table-header-group}tr{break-inside:avoid}</style><h2>'+title+'</h2><p>'+(sample?'SAMPLE · ':'')+r.from+' – '+r.to+' · '+summary(rows,type)+'</p><table><thead><tr>'+cols.map(c=>'<th>'+esc(rows[0][c])+'</th>').join('')+'</tr></thead><tbody>'+rows.slice(1).map(row=>'<tr>'+cols.map(c=>'<td>'+esc(row[c]??'')+'</td>').join('')+'</tr>').join('')+'</tbody></table>');doc.close();
  frame.contentWindow.addEventListener('afterprint',()=>frame.remove(),{once:true});frame.contentWindow.focus();frame.contentWindow.print();
 }
 async function download(filter,state,pdf,printReceipts) {
  const r=range(filter),type=filter.type,sample=state.sample,check=reportCheck(state);
  clear(); // An explicit export includes records posted since the summary was opened.
  const {rows,events}=await selected(filter,state);check();
  if(rows.length===1) throw Error('No '+(type==='shifts'?'shifts':'transactions')+' in this period.');
  if(pdf){
   if(type==='receipts')return printReceipts(events.map(e=>({...e.order,status:e.refund?'refunded':'paid',paid_at:e.at})),false,true);
   return printTable(type,rows,r,sample);
  }
  const exportRows=rows.map((row,i)=>[...row,i===0?'Sample':sample?'YES':'NO']);
  const url=URL.createObjectURL(new Blob(['\ufeff'+csv(exportRows)],{type:'text/csv;charset=utf-8'}));
  const a=document.createElement('a');
  a.href=url;
  a.download='POS-'+(sample?'SAMPLE-':'')+type+'-'+r.from+'-'+r.to+'.csv';
  document.body.append(a);a.click();a.remove();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
  showCenterStatus('Export downloaded.');
 }
 return {fxDescription,receiptId,transactions,pages,stamp,day,defaults,controls,download,clear,populate,openRange,summary,range,salesReport,shiftsReport,csv};
})();
