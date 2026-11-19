/* Per-cashier shift reconciliation. Server snapshots are the saved proof of closure. */
(()=>{'use strict';
const round=n=>Math.round((Number(n)||0)*100)/100;
function totals(opening,sales,refunds,moves){
 const cash=new Map(),methods=new Map(),t={paidCount:sales.length,refundCount:refunds.length,grossSales:0,discounts:0,sales:0,refunds:0,netSales:0,tips:0,collected:0};
 const balance=currency=>{if(!cash.has(currency))cash.set(currency,{currency,opening:Number(opening[currency]||0),received:0,change:0,refunds:0,cashIn:0,cashOut:0,expected:0});return cash.get(currency)};
 const method=name=>{if(!methods.has(name))methods.set(name,{method:name,paid:0,refunds:0,net:0});return methods.get(name)};
 for(const code of ['LAK','USD','THB',...Object.keys(opening)])balance(code);
 for(const {data:d} of sales){const collected=Number(d.collectedTotal??d.total),tip=Number(d.tip||0);t.grossSales+=Number(d.subtotal??d.total);t.sales+=Number(d.total);t.tips+=tip;t.collected+=collected;method(d.payment).paid+=collected;
  balance('LAK').change+=Math.max(0,round(Number(d.tendered??collected)-collected));
  if(d.payment==='Cash')balance(d.fxTender?.currency||'LAK').received+=Number(d.fxTender?.amount??d.tendered??collected);
 }
 for(const {data:d} of refunds){const amount=Number(d.collectedTotal??d.total);t.refunds+=Number(d.total);t.tips-=Number(d.tip||0);t.collected-=amount;method(d.payment).refunds+=amount;if(d.payment==='Cash')balance('LAK').refunds+=amount}
 for(const m of moves){if(m.kind==='change')continue;const b=balance(m.currency||'LAK');if(Number(m.amount)>0)b.cashIn+=Number(m.amount);else b.cashOut-=Number(m.amount)}
 t.discounts=t.grossSales-t.sales;t.netSales=t.sales-t.refunds;for(const key of Object.keys(t))t[key]=round(t[key]);
 for(const b of cash.values()){b.expected=b.opening+b.received-b.change-b.refunds+b.cashIn-b.cashOut;for(const key of Object.keys(b))if(key!=='currency')b[key]=round(b[key])}
 for(const m of methods.values()){m.net=m.paid-m.refunds;for(const key of ['paid','refunds','net'])m[key]=round(m[key])}
 return {totals:t,methods:[...methods.values()].sort((a,b)=>a.method.localeCompare(b.method)),cash:[...cash.values()]};
}
const stamp=v=>new Date(v).toLocaleString('en-GB',{timeZone:'Asia/Vientiane',dateStyle:'short',timeStyle:'short'});
const symbols={LAK:'₭',USD:'$',THB:'฿'};
const amount=(v,c='LAK')=>(symbols[c]||c+' ')+posMoney.display(v);
const drawerDetails=[['Starting cash','opening'],['Cash received','received'],['Change given','change'],['Cash refunds','refunds'],['Cash in','cashIn'],['Cash out','cashOut']];
const signedCount=v=>(v>0?'+':'')+posMoney.display(v);
function hasDrawerActivity(c){
 return c.currency==='LAK'||[...drawerDetails.map(([,key])=>c[key]),c.expected,c.counted,c.variance].some(value=>Number(value||0)!==0);
}
function sampleCode(s,shift){
 if(shift.shift_code)return shift.shift_code;
 const year=new Intl.DateTimeFormat('en',{timeZone:'Asia/Vientiane',year:'2-digit'}),y=year.format(new Date(shift.opened_at));
 const shifts=[...s.shifts].sort((a,b)=>Date.parse(a.opened_at)-Date.parse(b.opened_at)||String(a.id).localeCompare(String(b.id)));
 const index=shifts.findIndex(row=>row.id===shift.id);
 if(index<0)return 'Sample shift';
 let block=Math.floor(index/999)+1,letters='';
 while(block>0){letters=String.fromCharCode(65+(block-1)%26)+letters;block=Math.floor((block-1)/26)}
 return 'SAMPLE'+y+'-S'+letters+String(index%999+1).padStart(3,'0');
}
function cashTable(cash,esc,rows,label){
 const header=cash.map(c=>'<th scope="col">'+esc(c.currency)+'</th>').join('');
 return '<table class="shift-cash-matrix" aria-label="'+label+'"><thead><tr><th scope="col">Currency</th>'+header+'</tr></thead><tbody>'+rows.map(([name,cell])=>'<tr><th scope="row">'+name+'</th>'+cash.map(c=>'<td>'+cell(c)+'</td>').join('')+'</tr>').join('')+'</tbody></table>';
}
function breakdown(cash,esc){
 const rows=drawerDetails.filter(([,key])=>cash.some(c=>Number(c[key]))).map(([label,key])=>[label,c=>posMoney.display(c[key])]);
 return rows.length?cashTable(cash,esc,rows,'Cash breakdown'):'';
}
function sampleReport(s,shift){
 if(shift.closing_report)return {...shift.closing_report,shiftCode:sampleCode(s,shift)};
 const report=totals(shift.opening_cash||{LAK:shift.opening},s.orders.filter(o=>o.data.shiftId===shift.id&&['paid','refunded'].includes(o.status)),s.orders.filter(o=>o.data.refundShiftId===shift.id&&o.status==='refunded'),s.cash.filter(c=>c.shift_id===shift.id));
 return {...report,version:1,shiftId:shift.id,shiftCode:sampleCode(s,shift),cashierId:shift.cashier,cashier:shift.profile?.full_name||'Sample cashier',openedAt:shift.opened_at,closedAt:shift.closed_at||null,sample:true,reviewToken:JSON.stringify(report)};
}
function receipt(report,esc,width,review=false){
 const row=(a,b)=>'<div class="receipt-row118"><span>'+esc(a)+'</span><span>'+esc(b)+'</span></div>',t=report.totals;
 const cash=report.cash.filter(hasDrawerActivity);
 const movements=breakdown(cash,esc);
 const counts=cashTable(cash,esc,[
  ['Expected',c=>posMoney.display(c.expected)],
  ['Actual count',c=>c.counted==null?'—':posMoney.display(c.counted)],
  ['Difference',c=>c.variance==null?'—':signedCount(c.variance)]
 ],'Cash reconciliation');
 return '<article class="pos-thermal-paper" style="--receipt-width:'+width+'mm"><div class="paper-brand"><img src="assets/brand/oonjai-logo.png" alt="Oon Jai"><strong>Oon Jai Marketplace</strong><b>'+(review?'SHIFT REVIEW · NOT CLOSED':'CLOSE SHIFT RECEIPT')+'</b>'+(report.sample?'<b>SAMPLE · NOT A LIVE SHIFT</b>':'')+'</div><hr>'+row('Shift ID',report.shiftCode||'—')+'<div>Cashier: '+esc(report.cashier)+'</div><div>Opened: '+esc(stamp(report.openedAt))+'</div><div>Closed: '+esc(report.closedAt?stamp(report.closedAt):'Still open')+'</div><hr>'+row('Paid receipts',t.paidCount)+row('Gross sales',amount(t.grossSales))+row('Discounts',amount(t.discounts))+row('Refunds',amount(t.refunds))+row('Net sales',amount(t.netSales))+row('Tips (net)',amount(t.tips))+row('Total collected',amount(t.collected))+'<hr><b>PAYMENT SUMMARY (₭)</b>'+report.methods.map(m=>row(m.method,amount(m.net))+(m.refunds?row('  Refunds',amount(m.refunds)):'')).join('')+'<hr><b>CASH RECONCILIATION</b>'+counts+(movements?'<b>CASH MOVEMENTS</b>'+movements:'')+(report.legacy?'<p>Historical shift. Foreign cash counts were not recorded.</p>':'')+'</article>';
}
function summary(report,esc){const t=report.totals;return '<div class="pos-shift-meta"><strong>'+esc(report.shiftCode||'Shift')+' · '+esc(report.cashier)+'</strong><span>'+esc(stamp(report.openedAt))+' → '+(report.closedAt?esc(stamp(report.closedAt)):'Current shift')+'</span></div><div class="pos-shift-summary">'+[['Net sales',t.netSales],['Tips (net)',t.tips],['Total collected',t.collected]].map(([label,n])=>'<div>'+label+'<strong>'+amount(n)+'</strong></div>').join('')+'</div><p>'+t.paidCount+' paid receipts · '+t.refundCount+' refunds · Includes this cashier’s whole shift.</p><div class="pos-shift-table"><table><thead><tr><th>Payment</th><th>Paid (₭)</th><th>Refunds (₭)</th><th>Net (₭)</th></tr></thead><tbody>'+report.methods.map(m=>'<tr><th>'+esc(m.method)+'</th><td>'+posMoney.display(m.paid)+'</td><td>'+posMoney.display(m.refunds)+'</td><td>'+posMoney.display(m.net)+'</td></tr>').join('')+'</tbody></table></div>'}
function input(name,value='',signed=false){return '<input type="text" name="'+name+'" data-pos-money="2" inputmode="decimal" autocomplete="off" value="'+value+'" '+(signed?'':'min="0" ')+'max="999999999999.99" required>'}
function view(report,h,review=false){
 const title=review?'Shift review':'Close shift receipt',paper=()=>receipt(report,h.esc,h.paperWidth(),review);
 const root=h.dialog(title,paper(),null,{explicitClose:true}),panel=root.querySelector('.pos-dialog118');
 panel.classList.add('pos-shift-receipt');
 const print=document.createElement('button');print.type='button';print.className='shift-print-action';
 print.textContent=review?'Print review':'Print receipt';panel.querySelector('[data-close]').before(print);
 print.onclick=()=>h.runPrintButton(print,()=>h.printPaper(h.paperWidth(),title,paper()));
 return root;
}
function current(h){return h.state.shifts.find(s=>!s.closed_at&&(h.state.sample||s.cashier===h.owner()))}
function guard(h){if(!h.state.sample&&(!navigator.onLine||h.state.offline||h.state.offlineQueue.length))throw Error(h.state.offlineQueue.length?'Sync pending sales before changing the shift.':'Connect to confirm the complete shift totals before changing the shift.')}
async function open(action,h){
 guard(h);const s=h.state,owner=h.owner(),valid=()=>owner===h.owner(),check=()=>{if(!valid())throw Error('The signed-in cashier changed. Reopen the shift.')};
 if(action==='close'){
  const shift=current(h);if(!shift)throw Error('Open your shift first');
  let report=s.sample?sampleReport(s,shift):await h.rpc('pos_shift_report152',{p_shift:shift.id});check();
  if(report.closedAt){view(report,h);return}
  const extraCurrencies=new Set();
  let root;
  function rootReport(){
   const values=Object.fromEntries([...root.querySelectorAll('[data-cash-count]')].map(el=>[el.dataset.cashCount,el.value]));
   const cash=report.cash.filter(c=>hasDrawerActivity(c)||extraCurrencies.has(c.currency)||values[c.currency]);
   const hidden=report.cash.filter(c=>!cash.includes(c)),details=breakdown(cash,h.esc);
   const picker=hidden.length?'<select data-include-cash aria-label="Count another currency"><option value="">Count another currency…</option>'+hidden.map(c=>'<option>'+h.esc(c.currency)+'</option>').join('')+'</select>':'';
   const matrix=cashTable(cash,h.esc,[
    ['Expected',c=>posMoney.display(c.expected)],
    ['Actual count',c=>input('count_'+c.currency,h.esc(values[c.currency]??'')).replace('data-pos-money=', 'aria-label="Actual count in '+h.esc(c.currency)+'" data-cash-count="'+h.esc(c.currency)+'" data-pos-money=')],
    ['Difference',c=>'<output data-variance="'+h.esc(c.currency)+'" aria-label="Difference in '+h.esc(c.currency)+'">—</output>']
   ],'Cash reconciliation');
   const host=root.querySelector('[data-shift-content]');
   host.innerHTML=summary(report,h.esc)+'<div class="shift-cash-heading"><h4>Cash reconciliation</h4>'+picker+'</div><div class="shift-cash-scroll">'+matrix+'</div>'+(details?'<details class="shift-cash-details"><summary>Cash breakdown</summary><div class="shift-cash-scroll">'+details+'</div></details>':'');
   const more=host.querySelector('[data-include-cash]');
   if(more)more.onchange=()=>{const code=more.value;if(code){extraCurrencies.add(code);rootReport();root.querySelector('[data-cash-count="'+code+'"]').focus()}};
   posMoney.bind(root);refreshVariance();
  }
  function refreshVariance(){
   for(const el of root.querySelectorAll('[data-cash-count]')){
    const currency=el.dataset.cashCount,out=root.querySelector('[data-variance="'+currency+'"]'),expected=report.cash.find(c=>c.currency===currency).expected;
    const value=el.value&&el.validity.valid?round(posMoney.value(el)-expected):null;
    out.textContent=value==null?'—':signedCount(value);out.dataset.short=String(value!=null&&value<0);
   }
  }
  function counted(){
   const counts=Object.fromEntries(report.cash.map(c=>[c.currency,0]));
   for(const el of root.querySelectorAll('[data-cash-count]'))counts[el.dataset.cashCount]=posMoney.value(el);
   return counts;
  }
  root=h.dialog('Close shift · reconciliation','<form class="pos-shift-form"><div data-shift-content></div><div class="pos-shift-actions"><button type="button" data-refresh-shift>Refresh totals</button><button type="button" data-review-shift>Print review</button><button type="submit">Confirm close shift</button></div></form>',async()=>{
   check();guard(h);if(!s.sample&&(await h.pending()).length)throw Error('Sync all pending sales before closing.');
   const counts=counted();let result;
   const locked=[...root.querySelectorAll('input,select,button')];for(const el of locked)el.disabled=true;
   try{
    if(s.sample){const latest=sampleReport(s,shift);if(latest.reviewToken!==report.reviewToken)throw Error('Shift activity changed. Refresh totals and review before closing.');const frozen={...report,closedAt:new Date().toISOString(),cash:report.cash.map(c=>({...c,counted:counts[c.currency],variance:round(counts[c.currency]-c.expected)}))};delete frozen.reviewToken;result={...shift,closed_at:frozen.closedAt,counted:counts.LAK,expected:report.cash.find(c=>c.currency==='LAK').expected,closing_report:frozen};}
    else result=await h.rpc('pos_manage118',{p_action:'close',p_data:{shiftId:shift.id,reviewToken:report.reviewToken,countedCash:counts},p_version:0});
    check();if(!result?.closing_report)throw Error('The close-shift receipt was not returned. Refresh shift receipts before retrying.');
    s.shifts=[result,...s.shifts.filter(x=>x.id!==shift.id)];root.resolve108(true);h.render();view(result.closing_report,h);h.status('Shift closed.');if(!s.sample)h.load().catch(()=>{});
   }finally{for(const el of locked)el.disabled=false}
  },{explicitClose:true,keepOpen:true});
  root.querySelector('.pos-dialog118').classList.add('pos-shift-dialog');rootReport();root.querySelector('form').addEventListener('input',refreshVariance);
  root.querySelector('[data-refresh-shift]').onclick=async e=>{const b=e.currentTarget;b.disabled=true;try{guard(h);report=s.sample?sampleReport(s,shift):await h.rpc('pos_shift_report152',{p_shift:shift.id});check();if(report.closedAt){root.resolve108(true);view(report,h);return}rootReport()}catch(err){h.status(err.message,true)}finally{b.disabled=false}};
  root.querySelector('[data-review-shift]').onclick=()=>{if([...root.querySelectorAll('[data-cash-count]')].some(el=>el.value&&!el.reportValidity()))return;const counts=counted();view({...report,cash:report.cash.map(c=>({...c,...(root.querySelector('[data-cash-count="'+c.currency+'"]')?.value?{counted:counts[c.currency],variance:round(counts[c.currency]-c.expected)}:{})}))},h,true)};
  return;
 }
 const opening=action==='open',shift=current(h);if(opening&&shift)throw Error('Your shift is already open.');if(!opening&&!shift)throw Error('Open your shift first');
 const currencies=[...new Set(['LAK','USD','THB',...h.currencies()])],nonce=crypto.randomUUID();
 const body=opening?'<p>Enter the starting money already in your drawer. This is your opening float, not a sale.</p><div class="pos-opening-cash">'+currencies.map(c=>'<label>Starting cash · '+h.esc(c)+' '+(symbols[c]||'')+input('opening_'+c,c==='LAK'?'':'0')+'</label>').join('')+'</div>':'<label>Currency<select name="currency">'+currencies.map(c=>'<option>'+h.esc(c)+'</option>').join('')+'</select></label><label>Cash in (+) / cash out (−)'+input('amount','',true)+'</label><label>Reason<input name="reason" required minlength="3"></label>';
 const root=h.dialog(opening?'Open shift · starting cash':'Cash in / out','<form class="pos-shift-form">'+body+'<button type="submit">'+(opening?'Open shift':'Save movement')+'</button></form>',async data=>{
  check();guard(h);let result;const values=opening?{openingCash:Object.fromEntries(currencies.map(c=>[c,Number(data['opening_'+c])])),openingNonce:nonce}:{...data,shiftId:shift.id};
  if(s.sample){if(opening){result={id:crypto.randomUUID(),cashier:owner,profile:{full_name:h.currentUser()},opening:values.openingCash.LAK,opening_cash:values.openingCash,opened_at:new Date().toISOString()};s.shifts.push(result)}else{if(!Number(data.amount))throw Error('Enter a nonzero cash movement');s.cash.push({id:crypto.randomUUID(),shift_id:shift.id,amount:Number(data.amount),currency:data.currency,kind:'manual',reason:data.reason})}}
  else{result=await h.rpc('pos_manage118',{p_action:action,p_data:values,p_version:0});check();if(opening)s.shifts=[result,...s.shifts.filter(x=>x.id!==result.id)];else s.cash.push(result);await h.load()}
  h.status(opening?'Shift opened with starting cash.':'Cash movement saved.');h.render();
 },{explicitClose:true});root.querySelector('.pos-dialog118').classList.add('pos-shift-dialog');
}
async function history(h){
 const owner=h.owner(),s=h.state;const rows=s.sample?s.shifts.filter(s=>s.closed_at).map(s=>({...s,shift_code:sampleCode(h.state,s),cashier:s.profile?.full_name||'Sample cashier'})):await h.rpc('pos_shift_history152',{});
 if(owner!==h.owner())throw Error('The signed-in cashier changed.');
 const root=h.dialog('Shift receipts','<p>Latest 50 closed shifts. Each receipt keeps its recorded cash count and differences.</p><div class="pos-shift-history">'+rows.map(r=>'<button type="button" data-shift-receipt="'+h.esc(r.id)+'"><strong>'+h.esc(r.shift_code||'Shift')+' · '+h.esc(r.cashier)+'</strong><span>'+h.esc(stamp(r.closed_at))+'</span><span>View / Print</span></button>').join('')+(rows.length?'':'<p>No closed shifts yet.</p>')+'</div>',null,{explicitClose:true});
 root.querySelector('.pos-dialog118').classList.add('pos-shift-dialog');root.querySelector('.pos-shift-history').onclick=async e=>{const b=e.target.closest('[data-shift-receipt]');if(!b)return;b.disabled=true;try{const report=s.sample?sampleReport(s,s.shifts.find(x=>x.id===b.dataset.shiftReceipt)):await h.rpc('pos_shift_report152',{p_shift:b.dataset.shiftReceipt});if(owner!==h.owner())throw Error('The signed-in cashier changed.');view(report,h)}catch(err){h.status(err.message,true)}finally{b.disabled=false}};
}
window.posShifts={open,history,totals,receipt,sampleReport,sampleCode,hasDrawerActivity};
})();
