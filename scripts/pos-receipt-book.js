/* Each reservation lives with this browser's POS data. IndexedDB serializes
   writes across tabs; a forgotten reservation is never offered to another device. */
const posReceiptBook=(()=>{
 const yearOf=stamp=>Number(new Intl.DateTimeFormat('en',{timeZone:'Asia/Vientiane',year:'numeric'}).format(new Date(stamp)));
 const name='oonjai-receipt-book-'+new URL(OJM_SUPABASE_URL).hostname;
 const jobs=new Map();
 let connection;
 function database(){
  if(!connection)connection=new Promise((resolve,reject)=>{
   const request=indexedDB.open(name,1);
   request.onupgradeneeded=()=>{request.result.createObjectStore('books');request.result.createObjectStore('orders')};
   request.onsuccess=()=>resolve(request.result);
   request.onerror=()=>{connection=null;reject(request.error)};
  });
  return connection;
 }
 async function transaction(stores,fn){
  const db=await database();
  return new Promise((resolve,reject)=>{
   const tx=db.transaction(stores,'readwrite');let result;
   tx.oncomplete=()=>resolve(result);
   tx.onabort=()=>reject(tx.error||Error('Could not save receipt number on this device.'));
   fn(tx,value=>{result=value});
  });
 }
 const key=(owner,year)=>owner+':'+year;
 const available=book=>book.blocks.reduce((sum,b)=>sum+b.last-b.next+1,0);
 function bookUpdate(owner,year,edit){
  return transaction(['books'],(tx,done)=>{
   const store=tx.objectStore('books'),id=key(owner,year),read=store.get(id);
   read.onsuccess=()=>{
    const book=read.result||{blocks:[],pending:null};
    const result=edit(book);store.put(book,id);done(result);
   };
  });
 }
 function prepare(owner,year,rpc){
  const id=key(owner,year);if(jobs.has(id))return jobs.get(id);
  const job=(async()=>{
   const request=await bookUpdate(owner,year,book=>{
    if(available(book)>512)return null;
    return book.pending||=crypto.randomUUID();
   });
   if(!request)return;
   const range=await rpc('pos_reserve_receipt_book',{p_year:year,p_token:request});
   if(range?.token!==request||range.year!==year)throw Error('Receipt number reservation could not be verified.');
   if(range.cyclePending===true){
    await bookUpdate(owner,year,book=>{book.prepared=true});
    return;
   }
   if(!Number.isSafeInteger(range.first)||range.first<=0||!Number.isSafeInteger(range.last)||range.last<range.first||range.last-range.first>=4096)
    throw Error('Receipt number reservation could not be verified.');
   await transaction(['books'],(tx)=>{
    const books=tx.objectStore('books'),bookKey=key(owner,year),read=books.get(bookKey),saved=books.get(owner+':anchor');
    saved.onsuccess=()=>{
     const book=read.result;if(book.pending!==request)return;
     const anchor={token:request,first:range.first,year};
     if(!book.anchor)book.anchor=anchor;
     if(!saved.result||saved.result.year>year)books.put(anchor,owner+':anchor');
     book.blocks.push({token:request,next:range.first,last:range.last,first:range.first});book.pending=null;books.put(book,bookKey);
    };
   });
  })().finally(()=>jobs.delete(id));
  jobs.set(id,job);return job;
 }
 function stampCode(year,ticket){
  const i=BigInt(ticket.ordinal)-1n;
  return {...ticket,code:'OJM'+String(year).slice(-2)+'-4'+String.fromCharCode(65+Number(i/999n%26n))+String(i%999n+1n).padStart(3,'0')};
 }
 async function next(owner,id,year,allowLocalReference){
  const bookKey=key(owner,year),orderKey=owner+':'+id,anchorKey=owner+':anchor';
  return transaction(['books','orders'],(tx,done)=>{
   const books=tx.objectStore('books'),orders=tx.objectStore('orders'),prior=orders.get(orderKey);
   prior.onsuccess=()=>{
    if(prior.result?.year===year){done(prior.result.ticket);return}
    const read=books.get(bookKey),stored=books.get(anchorKey);
    stored.onsuccess=()=>{
     const book=read.result||{blocks:[],pending:null},block=book.blocks[0];
     let ticket;
     if(block){
      const anchor={token:block.token,first:block.first??block.last-127,year};
      if(!book.anchor)book.anchor=anchor;
      if(!stored.result||stored.result.year>year)books.put(anchor,anchorKey);
      ticket={token:block.token,ordinal:block.next++};
      if(block.next>block.last)book.blocks.shift();
     }else{
      const anchor=book.anchor||stored.result;
      if(!allowLocalReference||!book.prepared&&(!anchor||anchor.year>year)){done(null);return}
      const localRef='R-L'+id.replaceAll('-','').toUpperCase();
      ticket={localRef,code:localRef};
     }
     if(!ticket.localRef)ticket=stampCode(year,ticket);
     books.put(book,bookKey);orders.put({year,ticket},orderKey);done(ticket);
    };
   };
  });
 }
 async function recoverAnchor(owner,year){
  return transaction(['books','orders'],(tx,done)=>{
   const store=tx.objectStore('books'),key=owner+':anchor',saved=store.get(key);
   saved.onsuccess=()=>{
    if(saved.result&&saved.result.year<=year){done(true);return}
    const cursor=tx.objectStore('orders').openCursor(IDBKeyRange.bound(owner+':',owner+':\uffff'));
    cursor.onsuccess=()=>{
     const row=cursor.result;
     if(!row){done(false);return}
     const {year:issued,ticket}=row.value;
     if(issued<=year&&ticket?.token&&Number.isSafeInteger(ticket.ordinal)&&ticket.ordinal>0){
      store.put({year:issued,first:ticket.ordinal,token:ticket.token},key);done(true);
     }else row.continue();
    };
   };
  });
 }
 async function issue(owner,id,stamp,rpc,online){
  const year=yearOf(stamp);let ticket=await next(owner,id,year,!online);
  if(ticket)return ticket;
  if(online){
   try{await prepare(owner,year,rpc)}catch(e){
    if(navigator.onLine&&!window.posPerformance125?.network(e))throw e;
   }
   ticket=await next(owner,id,year,true);
  }
  if(!ticket&&await recoverAnchor(owner,year))ticket=await next(owner,id,year,true);
  if(!ticket)throw Error('Open a shift online once to prepare offline checkout on this register.');
  return ticket;
 }
 async function remaining(owner,year){const db=await database();return new Promise((resolve,reject)=>{
  const read=db.transaction('books').objectStore('books').get(key(owner,year));
  read.onsuccess=()=>resolve(read.result?available(read.result):0);read.onerror=()=>reject(read.error);
 })}
 async function ready(owner,year){
  const prepared=await transaction(['books'],(tx,done)=>{
   const store=tx.objectStore('books'),local=store.get(key(owner,year)),saved=store.get(owner+':anchor');
   saved.onsuccess=()=>done(!!(local.result?.prepared||local.result?.blocks?.length||local.result?.anchor||saved.result&&saved.result.year<=year));
  });
  return prepared||recoverAnchor(owner,year);
 }
 return {yearOf,prepare,issue,remaining,ready};
})();
