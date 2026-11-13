/* Durable POS queue, isolated by Supabase project and signed-in account. */
(function(){'use strict';
const project=new URL(OJM_SUPABASE_URL).hostname.split('.')[0];
const dbName='oonjai-pos-'+project+'-offline126',legacyName='oonjai-pos-offline119',legacyChecked=new Set();
function open(){return new Promise((resolve,reject)=>{const req=indexedDB.open(dbName,1);req.onupgradeneeded=()=>{const db=req.result;db.createObjectStore('snapshots',{keyPath:'owner'});const q=db.createObjectStore('queue',{keyPath:'key'});q.createIndex('owner','owner')};req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error)})}
async function transact(store,mode,fn){const db=await open();return new Promise((resolve,reject)=>{const tx=db.transaction(store,mode),request=fn(tx.objectStore(store));let result;request.onsuccess=()=>{result=request.result};tx.oncomplete=()=>{db.close();resolve(result)};tx.onerror=()=>{db.close();reject(tx.error||Error('Local storage failed'))};tx.onabort=()=>{db.close();reject(tx.error||Error('Local storage was interrupted'))}})}
const get=(store,key)=>transact(store,'readonly',s=>s.get(key));
const put=(store,value)=>transact(store,'readwrite',s=>s.put(value));
const remove=(store,key)=>transact(store,'readwrite',s=>s.delete(key));
function legacy(owner,countOnly=false){return new Promise((resolve,reject)=>{let absent=false;const req=indexedDB.open(legacyName);req.onupgradeneeded=()=>{absent=true;req.transaction.abort()};req.onerror=()=>absent?resolve(countOnly?0:[]):reject(req.error);req.onsuccess=()=>{const db=req.result;if(!db.objectStoreNames.contains('queue')){db.close();resolve(countOnly?0:[]);return}const tx=db.transaction('queue','readonly'),index=tx.objectStore('queue').index('owner'),q=countOnly?index.count(owner):index.getAll(owner);let rows=countOnly?0:[];q.onsuccess=()=>{rows=q.result};tx.oncomplete=()=>{db.close();resolve(rows)};tx.onerror=()=>{db.close();reject(tx.error)}}})}
async function inspectLegacy(owner){if(legacyChecked.has(owner))return;legacyChecked.add(owner);try{const count=await legacy(owner,true);window.restaurantLegacyQueue126={owner,count};if(count)window.restaurantShell122?.sync()}catch{legacyChecked.delete(owner)}}
async function exportLegacy(owner){if(typeof liveProfile==='undefined'||owner!==liveProfile?.id)throw Error('Sign in to the matching Restaurant account.');const records=await legacy(owner);if(!records.length)return;const blob=new Blob([JSON.stringify({source:'previous-restaurant-setup',owner,exportedAt:new Date().toISOString(),orders:records},null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='restaurant-previous-orders.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)}
async function queue(owner){await inspectLegacy(owner);return (await transact('queue','readonly',s=>s.index('owner').getAll(owner))).sort((a,b)=>a.savedAt-b.savedAt)}
async function saveEntry(owner,order,action,data){
 const db=await open(),key=owner+':'+order.id;
 return new Promise((resolve,reject)=>{
  const tx=db.transaction('queue','readwrite'),store=tx.objectStore('queue'),read=store.get(key);
  let conflict=false;
  read.onsuccess=()=>{
   const prior=read.result;
   if(prior?.action==='pay'){conflict=true;tx.abort();return}
   if(prior?.action==='save'&&!order.version)data={...data,checkoutSaveNonce:prior.data.offlineNonce};
   const updated={...order,version:Math.max(order.version||0,prior?.order.version||0)};
   store.put({key,owner,order:updated,action,data,savedAt:Date.now()});
  };
  tx.oncomplete=()=>{db.close();resolve()};tx.onabort=()=>{db.close();reject(conflict?Error('Payment already recorded on this device. Open Receipts.'):tx.error||Error('Local capture failed'))};
 });
}
async function acknowledge(entry,order){
 const db=await open();
 return new Promise((resolve,reject)=>{
  const tx=db.transaction('queue','readwrite'),store=tx.objectStore('queue'),read=store.get(entry.key);
  read.onsuccess=()=>{
   const current=read.result;if(!current)return;
   if(current.data.offlineNonce===entry.data.offlineNonce)store.delete(entry.key);
   else if(order.status==='unpaid'&&current.order.version===entry.order.version){
    current.order.version=order.version;current.order.number=order.number;store.put(current);
   }
  };
  tx.oncomplete=()=>{db.close();resolve()};tx.onabort=()=>{db.close();reject(tx.error||Error('Could not acknowledge local order'))};
 });
}
window.posOffline119={acknowledge,getSnapshot:async owner=>{const r=await get('snapshots',owner);return r?.catalogRelease===134?r:null},saveSnapshot:(owner,data)=>put('snapshots',{owner,data,catalogRelease:134,savedAt:Date.now()}),queue,save:saveEntry,remove:(owner,id)=>remove('queue',owner+':'+id),exportLegacy};
// The entry bootstrap owns the service worker; do not replace it when POS opens.

})();
