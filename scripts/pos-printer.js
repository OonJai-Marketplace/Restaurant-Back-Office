/* Device-local ESC/POS USB printing. No background scan, receipt storage or automatic retry. */
(()=>{'use strict';
const key='restaurant-printer151';
let device=null,port=null,busy=false;
function capabilities(){
 const ua=navigator.userAgent||'',ipad=/iPad|iPhone/.test(ua)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1),android=/Android/.test(ua),embedded=android&&/; wv\)/.test(ua);
 const platform=ipad?'iPad / iPhone':android?(embedded?'Android app':'Android website'):/Windows/.test(ua)?'Windows':/Mac/.test(ua)?'Mac':'This device';
 let permitted=true;try{permitted=(document.permissionsPolicy||document.featurePolicy)?.allowsFeature('usb')!==false}catch{}
 const usb=window.isSecureContext!==false&&permitted&&!!navigator.usb?.requestDevice;
 const system=!embedded&&typeof window.print==='function';
 const reason=window.isSecureContext===false?'Open the secure HTTPS POS address to request printer permission.':!permitted?'This page is not allowed to request USB access. Open the POS directly in its own browser tab.':embedded?'This installed Android app needs a native printer connection. Its web screen cannot discover USB or Bluetooth printers.':ipad?'This browser does not expose direct USB printer access. AirPrint opens the device print window; direct printing needs a compatible native or local printer connection.':android?'This Android browser does not expose USB access. Open the POS directly in an up-to-date Chrome browser.':'This browser does not expose USB access. A compatible browser or a native/local printer connection is required for direct printing.';
 return {platform,usb,system,guide:usb?(android?'Connect the thermal printer by USB using the tablet’s USB host/OTG connection.':'Connect the thermal printer by USB to this device.')+' Tap Find USB printer and allow access. Direct printing supports compatible ESC/POS printers; the device brand does not determine compatibility.':reason};
}
const supported=()=>capabilities().usb;
function preference(){try{return JSON.parse(localStorage.getItem(key))||{mode:'unconfigured'}}catch{return {mode:'unconfigured'}}}
function save(value){localStorage.setItem(key,JSON.stringify(value))}
function describe(d){return d.productName||'USB receipt printer'}
function matches(d,p){return d.vendorId===p.vendorId&&d.productId===p.productId&&(!p.serialNumber||d.serialNumber===p.serialNumber)}
function endpoint(d){
 for(const c of d.configurations||[])for(const i of c.interfaces)for(const a of i.alternates){
  const out=a.endpoints.find(e=>e.direction==='out'&&e.type==='bulk');
  if(out&&(a.interfaceClass===7||a.interfaceClass===255))return {configuration:c.configurationValue,interface:i.interfaceNumber,alternate:a.alternateSetting,endpoint:out.endpointNumber};
 }
 throw Error('This device has no supported USB receipt-printer connection. Use the tablet’s system printer instead.');
}
async function close(){const old=device;device=null;port=null;if(old?.opened)try{await old.close()}catch{}}
async function connect(d){
 const next=endpoint(d);await close();
 try{
  await d.open();
  if(d.configuration?.configurationValue!==next.configuration)await d.selectConfiguration(next.configuration);
  await d.claimInterface(next.interface);
  await d.selectAlternateInterface(next.interface,next.alternate);
  device=d;port=next;
 }catch(error){if(d.opened)try{await d.close()}catch{}
  throw Error('USB access failed. Close other apps using this printer and check the USB cable and permission. If its installed driver controls it, choose System printing; keep your working driver. '+(error.message||''));
 }
}
async function authorized(){
 if(!supported())return [];
 return (await navigator.usb.getDevices()).filter(d=>{try{endpoint(d);return true}catch{return false}});
}
async function select(existing=null){
 if(busy)throw Error('Wait for the current print job.');
 if(!supported())throw Error('This app/browser does not expose USB printer access. Use System printing on this device.');
 // requestDevice runs inside the cashier’s tap, before any other awaited work.
 busy=true;
 try{
  const chosen=existing||await navigator.usb.requestDevice({filters:[{classCode:7},{classCode:255}]});
  if(existing&&!(await authorized()).some(d=>matches(d,existing)))throw Error('This printer is no longer connected or permitted. Tap Find USB printer again.');
  await connect(chosen);save({mode:'usb',vendorId:chosen.vendorId,productId:chosen.productId,serialNumber:chosen.serialNumber||'',name:describe(chosen)});return describe(chosen);
 }catch(error){if(error.name!=='NotFoundError')await close();throw error}finally{busy=false}
}
async function useSystem(){if(busy)throw Error('Wait for the current print job.');save({mode:'system'});await close()}
async function reconnect(){
 const p=preference();
 if(device?.opened&&port&&matches(device,p))return;
 if(!supported())throw Error('USB printing is unavailable here. Open Configure Printing and choose System printing.');
 const devices=(await navigator.usb.getDevices()).filter(d=>matches(d,p));
 if(devices.length!==1)throw Error('The selected USB printer is disconnected or needs permission. Open Configure Printing → Find USB printer.');
 await connect(devices[0]);
}
function status(){const p=preference();if(p.mode==='unconfigured')return 'Choose a printer connection below';return p.mode==='usb'?(device?.opened?'Connected: ':'Selected: ')+(p.name||'USB printer'):'System printing · choose printer in the print window'}
let renderer;
function loadRenderer(){
 if(window.html2canvas)return Promise.resolve(window.html2canvas);
 if(!renderer)renderer=new Promise((resolve,reject)=>{const script=document.createElement('script');script.src=new URL('vendor/html2canvas-1.4.1.min.js',document.baseURI);script.onload=()=>resolve(window.html2canvas);script.onerror=()=>{renderer=null;script.remove();reject(Error('The receipt renderer could not load. Connect once to download it, or choose System printing.'))};document.head.append(script)});
 return renderer;
}
// GS v 0 raster bands: render all scripts/currencies as pixels, not an ASCII code page.
function rasterBand(pixels,width,height,start,rows){
 const bytes=Math.ceil(width/8),out=new Uint8Array(8+bytes*rows);
 out.set([0x1d,0x76,0x30,0,bytes&255,bytes>>8,rows&255,rows>>8]);
 for(let y=0;y<rows;y++)for(let x=0;x<width;x++){
  const at=((start+y)*width+x)*4,alpha=pixels[at+3]/255;
  const luminance=(.299*pixels[at]+.587*pixels[at+1]+.114*pixels[at+2])*alpha+255*(1-alpha);
  if(luminance<180)out[8+y*bytes+(x>>3)]|=0x80>>(x%8);
 }
 return out;
}
async function send(bytes){
 for(let at=0;at<bytes.length;){
  const part=bytes.subarray(at,Math.min(at+4096,bytes.length));
  const result=await device.transferOut(port.endpoint,part);
  if(result.status!=='ok'||!(result.bytesWritten>0)||result.bytesWritten>part.length)throw Error('The USB printer stopped accepting data.');
  at+=result.bytesWritten;
 }
}
async function printDocument(doc,width){
 if(busy)throw Error('A print job is already in progress.');
 busy=true;let started=false;
 try{
  await reconnect();const render=await loadRenderer();
  await doc.fonts?.ready;
  const dots=width===80?576:384;
  for(const article of doc.querySelectorAll('article')){
   const rect=article.getBoundingClientRect();
   if(!rect.width||rect.height*dots/rect.width>16000)throw Error('This receipt is too long for direct USB printing. Choose System printing.');
   const canvas=await render(article,{backgroundColor:'#fff',scale:dots/rect.width,logging:false,imageTimeout:5000});
   // Normalize rounding to the exact printer dot width.
   const normalized=doc.createElement('canvas');normalized.width=dots;normalized.height=canvas.height;
   const context=normalized.getContext('2d');context.fillStyle='#fff';context.fillRect(0,0,dots,canvas.height);context.drawImage(canvas,0,0,dots,canvas.height);
   const pixels=context.getImageData(0,0,dots,canvas.height).data;
   started=true;await send(Uint8Array.from([0x1b,0x40]));
   for(let y=0;y<canvas.height;y+=64)await send(rasterBand(pixels,dots,canvas.height,y,Math.min(64,canvas.height-y)));
   await send(Uint8Array.from([0x1b,0x64,4]));
  }
  return 'Sent to '+describe(device)+'. Check the printed paper.';
 }catch(error){await close();throw Error(error.message+(started?' A partial receipt may have printed. Check the paper before trying again.':''))}
 finally{busy=false}
}
navigator.usb?.addEventListener('disconnect',event=>{if(event.device===device){device=null;port=null}window.dispatchEvent(new Event('restaurant:printer-status'))});
window.posPrinter={supported,capabilities,authorized,preference,select,useSystem,status,printDocument,rasterBand};
})();
