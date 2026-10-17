const {PGlite}=require('@electric-sql/pglite');
const fs=require('fs'),path=require('path'),assert=require('node:assert/strict'),{randomUUID}=require('crypto');
const root=path.resolve(__dirname,'..');let checks=0;
const check=async(name,fn)=>{await fn();checks++;console.log('PASS',name)};
(async()=>{
 const db=new PGlite();
 await db.exec(`create role anon;create role authenticated;create role service_role;create schema auth;
 create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb,encrypted_password text);
 create function auth.uid() returns uuid language sql as $$select nullif(current_setting('test.uid',true),'')::uuid$$;
 grant usage on schema auth to authenticated;`);
 for(const file of fs.readdirSync(root+'/supabase/migrations').sort())await db.exec(fs.readFileSync(root+'/supabase/migrations/'+file,'utf8'));
 const admin=randomUUID(),staff=randomUUID(),menu=randomUUID(),online=randomUUID(),dine=randomUUID(),paid=randomUUID(),own=randomUUID();
 await db.query('insert into auth.users(id,email) values($1,$2),($3,$4)',[admin,'admin@example.test',staff,'staff@example.test']);
 await db.query("update profiles set role='admin' where id=$1",[admin]);
 await db.query('insert into restaurant_members121(user_id,permissions) values($1,$2)',[staff,{}]);
 const actor=async id=>db.query("select set_config('test.uid',$1,false)",[id]);
 const grants=async permissions=>{await db.exec('reset role');await actor(admin);await db.query('update restaurant_members121 set permissions=$2 where user_id=$1',[staff,permissions]);await actor(staff);await db.exec('set role authenticated')};
 const pos=tabs=>({pos:{view:true,sell:true,void:true,refund:true,tabs:Object.fromEntries(tabs.map(t=>[t,true]))}});
 await actor(admin);
 await db.query('insert into menu_items104(id,data) values($1,$2)',[menu,{name:'Audit fixture',code:'AUDIT',price:1000,currency:'LAK',recipe:[],posNoStock118:true}]);
 const payload=service=>({lines:[{menuId:menu,quantity:1}],service,customer:'Fixture'});
 for(const [id,service] of [[online,'Online'],[dine,'Dine in']])await db.query("select pos_order118($1,0,'save',$2)",[id,payload(service)]);
 await db.query("insert into pos_orders118(id,number,status,data,created_by,paid_at) values($1,2000,'paid',$2,$3,now())",[paid,{service:'Dine in',lines:[],total:10},admin]);
 await db.query('insert into pos_shifts118(cashier,opening) values($1,0),($2,0)',[admin,staff]);
 await db.exec('set role anon');
 await check('Anonymous visitors can read the complete public menu without staff access',async()=>{
  assert.equal((await db.query('select id,name,price from storefront_items127')).rows.length,34);
  const tables=['profiles','restaurant_members121','restaurant_presentation121','inventory_items104','inventory_movements104','menu_items104','menu_ingredients105','pos_orders118','pos_shifts118','pos_cash118','restaurant_batches124','restaurant_waste124'];
  for(const table of tables)await assert.rejects(db.query('select * from '+table),/permission denied/);
  await assert.rejects(db.query('select pos_cashier_snapshot125()'),/permission denied/);
 });
 await grants(pos([]));
 await check('A module with no allowed tabs cannot expose a POS snapshot',async()=>{
  await assert.rejects(db.query('select pos_cashier_snapshot125()'),/POS access required/);
  assert.equal((await db.query('select * from pos_shifts118')).rows.length,0);
 });
 await grants({inventory:{view:true,tabs:{}},menu:{view:true,tabs:{invalid:true}}});
 await check('Empty and unknown tab grants do not grant catalog access',async()=>{
  for(const table of ['menu_items104','inventory_items104','inventory_movements104'])assert.equal((await db.query('select * from '+table)).rows.length,0);
 });
 await grants({inventory:{view:true,prepare:true,tabs:{'inv-preparation124':true}}});
 await check('Kitchen-only staff can read preparation data but cannot enter POS or website management',async()=>{
  await db.query('select * from inventory_items104');await db.query('select * from menu_ingredients105');
  assert.equal((await db.query('select * from menu_items104')).rows.length,0);
  assert.equal((await db.query('select * from storefront_items127')).rows.length,0);
  await assert.rejects(db.query('select pos_cashier_snapshot125()'),/POS access required/);
 });
 await grants(pos(['pos-sales-online']));
 await check('Online-only staff receive only online unpaid orders',async()=>{
  const snapshot=(await db.query('select pos_cashier_snapshot125() as s')).rows[0].s;
  assert.deepEqual(snapshot.orders.map(x=>x.id),[online]);
  assert.equal((await db.query('select * from pos_orders118')).rows.length,1);
 });
 await check('Online-only staff cannot change or cancel hidden dine-in orders',async()=>{
  await assert.rejects(db.query("select pos_order118($1,1,'save',$2)",[dine,payload('Online')]),/Order access required/);
  await assert.rejects(db.query("select pos_order118($1,1,'cancel',$2)",[dine,{reason:'Audit fixture'}]),/Order access required/);
 });
 await check('Online-only staff cannot create dine-in orders or relabel an existing online order',async()=>{
  await assert.rejects(db.query("select pos_order118($1,0,'save',$2)",[randomUUID(),payload('Dine in')]),/Order access required/);
  await assert.rejects(db.query("select pos_order118($1,1,'save',$2)",[online,payload('Dine in')]),/Order access required/);
 });
 await check('Idempotent payment responses cannot reveal another cashier’s hidden receipt',async()=>{
  await assert.rejects(db.query("select pos_order118($1,0,'pay','{}')",[paid]),/Order access required/);
 });
 await check('An assigned online order can still be updated and cancelled',async()=>{
  const updated=(await db.query("select pos_order118($1,1,'save',$2) as o",[online,{...payload('Online'),customer:'Updated'}])).rows[0].o;
  assert.equal(updated.version,2);
  const canceled=(await db.query("select pos_order118($1,2,'cancel',$2) as o",[online,{reason:'Audit fixture'}])).rows[0].o;
  assert.equal(canceled.status,'cancelled');
 });
 await grants(pos(['pos-sales-new','pos-overview']));
 await check('Cashiers can see only their own shift records',async()=>{
  const shifts=(await db.query('select * from pos_shifts118')).rows;assert.equal(shifts.length,1);assert.equal(shifts[0].cashier,staff);
 });
 await check('New-order staff can save and pay their own order without an Open Orders grant',async()=>{
  const created=(await db.query("select pos_order118($1,0,'save',$2) as o",[own,payload('Dine in')])).rows[0].o;assert.equal(created.version,1);
  const data={...payload('Dine in'),payment:'Cash',confirmed:true,tendered:1000};
  const receipt=(await db.query("select pos_order118($1,1,'pay',$2) as o",[own,data])).rows[0].o;assert.equal(receipt.status,'paid');
  const retry=(await db.query("select pos_order118($1,1,'pay',$2) as o",[own,data])).rows[0].o;assert.equal(retry.id,receipt.id);assert.equal(retry.version,receipt.version);
  await assert.rejects(db.query("select pos_order118($1,1,'save',$2)",[dine,payload('Dine in')]),/Order access required/);
 });
 await db.exec('reset role');await actor(admin);await db.query('update restaurant_members121 set enabled=false where user_id=$1',[staff]);await actor(staff);await db.exec('set role authenticated');
 await check('Revoking a member immediately blocks the server while a token is still valid',async()=>await assert.rejects(db.query('select pos_cashier_snapshot125()'),/POS access required/));
 await db.close();console.log('COMPLETE',checks);
})().catch(e=>{console.error(e);process.exit(1)});
