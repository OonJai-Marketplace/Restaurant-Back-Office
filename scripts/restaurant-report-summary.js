/* Summaries use each payment event once, independently of the number of menu lines. */
var restaurantReportSummary = (() => {
 const cents=v=>Math.round((Number(v)||0)*100);
 function rows(events){
  let gross=0,discount=0,refunds=0,fxNet=0,drawerChange=0;
  const adjustments=new Map();
  const methods=new Map(['Cash','BCEL QR','Bank'].map(name=>[name,0])),currencies=new Map();
  for(const {order,refund} of events){
   const d=order.data,net=cents(d.total),sign=refund?-1:1,method=d.payment||'Unspecified';
   const before=d.subtotal==null?(d.lines?.length?d.lines.reduce((v,l)=>v+cents(l.quantity*l.unitPrice),0):net+cents(d.discount)):cents(d.subtotal);
   if(refund)refunds+=net;else {gross+=before;discount+=before-net}
   methods.set(method,(methods.get(method)||0)+sign*net);
   const fx=d.fxTender;if(!fx)continue;
   fxNet+=sign*net;
   if(refund)continue; // The refund reverses the sale; its foreign tender was received only once.
   const v=currencies.get(fx.currency)||{amount:0,lak:0,change:0};
   v.amount+=cents(fx.amount);v.lak+=cents(fx.equivalentLak);v.change+=cents(fx.changeLak);
   currencies.set(fx.currency,v);if(method!=='Cash'){
    const change=cents(fx.changeLak);drawerChange+=change;
    adjustments.set(method,(adjustments.get(method)||0)+change);
   }
  }
  return [
   ['Sales summary','LAK'],['Gross sales',gross/100],['Discounts on sales',discount/100],['Refunds after discounts',refunds/100],['Net sales',(gross-discount-refunds)/100],[],
   ['Payment method','Net sales (LAK)','Net received after kip change (LAK)'],
   ...[...methods].map(([method,value])=>[method,value/100,(value+(method==='Cash'?-drawerChange:adjustments.get(method)||0))/100]),[],
   ['Foreign-currency payments','Net sales (LAK), included above'],['Paid in foreign currency',fxNet/100],
   ['Currency','Foreign amount received','Valuation at recorded rates (LAK)','Change given (LAK)'],
   ...[...currencies].map(([currency,v])=>[currency,v.amount/100,v.lak/100,v.change/100]),
   ['Total foreign tender valued (LAK)',[...currencies.values()].reduce((s,v)=>s+v.lak,0)/100],
   ['Cash change on foreign bank or QR payments (LAK)',drawerChange/100]
  ];
 }
 function table(rows,esc){return '<table class="sales-summary"><tbody>'+rows.filter(r=>r.length).map(r=>'<tr>'+r.map(v=>'<td>'+esc(typeof v==='number'?v.toLocaleString('en-US',{maximumFractionDigits:2}):String(v))+'</td>').join('')+'</tr>').join('')+'</tbody></table>'}
 function localReference(o){
  return o.id?'R-L'+String(o.id).replaceAll('-','').toUpperCase():'';
 }
 function receiptNumber(o){
  if(o.data?.receiptCode)return o.data.receiptCode;
  if(o.offlinePending)return localReference(o);
  if(o.data?.offlineNonce?.startsWith('receipt-'+o.id+':')||(!Number(o.number)&&o.id))return 'R-L'+String(o.id).replaceAll('-','').toUpperCase();
  return o.number==null?'':'R-'+o.number;
 }
 return {rows,table,receiptNumber,localReference};
})();
