/* Shared calculation rules for the Sales workspace. No network or browser state. */
((root)=>{'use strict';
 const finite=v=>v!==null&&v!==undefined&&v!==''&&Number.isFinite(Number(v));
 const num=v=>finite(v)?Number(v):null;
 const day=v=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Vientiane',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(v));
 const round=v=>Math.round((v+Number.EPSILON)*100)/100;
 function period(from,to){
  if(!/^\d{4}-\d{2}-\d{2}$/.test(from)||!/^\d{4}-\d{2}-\d{2}$/.test(to))throw Error('Choose valid dates.');
  const a=Date.parse(from),b=Date.parse(to),days=(b-a)/86400000+1;
  if(!Number.isFinite(days)||days<1||days>366||new Date(a).toISOString().slice(0,10)!==from||new Date(b).toISOString().slice(0,10)!==to)throw Error('Choose a valid period of at most 366 days.');
  return {from,to,days,previousFrom:new Date(a-days*86400000).toISOString().slice(0,10),previousTo:new Date(a-86400000).toISOString().slice(0,10)};
 }
 function recipeCost(id,catalog,seen=new Set(),choices=null){
  const m=catalog.menu.find(x=>x.id===id)?.data;
  if(!m||seen.has(id)||seen.size>12)return {amount:null,reason:'Missing or circular recipe'};
  if(m.recipeReview135?.length)return {amount:null,reason:'Recipe quantities need review'};
  const next=new Set(seen).add(id);let total=0;
  const lines=[...(m.recipe||[])];
  if((m.posOptions118||[]).length&&choices===null)return {amount:null,reason:'Select recipe options to cost this item'};
  for(const group of m.posOptions118||[]){
   const selected=choices?.[group.id]||[];
   if(selected.length<Number(group.min||0))return {amount:null,reason:'Required recipe options are missing'};
   for(const optionId of selected){const option=group.options?.find(x=>x.id===optionId);if(!option||!option.recipe?.length)return {amount:null,reason:'Option recipe is incomplete'};lines.push(...option.recipe.map(r=>({...r,option:true})));}
  }
  if(!lines.length)return {amount:null,reason:'No saved recipe quantities'};
  for(const line of lines){
   const q=num(line.quantity);if(q===null||q<=0)return {amount:null,reason:'Invalid recipe quantity'};
   if(m.itemType==='bundle'&&!line.option){const child=catalog.menu.find(x=>x.id===line.itemId)?.data;if(child?.currency!==m.currency)return {amount:null,reason:'Mixed recipe currencies'};const c=recipeCost(line.itemId,catalog,next);if(c.amount===null)return c;total+=q*c.amount;}
   else{const d=catalog.ingredients.find(x=>x.id===line.itemId)?.data,c=num(d?.cost);if(!d||c===null||c<=0||d.unitReview135)return {amount:null,reason:'Ingredient price or unit needs review'};if(d.currency!==m.currency)return {amount:null,reason:'Mixed recipe currencies'};total+=c*q;}
  }
  return {amount:total,reason:''};
 }
 function assumptions(input={}){
  const a={type:'percent',value:0,fee:0,feeBasis:'discounted',packaging:0,tax:0,target:20,...input};
  for(const k of ['value','fee','packaging','tax','target']){a[k]=num(a[k]);if(a[k]===null||a[k]<0)throw Error('Enter nonnegative numbers for discount, fees, packaging, tax and margin.');}
  if(!['percent','amount','price'].includes(a.type)||!['discounted','original'].includes(a.feeBasis)||a.fee>100||a.tax>100||a.target>=100||(a.type==='percent'&&a.value>100))throw Error('Check percentage limits and promotion type. Target margin must be below 100%.');
  return a;
 }
 function simulate(price,cost,input){
  const a=assumptions(input);price=num(price);cost=num(cost);
  if(price===null||price<=0)return {status:'unknown',reason:'Selling price is missing'};
  const raw=a.type==='percent'?price*(1-a.value/100):a.type==='amount'?price-a.value:a.value;
  if(raw<0||raw>price)return {status:'invalid',reason:'Offer must be between zero and the normal price'};
  const promo=round(raw),net=promo/(1+a.tax/100),fees=(a.feeBasis==='original'?price:promo)*a.fee/100;
  if(cost===null||cost<0)return {promo,net,fees,status:'unknown',reason:'Cost incomplete'};
  const left=net-cost-a.packaging-fees,margin=net>0?left/net*100:null;
  const status=left<-.005?'loss':left<=.005?'break-even':margin>=a.target-1e-8?'good':'low';
  const denominator=(1-a.target/100)/(1+a.tax/100)-(a.feeBasis==='discounted'?a.fee/100:0);
  const floor=denominator>0?(cost+a.packaging+(a.feeBasis==='original'?price*a.fee/100:0))/denominator:null;
  const safe=floor!==null&&floor<=price;
  const original=price/(1+a.tax/100)-cost-a.packaging-price*a.fee/100;
  return {promo,net,fees,left,margin,status,floor,safe,maxDiscount:safe?Math.max(0,100*(1-floor/price)):null,extraUnitsPercent:left>0&&original>0?Math.max(0,(original/left-1)*100):null};
 }
 // Receipt discounts are allocated proportionally, preserving the exact receipt total.
 function allocate(lines,total){
  const bases=lines.map(l=>{const q=num(l.quantity),p=num(l.unitPrice);if(q===null||q<=0||p===null||p<0)throw Error('A receipt contains an invalid quantity or price.');return round(q*p)}),sum=bases.reduce((a,b)=>a+b,0);
  if(total<0||!finite(total)||(!sum&&total!==0)||total>sum+.02)throw Error('Receipt totals do not match its menu lines.');
  let used=0;return bases.map((base,i)=>{const v=i===bases.length-1?round(total-used):round(sum?total*base/sum:0);used=round(used+v);return v;});
 }
 function summarize(orders,catalog,from,to,service='All',input={}){
  const range=period(from,to),a=assumptions(input),seen=new Set();
  const products=new Map(catalog.menu.filter(m=>m.data.currency==='LAK'&&m.data.stage131!=='archived').map(m=>[m.id,{id:m.id,name:m.data.name,category:m.data.category||'',units:0,sales:0,cost:0,contribution:0,incomplete:false,refunded:0,orders:0,active:m.data.active!==false}]));
  const days=Array.from({length:range.days},(_,i)=>({date:new Date(Date.parse(from)+i*86400000).toISOString().slice(0,10),sales:0,contribution:0,incomplete:false,orders:0})),byDay=new Map(days.map(d=>[d.date,d]));
  const out={sales:0,discounts:0,refunds:0,orders:0,units:0,cost:0,contribution:0,unknownOrders:0,excludedCurrency:0,days,products:[],hasSales:false};
  for(const order of orders){
   if(seen.has(order.id)||order.offlinePending||!['paid','refunded'].includes(order.status)||!order.paid_at)continue;seen.add(order.id);
   const d=order.data||{},date=day(order.paid_at);if(date<from||date>to||(service!=='All'&&d.service!==service))continue;
   if(d.currency!=='LAK'){out.excludedCurrency++;continue;}
   const total=num(d.total),discount=num(d.discount),lines=d.lines;
   if(total===null||discount===null||total<0||discount<0||!Array.isArray(lines)||!lines.length)throw Error('A receipt has missing totals or menu lines. Review it before reporting.');
   const allocated=allocate(lines,total),daily=byDay.get(date);let unknown=false;
   const refund=order.status==='refunded',restocked=refund&&d.restocked===true;
   if(refund)out.refunds+=total;else{out.sales+=total/(1+a.tax/100);out.discounts+=discount;out.orders++;daily.orders++;out.hasSales=true;}
   for(let i=0;i<lines.length;i++){
    const line=lines[i],q=Number(line.quantity),sales=refund?0:allocated[i]/(1+a.tax/100),original=Number(line.unitPrice)*q;
    let p=products.get(line.menuId);if(!p){p={id:line.menuId,name:line.name||'Removed menu item',category:'',units:0,sales:0,cost:0,contribution:0,incomplete:false,refunded:0,orders:0,active:false};products.set(p.id,p);}
    const snapshot=line.cost143,unit=snapshot?.basis==='ingredient-recipe'&&snapshot.currency==='LAK'?num(snapshot.unitCost):null;
    const c=restocked?0:unit===null?null:unit*q;
    const pack=restocked?0:a.packaging*q;
    // Fee estimates are retained on refunds unless an actual fee reversal is recorded separately.
    const fees=(a.feeBasis==='original'?original:allocated[i])*a.fee/100;
    p.sales+=sales;daily.sales+=sales;if(refund)p.refunded+=q;else{p.units+=q;p.orders++;out.units+=q;}
    if(c===null){unknown=true;p.incomplete=true;daily.incomplete=true;}
    else{const contribution=sales-c-pack-fees;p.cost+=c;p.contribution+=contribution;daily.contribution+=contribution;out.cost+=c;out.contribution+=contribution;}
   }
   if(unknown)out.unknownOrders++;
  }
  out.products=[...products.values()];if(out.unknownOrders){out.cost=null;out.contribution=null;}
  out.averageOrder=out.orders?out.sales/out.orders:null;return out;
 }
 function campaign(current,baseline,spend){
  spend=num(spend);if(spend===null||spend<0)throw Error('Enter a nonnegative campaign spend.');
  if(current.contribution===null||baseline.contribution===null||!current.hasSales||!baseline.hasSales)return {incremental:null,roi:null};
  const incremental=current.contribution-baseline.contribution-spend;
  return {incremental,roi:spend>0?incremental/spend*100:null};
 }
 function returns(summary,overhead,capital){
  overhead=num(overhead);capital=num(capital);
  if(overhead===null||overhead<0||capital===null||capital<0)throw Error('Enter nonnegative period overhead and invested capital.');
  if(summary.contribution===null||!summary.hasSales)return {operating:null,roi:null,breakEven:null};
  const operating=summary.contribution-overhead,rate=summary.sales>0?summary.contribution/summary.sales:0;
  return {operating,roi:capital>0?operating/capital*100:null,breakEven:rate>0?overhead/rate:null};
 }
 const api={finite,num,round,day,period,recipeCost,assumptions,simulate,allocate,summarize,campaign,returns};
 root.salesMath143=api;if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof window==='undefined'?globalThis:window);
