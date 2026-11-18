const {readFileSync}=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const source=readFileSync('scripts/pos-v118.js','utf8');
function fixture(mode='usb',fail=false){
 const frames=[],calls=[],timers=[];
 const doc={documentElement:{clientWidth:1024,clientHeight:768},fonts:{ready:Promise.resolve()},images:[],open(){},write(html){this.html=html},close(){},createElement(){return {}},head:{append(){}},querySelectorAll(){return [{getBoundingClientRect:()=>({height:300})}]}};
 const sheet={cssRules:[{cssText:'article.pos-thermal-paper{width:56mm}'}]};
 const document={documentElement:{clientWidth:1024,clientHeight:768},baseURI:'https://example.test/',querySelector:()=>({sheet}),body:{append(f){frames.push(f)}},createElement(){return {style:{},attrs:{},setAttribute(k,v){this.attrs[k]=v},contentDocument:doc,contentWindow:{focus(){throw Error('Print must never focus its iframe')},addEventListener(name,fn){this[name]=fn},print(){calls.push('system')}},remove(){this.removed=true}}}};
 const context={document,window:{},navigator:{userAgent:'Android Chrome'},posPrinter:{preference:()=>({mode}),async printDocument(d,w){calls.push(['usb',w]);if(fail)throw Error('USB disconnected');return 'Printed'}},esc:v=>v,setTimeout(fn,ms){timers.push({fn,ms})},Promise,Math,Array};
 vm.createContext(context);
 vm.runInContext(source.slice(source.indexOf('function receiptStyleText(){'),source.indexOf('function isolateReceiptPreviews('))+source.slice(source.indexOf('async function printPaper('),source.indexOf('function settings(){')),context);
 return {context,doc,frames,calls,timers};
}
(async()=>{
 const usb=fixture();for(let i=0;i<3;i++)await usb.context.printPaper(56,'Bill','<article>Unpaid bill</article>');
 assert.equal(usb.frames.length,3);assert(usb.frames.every(f=>f.removed));assert.equal(usb.calls.length,3);
 assert(usb.frames.every(f=>f.tabIndex===-1&&f.attrs['aria-hidden']==='true'));
 assert.match(usb.frames[0].style.cssText,/width:1024px;height:768px/);assert(!usb.frames[0].style.cssText.includes('10000'));
 assert.match(usb.doc.html,/name="viewport" content="width=device-width,initial-scale=1"/);assert(!/body\{width:/.test(usb.doc.html));
 const system=fixture('system');await system.context.printPaper(58,'Bill','<article>Bill</article>');assert.deepEqual(system.calls,['system']);system.frames[0].contentWindow.afterprint();assert(system.frames[0].removed);
 const fail=fixture('usb',true);await assert.rejects(()=>fail.context.printPaper(56,'Bill',''),/disconnected/);assert(fail.frames[0].removed);assert.equal(fail.calls.length,1);
 const cur={Intl,S:{config:{}},n:v=>Number(v)||0,fmt:v=>new Intl.NumberFormat('en-US',{maximumFractionDigits:2}).format(v),esc:v=>String(v).replaceAll('<','&lt;')};vm.createContext(cur);
 vm.runInContext(source.slice(source.indexOf('function availableCurrencies(){'),source.indexOf('function receipts(){')),cur);
 assert.equal(JSON.stringify(cur.acceptedCurrencies()),'["USD","THB"]');assert.equal(JSON.stringify(cur.acceptedCurrencies({fxCurrencies:['EUR','EUR','LAK','INVALID']})),'["EUR"]');assert.equal(cur.acceptedCurrencies({fxCurrencies:[]}).length,0);
 const html=cur.fxSummary({currency:'USD',amount:50,rate:21000,equivalentLak:1050000,changeLak:50000});assert.equal((html.match(/<span>/g)||[]).length,2);assert.match(html,/\$50 = ₭1,050,000/);assert.match(html,/Change: ₭50,000/);assert(!/USD|LAK/.test(html));
 assert.match(cur.fxSummary({currency:'USD',amount:1,equivalentLak:21000,changeLak:-1000}),/Still due: ₭1,000/);
 console.log('PASS repeated USB/system printing without focus, stable iframe viewport, frame cleanup, saved currency choices and compact FX receipt');
})().catch(e=>{console.error(e);process.exitCode=1});
