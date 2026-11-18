const {readFileSync}=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const source=readFileSync('scripts/pos-printer.js','utf8');
function fixture({supported=true,claimFails=false,stall=false}={}){
 const writes=[],calls=[],store=new Map(),events={};
 const device={vendorId:123,productId:456,productName:'Test thermal',serialNumber:'one',opened:false,configuration:null,
 configurations:[{configurationValue:1,interfaces:[{interfaceNumber:2,alternates:[{alternateSetting:0,interfaceClass:7,endpoints:[{direction:'out',type:'bulk',endpointNumber:3}]}]}]}],
 async open(){this.opened=true},async close(){this.opened=false},async selectConfiguration(v){this.configuration={configurationValue:v}},
 async claimInterface(i){calls.push(i);if(claimFails)throw Error('claimed by driver')},async selectAlternateInterface(){},
 async transferOut(ep,data){writes.push([...data]);return {status:stall?'stall':'ok',bytesWritten:data.length}}};
 const pixels=new Uint8ClampedArray(384*2*4).fill(0);for(let i=3;i<pixels.length;i+=4)pixels[i]=255;
 const canvas={width:384,height:2,getContext:()=>({fillRect(){},drawImage(){},getImageData:()=>({data:pixels})})};
 const doc={fonts:{ready:Promise.resolve()},querySelectorAll:()=>[{getBoundingClientRect:()=>({width:200,height:1})}],createElement:()=>({...canvas})};
 const usb={requestDevice:async()=>device,getDevices:async()=>[device],addEventListener:(k,v)=>events[k]=v};
 const ctx={navigator:supported?{usb}:{},localStorage:{getItem:k=>store.get(k),setItem:(k,v)=>store.set(k,v)},Uint8Array,Event:class{},document:{},window:{dispatchEvent(){},html2canvas:async()=>canvas}};
 vm.runInNewContext(source,ctx);return {...ctx,api:ctx.window.posPrinter,device,writes,calls,doc,events};
}
(async()=>{
 const f=fixture();assert.equal(f.api.preference().mode,'unconfigured');await f.api.select();assert.deepEqual(f.calls,[2]);assert.match(f.api.status(),/^Connected/);
 await f.api.printDocument(f.doc,58);assert.deepEqual(f.writes[0],[27,64]);assert.deepEqual(f.writes[1].slice(0,8),[29,118,48,0,48,0,2,0]);assert(f.writes[1].slice(8).every(v=>v===255));
 assert.deepEqual(f.writes.at(-1),[27,100,4]);
 f.events.disconnect({device:f.device});assert.match(f.api.status(),/^Selected/);await f.api.printDocument(f.doc,58);assert.equal(f.calls.length,2);
 await f.api.useSystem();assert.equal(f.device.opened,false);assert.equal(f.api.preference().mode,'system');
 const fail=fixture({claimFails:true});await assert.rejects(fail.api.select,/keep your working driver/);assert.equal(fail.api.preference().mode,'unconfigured');assert.equal(fail.device.opened,false);
 const unsupported=fixture({supported:false});assert.equal(unsupported.api.supported(),false);await assert.rejects(unsupported.api.select,/does not expose USB/);
 const broken=fixture({stall:true});await broken.api.select();await assert.rejects(()=>broken.api.printDocument(broken.doc,58),/partial receipt/);assert.equal(broken.device.opened,false);assert.equal(broken.writes.length,1,'No retry or system-print fallback after data might have been sent');
 const white=new Uint8Array(8*4).fill(255);assert.equal(f.api.rasterBand(white,8,1,0,1)[8],0);white.fill(0);assert.equal(f.api.rasterBand(white,8,1,0,1)[8],0,'Transparent pixels print white');
 const pos=readFileSync('scripts/pos-v118.js','utf8');const sample=pos.slice(pos.indexOf('test.onclick='),pos.indexOf('const onStatus='));assert(!/\bsave\(|\brpc\(|\.issue\(/.test(sample));assert(sample.includes('NOT A SALE'));
 assert(pos.includes("printButton.textContent='Print bill'"));assert(pos.includes('UNPAID BILL · NOT A PAYMENT RECEIPT'));assert(!pos.includes("printButton.dataset.printReceipt='';printButton.disabled=true"));
 console.log('PASS USB permission, endpoint selection, raster encoding, reconnect, disconnect, driver conflict, unsupported device, partial-transfer stop, sample separation and unpaid bill availability');
})().catch(e=>{console.error(e);process.exitCode=1});
