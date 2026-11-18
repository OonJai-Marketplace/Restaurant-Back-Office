/* Device-only snapshots, separated by account; no network requests or sync loop. */
(()=>{'use strict';
 function access(owner,area,value){return new Promise((resolve,reject)=>{
  if(!owner)return resolve(null);const request=indexedDB.open('oonjai-restaurant-local152',1);
  request.onupgradeneeded=()=>request.result.createObjectStore('snapshots',{keyPath:'key'});
  request.onerror=()=>reject(request.error);request.onsuccess=()=>{const db=request.result,tx=db.transaction('snapshots',value===undefined?'readonly':'readwrite'),store=tx.objectStore('snapshots');let result;
   const query=value===undefined?store.get(owner+':'+area):value===null?store.delete(owner+':'+area):store.put({key:owner+':'+area,owner,area,savedAt:Date.now(),value});query.onsuccess=()=>result=query.result;
   tx.oncomplete=()=>{db.close();resolve(result||null)};tx.onerror=tx.onabort=()=>{db.close();reject(tx.error||Error('Device storage is unavailable'))};};
 });}
 async function read(query,controller,ms=6000){let timer;try{return await Promise.race([Promise.resolve(query.abortSignal?query.abortSignal(controller.signal):query),new Promise((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(Error('Connection timed out. Use Refresh to try again.'))},ms)})])}finally{clearTimeout(timer)}}
 const network=e=>navigator.onLine===false||/failed to fetch|networkerror|network request failed|load failed|timed out|abort/i.test(e?.message||'');
 window.restaurantLocal152={get:(owner,area)=>access(owner,area).catch(()=>null),put:(owner,area,value)=>access(owner,area,value),remove:(owner,area)=>access(owner,area,null).catch(()=>{}),read,network};
})();
