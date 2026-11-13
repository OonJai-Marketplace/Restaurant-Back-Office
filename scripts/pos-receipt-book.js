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
    if(available(book)>32)return null;
    return book.pending||=crypto.randomUUID();
   });
   if(!request)return;
   const range=await rpc('pos_reserve_receipts',{p_year:year,p_token:request});
   if(range?.token!==request||range.year!==year||!Number.isSafeInteger(range.first)||range.first<=0||range.last!==range.first+127)
    throw Error('Receipt number reservation could not be verified.');
   await bookUpdate(owner,year,book=>{
    if(book.pending!==request)return; // Another tab already installed this response.
    book.blocks.push({token:request,next:range.first,last:range.last});book.pending=null;
   });
  })().finally(()=>jobs.delete(id));
  jobs.set(id,job);return job;
 }
 async function next(owner,id,stamp){
  const year=yearOf(stamp),bookKey=key(owner,year),orderKey=owner+':'+id;
  return transaction(['books','orders'],(tx,done)=>{
   const books=tx.objectStore('books'),orders=tx.objectStore('orders'),prior=orders.get(orderKey);
   prior.onsuccess=()=>{
    if(prior.result?.year===year){done(prior.result.ticket);return}
    const read=books.get(bookKey);
    read.onsuccess=()=>{
     const book=read.result,block=book?.blocks[0];if(!block){done(null);return}
     const ordinal=block.next++,letter=String.fromCharCode(65+Math.floor((ordinal-1)/999)%26);
     const code='OJM'+String(year).slice(-2)+'-4'+letter+String((ordinal-1)%999+1).padStart(3,'0');
     const ticket={token:block.token,ordinal,code};
     if(block.next>block.last)book.blocks.shift();
     books.put(book,bookKey);orders.put({year,ticket},orderKey);done(ticket);
    };
   };
  });
 }
 async function issue(owner,id,stamp,rpc,online){
  const year=yearOf(stamp);let ticket=await next(owner,id,stamp);
  if(!ticket&&online){await prepare(owner,year,rpc);ticket=await next(owner,id,stamp)}
  if(!ticket)throw Error('Connect this register once to replenish its offline receipt numbers. The order is still unpaid.');
  return ticket;
 }
 async function remaining(owner,year){const db=await database();return new Promise((resolve,reject)=>{
  const read=db.transaction('books').objectStore('books').get(key(owner,year));
  read.onsuccess=()=>resolve(read.result?available(read.result):0);read.onerror=()=>reject(read.error);
 })}
 return {yearOf,prepare,issue,remaining};
})();
