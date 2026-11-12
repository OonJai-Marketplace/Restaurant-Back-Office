const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const handlers={},dialogs=[],table={rows:[],tHead:null},scope={isConnected:true,querySelectorAll:()=>[table]};
table.closest=()=>scope;
let opens=0,edits=0,deletes=0,time=1000;
function element(){
 const parts={};
 return {dataset:{},children:[],isConnected:true,append(...els){this.children.push(...els)},querySelector(k){return parts[k]??=element()},setAttribute(){},remove(){this.isConnected=false},
 showModal(){this.open=true;opens++},close(){this.open=false;this.onclose?.()}};
}
const ctx={sessionEpoch121:1,liveProfile:{id:'cashier'},performance:{now:()=>time},window:{deleteCatalog108:async()=>{deletes++}},catalogCan121:()=>true,actionPermission121:()=>true,restaurantModules125:{ensure:async()=>{}},document:{addEventListener:(k,f)=>handlers[k]=f,body:element(),createElement(t){const e=element();if(t==='dialog')dialogs.push(e);return e}}};
vm.createContext(ctx);vm.runInContext(fs.readFileSync('scripts/restaurant-table-rows.js','utf8'),ctx);
const api=ctx.window.restaurantTableRows;
function fixture(name,editable){
 const css=new Set(),cell={textContent:name,querySelectorAll:()=>[],cloneNode:()=>({textContent:name,querySelectorAll:()=>[]})};
 const button={tagName:'BUTTON',textContent:'Edit',dataset:{imAction:'edit-item',imId:name},getAttribute:()=>null,getClientRects:()=>[{}],closest:k=>k==='tr'?row:null,click(){edits++}};
 const row={dataset:{},parentElement:{tagName:'TBODY'},cells:[cell],isConnected:true,getAttributeNames:()=>[],closest:()=>table,classList:{add:k=>css.add(k),remove:k=>css.delete(k)},querySelectorAll:()=>editable?[button]:[],querySelector:k=>editable&&(k.startsWith('[data-im-id]')||k.startsWith('[data-im-action^'))?button:null};
 table.rows.push(row);return {row,css};
}
function fire(which,record,delay=100){
 time+=delay;
 handlers[which]({target:{closest:k=>k==='tr'?record.row:null},clientX:15,clientY:10,preventDefault(){},stopPropagation(){}});
}
(async()=>{
 const a=fixture('Flour',true),b=fixture('Summary total',false);
 fire('click',a);assert.equal(a.css.size,1);assert.equal(opens,0);
 fire('click',b);assert.equal(a.css.size,0);assert.equal(b.css.size,1);assert.equal(opens,0);
 fire('click',b);assert.equal(opens,1);assert.equal(dialogs[0].querySelector('footer').children.length,0);dialogs[0].close();
 fire('click',a,900);a.row.isConnected=false;table.rows.shift();const replacement=fixture('Flour',true);api.restore();assert.equal(replacement.css.size,1);
 fire('click',replacement);const dlg=dialogs.at(-1);assert.equal(opens,2);
 const actions=dlg.querySelector('footer').children;assert.deepEqual(actions.map(b=>b.textContent),['Edit','Delete']);assert.equal(edits+deletes,0);
 await actions[0].onclick();assert.equal(edits,1);
 fire('dblclick',replacement);await dialogs.at(-1).querySelector('footer').children[1].onclick();assert.equal(deletes,1);
 ctx.catalogCan121=()=>false;fire('dblclick',replacement);assert.deepEqual(dialogs.at(-1).querySelector('footer').children.map(b=>b.textContent),['Edit']);api.reset();assert.equal(replacement.css.size,0);
 console.log('PASS single-click selection, double-click and double-tap actions, read-only details, selection after redraw and permission-aware Delete');
})().catch(e=>{console.error(e);process.exitCode=1});
