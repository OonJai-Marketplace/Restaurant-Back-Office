-- DRAFT: apply only after the currently installed Restaurant migrations 01–08.
-- Does not modify Accounting records or replace existing POS permission guards.
begin;
create table if not exists public.restaurant_batches124 (
 id uuid primary key, output_item_id uuid not null references public.inventory_items104(id),
 data jsonb not null, created_at timestamptz not null default now(),
 created_by uuid not null references public.profiles(id)
);
create table if not exists public.restaurant_waste124 (
 id uuid primary key, item_id uuid not null references public.inventory_items104(id),
 batch_id uuid references public.restaurant_batches124(id), data jsonb not null,
 created_at timestamptz not null default now(),created_by uuid not null references public.profiles(id)
);
create index if not exists restaurant_batches_item124 on public.restaurant_batches124(output_item_id);
create index if not exists restaurant_waste_batch124 on public.restaurant_waste124(batch_id);
create unique index if not exists restaurant_waste_reversal124 on public.restaurant_waste124((data->>'reverses124')) where data ? 'reverses124';
create index if not exists inventory_movements_item124 on public.inventory_movements104((data->>'itemId'));
create index if not exists pos_stock_item124 on public.pos_stock118(item_id);
alter table public.restaurant_batches124 enable row level security;
alter table public.restaurant_waste124 enable row level security;
revoke all on public.restaurant_batches124,public.restaurant_waste124 from public,anon,authenticated;
grant select on public.restaurant_batches124,public.restaurant_waste124 to authenticated;
drop policy if exists preparation_read124 on public.restaurant_batches124;
create policy preparation_read124 on public.restaurant_batches124 for select to authenticated
 using(public.restaurant_can121('inventory') or public.restaurant_can121('menu'));
drop policy if exists waste_read124 on public.restaurant_waste124;
create policy waste_read124 on public.restaurant_waste124 for select to authenticated
 using(public.restaurant_can121('inventory') or public.restaurant_can121('menu'));

-- Quantities must stay in the Inventory item's unit; packs require their contents.
create or replace function public.restaurant_unit124(p_from text,p_to text,p_pack numeric default null)
returns numeric language plpgsql immutable set search_path=public,pg_temp as $$
declare f text=lower(trim(p_from));t text=lower(trim(p_to));begin
 if f='pack' and t<>'pack' then
  if p_pack is null or p_pack<=0 or p_pack::text in ('NaN','Infinity','-Infinity') then raise exception 'Enter the quantity in one pack, using the stock unit';end if;
  return p_pack;
 end if;
 if f=t then return 1;end if;
 if f in ('g','kg') and t in ('g','kg') then return case when f='g' then 0.001 else 1000 end;end if;
 if f in ('ml','l') and t in ('ml','l') then return case when f='ml' then 0.001 else 1000 end;end if;
 raise exception 'Units do not match. Use % or a declared pack size',p_to;
end $$;
create or replace function public.restaurant_reverse_waste124(p_id uuid,p_original uuid,p_reason text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare original restaurant_waste124;existing restaurant_waste124;d jsonb;begin
 if not public.restaurant_can121('inventory','adjust') then raise exception 'Inventory adjustment access required';end if;
 if p_id is null or length(trim(coalesce(p_reason,'')))<3 then raise exception 'Correction ID and reason required';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_original::text,124));
 select * into original from restaurant_waste124 where id=p_original for update;
 if not found or original.data ? 'reverses124' then raise exception 'Select an original waste record';end if;
 select * into existing from restaurant_waste124 where data->>'reverses124'=p_original::text;
 if found then return to_jsonb(existing);end if;
 perform 1 from inventory_items104 where id=original.item_id for update;
 d=original.data||jsonb_build_object('date',to_char(now() at time zone 'Asia/Vientiane','YYYY-MM-DD'),'quantity',-(original.data->>'quantity')::numeric,'stockQuantity',-(original.data->>'stockQuantity')::numeric,'ingredientLoss',-(original.data->>'ingredientLoss')::numeric,'cookingLoss',-(original.data->>'cookingLoss')::numeric,'fullLoss',-(original.data->>'fullLoss')::numeric,'reason',left(p_reason,500),'reverses124',p_original);
 insert into restaurant_waste124(id,item_id,batch_id,data,created_by) values(p_id,original.item_id,original.batch_id,d,auth.uid()) returning * into existing;
 insert into inventory_movements104(data,created_by) values(jsonb_build_object('itemId',original.item_id,'kind','adjust-in','quantity',(original.data->>'stockQuantity')::numeric,'currency',d->>'currency','date',d->>'date','reference','Waste correction '||p_id,'note',p_reason,'waste124',p_id),auth.uid());
 return to_jsonb(existing);
end $$;
create or replace function public.restaurant_stock124(p_item uuid) returns numeric
language sql stable security definer set search_path=public,pg_temp as $$
 select coalesce((select sum(case when data->>'kind' in ('in','adjust-in') then (data->>'quantity')::numeric else -(data->>'quantity')::numeric end)
 from inventory_movements104 where data->>'itemId'=p_item::text),0)
 -coalesce((select sum(quantity) from pos_stock118 where item_id=p_item),0)
$$;
create or replace function public.restaurant_prepare124(p_id uuid,p_data jsonb)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare existing restaurant_batches124;out_item inventory_items104;ing menu_ingredients105;input_item inventory_items104;
 line jsonb;snapshot jsonb='[]';item_ids uuid[];lock_id uuid;qty numeric;factor numeric;used numeric;ingredient_total numeric=0;
 full_input_total numeric=0;unit_cost numeric;input_cost numeric;labor numeric;energy numeric;other_cost numeric;
 output_qty numeric;amount numeric;full_total numeric;extra numeric;mode text;capture_date date;
begin
 if not public.is_admin() then raise exception 'Administrator access required for cooking batches';end if;
 if p_id is null then raise exception 'Batch ID required';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_id::text,124));
 select * into existing from restaurant_batches124 where id=p_id;
 if found then
  if existing.created_by<>auth.uid() then raise exception 'Batch belongs to another user';end if;
  return to_jsonb(existing);
 end if;
 if jsonb_typeof(p_data->'inputs') is distinct from 'array' or jsonb_array_length(p_data->'inputs') not between 1 and 100 then raise exception 'Add 1–100 ingredients';end if;
 output_qty=(p_data->>'outputQuantity')::numeric;
 if output_qty is null or output_qty<=0 or output_qty::text in ('NaN','Infinity','-Infinity') then raise exception 'Enter the usable cooked quantity';end if;
 capture_date=(p_data->>'date')::date;
 if capture_date is null or capture_date>current_date+1 then raise exception 'Enter a valid batch date';end if;
 select * into out_item from inventory_items104 where id=(p_data->>'outputItemId')::uuid;
 if out_item.id is null or out_item.data->>'active'='false' then raise exception 'Choose an active Inventory item for the cooked output';end if;
 item_ids=array[out_item.id];
 for line in select value from jsonb_array_elements(p_data->'inputs') loop
  select * into ing from menu_ingredients105 where id=(line->>'ingredientId')::uuid;
  if ing.id is null or ing.data->>'active'='false' or coalesce(ing.data->>'inventoryItemId118','')='' then raise exception 'Link each active ingredient to Inventory first';end if;
  item_ids=array_append(item_ids,(ing.data->>'inventoryItemId118')::uuid);
 end loop;
 -- Same item lock order as POS; all input deductions and output happen atomically.
 for lock_id in select distinct x from unnest(item_ids) x order by x loop
  perform 1 from inventory_items104 where inventory_items104.id=lock_id for update;
 end loop;
 select * into out_item from inventory_items104 where inventory_items104.id=out_item.id;
 for line in select value from jsonb_array_elements(p_data->'inputs') loop
  select * into ing from menu_ingredients105 where id=(line->>'ingredientId')::uuid for share;
  if (line->>'version')::integer is distinct from ing.version then raise exception 'Ingredient cost or link changed; review the batch before syncing';end if;
  qty=(line->>'quantity')::numeric;factor=coalesce((ing.data->>'inventoryFactor118')::numeric,1);
  if qty is null or factor is null or qty<=0 or factor<=0 or qty::text in ('NaN','Infinity','-Infinity') or factor::text in ('NaN','Infinity','-Infinity') then raise exception 'Enter positive ingredient quantities and conversion factors';end if;
  select * into input_item from inventory_items104 where id=(ing.data->>'inventoryItemId118')::uuid;
  if input_item.id is null or input_item.data->>'active'='false' or input_item.id=out_item.id then raise exception 'Input must be active and different from the cooked output';end if;
  if ing.data->>'currency' is distinct from out_item.data->>'currency' or input_item.data->>'currency' is distinct from out_item.data->>'currency' then raise exception 'Use one currency for this batch; convert costs explicitly first';end if;
  unit_cost=(ing.data->>'cost')::numeric;
  if unit_cost is null or unit_cost<=0 or unit_cost::text in ('NaN','Infinity','-Infinity') then raise exception 'Complete ingredient prices before cooking';end if;
  used=qty*factor;
  if restaurant_stock124(input_item.id)<used then raise exception 'Insufficient stock: %',input_item.data->>'name';end if;
  ingredient_total=ingredient_total+qty*unit_cost;
  -- A prepared input carries its recorded production cost; raw input uses ingredient price.
  input_cost=case when input_item.data->>'prepared124'='true' then coalesce((ing.data->>'fullPreparedCost124')::numeric,unit_cost) else unit_cost end;
  full_input_total=full_input_total+qty*input_cost;
  snapshot=snapshot||jsonb_build_array(jsonb_build_object('ingredientId',ing.id,'name',ing.data->>'name','quantity',qty,'unit',ing.data->>'unit','unitCost',unit_cost,'fullUnitCost',input_cost,'inventoryItemId',input_item.id,'stockQuantity',used));
  insert into inventory_movements104(data,created_by) values(jsonb_build_object('itemId',input_item.id,'kind','out','quantity',used,'cost',unit_cost/factor,'currency',out_item.data->>'currency','date',capture_date,'reference','Preparation '||p_id,'note','Ingredients used in cooking','preparation124',p_id),auth.uid());
 end loop;
 mode=coalesce(p_data->>'costMode','actual');
 if mode='actual' then
  labor=coalesce((p_data->>'minutes')::numeric,0)*coalesce((p_data->>'hourlyRate')::numeric,0)/60;
  energy=coalesce((p_data->>'energy')::numeric,0);other_cost=coalesce((p_data->>'otherCost')::numeric,0);
  if coalesce((p_data->>'minutes')::numeric,0)<0 or coalesce((p_data->>'hourlyRate')::numeric,0)<0 or energy<0 or other_cost<0 then raise exception 'Cooking expenses must be nonnegative';end if;
  extra=labor+energy+other_cost;
 elsif mode='estimate' then
  amount=(p_data->>'surchargePercent')::numeric;
  if amount is null or amount<0 or amount>1000 then raise exception 'Enter a cooking surcharge from 0–1000 percent';end if;
  extra=ingredient_total*amount/100;labor=0;energy=0;other_cost=0;
 else raise exception 'Choose actual costs or estimated surcharge';end if;
 full_total=full_input_total+extra;
 if full_total::text in ('NaN','Infinity','-Infinity') then raise exception 'Invalid cooking expenses';end if;
 p_data=p_data||jsonb_build_object('inputs',snapshot,'ingredientTotal',ingredient_total,'fullInputTotal',full_input_total,'laborCost',labor,'energy',energy,'otherCost',other_cost,'cookingCost',extra,'fullTotal',full_total,'ingredientUnitCost',ingredient_total/output_qty,'fullUnitCost',full_total/output_qty,'currency',out_item.data->>'currency','stockUnit',out_item.data->>'unit','cookingAdditionPercent',(full_total-ingredient_total)/ingredient_total*100,'name',left(coalesce(p_data->>'name',out_item.data->>'name'),200));
 insert into restaurant_batches124(id,output_item_id,data,created_by) values(p_id,out_item.id,p_data,auth.uid()) returning * into existing;
 insert into inventory_movements104(data,created_by) values(jsonb_build_object('itemId',out_item.id,'kind','in','quantity',output_qty,'cost',ingredient_total/output_qty,'currency',out_item.data->>'currency','date',capture_date,'reference','Preparation '||p_id,'note','Usable cooked output','preparation124',p_id),auth.uid());
 update inventory_items104 set version=version+1,data=data||jsonb_build_object('cost',ingredient_total/output_qty,'prepared124',true,'fullPreparedCost124',full_total/output_qty) where inventory_items104.id=out_item.id;
 -- Existing ingredient costing stays ingredient-only; full cooking cost is separate.
 update menu_ingredients105 set version=version+1,data=data||jsonb_build_object('cost',ingredient_total/output_qty*coalesce((data->>'inventoryFactor118')::numeric,1),'purchasePrice',ingredient_total/output_qty*coalesce((data->>'inventoryFactor118')::numeric,1)*coalesce((data->>'purchaseQuantity')::numeric,1),'fullPreparedCost124',full_total/output_qty*coalesce((data->>'inventoryFactor118')::numeric,1)) where data->>'inventoryItemId118'=out_item.id::text;
 return to_jsonb(existing);
end $$;
create or replace function public.restaurant_record_waste124(p_id uuid,p_data jsonb)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare existing restaurant_waste124;b restaurant_batches124;i inventory_items104;qty numeric;factor numeric;
 unit_cost numeric;food_cost numeric;used numeric;already numeric;capture_date date;
begin
 if not public.restaurant_can121('inventory','stock_out') then raise exception 'Inventory stock-out access required';end if;
 if p_id is null then raise exception 'Waste ID required';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_id::text,124));
 select * into existing from restaurant_waste124 where id=p_id;
 if found then
  if existing.created_by<>auth.uid() then raise exception 'Waste belongs to another user';end if;
  return to_jsonb(existing);
 end if;
 select * into i from inventory_items104 where id=(p_data->>'itemId')::uuid for update;
 if i.id is null or i.data->>'active'='false' then raise exception 'Choose an active Inventory item';end if;
 qty=(p_data->>'quantity')::numeric;factor=restaurant_unit124(p_data->>'unit',i.data->>'unit',(p_data->>'packQuantity')::numeric);
 used=qty*factor;
 if used is null or used<=0 or used::text in ('NaN','Infinity','-Infinity') then raise exception 'Enter a positive waste quantity';end if;
 if length(trim(coalesce(p_data->>'reason','')))<3 then raise exception 'Enter the waste reason';end if;
 capture_date=(p_data->>'date')::date;
 if capture_date is null or capture_date>current_date+1 then raise exception 'Enter a valid waste date';end if;
 if restaurant_stock124(i.id)<used then raise exception 'Waste exceeds current usable stock';end if;
 if coalesce(p_data->>'batchId','')<>'' then
  select * into b from restaurant_batches124 where id=(p_data->>'batchId')::uuid for update;
  if b.id is null or b.output_item_id<>i.id then raise exception 'Select the batch for this cooked item';end if;
  select coalesce(sum((data->>'stockQuantity')::numeric),0) into already from restaurant_waste124 where batch_id=b.id;
  if used+already>(b.data->>'outputQuantity')::numeric then raise exception 'Recorded batch waste exceeds its original cooked yield';end if;
  unit_cost=(b.data->>'fullUnitCost')::numeric;food_cost=(b.data->>'ingredientUnitCost')::numeric;
 else
  if i.data->>'prepared124'='true' then raise exception 'Choose the cooking batch to cost prepared waste';end if;
  select coalesce((data->>'cost')::numeric,0) into food_cost from inventory_movements104 where data->>'itemId'=i.id::text and data->>'kind' in ('in','adjust-in') and coalesce((data->>'cost')::numeric,0)>0 order by created_at desc,id desc limit 1;
  food_cost=coalesce(food_cost,(i.data->>'cost')::numeric);
  if food_cost is null or food_cost<=0 or food_cost::text in ('NaN','Infinity','-Infinity') then raise exception 'Complete the stock unit cost before recording raw waste';end if;
  unit_cost=food_cost;
 end if;
 p_data=p_data||jsonb_build_object('name',i.data->>'name','stockQuantity',used,'stockUnit',i.data->>'unit','currency',i.data->>'currency','ingredientLoss',food_cost*used,'cookingLoss',(unit_cost-food_cost)*used,'fullLoss',unit_cost*used,'costMode',coalesce(b.data->>'costMode','raw'));
 insert into restaurant_waste124(id,item_id,batch_id,data,created_by) values(p_id,i.id,b.id,p_data,auth.uid()) returning * into existing;
 insert into inventory_movements104(data,created_by) values(jsonb_build_object('itemId',i.id,'kind','out','quantity',used,'cost',food_cost,'currency',i.data->>'currency','date',capture_date,'reference','Waste '||p_id,'note',p_data->>'reason','waste124',p_id),auth.uid());
 return to_jsonb(existing);
end $$;
revoke all on function public.restaurant_stock124(uuid),public.restaurant_unit124(text,text,numeric),public.restaurant_prepare124(uuid,jsonb),public.restaurant_record_waste124(uuid,jsonb),public.restaurant_reverse_waste124(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.restaurant_prepare124(uuid,jsonb),public.restaurant_record_waste124(uuid,jsonb),public.restaurant_reverse_waste124(uuid,uuid,text) to authenticated;
-- Extend the existing workspace gate only for these restaurant endpoints.
do $$declare body text;begin
 if to_regprocedure('public.check_workspace_request123()') is null then raise exception 'Install Restaurant migration 08 first';end if;
 body=pg_get_functiondef('public.check_workspace_request123()'::regprocedure);
 if position('restaurant_record_waste124' in body)=0 then
  if position('''pos_snapshot118''' in body)=0 then raise exception 'Workspace gate differs from the expected version; review before installing';end if;
  body=replace(body,'''pos_snapshot118''','''restaurant_batches124'',''restaurant_waste124'',''restaurant_prepare124'',''restaurant_record_waste124'',''restaurant_reverse_waste124'',''pos_snapshot118''');
  execute body;
 end if;
end $$;
do $$begin if to_regclass('public.backup_registry113') is not null then
 insert into public.backup_registry113(table_name,pk_columns,date_path) values('restaurant_batches124',array['id'],array['created_at']),('restaurant_waste124',array['id'],array['created_at']) on conflict(table_name) do nothing;
end if;end$$;
notify pgrst,'reload schema';
commit;
