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
const difference=(v,c)=>v===0?'Balanced':(v<0?'Short ':'Over ')+amount(Math.abs(v),c);
function sampleReport(s,shift){
 if(shift.closing_report)return shift.closing_report;
 const report=totals(shift.opening_cash||{LAK:shift.opening},s.orders.filter(o=>o.data.shiftId===shift.id&&['paid','refunded'].includes(o.status)),s.orders.filter(o=>o.data.refundShiftId===shift.id&&o.status==='refunded'),s.cash.filter(c=>c.shift_id===shift.id));
 return {...report,version:1,shiftId:shift.id,cashierId:shift.cashier,cashier:shift.profile?.full_name||'Sample cashier',openedAt:shift.opened_at,closedAt:shift.closed_at||null,sample:true,reviewToken:JSON.stringify(report)};
}
function receipt(report,esc,width,review=false){
 const row=(a,b)=>'<div class="receipt-row118"><span>'+esc(a)+'</span><span>'+esc(b)+'</span></div>',t=report.totals;
 return '<article class="pos-thermal-paper" style="--receipt-width:'+width+'mm"><div class="paper-brand"><img src="assets/brand/oonjai-logo.png" alt="Oon Jai"><strong>Oon Jai Marketplace</strong><b>'+(review?'SHIFT REVIEW · NOT CLOSED':'CLOSE SHIFT RECEIPT')+'</b>'+(report.sample?'<b>SAMPLE · NOT A LIVE SHIFT</b>':'')+'</div><hr><div>Cashier: '+esc(report.cashier)+'</div><div>Opened: '+esc(stamp(report.openedAt))+'</div><div>Closed: '+esc(report.closedAt?stamp(report.closedAt):'Still open')+'</div><hr>'+row('Paid receipts',t.paidCount)+row('Gross sales',amount(t.grossSales))+row('Discounts',amount(t.discounts))+row('Refunds',amount(t.refunds))+row('Net sales',amount(t.netSales))+row('Tips (net)',amount(t.tips))+row('Total collected',amount(t.collected))+'<hr><b>PAYMENT SUMMARY (₭)</b>'+report.methods.map(m=>row(m.method,amount(m.net))+(m.refunds?row('  Refunds',amount(m.refunds)):'')).join('')+'<hr><b>CASH RECONCILIATION</b>'+report.cash.map(c=>'<hr><b>'+esc(c.currency)+'</b>'+row('Starting cash',amount(c.opening,c.currency))+row('Cash received',amount(c.received,c.currency))+(c.change?row('Change given',amount(c.change,c.currency)):'')+(c.refunds?row('Cash refunds',amount(c.refunds,c.currency)):'')+(c.cashIn?row('Cash in',amount(c.cashIn,c.currency)):'')+(c.cashOut?row('Cash out',amount(c.cashOut,c.currency)):'')+row('Expected cash',amount(c.expected,c.currency))+row('Actual count',c.counted==null?'Not recorded':amount(c.counted,c.currency))+row('Difference',c.variance==null?'Not recorded':difference(c.variance,c.currency))).join('')+'<hr>'+(report.legacy?'<p>Historical shift: foreign cash counts were not recorded.</p>':'')+'<small class="paper-timestamp">Shift '+esc(report.shiftId)+'</small></article>';
}
function summary(report,esc){const t=report.totals;return '<div class="pos-shift-meta"><strong>'+esc(report.cashier)+'</strong><span>'+esc(stamp(report.openedAt))+' → '+(report.closedAt?esc(stamp(report.closedAt)):'Current shift')+'</span></div><div class="pos-shift-summary">'+[['Net sales',t.netSales],['Tips (net)',t.tips],['Total collected',t.collected]].map(([label,n])=>'<div>'+label+'<strong>'+amount(n)+'</strong></div>').join('')+'</div><p>'+t.paidCount+' paid receipts · '+t.refundCount+' refunds · Includes this cashier’s whole shift.</p><div class="pos-shift-table"><table><thead><tr><th>Payment</th><th>Paid (₭)</th><th>Refunds (₭)</th><th>Net (₭)</th></tr></thead><tbody>'+report.methods.map(m=>'<tr><th>'+esc(m.method)+'</th><td>'+posMoney.display(m.paid)+'</td><td>'+posMoney.display(m.refunds)+'</td><td>'+posMoney.display(m.net)+'</td></tr>').join('')+'</tbody></table></div>'}
function input(name,value='',signed=false){return '<input type="text" name="'+name+'" data-pos-money="2" inputmode="decimal" autocomplete="off" value="'+value+'" '+(signed?'':'min="0" ')+'max="999999999999.99" required>'}
function view(report,h,review=false){const root=h.dialog(review?'Shift review':'Close shift receipt',receipt(report,h.esc,h.paperWidth(),review),null,{explicitClose:true});root.querySelector('.pos-dialog118').classList.add('pos-shift-receipt');const print=document.createElement('button');print.type='button';print.textContent=review?'Print review':'Print shift receipt';root.querySelector('[data-close]').before(print);print.onclick=()=>h.runPrintButton(print,()=>h.printPaper(h.paperWidth(),'Shift receipt',receipt(report,h.esc,h.paperWidth(),review)));return root}
function current(h){return h.state.shifts.find(s=>!s.closed_at&&(h.state.sample||s.cashier===h.owner()))}
function guard(h){if(!h.state.sample&&(!navigator.onLine||h.state.offline||h.state.offlineQueue.length))throw Error(h.state.offlineQueue.length?'Sync pending sales before changing the shift.':'Connect to confirm the complete shift totals before changing the shift.')}
async function open(action,h){
 guard(h);const s=h.state,owner=h.owner(),valid=()=>owner===h.owner(),check=()=>{if(!valid())throw Error('The signed-in cashier changed. Reopen the shift.')};
 if(action==='close'){
  const shift=current(h);if(!shift)throw Error('Open your shift first');
  let report=s.sample?sampleReport(s,shift):await h.rpc('pos_shift_report152',{p_shift:shift.id});check();
  if(report.closedAt){view(report,h);return}
  let root;const rootReport=()=>{
   const values=Object.fromEntries([...root.querySelectorAll('[data-cash-count]')].map(el=>[el.dataset.cashCount,el.value]));
   const host=root.querySelector('[data-shift-content]');host.innerHTML=summary(report,h.esc)+'<h4>Count the cash in your drawer</h4><p>Enter each currency separately. BCEL and bank payments are excluded from physical cash.</p><div class="pos-shift-counts">'+report.cash.map(c=>'<section data-count-row="'+h.esc(c.currency)+'"><header><strong>'+h.esc(c.currency)+' · '+(symbols[c.currency]||'')+'</strong><span>Received '+amount(c.received,c.currency)+'</span></header><div><span>Expected<strong>'+amount(c.expected,c.currency)+'</strong></span><label>Actual count'+input('count_'+c.currency,h.esc(values[c.currency]??'')).replace('data-pos-money="2"','data-pos-money="2" data-cash-count="'+h.esc(c.currency)+'"')+'</label><output data-variance>Enter count</output></div><details><summary>Cash breakdown</summary><dl>'+[['Starting cash',c.opening],['Cash received',c.received],['Change given',-c.change],['Cash refunds',-c.refunds],['Cash in',c.cashIn],['Cash out',-c.cashOut]].map(([label,v])=>'<div><dt>'+label+'</dt><dd>'+amount(v,c.currency)+'</dd></div>').join('')+'</dl></details></section>').join('')+'</div>';
   posMoney.bind(root);refreshVariance();
  };
  function refreshVariance(){for(const row of root.querySelectorAll('[data-count-row]')){const el=row.querySelector('input'),currency=row.dataset.countRow,expected=report.cash.find(c=>c.currency===currency).expected,out=row.querySelector('output');const diff=round(posMoney.value(el)-expected);out.textContent=el.value&&el.validity.valid?difference(diff,currency):'Enter count';out.dataset.short=String(!!el.value&&diff<0)}}
  function counted(){return Object.fromEntries([...root.querySelectorAll('[data-cash-count]')].map(el=>[el.dataset.cashCount,posMoney.value(el)]))}
  root=h.dialog('Close shift · reconciliation','<form class="pos-shift-form"><div data-shift-content></div><div class="pos-shift-actions"><button type="button" data-refresh-shift>Refresh totals</button><button type="button" data-review-shift>Print review</button><button type="submit">Confirm close shift</button></div></form>',async()=>{
   check();guard(h);if(!s.sample&&(await h.pending()).length)throw Error('Sync all pending sales before closing.');
   const counts=counted();let result;
   const close=root.querySelector('[data-close]'),locked=[...root.querySelectorAll('input,select,button')];for(const el of locked)el.disabled=true;
   try{
    if(s.sample){const latest=sampleReport(s,shift);if(latest.reviewToken!==report.reviewToken)throw Error('Shift activity changed. Refresh totals and review before closing.');const frozen={...report,closedAt:new Date().toISOString(),cash:report.cash.map(c=>({...c,counted:counts[c.currency],variance:round(counts[c.currency]-c.expected)}))};delete frozen.reviewToken;result={...shift,closed_at:frozen.closedAt,counted:counts.LAK,expected:report.cash.find(c=>c.currency==='LAK').expected,closing_report:frozen};}
    else result=await h.rpc('pos_manage118',{p_action:'close',p_data:{shiftId:shift.id,reviewToken:report.reviewToken,countedCash:counts},p_version:0});
    check();if(!result?.closing_report)throw Error('The close-shift receipt was not returned. Refresh shift receipts before retrying.');
    s.shifts=[result,...s.shifts.filter(x=>x.id!==shift.id)];root.resolve108(true);h.render();view(result.closing_report,h);h.status('Shift closed.');if(!s.sample)h.load().catch(()=>{});
   }finally{for(const el of locked)el.disabled=false}
  },{explicitClose:true,keepOpen:true});
  root.querySelector('.pos-dialog118').classList.add('pos-shift-dialog');rootReport();root.querySelector('form').addEventListener('input',refreshVariance);
  root.querySelector('[data-refresh-shift]').onclick=async e=>{const b=e.currentTarget;b.disabled=true;try{guard(h);report=s.sample?sampleReport(s,shift):await h.rpc('pos_shift_report152',{p_shift:shift.id});check();if(report.closedAt){root.resolve108(true);view(report,h);return}rootReport()}catch(err){h.status(err.message,true)}finally{b.disabled=false}};
  root.querySelector('[data-review-shift]').onclick=()=>{if([...root.querySelectorAll('[data-cash-count]')].some(el=>el.value&&!el.reportValidity()))return;const counts=counted();view({...report,cash:report.cash.map(c=>({...c,...(root.querySelector('[data-cash-count="'+c.currency+'"]').value?{counted:counts[c.currency],variance:round(counts[c.currency]-c.expected)}:{})}))},h,true)};
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
 const owner=h.owner(),s=h.state;const rows=s.sample?s.shifts.filter(s=>s.closed_at).map(s=>({...s,cashier:s.profile?.full_name||'Sample cashier'})):await h.rpc('pos_shift_history152',{});
 if(owner!==h.owner())throw Error('The signed-in cashier changed.');
 const root=h.dialog('Shift receipts','<p>Latest 50 closed shifts. Each receipt keeps its recorded cash count and differences.</p><div class="pos-shift-history">'+rows.map(r=>'<button type="button" data-shift-receipt="'+h.esc(r.id)+'"><strong>'+h.esc(r.cashier)+'</strong><span>'+h.esc(stamp(r.closed_at))+'</span><span>View / Print</span></button>').join('')+(rows.length?'':'<p>No closed shifts yet.</p>')+'</div>',null,{explicitClose:true});
 root.querySelector('.pos-dialog118').classList.add('pos-shift-dialog');root.querySelector('.pos-shift-history').onclick=async e=>{const b=e.target.closest('[data-shift-receipt]');if(!b)return;b.disabled=true;try{const report=s.sample?sampleReport(s,s.shifts.find(x=>x.id===b.dataset.shiftReceipt)):await h.rpc('pos_shift_report152',{p_shift:b.dataset.shiftReceipt});if(owner!==h.owner())throw Error('The signed-in cashier changed.');view(report,h)}catch(err){h.status(err.message,true)}finally{b.disabled=false}};
}
window.posShifts={open,history,totals,receipt,sampleReport};
})();
