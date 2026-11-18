const vm=require('node:vm'),{readFileSync}=require('node:fs'),assert=require('node:assert/strict');
const ctx={window:{},Intl,Number,Math,Map,Set,JSON,Date};vm.createContext(ctx);for(const file of ['scripts/pos-money.js','scripts/pos-shifts.js']){vm.runInContext(readFileSync(file,'utf8'),ctx);Object.assign(ctx,ctx.window)}
const m=ctx.posMoney;assert.equal(m.edit('1234',4).text,'1,234.00');assert.equal(m.edit('1234',4).caret,5);assert.equal(m.edit('1,234.50',8).text,'1,234.50');assert.equal(m.edit('12,034.00',4).caret,4);assert.equal(m.edit('.5',2).text,'0.50');assert.equal(m.edit('-1234',5).text,'-1,234.00');assert.equal(m.edit('0.000001',8,6).text,'0.000001');assert.equal(m.raw('22,000.25'),'22000.25');assert.equal(m.value({value:'1,234.56'}),1234.56);
const data=ctx.posShifts.totals({LAK:100000,USD:20,THB:300},[
 {data:{payment:'Cash',total:90000,subtotal:90000,tip:10000,collectedTotal:100000,tendered:120000}},
 {data:{payment:'Cash',total:200000,collectedTotal:200000,tendered:1100000,fxTender:{currency:'USD',amount:50}}},
 {data:{payment:'Cash',total:50000,collectedTotal:50000,tendered:65000,fxTender:{currency:'THB',amount:100}}},
 {data:{payment:'BCEL QR',total:200000,collectedTotal:200000,tendered:250000}},
 {data:{payment:'Bank',total:100000,collectedTotal:100000,tendered:100000}}
],[{data:{payment:'Cash',total:20000}},{data:{payment:'BCEL QR',total:10000}}],[{currency:'LAK',amount:1000000},{currency:'USD',amount:-5},{kind:'change',currency:'LAK',amount:-50000}]);
assert.equal(data.cash.find(x=>x.currency==='LAK').expected,215000);assert.equal(data.cash.find(x=>x.currency==='USD').expected,65);assert.equal(data.cash.find(x=>x.currency==='THB').expected,400);assert.equal(data.totals.collected,620000);
console.log('PASS comma/decimal editing, caret position, signed cash, fractional FX rates and sample reconciliation');
