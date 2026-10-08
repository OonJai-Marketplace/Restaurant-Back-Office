/* Durable, account-scoped POS queue. Never acknowledge a local sale before IDB commits. */
(function(){'use strict';
const dbName='oonjai-pos-offline119';
function open(){return new Promise((resolve,reject)=>{const req=indexedDB.open(dbName,1);req.onupgradeneeded=()=>{const db=req.result;db.createObjectStore('snapshots',{keyPath:'owner'});const q=db.createObjectStore('queue',{keyPath:'key'});q.createIndex('owner','owner')};req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error)})}
async function transact(store,mode,fn){const db=await open();return new Promise((resolve,reject)=>{const tx=db.transaction(store,mode),request=fn(tx.objectStore(store));let result;request.onsuccess=()=>{result=request.result};tx.oncomplete=()=>{db.close();resolve(result)};tx.onerror=()=>{db.close();reject(tx.error||Error('Local storage failed'))};tx.onabort=()=>{db.close();reject(tx.error||Error('Local storage was interrupted'))}})}
const get=(store,key)=>transact(store,'readonly',s=>s.get(key));
const put=(store,value)=>transact(store,'readwrite',s=>s.put(value));
const remove=(store,key)=>transact(store,'readwrite',s=>s.delete(key));
async function queue(owner){return (await transact('queue','readonly',s=>s.index('owner').getAll(owner))).sort((a,b)=>a.savedAt-b.savedAt)}
window.posOffline119={getSnapshot:owner=>get('snapshots',owner),saveSnapshot:(owner,data)=>put('snapshots',{owner,data,savedAt:Date.now()}),queue,save:(owner,order,action,data)=>put('queue',{key:owner+':'+order.id,owner,order,action,data,savedAt:Date.now()}),remove:(owner,id)=>remove('queue',owner+':'+id)};
if('serviceWorker'in navigator&&(location.protocol==='https:'||['localhost','127.0.0.1'].includes(location.hostname)))navigator.serviceWorker.register('pos-sw119.js',{scope:'./'}).catch(()=>{});
})();
