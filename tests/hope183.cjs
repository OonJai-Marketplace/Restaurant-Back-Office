// Run with NODE_PATH pointing to jsdom@26.1.0 installed in the validation environment.
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {JSDOM}=require('jsdom');
const tick=()=>new Promise(r=>setImmediate(r));
async function settle(check){for(let i=0;i<30;i++){if(check())return;await tick();}throw Error('UI did not settle');}
async function publicForm(){
 const html=fs.readFileSync('public-restaurant/index.html','utf8');
 const dom=new JSDOM(html,{url:'https://oonjai-marketplace.github.io/Restaurant-Back-Office/public-restaurant/',runScripts:'outside-only',pretendToBeVisual:true}),w=dom.window;
 const requests=[];let fail=true;
 w.fetch=async(_,options)=>{requests.push(JSON.parse(options.body));if(fail)throw Error('Offline');return {ok:true,json:async()=>({saved:true,id:requests.at(-1).id})};};
 w.confirm=()=>true;w.eval(fs.readFileSync('public-restaurant/hope183.js','utf8'));w.OonJaiHopePublic183.setup();
 const form=w.document.getElementById('customForm'),message=w.document.getElementById('message'),name=w.document.getElementById('name'),submit=w.document.getElementById('submitBtn');
 message.value='ຂໍໃຫ້ມີຄວາມສຸກໃນທຸກໆມື້';name.value='Test';message.dispatchEvent(new w.Event('input',{bubbles:true}));
 form.dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));await settle(()=>!submit.disabled);assert.match(w.document.getElementById('statusMsg').textContent,/draft is kept/);assert.equal(message.value,requests[0].message);
 const saved=JSON.parse(w.localStorage.getItem('oonjai_hope_draft183'));assert.equal(saved.id,requests[0].id);
 fail=false;form.dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));form.dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));await settle(()=>!submit.disabled);
 assert.equal(requests.length,2);assert.equal(requests[0].id,requests[1].id);assert.equal(message.value,'');assert.equal(w.localStorage.getItem('oonjai_hope_draft183'),null);assert.match(w.document.getElementById('statusMsg').textContent,/received for review/);dom.window.close();
 console.log('PASS: Lao input, retained drafts, duplicate-click protection, retry ID, confirmed success');
}
async function inbox(){
 const dom=new JSDOM('<html><head></head><body></body></html>',{url:'https://oonjai-marketplace.github.io/Accounting/desktop.html',runScripts:'outside-only',pretendToBeVisual:true}),w=dom.window;
 w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};w.HTMLDialogElement.prototype.close=function(){this.open=false;this.dispatchEvent(new w.Event('close'));};
 w.liveProfile={id:'actor',role:'admin',status:'active'};let authCallback;w.ojmDb={auth:{getSession:async()=>({data:{session:{access_token:'test'}}}),onAuthStateChange:cb=>{authCallback=cb;return {data:{subscription:{unsubscribe(){}}}}}}};
 let read=false,opened=false;const calls=[];
 w.fetch=async(_,opts)=>{const b=JSON.parse(opts.body);calls.push(b.action);if(b.action==='mark-read'){assert(w.document.querySelector('.hope-detail183'),'receipt requires visible detail');read=true;return {ok:true,json:async()=>({read:true})};}if(b.action==='open'){opened=true;return {ok:true,json:async()=>({row:{message:'<img src=x onerror=alert(1)>',consent:false}})};}return {ok:true,json:async()=>({unread:read?0:1,pending:0,latest:'one',rows:b.action==='list'?[{id:'one',display_name:'<b>Guest</b>',created_at:'2026-10-26T00:00:00Z',preview:'Encouragement',unread:true}]:[]})};};
 w.eval(fs.readFileSync('scripts/word-of-hope183.js','utf8'));await settle(()=>w.WordOfHope183.notices().length===1);w.WordOfHope183.open();await settle(()=>w.document.querySelector('.hope-row183'));
 assert.equal(read,false);assert.equal(opened,false);w.document.querySelector('.hope-row183>button').click();await settle(()=>read);assert(!w.document.querySelector('.hope-detail183 img'));assert.match(w.document.querySelector('.hope-detail183').textContent,/<img/);
 w.liveProfile=null;authCallback('SIGNED_OUT',null);assert.equal(w.WordOfHope183.notices().length,0);assert.equal(w.document.querySelector('dialog'),null);dom.window.close();console.log('PASS: inbox opening preserves unread, detail precedes receipt, escaped content, logout clears private state');
}
(async()=>{await publicForm();await inbox();})().catch(e=>{console.error(e);process.exit(1);});
