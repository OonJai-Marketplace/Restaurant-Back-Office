const fs=require('fs'),vm=require('vm'),assert=require('node:assert/strict');
const source=fs.readFileSync('scripts/inventory-menu-v104.js','utf8');
function fixture(rows,beforeRead=async()=>{}){
 const c={window:{},console,AbortController,liveProfile:{id:'owner'},sessionEpoch121:1,readEpoch125:0,readController125:null,loadJob132:null,state:{owner:null,loaded:false,busy:false,moves:[]},tables:{items:'inventory_items104',moves:'inventory_movements104'},restaurantCan:()=>true,rendered:()=>false,render(){},calls:[]};
 c.ojmDb={from(table){const q={start:0,end:999,select(){return this},order(){return this},range(a,b){this.start=a;this.end=b;return this},abortSignal(){return this},async then(resolve,reject){try{c.calls.push([table,this.start,this.end]);await beforeRead(table,this.start,c);resolve({data:(rows[table]||[]).slice(this.start,this.end+1)})}catch(e){reject(e)}}};return q}};
 vm.createContext(c);vm.runInContext(source.slice(source.indexOf(' function load('),source.indexOf(' async function save(')),c);return c;
}
(async()=>{
 const rows={inventory_items104:[{id:'item'}],inventory_movements104:Array.from({length:1205},(_,i)=>({id:String(i),data:{quantity:1}})),pos_stock118:Array.from({length:1102},(_,i)=>({id:'s'+i,created_at:'2026-10-18T00:00:00Z',quantity:1,item_id:'item',order_id:'o'+i}))};
 let c=fixture(rows);await c.load();assert.equal(c.state.moves.length,2307,'Stock must include every inventory movement and POS deduction beyond the API page limit');console.log('PASS Complete ledger pagination');
 c=fixture(rows,async(table,start,c)=>{if(table==='pos_stock118'&&start===0){c.liveProfile={id:'other'};c.sessionEpoch121++;c.readEpoch125++;c.state={owner:'other',loaded:false,moves:[]}}});await c.load();assert.equal(c.state.loaded,false);assert.equal(c.state.moves.length,0);assert.equal(c.state.owner,'other');console.log('PASS Late stock response cannot enter another session');
 c=fixture(rows,async(table,start)=>{if(table==='pos_stock118'&&start>0)throw Error('Network failed on second page')});await c.load();assert.equal(c.state.loaded,false);assert.equal(c.state.moves.length,0);assert.match(c.state.error,/Network/);console.log('PASS Interrupted pagination does not publish a partial balance');
 console.log('COMPLETE 3');
})().catch(e=>{console.error(e);process.exitCode=1});
