/* Exercise the deployed order RPC on a disposable PostgreSQL database. */
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {randomUUID}=require('node:crypto');
const {PGlite}=require('@electric-sql/pglite');

(async()=>{
 const db=new PGlite();
 try{
  await db.exec(`create role anon; create role authenticated; create role service_role;
   create schema auth; create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb,encrypted_password text);
   create function auth.uid() returns uuid language sql as $$select nullif(current_setting('test.uid',true),'')::uuid$$;
   grant usage on schema auth to authenticated;
   create schema storage; create table storage.buckets(id text,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
   create table storage.objects(bucket_id text);`);
  for(const file of fs.readdirSync('supabase/migrations').sort()){
   if(!file.endsWith('.sql')||/promotion_proof_(scheduler|retention)/.test(file))continue;
   await db.exec(fs.readFileSync('supabase/migrations/'+file,'utf8'));
  }
  const query=async(sql,args=[])=>(await db.query(sql,args)).rows[0];
  const admin=randomUUID(),menu=randomUUID(),id=randomUUID();
  await query('insert into auth.users(id,email) values($1,$2)',[admin,'cashier@example.test']);
  await query("update profiles set role='admin' where id=$1",[admin]);
  await query("select set_config('test.uid',$1,false)",[admin]);
  await query('insert into menu_items104(id,data) values($1,$2)',[menu,{code:'S',name:'Soup',price:1000,currency:'LAK',recipe:[]}]);
  await query("select pos_manage118('open','{\"amount\":0}',0)");
  const data={service:'Dine in',lines:[{menuId:menu,quantity:2,unitPrice:1000,name:'Soup',options:[]}],payment:'Cash',confirmed:true,tendered:3000,reviewedTotal:2000,offlineNonce:'payment-test'};
  const run=async(order,version,action,body)=>(await query('select pos_order118($1,$2,$3,$4) as r',[order,version,action,body])).r;
  const saved=await run(id,0,'save',{...data,offlineNonce:'draft-test'});
  assert.equal(saved.data.receiptCode,undefined);
  await assert.rejects(()=>run(id,saved.version,'pay',{...data,reviewedTotal:1999}),/menu or price changed/);
  await assert.rejects(()=>run(id,saved.version,'pay',{...data,lines:[{...data.lines[0],name:'Old soup'}]}),/menu or price changed/);
  const result=await run(id,saved.version,'pay',data);
  const year=Number(new Intl.DateTimeFormat('en',{timeZone:'Asia/Vientiane',year:'numeric'}).format(new Date(result.paid_at)));
  const prefix='OJM'+String(year).slice(-2)+'-4';
  assert.equal(result.data.receiptCode,prefix+'A001');
  assert.equal((await run(id,saved.version,'pay',data)).data.receiptCode,result.data.receiptCode);
  assert.equal((await run(id,result.version,'refund',{reason:'Fixture refund'})).data.receiptCode,result.data.receiptCode);
  const next=await run(randomUUID(),0,'pay',data);
  assert.equal(next.data.receiptCode,prefix+'A002');
  for(const [ordinal,suffix] of [[999,'A999'],[1000,'B001'],[25974,'Z999'],[25975,'A001']]){
   assert.equal((await query('select restaurant_private.receipt_code($1,$2) as code',[year,ordinal])).code,prefix+suffix);
  }
  const newYear=year+1,rollover=randomUUID();
  await query("insert into pos_orders118(id,number,status,data,created_by) values($1,9000,'unpaid','{}',$2)",[rollover,admin]);
  const rolloverDate=year+'-12-31T17:00:00Z';
  const rotated=await query("update pos_orders118 set status='paid',paid_at=$2,data='{\"lines\":[]}' where id=$1 returning data",[rollover,rolloverDate]);
  assert.equal(rotated.data.receiptCode,'OJM'+String(newYear).slice(-2)+'-4A001');
  const reserve=async(token,yr=year)=>(await query('select pos_reserve_receipts($1,$2) as block',[yr,token])).block;
  const first=await reserve(randomUUID()),second=await reserve(randomUUID());
  assert.equal(second.first,first.last+1);
  assert.deepEqual(await reserve(first.token),first);
  const issue=async(id,ordinal,block=first,extra={})=>{
   const code=(await query('select restaurant_private.receipt_code($1,$2) as code',[year,ordinal])).code;
   const packet={...data,offlineNonce:'sale-'+id,receiptTicket:{token:block.token,ordinal,code},
    receiptIssuedAt:new Date().toISOString(),receiptFooter:'Saved receipt footer',...extra};
   return run(id,0,'pay',packet);
  };
  const offlineId=randomUUID(),at=new Date().toISOString(),receipt=await issue(offlineId,first.first,first,{offlineCapturedAt:at,offlineTotal:2000});
  assert.equal(receipt.data.receiptCode,prefix+'A003');
  assert.equal(receipt.data.receiptFooter,'Saved receipt footer');
  assert.equal(Date.parse(receipt.paid_at),Date.parse(at));
  assert.equal(receipt.data.localReceiptRef,null);
  assert.equal((await issue(offlineId,first.first)).data.receiptCode,receipt.data.receiptCode);
  await assert.rejects(()=>issue(randomUUID(),first.first),/duplicate key/);
  await assert.rejects(()=>issue(randomUUID(),second.first,first),/reservation/);
  await assert.rejects(()=>issue(randomUUID(),first.first+1,first,{receiptTicket:{token:first.token,ordinal:first.first+1,code:'OJM26-4Z999'}}),/reservation/);
  const online=await issue(randomUUID(),second.first,second);
  assert.equal(online.data.receiptCode,prefix+'A131');
  const legacy=await run(randomUUID(),0,'pay',data);
  assert.equal(legacy.data.receiptCode,prefix+'A259');
  assert.equal((await reserve(randomUUID(),year+1)).first,2);
  async function continuation(block,serial,order=randomUUID(),witness=block.first){
   const {ordinal,code}=await query(`select n::text as ordinal, restaurant_private.receipt_code($1,mod(n-1,25974)::bigint+1) as code
    from restaurant_private.continuation_ordinal($2,0,$3,513) n`,[year,witness,serial]);
   const packet={...data,offlineNonce:'paid-'+order,offlineCapturedAt:new Date().toISOString(),offlineTotal:2000,
    receiptTicket:{token:block.token,ordinal,code,continuation:serial,witness}};
   return {run:()=>run(order,0,'pay',packet),packet};
  }
  const bookA=await continuation(first,1),bookB=await continuation(second,1);
  const a=await bookA.run(),b=await bookB.run();
  assert.notEqual(a.data.receiptOrdinal,b.data.receiptOrdinal);
  assert.equal(a.data.receiptCode,bookA.packet.receiptTicket.code);
  assert.equal((await bookA.run()).id,a.id);
  await assert.rejects((await continuation(first,1)).run,/duplicate key/);
  await assert.rejects((await continuation(first,1,randomUUID(),second.first)).run,/anchor/);
  const longOutage=await continuation(first,513);assert.notEqual((await longOutage.run()).data.receiptOrdinal,a.data.receiptOrdinal);
  for(let i=0;i<12;i++){
   const block=await reserve(randomUUID());assert.equal(Math.floor((block.first-1)/512)%2,0);
   assert.equal(Math.floor((block.first-1)/512),Math.floor((block.last-1)/512));
  }
  console.log('PASS offline continuation on independent registers, replay, legacy coexistence and disjoint server ranges');
  const tipped={...data,discount:10,discountType:'percent',reviewedTotal:1800,tip:200,tendered:2500};
  const shiftBefore=async()=>(await query('select pos_cashier_snapshot125() as s')).s.shiftExpected125;
  const opening=await shiftBefore();
  for(const method of ['Cash','BCEL QR','Bank']){
   const order=randomUUID(),packet={...tipped,payment:method};
   await assert.rejects(()=>run(order,0,'pay',{...packet,tendered:1999}),/including tip/);
   const sale=await run(order,0,'pay',packet);
   assert.equal(sale.data.tip,200);assert.equal(sale.data.total,1800);assert.equal(sale.data.collectedTotal,2000);
   assert.equal(await shiftBefore(),opening+(method==='Cash'?2000:-500));
   await run(order,sale.version,'refund',{reason:'Test full refund'});
   if(method!=='Cash')await query("select pos_manage118('cash',$1,0)",[{amount:500,reason:'Test replenish change'}]);
   assert.equal(await shiftBefore(),opening);
  }
  const fxId=randomUUID(),fx={currency:'USD',amount:1,rate:2500,equivalentLak:2500,changeLak:500};
  const fxPaid=await run(fxId,0,'pay',{...tipped,payment:'Bank',fxTender:fx});
  assert.equal(fxPaid.data.fxTender.changeLak,500);
  await assert.rejects(()=>run(randomUUID(),0,'pay',{...tipped,tip:-1}),/valid tip/);
  console.log('PASS cash, bank and QR tips, optional reference, underpayment, FX, drawer and refunds');
  console.log('PASS two register ranges, reissued response, identical offline receipt, duplicate protection and legacy coexistence');
  console.log('PASS real POS RPC, reviewed basket, retry, refund, annual Laos rollover and A–Z boundaries');
 }finally{await db.close()}
})().catch(e=>{console.error(e.message);process.exitCode=1});
