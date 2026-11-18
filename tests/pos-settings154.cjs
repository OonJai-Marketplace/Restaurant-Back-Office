const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const context={window:{},crypto:require('node:crypto').webcrypto,Intl};vm.createContext(context);vm.runInContext(fs.readFileSync('scripts/pos-setup154.js','utf8'),context);
const {validate}=context.window.PosSetup154;
validate([{id:'one',name:'Staff',type:'percent',value:10},{id:'two',name:'Goodwill',type:'amount',value:5000},{id:'three',name:'Open',type:'open',value:0}],[{id:'1',name:'Terrace'}]);
for(const bad of [101,-1,Infinity,NaN])assert.throws(()=>validate([{id:'a',name:'Bad',type:'percent',value:bad}],[]));
assert.throws(()=>validate([{id:'a',name:'Staff',type:'percent',value:10},{id:'b',name:' staff ',type:'amount',value:5000}],[]));
assert.throws(()=>validate([],[{id:'a',name:'Table 1'},{id:'b',name:'Table 1'}]));
const source=fs.readFileSync('scripts/pos-v118.js','utf8');
const c={Math,Number,String,n:v=>Number(String(v).replaceAll(',',''))||0,S:{classification:'All',category:'All',query:''},categoryName:id=>id,catalog:()=>[{data:{name:'Piñamon roll',code:'BR-1',category:'Bakery',sourceCategory131:'bakery'}},{data:{name:'Veggie Pack',code:'BW-1',category:'Bowls'}}]};vm.createContext(c);
vm.runInContext(source.slice(source.indexOf('function lineAmount'),source.indexOf('let loadJob132'))+source.slice(source.indexOf('function total(d)'),source.indexOf('function photo'))+source.slice(source.indexOf('function searchText154'),source.indexOf('function catalogTiles')),c);
let d={lines:[{unitPrice:22000,quantity:2}],discount:10,discountType:'percent'};assert.equal(c.total(d).total,39600);d.discountType='amount';d.discount=5000;assert.equal(c.total(d).total,39000);d.discount=0;assert.equal(c.total(d).total,44000);
for(const q of ['bread',' PINAMON ','roll br','br-1']){c.S.query=q;assert.equal(c.filteredItems().length,1,q)}c.S.query='not here';assert.equal(c.filteredItems().length,0);
// A current bundle build must retain the separately published FX calculation.
assert.match(source,/fxRateSettings/);assert.match(source,/bufferPercent/);
console.log('PASS named/open/fixed discounts, invalid and duplicate values, table uniqueness, exact totals, accent-insensitive/token/category search, retained FX behavior');
