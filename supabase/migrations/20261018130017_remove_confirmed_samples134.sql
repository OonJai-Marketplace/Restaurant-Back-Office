-- Explicitly remove the confirmed demonstration seed, not real restaurant records.
-- No public products or user-created records are selected. The immutable ledger
-- exception is bounded to the ten original artificial opening entries in this transaction.
begin;
lock table public.menu_items104, public.menu_ingredients105, public.inventory_items104,
 public.inventory_movements104, public.pos_orders118, public.pos_stock118,
 public.menu_sales108, public.restaurant_preparations132, public.restaurant_batches124,
 public.restaurant_waste124 in share row exclusive mode;
create temporary table sample_remove134 (kind text,id uuid,primary key(kind,id)) on commit drop;
with samples(code,name) as (values
  ('MENU-01','Tofu Garden Bowl'),
  ('MENU-02','Chickpea Nourish Bowl'),
  ('MENU-03','Black Bean Bowl'),
  ('MENU-04','Mushroom Rice Bowl'),
  ('MENU-05','Classic Bean Burger'),
  ('MENU-06','Tofu Burger'),
  ('MENU-07','Mushroom Burger'),
  ('MENU-08','Avocado Sandwich'),
  ('MENU-09','Chickpea Sandwich'),
  ('MENU-10','Tofu Club Sandwich'),
  ('MENU-11','Bean Burrito'),
  ('MENU-12','Tofu Wrap'),
  ('MENU-13','Tomato Mushroom Pasta'),
  ('MENU-14','Creamy Coconut Pasta'),
  ('MENU-15','Banana Date Smoothie'),
  ('MENU-16','Mango Smoothie'),
  ('MENU-17','Berry Smoothie'),
  ('MENU-18','Peanut Banana Smoothie'),
  ('MENU-19','Lemon Ginger Refresher'),
  ('MENU-20','Carrot Ginger Refresher'))
insert into sample_remove134 select 'menu',m.id from public.menu_items104 m join samples s
on m.data->>'code'=s.code and m.data->>'name'=s.name
where m.created_at='2026-09-27 11:44:52.669984+00' and m.data->>'legacySample133'='true'
and m.data->>'storefrontManaged131' is distinct from 'true' and not exists(select 1 from public.storefront_items127 w where w.menu_item_id=m.id);
with samples(code,name) as (values
  ('ING-01','Brown rice'),
  ('ING-02','Firm tofu'),
  ('ING-03','Cooked black beans'),
  ('ING-04','Cooked chickpeas'),
  ('ING-06','Tomato'),
  ('ING-07','Carrot'),
  ('ING-09','Wholegrain bread'),
  ('ING-10','Burger bun'),
  ('ING-11','Tortilla'),
  ('ING-12','Dry pasta'),
  ('ING-13','Mushrooms'),
  ('ING-17','Mixed berries'),
  ('ING-18','Oat milk'),
  ('ING-19','Pitted dates'),
  ('ING-23','Potato'),
  ('ING-24','Cooking oil'),
  ('ING-25','House sauce'),
  ('ING-26','Onion'),
  ('ING-28','Food packaging'))
insert into sample_remove134 select 'ingredient',m.id from public.menu_ingredients105 m join samples s
on m.data->>'code'=s.code and m.data->>'name'=s.name
where m.created_at='2026-09-27 11:44:52.669984+00' and m.data->>'legacySample133'='true'
;
with samples(code,name) as (values
 ('SALE-0','Bottled water'),('SALE-1','House granola pack'),('SALE-2','Peanut butter jar'),
 ('SALE-3','Herbal tea pack'),('SALE-4','Dried mango pack'),('SALE-5','Coffee beans bag'),
 ('SALE-6','Reusable cup'),('SALE-7','Canvas tote bag'),('SALE-8','Oat cookies pack'),('SALE-9','Gift voucher'))
insert into sample_remove134 select 'stock',i.id from public.inventory_items104 i join samples s
on i.data->>'code'=s.code and i.data->>'name'=s.name
where i.created_at='2026-09-27 11:44:52.669984+00' and i.version=1;
insert into sample_remove134 select 'opening',m.id from public.inventory_movements104 m
join public.inventory_items104 i on i.id::text=m.data->>'itemId'
join sample_remove134 t on t.kind='stock' and t.id=i.id
where m.created_at='2026-09-27 11:44:52.669984+00' and m.data->>'reference'='OPENING-CATALOG-106' and m.data->>'date'='2026-09-01'
and m.data->>'kind'='in' and (m.data->>'quantity')::numeric=20
and m.data->>'itemName'=i.data->>'name' and m.data->>'currency'='LAK'
and (m.data->>'cost')::numeric=10000+2500*substring(i.data->>'code' from 6)::int;
do $cleanup$
declare actor uuid; prior_sub text=current_setting('request.jwt.claim.sub',true); t record; target record; found_ref boolean;
begin
 if not exists(select 1 from sample_remove134) then return;end if;
 -- Refuse the whole cleanup if any actual transaction or retained recipe now uses a target.
 for target in select * from sample_remove134 where kind<>'opening' loop
  for t in select unnest(array['pos_orders118','pos_stock118','menu_sales108','restaurant_preparations132','restaurant_batches124','restaurant_waste124']) as name loop
   execute format('select exists(select 1 from public.%I r where to_jsonb(r)::text like $1)',t.name)
   into found_ref using '%'||target.id::text||'%';
   if found_ref then raise exception 'Sample cleanup stopped: % references %',t.name,target.id;end if;
  end loop;
  if exists(select 1 from public.menu_items104 m where not exists(select 1 from sample_remove134 s where s.kind='menu' and s.id=m.id) and m.data::text like '%'||target.id::text||'%')
   or exists(select 1 from public.menu_ingredients105 i where not exists(select 1 from sample_remove134 s where s.kind='ingredient' and s.id=i.id) and i.data::text like '%'||target.id::text||'%')
   or exists(select 1 from public.inventory_movements104 m where not exists(select 1 from sample_remove134 s where s.kind='opening' and s.id=m.id) and m.data::text like '%'||target.id::text||'%')
  then raise exception 'Sample cleanup stopped: retained records reference %',target.id;end if;
 end loop;
 select id into actor from public.profiles where role='admin' and status='active' order by id limit 1;
 if actor is null then raise exception 'An active restaurant administrator is required';end if;
 perform set_config('request.jwt.claim.sub',actor::text,true);
 delete from public.menu_items104 where id in(select id from sample_remove134 where kind='menu');
 delete from public.menu_ingredients105 where id in(select id from sample_remove134 where kind='ingredient');
 -- Only the exact original artificial openings can be removed. Restore the guard
 -- before deleting stock; an exception rolls back all data and trigger changes.
 alter table public.inventory_movements104 disable trigger inventory_movements_guard104;
 delete from public.inventory_movements104 where id in(select id from sample_remove134 where kind='opening');
 alter table public.inventory_movements104 enable trigger inventory_movements_guard104;
 delete from public.inventory_items104 where id in(select id from sample_remove134 where kind='stock');
 -- Original public names remain, but unchanged demonstration purchase costs are not facts.
 with costs(code,name,price) as (values
 ('ING-05','Lettuce',30000),('ING-08','Avocado',80000),('ING-14','Coconut milk',30000),
 ('ING-15','Banana',15000),('ING-16','Mango',35000),('ING-20','Peanut butter',70000),
 ('ING-21','Lemon juice',55000),('ING-22','Ginger',30000),('ING-27','Spinach',30000))
 update public.menu_ingredients105 i set data=(i.data-'fullPreparedCost124')||jsonb_build_object(
 'cost',0,'purchasePrice',0,'purchaseQuantity',1,'active',false,'setupPending134',true,
 'sourceNote120','Original public ingredient name. Enter actual purchase unit, cost and stock link.'),version=i.version+1
 from costs c where i.data->>'code'=c.code and i.data->>'name'=c.name
 and i.created_at='2026-09-27 11:44:52.669984+00' and i.version=1
 and (i.data->>'cost')::numeric=c.price and (i.data->>'purchasePrice')::numeric=c.price
 and nullif(i.data->>'inventoryItemId118','') is null;
 perform set_config('request.jwt.claim.sub',coalesce(prior_sub,''),true);
end $cleanup$;
commit;
