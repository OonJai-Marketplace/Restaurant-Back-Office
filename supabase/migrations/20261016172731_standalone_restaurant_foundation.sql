
-- New Restaurant project only. No Accounting schema, data or authentication tokens.
begin;
do $$begin
 if to_regclass('public.journal_entries') is not null or to_regclass('public.accounts') is not null then
  raise exception 'STOP: this migration belongs in the separate Restaurant project';
 end if;
end $$;
create schema if not exists restaurant_private;
revoke all on schema restaurant_private from public,anon;
grant usage on schema restaurant_private to authenticated,service_role;
create table public.profiles (
 id uuid primary key references auth.users(id) on delete cascade,
 email text not null,full_name text not null default '',
 role text not null default 'submitter' check(role in ('admin','submitter','staff')),
 status text not null default 'active' check(status in ('active','inactive','disabled')),
 created_at timestamptz not null default now(),updated_at timestamptz not null default now()
);
alter table public.profiles enable row level security;
revoke all on public.profiles from public,anon,authenticated;
grant select on public.profiles to authenticated;
grant update(full_name,status) on public.profiles to authenticated;
create function restaurant_private.is_admin() returns boolean language sql stable security definer
 set search_path='' as $$select auth.uid() is not null and exists(select 1 from public.profiles where id=auth.uid() and role='admin' and status='active')$$;
create function restaurant_private.active_user() returns boolean language sql stable security definer
 set search_path='' as $$select auth.uid() is not null and exists(select 1 from public.profiles where id=auth.uid() and status='active')$$;
revoke all on function restaurant_private.is_admin(),restaurant_private.active_user() from public,anon;
grant execute on function restaurant_private.is_admin(),restaurant_private.active_user() to authenticated;
create function public.is_admin() returns boolean language sql stable security invoker set search_path='' as $$select restaurant_private.is_admin()$$;
revoke all on function public.is_admin() from public,anon;
grant execute on function public.is_admin() to authenticated;
create policy profiles_read on public.profiles for select to authenticated using(id=(select auth.uid()) or (select public.is_admin()));
create policy profiles_admin_update on public.profiles for update to authenticated using((select public.is_admin())) with check((select public.is_admin()));
create function restaurant_private.new_profile() returns trigger language plpgsql security definer set search_path='' as $$
 begin
  insert into public.profiles(id,email,full_name) values(new.id,coalesce(new.email,''),left(coalesce(new.raw_user_meta_data->>'full_name',''),120)) on conflict(id) do nothing;
  return new;
 end $$;
revoke all on function restaurant_private.new_profile() from public,anon,authenticated;
create trigger restaurant_new_profile after insert on auth.users for each row execute function restaurant_private.new_profile();
create table restaurant_private.migration_archive (
 source_project text not null,source_table text not null,record_key text not null,
 record_data jsonb not null,captured_at timestamptz not null default now(),
 primary key(source_project,source_table,record_key)
);
alter table restaurant_private.migration_archive enable row level security;
revoke all on restaurant_private.migration_archive from public,anon,authenticated;


create table if not exists public.inventory_items104 (
 id uuid primary key default gen_random_uuid(), data jsonb not null default '{}'::jsonb,
 version integer not null default 1, created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(), updated_by uuid references public.profiles(id)
);
create table if not exists public.inventory_movements104 (
 id uuid primary key default gen_random_uuid(), data jsonb not null default '{}'::jsonb,
 created_at timestamptz not null default now(), created_by uuid references public.profiles(id)
);
create table if not exists public.menu_items104 (
 id uuid primary key default gen_random_uuid(), data jsonb not null default '{}'::jsonb,
 version integer not null default 1, created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(), updated_by uuid references public.profiles(id)
);
create table if not exists public.menu_categories104 (
 id uuid primary key default gen_random_uuid(), data jsonb not null default '{}'::jsonb,
 version integer not null default 1, created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(), updated_by uuid references public.profiles(id)
);
create unique index if not exists inventory_item_code104 on public.inventory_items104(lower(data->>'code')) where coalesce(data->>'code','')<>'';
create unique index if not exists menu_item_code104 on public.menu_items104(lower(data->>'code')) where coalesce(data->>'code','')<>'';
create unique index if not exists menu_category_code104 on public.menu_categories104(lower(data->>'code')) where coalesce(data->>'code','')<>'';
create or replace function public.stamp_inventory_menu104() returns trigger language plpgsql security invoker as $$
declare on_hand numeric;
begin
 if not public.is_admin() then raise exception 'Administrator access required'; end if;
 if tg_table_name='inventory_movements104' then
  if tg_op<>'INSERT' then raise exception 'Stock movements are immutable; create a correcting movement'; end if;
  if not exists(select 1 from public.inventory_items104 where id::text=new.data->>'itemId') then raise exception 'Inventory item does not exist'; end if;
  if (new.data->>'quantity')::numeric<=0 or new.data->>'kind' not in ('in','out','adjust-in','adjust-out') then raise exception 'Invalid stock movement'; end if;
  -- Serialize movements on this item so two simultaneous issues cannot overspend stock.
  perform 1 from public.inventory_items104 where id::text=new.data->>'itemId' for update;
  if new.data->>'kind' in ('out','adjust-out') then
   select coalesce(sum(case when data->>'kind' in ('in','adjust-in') then (data->>'quantity')::numeric else -(data->>'quantity')::numeric end),0) into on_hand
   from public.inventory_movements104 where data->>'itemId'=new.data->>'itemId';
   if on_hand<(new.data->>'quantity')::numeric then raise exception 'Insufficient stock';end if;
  end if;
  new.created_by=auth.uid(); return new;
 end if;
 if coalesce(trim(new.data->>'code'),'')='' or coalesce(trim(new.data->>'name'),'')='' then raise exception 'Code and name are required'; end if;
 new.updated_by=auth.uid();new.updated_at=now();
 if tg_op='UPDATE' then
  if new.version<>old.version+1 then raise exception 'Record changed; reload before editing'; end if;
 else new.version=1;end if;
 return new;
end $$;
drop trigger if exists inventory_items_guard104 on public.inventory_items104;
create trigger inventory_items_guard104 before insert or update on public.inventory_items104 for each row execute function public.stamp_inventory_menu104();
drop trigger if exists inventory_movements_guard104 on public.inventory_movements104;
create trigger inventory_movements_guard104 before insert or update or delete on public.inventory_movements104 for each row execute function public.stamp_inventory_menu104();
drop trigger if exists menu_items_guard104 on public.menu_items104;
create trigger menu_items_guard104 before insert or update on public.menu_items104 for each row execute function public.stamp_inventory_menu104();
alter table public.inventory_items104 enable row level security;
alter table public.inventory_movements104 enable row level security;
alter table public.menu_items104 enable row level security;
alter table public.menu_categories104 enable row level security;
do $$ declare t text;begin
 foreach t in array array['inventory_items104','inventory_movements104','menu_items104','menu_categories104'] loop
 execute format('drop policy if exists admin_records104 on public.%I',t);
 execute format('create policy admin_records104 on public.%I for all to authenticated using(public.is_admin()) with check(public.is_admin())',t);
 execute format('grant select,insert,update on public.%I to authenticated',t);
 end loop;
end $$;
create table if not exists public.menu_ingredients105 (
 id uuid primary key default gen_random_uuid(), data jsonb not null default '{}'::jsonb,
 version integer not null default 1, created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(), updated_by uuid references public.profiles(id)
);
insert into public.menu_ingredients105(id,data)
 select i.id,i.data from public.inventory_items104 i
 where not exists(select 1 from public.menu_ingredients105 existing where existing.id=i.id) and exists(select 1 from public.menu_items104 m, jsonb_array_elements(coalesce(m.data->'recipe','[]'::jsonb)) r where r->>'itemId'=i.id::text)
 on conflict(id) do nothing;
create unique index if not exists menu_ingredient_code105 on public.menu_ingredients105(lower(data->>'code')) where coalesce(data->>'code','')<>'';
create or replace function public.stamp_workspace105() returns trigger language plpgsql security invoker set search_path=public as $$
begin
 if current_user not in ('postgres','supabase_admin') and not public.is_admin() then raise exception 'Administrator access required';end if;
 if tg_op='UPDATE' and new.version<>old.version+1 then raise exception 'Record changed; reload before editing';end if;
 if tg_op='INSERT' then new.version=1;end if;
 new.updated_at=now();new.updated_by=auth.uid();return new;
end $$;
do $$ declare t text;begin
 foreach t in array array['menu_ingredients105'] loop
 execute format('alter table public.%I enable row level security',t);
 execute format('drop policy if exists admin_workspace105 on public.%I',t);
 execute format('create policy admin_workspace105 on public.%I for all to authenticated using(public.is_admin()) with check(public.is_admin())',t);
 execute format('grant select,insert,update on public.%I to authenticated',t);
 execute format('drop trigger if exists stamp_workspace105 on public.%I',t);
 execute format('create trigger stamp_workspace105 before insert or update on public.%I for each row execute function public.stamp_workspace105()',t);
 end loop;
end $$;

create table if not exists public.record_deletions108 (
 id uuid primary key default gen_random_uuid(), table_name text not null,
 record_id uuid not null, record_data jsonb not null, deleted_at timestamptz not null default now(),
 deleted_by uuid not null default auth.uid()
);
alter table public.record_deletions108 enable row level security;
drop policy if exists admin_read108 on public.record_deletions108;
create policy admin_read108 on public.record_deletions108 for select to authenticated using(public.is_admin());
grant select on public.record_deletions108 to authenticated;
revoke insert,update,delete on public.record_deletions108 from authenticated,anon;
create table if not exists public.menu_sales108 (
 id uuid primary key default gen_random_uuid(), data jsonb not null,
 version integer not null default 1, created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(), created_by uuid default auth.uid(), updated_by uuid default auth.uid()
);
create unique index if not exists menu_sales_product_date108 on public.menu_sales108 ((data->>'productId'),(data->>'date'));
alter table public.menu_sales108 enable row level security;
drop policy if exists admin_sales108 on public.menu_sales108;
create policy admin_sales108 on public.menu_sales108 for all to authenticated using(public.is_admin()) with check(public.is_admin());
grant select,insert,update,delete on public.menu_sales108 to authenticated;
create or replace function public.guard_sales108() returns trigger language plpgsql set search_path=public as $$
begin
 if not public.is_admin() then raise exception 'Administrator access required'; end if;
 if tg_op='UPDATE' and new.version<>old.version+1 then raise exception 'Record version conflict'; end if;
 if (new.data->>'date')::date is null or (new.data->>'quantity')::numeric<=0 or (new.data->>'unitCost')::numeric<=0 or (new.data->>'revenue')::numeric<0 or not (new.data ?& array['date','quantity','unitCost','revenue','productId','currency']) then raise exception 'Invalid sales values'; end if;
 if not exists(select 1 from public.menu_items104 where id::text=new.data->>'productId' and data->>'currency'=new.data->>'currency') then raise exception 'Product or currency no longer matches'; end if;
 new.updated_at=now();new.updated_by=auth.uid();return new;
end $$;
drop trigger if exists guard_sales108 on public.menu_sales108;
create trigger guard_sales108 before insert or update on public.menu_sales108 for each row execute function public.guard_sales108();
create or replace function public.guard_delete108() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if not public.is_admin() then raise exception 'Administrator access required'; end if;
 if tg_table_name in ('menu_items104','menu_ingredients105','menu_categories104') then
  lock table public.menu_items104,public.menu_sales108 in share row exclusive mode;
  if tg_table_name='menu_categories104' and exists(select 1 from public.menu_items104 where data->>'category'=old.id::text) then raise exception 'Category is in use.'; end if;
  if tg_table_name in ('menu_items104','menu_ingredients105') and exists(select 1 from public.menu_items104 m cross join lateral jsonb_array_elements(coalesce(m.data->'recipe','[]')) line where line->>'itemId'=old.id::text) then raise exception 'Component is used in a recipe or bundle.'; end if;
  if tg_table_name='menu_items104' and exists(select 1 from public.menu_sales108 where data->>'productId'=old.id::text) then raise exception 'Product has sales history. Make it unavailable instead.'; end if;
 end if;
 if tg_table_name='inventory_items104' then
  lock table public.inventory_movements104 in share row exclusive mode;
  if exists(select 1 from public.inventory_movements104 where data->>'itemId'=old.id::text) then raise exception 'Stock movements exist. Make the item inactive instead.'; end if;
 end if;
 insert into public.record_deletions108(table_name,record_id,record_data) values(tg_table_name,old.id,to_jsonb(old));
 return old;
end $$;
do $$ declare t text;begin
 foreach t in array array['inventory_items104','menu_ingredients105','menu_items104','menu_categories104','menu_sales108'] loop
  execute format('drop trigger if exists guard_delete108 on public.%I',t);
  execute format('create trigger guard_delete108 before delete on public.%I for each row execute function public.guard_delete108()',t);
 end loop;
end $$;
create or replace function public.delete_record108(p_table text,p_id uuid,p_version integer) returns boolean language plpgsql security invoker set search_path=public,pg_temp as $$
declare count_deleted integer;
begin
 if not public.is_admin() then raise exception 'Administrator access required'; end if;
 if p_table<>all(array['inventory_items104','menu_ingredients105','menu_items104','menu_categories104','menu_sales108']) then raise exception 'Record type does not support deletion'; end if;
 execute format('delete from public.%I where id=$1 and version=$2',p_table) using p_id,p_version;
 get diagnostics count_deleted=row_count;
 if count_deleted<>1 then raise exception 'Record changed or was already deleted. Reload before trying again.'; end if;
 return true;
end $$;
revoke all on function public.delete_record108(text,uuid,integer) from public;
grant execute on function public.delete_record108(text,uuid,integer) to authenticated;
create unique index if not exists inventory_one_reversal108 on public.inventory_movements104 ((data->>'reverses108')) where data ? 'reverses108';
notify pgrst,'reload schema';

create table if not exists public.pos_config118(id boolean primary key default true check(id),data jsonb not null default '{"methods":["Cash","BCEL QR","Bank"],"cashiers":[],"discountLimit":10,"receiptWidth":80,"receiptFooter":"Thank you for visiting."}'::jsonb,version integer not null default 1);
insert into public.pos_config118(id) values(true) on conflict do nothing;
create table if not exists public.pos_orders118(id uuid primary key,number bigint generated by default as identity unique,status text not null default 'unpaid' check(status in ('unpaid','paid','cancelled','refunded')),data jsonb not null,version integer not null default 1,created_at timestamptz not null default now(),updated_at timestamptz not null default now(),created_by uuid not null references public.profiles(id),paid_at timestamptz,refunded_at timestamptz);
create table if not exists public.pos_shifts118(id uuid primary key default gen_random_uuid(),cashier uuid not null references public.profiles(id),opened_at timestamptz not null default now(),closed_at timestamptz,opening numeric not null check(opening>=0),counted numeric,expected numeric);
create unique index if not exists pos_one_open_shift118 on public.pos_shifts118(cashier) where closed_at is null;
create table if not exists public.pos_cash118(id uuid primary key default gen_random_uuid(),shift_id uuid not null references public.pos_shifts118(id),amount numeric not null check(amount<>0),reason text not null,created_at timestamptz not null default now(),created_by uuid not null references public.profiles(id));
create table if not exists public.pos_stock118(id uuid primary key default gen_random_uuid(),order_id uuid not null references public.pos_orders118(id),item_id uuid not null references public.inventory_items104(id),quantity numeric not null check(quantity<>0),kind text not null check(kind in ('sale','return')),created_at timestamptz not null default now(),created_by uuid not null references public.profiles(id),unique(order_id,item_id,kind));
create or replace function public.pos_allowed118() returns boolean language sql stable security definer set search_path=public,pg_temp as $$select auth.uid() is not null and (public.is_admin() or exists(select 1 from public.pos_config118 where data->'cashiers' ? auth.uid()::text))$$;
do $$declare t text;begin foreach t in array array['pos_config118','pos_orders118','pos_shifts118','pos_cash118','pos_stock118'] loop execute format('alter table public.%I enable row level security',t);execute format('revoke all on public.%I from anon,authenticated',t);execute format('grant select on public.%I to authenticated',t);execute format('drop policy if exists pos_read118 on public.%I',t);execute format('create policy pos_read118 on public.%I for select to authenticated using(public.pos_allowed118())',t);end loop;end$$;
create or replace function public.pos_snapshot118() returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if not public.pos_allowed118() then raise exception 'Ask an administrator to enable your POS access';end if;
 return jsonb_build_object('config',(select data from pos_config118 where id),'configVersion',(select version from pos_config118 where id),'menu',coalesce((select jsonb_agg(to_jsonb(m)) from menu_items104 m),'[]'::jsonb),'ingredients',coalesce((select jsonb_agg(to_jsonb(m)) from menu_ingredients105 m),'[]'::jsonb),'items',coalesce((select jsonb_agg(to_jsonb(m)) from inventory_items104 m),'[]'::jsonb),'categories',coalesce((select jsonb_agg(to_jsonb(m)) from menu_categories104 m),'[]'::jsonb),'moves',coalesce((select jsonb_agg(to_jsonb(m)) from inventory_movements104 m),'[]'::jsonb),'stock',coalesce((select jsonb_agg(to_jsonb(m)) from pos_stock118 m),'[]'::jsonb),'orders',coalesce((select jsonb_agg(to_jsonb(m) order by m.created_at desc) from pos_orders118 m),'[]'::jsonb),'shifts',coalesce((select jsonb_agg(to_jsonb(m)) from pos_shifts118 m),'[]'::jsonb),'cash',coalesce((select jsonb_agg(to_jsonb(m)) from pos_cash118 m),'[]'::jsonb));
end$$;
create or replace function public.pos_recipe118(p_menu uuid,p_quantity numeric,p_seen uuid[] default '{}') returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare d jsonb;l jsonb;result jsonb='[]';begin
 if p_menu=any(p_seen) or cardinality(p_seen)>12 then raise exception 'Recipe contains a circular bundle';end if;
 select data into d from menu_items104 where id=p_menu;
 if d is null or d->>'active'='false' then raise exception 'Menu item unavailable';end if;
 for l in select value from jsonb_array_elements(coalesce(d->'recipe','[]')) loop
  if coalesce((l->>'quantity')::numeric,0)<=0 then raise exception 'Invalid recipe quantity';end if;
  if d->>'itemType'='bundle' then result=result||pos_recipe118((l->>'itemId')::uuid,(l->>'quantity')::numeric*p_quantity,p_seen||p_menu);
  else result=result||jsonb_build_array(jsonb_build_object('itemId',l->>'itemId','quantity',(l->>'quantity')::numeric*p_quantity));end if;
 end loop;return result;end$$;
create or replace function public.pos_order118(p_id uuid,p_version integer,p_action text,p_data jsonb default '{}') returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare old pos_orders118;result pos_orders118;line jsonb;d jsonb;g jsonb;o jsonb;pick jsonb;recipe jsonb;ing jsonb;r jsonb;item inventory_items104;config jsonb;lines jsonb='[]';uses jsonb='[]';choices jsonb;names jsonb;qty numeric;price numeric;subtotal numeric=0;discount numeric;amount numeric;on_hand numeric;consumption numeric;sid uuid;method text;count_selected integer;ref text;
begin
 if not pos_allowed118() then raise exception 'POS access required';end if;
 if p_id is null or p_action not in ('save','pay','cancel','refund') then raise exception 'Invalid order action';end if;
 perform pg_advisory_xact_lock(118,118);
 perform pg_advisory_xact_lock(hashtextextended(p_id::text,118));
 select * into old from pos_orders118 where id=p_id for update;
 select data into config from pos_config118 where id;
 if old.id is not null and old.status=p_action then return to_jsonb(old);end if;
 -- Repeated payment requests return the original receipt; never consume twice.
 if p_action='pay' and old.status='paid' then return to_jsonb(old);end if;
 if p_action='refund' and old.status='refunded' then return to_jsonb(old);end if;
 if old.id is not null and old.version<>p_version then raise exception 'Order changed on another device. Reload before continuing';end if;
 if old.id is null and p_version<>0 then raise exception 'Order no longer exists';end if;
 if p_action in ('cancel','refund') then
  if old.id is null then raise exception 'Save the order first';end if;
  if p_action='cancel' and old.status<>'unpaid' then raise exception 'Only unpaid orders can be cancelled';end if;
  if p_action='refund' and (old.status<>'paid' or not public.is_admin()) then raise exception 'An administrator must approve a paid-order refund';end if;
  if length(trim(coalesce(p_data->>'reason','')))<3 then raise exception 'Enter a reason';end if;
  if p_action='refund' and old.data->>'payment'='Cash' then select id into sid from pos_shifts118 where cashier=auth.uid() and closed_at is null for update;if sid is null then raise exception 'Open your shift before refunding cash';end if;end if;
  if p_action='refund' and coalesce((p_data->>'restock')::boolean,false) then
   for r in select to_jsonb(x) from pos_stock118 x where order_id=p_id and kind='sale' order by item_id loop
    perform 1 from inventory_items104 where id=(r->>'item_id')::uuid for update;
    insert into pos_stock118(order_id,item_id,quantity,kind,created_by) values(p_id,(r->>'item_id')::uuid,-(r->>'quantity')::numeric,'return',auth.uid());
   end loop;
  end if;
  update pos_orders118 set status=case when p_action='refund' then 'refunded' else 'cancelled' end,version=version+1,updated_at=now(),refunded_at=case when p_action='refund' then now() else null end,data=data||jsonb_build_object('reason',p_data->>'reason','restocked',coalesce((p_data->>'restock')::boolean,false),'actionBy',auth.uid(),'refundShiftId',sid) where id=p_id returning * into result;return to_jsonb(result);
 end if;
 if old.id is not null and old.status<>'unpaid' then raise exception 'This order is already closed';end if;
 if coalesce(jsonb_typeof(p_data->'lines'),'')<>'array' or jsonb_array_length(p_data->'lines') not between 1 and 100 then raise exception 'Add between 1 and 100 order lines';end if;
 if coalesce(p_data->>'service','') not in ('Dine in','Takeaway','Delivery','Online') or length(coalesce(p_data->>'customer',''))>200 or length(coalesce(p_data->>'note',''))>2000 then raise exception 'Invalid order details';end if;
 for line in select value from jsonb_array_elements(p_data->'lines') loop
  select data into d from menu_items104 where id=(line->>'menuId')::uuid;
  if d is null or d->>'active'='false' or d->>'currency'<>'LAK' then raise exception 'Choose an available LAK menu item';end if;
  qty=(line->>'quantity')::numeric;if qty is null or qty<>trunc(qty) or qty not between 1 and 999 then raise exception 'Invalid order quantity';end if;
  price=(d->>'price')::numeric;if price is null or price<0 or price>1000000000 then raise exception 'Invalid menu price';end if;
  recipe=pos_recipe118((line->>'menuId')::uuid,1);choices='{}';names='[]';
  for g in select value from jsonb_array_elements(coalesce(d->'posOptions118','[]')) loop
   pick=coalesce(line->'choices'->(g->>'id'),'[]');if jsonb_typeof(pick)<>'array' then raise exception 'Invalid customization';end if;
   count_selected=jsonb_array_length(pick);
   if count_selected<coalesce((g->>'min')::integer,0) or count_selected>coalesce((g->>'max')::integer,1) then raise exception 'Review choices for %',g->>'name';end if;
   if (select count(distinct value) from jsonb_array_elements(pick))<>count_selected then raise exception 'Duplicate choice';end if;
   if count_selected>0 then select coalesce(jsonb_agg(x),'[]') into recipe from jsonb_array_elements(recipe) x where not coalesce(g->'replaces','[]') ? (x->>'itemId');end if;
   for ref in select jsonb_array_elements_text(pick) loop
    select x into o from jsonb_array_elements(g->'options') x where x->>'id'=ref;
    if o is null or o->>'available'='false' then raise exception 'An option is unavailable';end if;
    if coalesce((o->>'price')::numeric,0)<0 then raise exception 'Invalid option price';end if;
    price=price+coalesce((o->>'price')::numeric,0);recipe=recipe||coalesce(o->'recipe','[]');names=names||jsonb_build_array(o->>'name');
   end loop;choices=choices||jsonb_build_object(g->>'id',pick);
  end loop;
  if p_action='pay' then
   if jsonb_array_length(recipe)=0 and coalesce(d->>'posNoStock118','false')<>'true' then raise exception 'Link the recipe to Inventory, or mark this item as non-stock in POS Management';end if;
   for r in select value from jsonb_array_elements(recipe) loop
    select data into ing from menu_ingredients105 where id=(r->>'itemId')::uuid;
    if ing is null or ing->>'active'='false' or coalesce(ing->>'inventoryItemId118','')='' then raise exception 'Link every selected ingredient to Inventory in POS Management';end if;
    amount=(r->>'quantity')::numeric*coalesce((ing->>'inventoryFactor118')::numeric,1)*qty;
    if amount is null or amount<=0 then raise exception 'Invalid ingredient unit conversion';end if;
    uses=uses||jsonb_build_array(jsonb_build_object('itemId',ing->>'inventoryItemId118','quantity',amount));
   end loop;
  end if;
  subtotal=subtotal+round(price*qty,2);lines=lines||jsonb_build_array(jsonb_build_object('menuId',line->>'menuId','name',d->>'name','photoData',d->>'photoData','photo118',d->>'photo118','quantity',qty,'unitPrice',price,'choices',choices,'options',names,'note',left(coalesce(line->>'note',''),500)));
 end loop;
 discount=coalesce((p_data->>'discount')::numeric,0);if p_data->>'discountType'='percent' then discount=round(subtotal*discount/100,2);end if;
 if discount<0 or discount>subtotal then raise exception 'Discount exceeds the order amount';end if;
 if not is_admin() and discount>subtotal*coalesce((config->>'discountLimit')::numeric,0)/100 then raise exception 'This discount requires administrator approval';end if;
 method=p_data->>'payment';
 if p_action='pay' then
  if method is null or not config->'methods' ? method or coalesce(p_data->>'confirmed','false')<>'true' then raise exception 'Confirm the actual payment received';end if;
  if method<>'Cash' and length(trim(coalesce(p_data->>'paymentReference','')))<3 then raise exception 'Enter the verified bank payment reference';end if;
  select id into sid from pos_shifts118 where cashier=auth.uid() and closed_at is null for update;
  if sid is null then raise exception 'Open your shift in Overview before charging';end if;
  if method='Cash' and coalesce((p_data->>'tendered')::numeric,0)<subtotal-discount then raise exception 'Cash received is less than the total';end if;
 end if;
 insert into pos_orders118(id,number,data,created_by) select p_id,coalesce(max(number),1000)+1,'{}',auth.uid() from pos_orders118 on conflict(id) do nothing;
 if p_action='pay' then
  for r in select jsonb_build_object('itemId',x->>'itemId','quantity',sum((x->>'quantity')::numeric)) from jsonb_array_elements(uses) x group by x->>'itemId' order by x->>'itemId' loop
   select * into item from inventory_items104 where id=(r->>'itemId')::uuid for update;
   if item.id is null or item.data->>'active'='false' then raise exception 'Inventory item unavailable';end if;
   select coalesce(sum(case when data->>'kind' in ('in','adjust-in') then (data->>'quantity')::numeric else -(data->>'quantity')::numeric end),0) into on_hand from inventory_movements104 where data->>'itemId'=item.id::text;
   select coalesce(sum(quantity),0) into consumption from pos_stock118 where item_id=item.id;
   if on_hand-consumption<(r->>'quantity')::numeric then raise exception 'Insufficient stock: %',item.data->>'name';end if;
   insert into pos_stock118(order_id,item_id,quantity,kind,created_by) values(p_id,item.id,(r->>'quantity')::numeric,'sale',auth.uid());
  end loop;
 end if;
 update pos_orders118 set data=jsonb_build_object('lines',lines,'service',p_data->>'service','customer',left(coalesce(p_data->>'customer',''),200),'note',left(coalesce(p_data->>'note',''),2000),'subtotal',subtotal,'discount',discount,'discountType','amount','total',subtotal-discount,'currency','LAK','payment',case when p_action='pay' then method else null end,'paymentReference',p_data->>'paymentReference','tendered',p_data->>'tendered','shiftId',sid,'cashier',(select full_name from profiles where id=auth.uid())),status=case when p_action='pay' then 'paid' else 'unpaid' end,version=coalesce(old.version,0)+1,updated_at=now(),paid_at=case when p_action='pay' then now() else null end where id=p_id returning * into result;
 return to_jsonb(result);
end$$;
create or replace function public.pos_manage118(p_action text,p_data jsonb,p_version integer default 0) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare s pos_shifts118;r jsonb;expected_amount numeric;v integer;begin
 if not pos_allowed118() then raise exception 'POS access required';end if;
 if p_action='config' then
  if not is_admin() then raise exception 'Administrator access required';end if;
  if jsonb_typeof(p_data->'methods')<>'array' or jsonb_array_length(p_data->'methods')=0 or exists(select 1 from jsonb_array_elements_text(p_data->'methods') x where x not in ('Cash','BCEL QR','Bank')) or jsonb_typeof(p_data->'cashiers')<>'array' or coalesce((p_data->>'discountLimit')::numeric,-1) not between 0 and 100 or coalesce((p_data->>'receiptWidth')::integer,0) not in(58,80) then raise exception 'Invalid POS settings';end if;
  update pos_config118 set data=p_data,version=version+1 where id and version=p_version returning version into v;if v is null then raise exception 'Settings changed. Reload before saving';end if;return jsonb_build_object('version',v);
 elsif p_action='open' then
  if coalesce((p_data->>'amount')::numeric,-1)<0 then raise exception 'Enter the opening cash float';end if;
  insert into pos_shifts118(cashier,opening) values(auth.uid(),(p_data->>'amount')::numeric) returning to_jsonb(pos_shifts118.*) into r;return r;
 end if;
 select * into s from pos_shifts118 where cashier=auth.uid() and closed_at is null for update;if s.id is null then raise exception 'Open a shift first';end if;
 if p_action='cash' then
  if coalesce((p_data->>'amount')::numeric,0)=0 or length(trim(coalesce(p_data->>'reason','')))<3 then raise exception 'Enter a nonzero cash movement and reason';end if;
  insert into pos_cash118(shift_id,amount,reason,created_by) values(s.id,(p_data->>'amount')::numeric,p_data->>'reason',auth.uid()) returning to_jsonb(pos_cash118.*) into r;return r;
 elsif p_action='close' then
  if coalesce((p_data->>'amount')::numeric,-1)<0 then raise exception 'Enter the counted cash';end if;
  select s.opening+coalesce((select sum(amount) from pos_cash118 where shift_id=s.id),0)+coalesce((select sum((data->>'total')::numeric) from pos_orders118 where data->>'shiftId'=s.id::text and data->>'payment'='Cash' and status in('paid','refunded')),0)-coalesce((select sum((data->>'total')::numeric) from pos_orders118 where data->>'payment'='Cash' and status='refunded' and data->>'refundShiftId'=s.id::text),0) into expected_amount;
  update pos_shifts118 set closed_at=now(),counted=(p_data->>'amount')::numeric,expected=expected_amount where id=s.id returning to_jsonb(pos_shifts118.*) into r;return r;
 end if;raise exception 'Unknown management action';end$$;
create or replace function public.pos_inventory_guard118() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare available numeric;begin
 if new.data->>'kind' not in ('out','adjust-out') then return new;end if;
 perform 1 from inventory_items104 where id::text=new.data->>'itemId' for update;
 select coalesce(sum(case when data->>'kind' in ('in','adjust-in') then (data->>'quantity')::numeric else -(data->>'quantity')::numeric end),0)-(select coalesce(sum(quantity),0) from pos_stock118 where item_id::text=new.data->>'itemId') into available from inventory_movements104 where data->>'itemId'=new.data->>'itemId';
 if available<(new.data->>'quantity')::numeric then raise exception 'Insufficient stock after POS sales';end if;return new;end$$;
drop trigger if exists pos_inventory_guard118 on public.inventory_movements104;
create trigger pos_inventory_guard118 before insert on public.inventory_movements104 for each row execute function public.pos_inventory_guard118();
revoke all on function public.pos_recipe118(uuid,numeric,uuid[]) from public,anon,authenticated;
revoke all on function public.pos_snapshot118(),public.pos_order118(uuid,integer,text,jsonb),public.pos_manage118(text,jsonb,integer),public.pos_allowed118(),public.pos_inventory_guard118() from public,anon;
grant execute on function public.pos_snapshot118(),public.pos_order118(uuid,integer,text,jsonb),public.pos_manage118(text,jsonb,integer),public.pos_allowed118() to authenticated;


create or replace function public.pos_order118(p_id uuid,p_version integer,p_action text,p_data jsonb default '{}') returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare old pos_orders118;result pos_orders118;line jsonb;d jsonb;g jsonb;o jsonb;pick jsonb;recipe jsonb;ing jsonb;r jsonb;item inventory_items104;config jsonb;lines jsonb='[]';uses jsonb='[]';choices jsonb;names jsonb;qty numeric;price numeric;subtotal numeric=0;discount numeric;amount numeric;on_hand numeric;consumption numeric;sid uuid;method text;count_selected integer;ref text;offline_at timestamptz;
begin
 if not pos_allowed118() then raise exception 'POS access required';end if;
 if p_id is null or p_action not in ('save','pay','cancel','refund') then raise exception 'Invalid order action';end if;
 perform pg_advisory_xact_lock(118,118);
 perform pg_advisory_xact_lock(hashtextextended(p_id::text,118));
 select * into old from pos_orders118 where id=p_id for update;
 if old.id is not null and p_data ? 'offlineNonce' and old.data->>'offlineNonce'=p_data->>'offlineNonce' then return to_jsonb(old);end if;
 select data into config from pos_config118 where id;
 if old.id is not null and old.status=p_action then return to_jsonb(old);end if;
 -- Repeated payment requests return the original receipt; never consume twice.
 if p_action='pay' and old.status='paid' then return to_jsonb(old);end if;
 if p_action='refund' and old.status='refunded' then return to_jsonb(old);end if;
 if old.id is not null and old.version<>p_version then raise exception 'Order changed on another device. Reload before continuing';end if;
 if old.id is null and p_version<>0 then raise exception 'Order no longer exists';end if;
 if p_action in ('cancel','refund') then
  if old.id is null then raise exception 'Save the order first';end if;
  if p_action='cancel' and old.status<>'unpaid' then raise exception 'Only unpaid orders can be cancelled';end if;
  if p_action='refund' and (old.status<>'paid' or not public.is_admin()) then raise exception 'An administrator must approve a paid-order refund';end if;
  if length(trim(coalesce(p_data->>'reason','')))<3 then raise exception 'Enter a reason';end if;
  if p_action='refund' and old.data->>'payment'='Cash' then select id into sid from pos_shifts118 where cashier=auth.uid() and closed_at is null for update;if sid is null then raise exception 'Open your shift before refunding cash';end if;end if;
  if p_action='refund' and coalesce((p_data->>'restock')::boolean,false) then
   for r in select to_jsonb(x) from pos_stock118 x where order_id=p_id and kind='sale' order by item_id loop
    perform 1 from inventory_items104 where id=(r->>'item_id')::uuid for update;
    insert into pos_stock118(order_id,item_id,quantity,kind,created_by) values(p_id,(r->>'item_id')::uuid,-(r->>'quantity')::numeric,'return',auth.uid());
   end loop;
  end if;
  update pos_orders118 set status=case when p_action='refund' then 'refunded' else 'cancelled' end,version=version+1,updated_at=now(),refunded_at=case when p_action='refund' then now() else null end,data=data||jsonb_build_object('reason',p_data->>'reason','restocked',coalesce((p_data->>'restock')::boolean,false),'actionBy',auth.uid(),'refundShiftId',sid) where id=p_id returning * into result;return to_jsonb(result);
 end if;
 if old.id is not null and old.status<>'unpaid' then raise exception 'This order is already closed';end if;
 if coalesce(jsonb_typeof(p_data->'lines'),'')<>'array' or jsonb_array_length(p_data->'lines') not between 1 and 100 then raise exception 'Add between 1 and 100 order lines';end if;
 if coalesce(p_data->>'service','') not in ('Dine in','Takeaway','Delivery','Online') or length(coalesce(p_data->>'customer',''))>200 or length(coalesce(p_data->>'note',''))>2000 then raise exception 'Invalid order details';end if;
 for line in select value from jsonb_array_elements(p_data->'lines') loop
  select data into d from menu_items104 where id=(line->>'menuId')::uuid;
  if d is null or d->>'active'='false' or d->>'currency'<>'LAK' then raise exception 'Choose an available LAK menu item';end if;
  qty=(line->>'quantity')::numeric;if qty is null or qty<>trunc(qty) or qty not between 1 and 999 then raise exception 'Invalid order quantity';end if;
  price=(d->>'price')::numeric;if price is null or price<0 or price>1000000000 then raise exception 'Invalid menu price';end if;
  recipe=pos_recipe118((line->>'menuId')::uuid,1);choices='{}';names='[]';
  for g in select value from jsonb_array_elements(coalesce(d->'posOptions118','[]')) loop
   pick=coalesce(line->'choices'->(g->>'id'),'[]');if jsonb_typeof(pick)<>'array' then raise exception 'Invalid customization';end if;
   count_selected=jsonb_array_length(pick);
   if count_selected<coalesce((g->>'min')::integer,0) or count_selected>coalesce((g->>'max')::integer,1) then raise exception 'Review choices for %',g->>'name';end if;
   if (select count(distinct value) from jsonb_array_elements(pick))<>count_selected then raise exception 'Duplicate choice';end if;
   if count_selected>0 then select coalesce(jsonb_agg(x),'[]') into recipe from jsonb_array_elements(recipe) x where not coalesce(g->'replaces','[]') ? (x->>'itemId');end if;
   for ref in select jsonb_array_elements_text(pick) loop
    select x into o from jsonb_array_elements(g->'options') x where x->>'id'=ref;
    if o is null or o->>'available'='false' then raise exception 'An option is unavailable';end if;
    if coalesce((o->>'price')::numeric,0)<0 then raise exception 'Invalid option price';end if;
    price=price+coalesce((o->>'price')::numeric,0);recipe=recipe||coalesce(o->'recipe','[]');names=names||jsonb_build_array(o->>'name');
   end loop;choices=choices||jsonb_build_object(g->>'id',pick);
  end loop;
  if p_action='pay' then
   if jsonb_array_length(recipe)=0 and coalesce(d->>'posNoStock118','false')<>'true' then raise exception 'Link the recipe to Inventory, or mark this item as non-stock in POS Management';end if;
   for r in select value from jsonb_array_elements(recipe) loop
    select data into ing from menu_ingredients105 where id=(r->>'itemId')::uuid;
    if ing is null or ing->>'active'='false' or coalesce(ing->>'inventoryItemId118','')='' then raise exception 'Link every selected ingredient to Inventory in POS Management';end if;
    amount=(r->>'quantity')::numeric*coalesce((ing->>'inventoryFactor118')::numeric,1)*qty;
    if amount is null or amount<=0 then raise exception 'Invalid ingredient unit conversion';end if;
    uses=uses||jsonb_build_array(jsonb_build_object('itemId',ing->>'inventoryItemId118','quantity',amount));
   end loop;
  end if;
  subtotal=subtotal+round(price*qty,2);lines=lines||jsonb_build_array(jsonb_build_object('menuId',line->>'menuId','name',d->>'name','photoData',d->>'photoData','photo118',d->>'photo118','quantity',qty,'unitPrice',price,'choices',choices,'options',names,'note',left(coalesce(line->>'note',''),500)));
 end loop;
 discount=coalesce((p_data->>'discount')::numeric,0);if p_data->>'discountType'='percent' then discount=round(subtotal*discount/100,2);end if;
 if discount<0 or discount>subtotal then raise exception 'Discount exceeds the order amount';end if;
 if not is_admin() and discount>subtotal*coalesce((config->>'discountLimit')::numeric,0)/100 then raise exception 'This discount requires administrator approval';end if;
 if p_data ? 'offlineCapturedAt' then
  offline_at=(p_data->>'offlineCapturedAt')::timestamptz;
  if offline_at is null or offline_at>now()+interval '5 minutes' or offline_at<now()-interval '30 days' then raise exception 'Offline sale date needs review';end if;
  if round(coalesce((p_data->>'offlineTotal')::numeric,-1),2)<>round(subtotal-discount,2) then raise exception 'Menu price or discount changed while offline. Review this sale before syncing';end if;
 end if;
 method=p_data->>'payment';
 if p_action='pay' then
  if method is null or not config->'methods' ? method or coalesce(p_data->>'confirmed','false')<>'true' then raise exception 'Confirm the actual payment received';end if;
  if method<>'Cash' and length(trim(coalesce(p_data->>'paymentReference','')))<3 then raise exception 'Enter the verified bank payment reference';end if;
  select id into sid from pos_shifts118 where cashier=auth.uid() and closed_at is null for update;
  if sid is null then raise exception 'Open your shift in Overview before charging';end if;
  if offline_at is not null and offline_at<(select opened_at from pos_shifts118 where id=sid) then raise exception 'Offline sale predates this shift. Manager review required';end if;
  if method='Cash' and coalesce((p_data->>'tendered')::numeric,0)<subtotal-discount then raise exception 'Cash received is less than the total';end if;
 end if;
 insert into pos_orders118(id,number,data,created_by) select p_id,coalesce(max(number),1000)+1,'{}',auth.uid() from pos_orders118 on conflict(id) do nothing;
 if p_action='pay' then
  for r in select jsonb_build_object('itemId',x->>'itemId','quantity',sum((x->>'quantity')::numeric)) from jsonb_array_elements(uses) x group by x->>'itemId' order by x->>'itemId' loop
   select * into item from inventory_items104 where id=(r->>'itemId')::uuid for update;
   if item.id is null or item.data->>'active'='false' then raise exception 'Inventory item unavailable';end if;
   select coalesce(sum(case when data->>'kind' in ('in','adjust-in') then (data->>'quantity')::numeric else -(data->>'quantity')::numeric end),0) into on_hand from inventory_movements104 where data->>'itemId'=item.id::text;
   select coalesce(sum(quantity),0) into consumption from pos_stock118 where item_id=item.id;
   if on_hand-consumption<(r->>'quantity')::numeric then raise exception 'Insufficient stock: %',item.data->>'name';end if;
   insert into pos_stock118(order_id,item_id,quantity,kind,created_by) values(p_id,item.id,(r->>'quantity')::numeric,'sale',auth.uid());
  end loop;
 end if;
 update pos_orders118 set data=jsonb_build_object('lines',lines,'service',p_data->>'service','customer',left(coalesce(p_data->>'customer',''),200),'note',left(coalesce(p_data->>'note',''),2000),'subtotal',subtotal,'discount',discount,'discountType','amount','total',subtotal-discount,'currency','LAK','payment',case when p_action='pay' then method else null end,'paymentReference',p_data->>'paymentReference','tendered',p_data->>'tendered','shiftId',sid,'cashier',(select full_name from profiles where id=auth.uid()),'offlineNonce',p_data->>'offlineNonce'),status=case when p_action='pay' then 'paid' else 'unpaid' end,version=coalesce(old.version,0)+1,updated_at=now(),paid_at=case when p_action='pay' then coalesce(offline_at,now()) else null end where id=p_id returning * into result;
 return to_jsonb(result);
end$$;

create or replace function public.pos_order118(p_id uuid,p_version integer,p_action text,p_data jsonb default '{}') returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare old pos_orders118;result pos_orders118;line jsonb;d jsonb;g jsonb;o jsonb;pick jsonb;recipe jsonb;ing jsonb;r jsonb;item inventory_items104;config jsonb;lines jsonb='[]';uses jsonb='[]';choices jsonb;names jsonb;qty numeric;price numeric;subtotal numeric=0;discount numeric;amount numeric;on_hand numeric;consumption numeric;sid uuid;method text;count_selected integer;ref text;offline_at timestamptz;selected_custom integer;
begin
 if not pos_allowed118() then raise exception 'POS access required';end if;
 if p_id is null or p_action not in ('save','pay','cancel','refund') then raise exception 'Invalid order action';end if;
 perform pg_advisory_xact_lock(118,118);
 perform pg_advisory_xact_lock(hashtextextended(p_id::text,118));
 select * into old from pos_orders118 where id=p_id for update;
 if old.id is not null and p_data ? 'offlineNonce' and old.data->>'offlineNonce'=p_data->>'offlineNonce' then return to_jsonb(old);end if;
 select data into config from pos_config118 where id;
 if old.id is not null and old.status=p_action then return to_jsonb(old);end if;
 -- Repeated payment requests return the original receipt; never consume twice.
 if p_action='pay' and old.status='paid' then return to_jsonb(old);end if;
 if p_action='refund' and old.status='refunded' then return to_jsonb(old);end if;
 if old.id is not null and old.version<>p_version then raise exception 'Order changed on another device. Reload before continuing';end if;
 if old.id is null and p_version<>0 then raise exception 'Order no longer exists';end if;
 if p_action in ('cancel','refund') then
  if old.id is null then raise exception 'Save the order first';end if;
  if p_action='cancel' and old.status<>'unpaid' then raise exception 'Only unpaid orders can be cancelled';end if;
  if p_action='refund' and (old.status<>'paid' or not public.is_admin()) then raise exception 'An administrator must approve a paid-order refund';end if;
  if length(trim(coalesce(p_data->>'reason','')))<3 then raise exception 'Enter a reason';end if;
  if p_action='refund' and old.data->>'payment'='Cash' then select id into sid from pos_shifts118 where cashier=auth.uid() and closed_at is null for update;if sid is null then raise exception 'Open your shift before refunding cash';end if;end if;
  if p_action='refund' and coalesce((p_data->>'restock')::boolean,false) then
   for r in select to_jsonb(x) from pos_stock118 x where order_id=p_id and kind='sale' order by item_id loop
    perform 1 from inventory_items104 where id=(r->>'item_id')::uuid for update;
    insert into pos_stock118(order_id,item_id,quantity,kind,created_by) values(p_id,(r->>'item_id')::uuid,-(r->>'quantity')::numeric,'return',auth.uid());
   end loop;
  end if;
  update pos_orders118 set status=case when p_action='refund' then 'refunded' else 'cancelled' end,version=version+1,updated_at=now(),refunded_at=case when p_action='refund' then now() else null end,data=data||jsonb_build_object('reason',p_data->>'reason','restocked',coalesce((p_data->>'restock')::boolean,false),'actionBy',auth.uid(),'refundShiftId',sid) where id=p_id returning * into result;return to_jsonb(result);
 end if;
 if old.id is not null and old.status<>'unpaid' then raise exception 'This order is already closed';end if;
 if coalesce(jsonb_typeof(p_data->'lines'),'')<>'array' or jsonb_array_length(p_data->'lines') not between 1 and 100 then raise exception 'Add between 1 and 100 order lines';end if;
 if coalesce(p_data->>'service','') not in ('Dine in','Takeaway','Delivery','Online') or length(coalesce(p_data->>'customer',''))>200 or length(coalesce(p_data->>'note',''))>2000 then raise exception 'Invalid order details';end if;
 for line in select value from jsonb_array_elements(p_data->'lines') loop
  select data into d from menu_items104 where id=(line->>'menuId')::uuid;
  if d is null or d->>'active'='false' or d->>'currency'<>'LAK' then raise exception 'Choose an available LAK menu item';end if;
  qty=(line->>'quantity')::numeric;if qty is null or qty<>trunc(qty) or qty not between 1 and 999 then raise exception 'Invalid order quantity';end if;
  price=(d->>'price')::numeric;if price is null or price<0 or price>1000000000 then raise exception 'Invalid menu price';end if;
  if p_action='pay' and d->>'posSetupPending120'='true' then raise exception 'Review this menu recipe and Inventory links in Menu before taking payment';end if;
  recipe=pos_recipe118((line->>'menuId')::uuid,1);choices='{}';names='[]';selected_custom=0;
  for g in select value from jsonb_array_elements(coalesce(d->'posOptions118','[]')) loop
   pick=coalesce(line->'choices'->(g->>'id'),'[]');if jsonb_typeof(pick)<>'array' then raise exception 'Invalid customization';end if;
   count_selected=jsonb_array_length(pick);
   if g->>'id'<>'wellness' then selected_custom=selected_custom+count_selected;end if;
   if g ? 'included' and (coalesce((g->>'included')::integer,-1)<0 or coalesce((g->>'extraPrice')::numeric,-1)<0) then raise exception 'Invalid menu customization pricing';end if;
   if count_selected<coalesce((g->>'min')::integer,0) or count_selected>coalesce((g->>'max')::integer,1) then raise exception 'Review choices for %',g->>'name';end if;
   if (select count(distinct value) from jsonb_array_elements(pick))<>count_selected then raise exception 'Duplicate choice';end if;
   if count_selected>0 then select coalesce(jsonb_agg(x),'[]') into recipe from jsonb_array_elements(recipe) x where not coalesce(g->'replaces','[]') ? (x->>'itemId');end if;
   for ref in select jsonb_array_elements_text(pick) loop
    select x into o from jsonb_array_elements(g->'options') x where x->>'id'=ref;
    if o is null or o->>'available'='false' then raise exception 'An option is unavailable';end if;
    if p_action='pay' and d->>'posCustom118'='true' and jsonb_array_length(coalesce(o->'recipe','[]'::jsonb))=0 and o->>'posNoStock118' is distinct from 'true' then raise exception 'Link the selected customization to Inventory before payment';end if;
    if coalesce((o->>'price')::numeric,0)<0 then raise exception 'Invalid option price';end if;
    price=price+coalesce((o->>'price')::numeric,0);recipe=recipe||coalesce(o->'recipe','[]');names=names||jsonb_build_array(o->>'name');
   end loop;
   if g ? 'included' then price=price+greatest(0,count_selected-(g->>'included')::integer)*(g->>'extraPrice')::numeric;end if;
   choices=choices||jsonb_build_object(g->>'id',pick);
  end loop;
  if d->>'posCustom118'='true' and selected_custom=0 then raise exception 'Select a sauce, veggie or protein';end if;
  if p_action='pay' then
   if jsonb_array_length(recipe)=0 and coalesce(d->>'posNoStock118','false')<>'true' then raise exception 'Link the recipe to Inventory, or mark this item as non-stock in POS Management';end if;
   for r in select value from jsonb_array_elements(recipe) loop
    select data into ing from menu_ingredients105 where id=(r->>'itemId')::uuid;
    if ing is null or ing->>'active'='false' or coalesce(ing->>'inventoryItemId118','')='' then raise exception 'Link every selected ingredient to Inventory in POS Management';end if;
    amount=(r->>'quantity')::numeric*coalesce((ing->>'inventoryFactor118')::numeric,1)*qty;
    if amount is null or amount<=0 then raise exception 'Invalid ingredient unit conversion';end if;
    uses=uses||jsonb_build_array(jsonb_build_object('itemId',ing->>'inventoryItemId118','quantity',amount));
   end loop;
  end if;
  subtotal=subtotal+round(price*qty,2);lines=lines||jsonb_build_array(jsonb_build_object('menuId',line->>'menuId','name',d->>'name','photoData',d->>'photoData','photo118',d->>'photo118','quantity',qty,'unitPrice',price,'choices',choices,'options',names,'note',left(coalesce(line->>'note',''),500)));
 end loop;
 discount=coalesce((p_data->>'discount')::numeric,0);if p_data->>'discountType'='percent' then discount=round(subtotal*discount/100,2);end if;
 if discount<0 or discount>subtotal then raise exception 'Discount exceeds the order amount';end if;
 if not is_admin() and discount>subtotal*coalesce((config->>'discountLimit')::numeric,0)/100 then raise exception 'This discount requires administrator approval';end if;
 if p_data ? 'offlineCapturedAt' then
  offline_at=(p_data->>'offlineCapturedAt')::timestamptz;
  if offline_at is null or offline_at>now()+interval '5 minutes' or offline_at<now()-interval '30 days' then raise exception 'Offline sale date needs review';end if;
  if round(coalesce((p_data->>'offlineTotal')::numeric,-1),2)<>round(subtotal-discount,2) then raise exception 'Menu price or discount changed while offline. Review this sale before syncing';end if;
 end if;
 method=p_data->>'payment';
 if p_action='pay' then
  if method is null or not config->'methods' ? method or coalesce(p_data->>'confirmed','false')<>'true' then raise exception 'Confirm the actual payment received';end if;
  if method<>'Cash' and length(trim(coalesce(p_data->>'paymentReference','')))<3 then raise exception 'Enter the verified bank payment reference';end if;
  select id into sid from pos_shifts118 where cashier=auth.uid() and closed_at is null for update;
  if sid is null then raise exception 'Open your shift in Overview before charging';end if;
  if offline_at is not null and offline_at<(select opened_at from pos_shifts118 where id=sid) then raise exception 'Offline sale predates this shift. Manager review required';end if;
  if method='Cash' and coalesce((p_data->>'tendered')::numeric,0)<subtotal-discount then raise exception 'Cash received is less than the total';end if;
 end if;
 insert into pos_orders118(id,number,data,created_by) select p_id,coalesce(max(number),1000)+1,'{}',auth.uid() from pos_orders118 on conflict(id) do nothing;
 if p_action='pay' then
  for r in select jsonb_build_object('itemId',x->>'itemId','quantity',sum((x->>'quantity')::numeric)) from jsonb_array_elements(uses) x group by x->>'itemId' order by x->>'itemId' loop
   select * into item from inventory_items104 where id=(r->>'itemId')::uuid for update;
   if item.id is null or item.data->>'active'='false' then raise exception 'Inventory item unavailable';end if;
   select coalesce(sum(case when data->>'kind' in ('in','adjust-in') then (data->>'quantity')::numeric else -(data->>'quantity')::numeric end),0) into on_hand from inventory_movements104 where data->>'itemId'=item.id::text;
   select coalesce(sum(quantity),0) into consumption from pos_stock118 where item_id=item.id;
   if on_hand-consumption<(r->>'quantity')::numeric then raise exception 'Insufficient stock: %',item.data->>'name';end if;
   insert into pos_stock118(order_id,item_id,quantity,kind,created_by) values(p_id,item.id,(r->>'quantity')::numeric,'sale',auth.uid());
  end loop;
 end if;
 update pos_orders118 set data=jsonb_build_object('lines',lines,'service',p_data->>'service','customer',left(coalesce(p_data->>'customer',''),200),'note',left(coalesce(p_data->>'note',''),2000),'subtotal',subtotal,'discount',discount,'discountType','amount','total',subtotal-discount,'currency','LAK','payment',case when p_action='pay' then method else null end,'paymentReference',p_data->>'paymentReference','tendered',p_data->>'tendered','shiftId',sid,'cashier',(select full_name from profiles where id=auth.uid()),'offlineNonce',p_data->>'offlineNonce'),status=case when p_action='pay' then 'paid' else 'unpaid' end,version=coalesce(old.version,0)+1,updated_at=now(),paid_at=case when p_action='pay' then coalesce(offline_at,now()) else null end where id=p_id returning * into result;
 return to_jsonb(result);
end$$;

create or replace function public.pos_import_online_menu120() returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $import$
declare source jsonb:='{"categories":["Burgers","Sandwiches","Tex-Mex","Pasta","Build Your Bowl","Smoothies","Refreshers","Wellness Drinks"],"menu":[{"code":"WEB-B1","name":"Burger Combo","price":199000,"currency":"LAK","description":"The Classic Burger + Mint Pineapple Refresher + Lemon Oat Cookie.","sourceIngredients":"The Classic Burger + Mint Pineapple Refresher + Lemon Oat Cookie.","sourceMenu118":"b1","sourceCategory":"Burgers","itemType":"single","active":true,"posCustom118":false,"posSetupPending120":true,"recipe":[],"posOptions118":[],"photoUrl":"https://i.postimg.cc/h4TW6rLk/Burger-combo-1.webp"},{"code":"WEB-B2","name":"The Classic","price":120000,"currency":"LAK","description":"Meaty patty, lettuce, tomato, onion, pickles, garlic mayo, and cheese sauce. Served with a portion of fries.","sourceIngredients":"Meaty patty, lettuce, tomato, onion, pickles, garlic mayo, and cheese sauce. Served with a portion of fries.","sourceMenu118":"b2","sourceCategory":"Burgers","itemType":"single","active":true,"posCustom118":false,"posSetupPending120":true,"recipe":[],"posOptions118":[],"photoUrl":"https://i.postimg.cc/0jpTSk5t/classic-1.webp"},{"code":"WEB-B3","name":"The Cheeser","price":110000,"currency":"LAK","description":"Meaty patty, tomato, garlic mayo, and cheese sauce. Served with a portion of fries.","sourceIngredients":"Meaty patty, tomato, garlic mayo, and cheese sauce. Served with a portion of fries.","sourceMenu118":"b3","sourceCategory":"Burgers","itemType":"single","active":true,"posCustom118":false,"posSetupPending120":true,"recipe":[],"posOptions118":[],"photoUrl":"https://i.postimg.cc/v87p8m4T/cheeser.webp"},{"code":"WEB-B4","name":"The Bougie","price":130000,"currency":"LAK","description":"Meaty patty, microgreens, tomato, caramelized onion, sautéed mushroom, grilled pineapple, and basil mayo. Served with a portion of fries.","sourceIngredients":"Meaty patty, microgreens, tomato, caramelized onion, sautéed mushroom, grilled pineapple, and basil mayo. Served with a portion of fries.","sourceMenu118":"b4","sourceCategory":"Burgers","itemType":"single","active":true,"posCustom118":false,"posSetupPending120":true,"recipe":[],"posOptions118":[],"photoUrl":"https://i.postimg.cc/QCp278NY/Bougie-1.webp"},{"code":"WEB-B5","name":"French Fries","price":60000,"currency":"LAK","description":"Crispy golden French fries with seasoning.","sourceIngredients":"Crispy golden French fries with seasoning.","sourceMenu118":"b5","sourceCategory":"Burgers","itemType":"single","active":true,"posCustom118":false,"posSetupPending120":true,"recipe":[],"posOptions118":[],"photoUrl":""},{"code":"WEB-S1","name":"Sandwich Combo","price":180000,"currency":"LAK","description":"Chickelicious sandwich + Paradise Point Refresher + Brownie.","sourceIngredients":"Chickelicious sandwich + Paradise Point Refresher + Brownie.","sourceMenu118":"s1","sourceCategory":"Sandwiches","itemType":"single","active":true,"posCustom118":false,"posSetupPending120":true,"recipe":[],"posOptions118":[],"photoUrl":"https://i.postimg.cc/KcBSwN78/Chickelious-1.webp"},{"code":"WEB-S2","name":"Mediterranean","price":105000,"currency":"LAK","description":"Falafel, hummus, tahini sauce, tomato, pickles, mint, and cilantro.","sourceIngredients":"Falafel, hummus, tahini sauce, tomato, pickles, mint, and cilantro.","sourceMenu118":"s2","sourceCategory":"Sandwiches","itemType":"single","active":true,"posCustom118":false,"posSetupPending120":true,"recipe":[],"posOptions118":[],"photoUrl":"https://i.postimg.cc/QtwghSrd/Mediteranian-1.webp"},{"code":"WEB-S3","name":"Italian","price":105000,"currency":"LAK","description":"Grilled tofu, sautéed veggies, tomato, lettuce, onion, and basil mayo.","sourceIngredients":"Grilled tofu, sautéed veggies, tomato, lettuce, onion, and basil mayo.","sourceMenu118":"s3","sourceCategory":"Sandwiches","itemType":"single","active":true,"posCustom118":false,"posSetupPending120":true,"recipe":[],"posOptions118":[],"photoUrl":"https://i.postimg.cc/L5zcP94C/Italian-1.webp"},{"code":"WEB-S4","name":"Chickelicious","price":110000,"currency":"LAK","description":"Plant-based chicken, caramelized onion, olives, microgreens, tomato, cheese sauce, and basil mayo.","sourceIngredients":"Plant-based chicken, caramelized onion, olives, microgreens, tomato, cheese sauce, and basil mayo.","sourceMenu118":"s4","sourceCategory":"Sandwiches","itemType":"single","active":true,"posCustom118":false,"posSetupPending120":true,"recipe":[],"posOptions118":[],"photoUrl":"https://i.postimg.cc/KcBSwN78/Chickelious-1.webp"},{"code":"WEB-S5","name":"Build Your Own Sandwich","price":110000,"currency":"LAK","description":"Customizable sandwich. Choose your sauces, veggies, and protein.","sourceIngredients":"Customizable sandwich. Choose your sauces, veggies, and protein.","sourceMenu118":"s5","sourceCategory":"Sandwiches","itemType":"single","active":true,"posCustom118":true,"posSetupPending120":true,"recipe":[],"posOptions118":[{"id":"sauces","name":"Sauces","min":0,"max":2,"included":2,"extraPrice":0,"options":[{"id":"garlic-mayo","name":"Garlic mayo","price":0,"recipe":[]},{"id":"basil-mayo","name":"Basil mayo","price":0,"recipe":[]},{"id":"chili-mayo","name":"Chili mayo","price":0,"recipe":[]},{"id":"tahini-sauce","name":"Tahini sauce","price":0,"recipe":[]},{"id":"hummus","name":"Hummus","price":0,"recipe":[]},{"id":"cheese-sauce","name":"Cheese sauce","price":0,"recipe":[]}]},{"id":"veggies","name":"Veggies","min":0,"max":12,"included":3,"extraPrice":7000,"options":[{"id":"grilled-mushrooms","name":"Grilled mushrooms","price":0,"recipe":[]},{"id":"grilled-bell-peppers","name":"Grilled bell peppers","price":0,"recipe":[]},{"id":"grilled-eggplant","name":"Grilled eggplant","price":0,"recipe":[]},{"id":"caramelized-onion","name":"Caramelized onion","price":0,"recipe":[]},{"id":"microgreens","name":"Microgreens","price":0,"recipe":[]},{"id":"avocado","name":"Avocado","price":0,"recipe":[]},{"id":"lettuce","name":"Lettuce","price":0,"recipe":[]},{"id":"tomatoes","name":"Tomatoes","price":0,"recipe":[]},{"id":"onions","name":"Onions","price":0,"recipe":[]},{"id":"carrots","name":"Carrots","price":0,"recipe":[]},{"id":"olives","name":"Olives","price":0,"recipe":[]},{"id":"corn","name":"Corn","price":0,"recipe":[]}]},{"id":"proteins","name":"Proteins","min":0,"max":5,"included":1,"extraPrice":7000,"options":[{"id":"sautéed-tofu","name":"Sautéed tofu","price":0,"recipe":[]},{"id":"lemon-chicken","name":"Lemon chicken","price":0,"recipe":[]},{"id":"ground-meat","name":"Ground meat","price":0,"recipe":[]},{"id":"spicy-sausage","name":"Spicy sausage","price":0,"recipe":[]},{"id":"regular-sausage","name":"Regular sausage","price":0,"recipe":[]}]}],"photoUrl":""},{"code":"WEB-TX1","name":"Tex-Mex Combo","price":210000,"currency":"LAK","description":"Tacos + Quesadilla + Mint Pineapple Refresher.","sourceIngredients":"Tacos + Quesadilla + Mint Pineapple Refresher.","sourceMenu118":"tx1","sourceCategory":"Tex-Mex","itemType":"single","active":true,"posCustom118":false,"posSetupPending120":true,"recipe":[],"posOptions118":[],"photoUrl":"https://i.postimg.cc/tTYdKw8Z/Tex-Mex-combo-1.webp"},{"code":"WEB-TX2","name":"Quesadilla","price":85000,"currency":"LAK","description":"Flour tortilla with cheese sauce, ground meat, and pico de gallo.","sourceIngredients":"Flour tortilla with cheese sauce, ground meat, and pico de gallo.","sourceMenu118":"tx2","sourceCategory":"Tex-Mex","itemType":"single","active":true,"posCustom118":false,"posSetupPending120":true,"recipe":[],"posOptions118":[],"photoUrl":"https://i.postimg.cc/DZX2H3nX/Review-3.jpg"},{"code":"WEB-TX3","name":"Tacos","price":99000,"currency":"LAK","description":"Two soft shell tacos filled with ground meat or black beans, grilled bell pepper, avocado, pico de gallo, and cheese sauce.","sourceIngredients":"Two soft shell tacos filled with ground meat or black beans, grilled bell pepper, avocado, pico de gallo, and cheese sauce.","sourceMenu118":"tx3","sourceCategory":"Tex-Mex","itemType":"single","active":true,"posCustom118":false,"posSetupPending120":true,"recipe":[],"posOptions118":[],"photoUrl":"https://i.postimg.cc/DZX2H3nX/Review-3.jpg"},{"code":"WEB-P1","name":"Miso-Seaweed","price":110000,"currency":"LAK","description":"Herb, fresh, vibrant, and aromatic miso-seaweed fusion.","sourceIngredients":"Herb, fresh, vibrant, and aromatic miso-seaweed fusion.","sourceMenu118":"p1","sourceCategory":"Pasta","itemType":"single","active":true,"posCustom118":false,"posSetupPending120":true,"recipe":[],"posOptions118":[],"photoUrl":"https://i.postimg.cc/DZ8Q9HR8/Miso-pasta-1.webp"},{"code":"WEB-P2","name":"Carbonara","price":110000,"currency":"LAK","description":"Rich and creamy pasta made with peanut butter and coconut milk.","sourceIngredients":"Rich and creamy pasta made with peanut butter and coconut milk.","sourceMenu118":"p2","sourceCategory":"Pasta","itemType":"single","active":true,"posCustom118":false,"posSetupPending120":true,"recipe":[],"posOptions118":[],"photoUrl":"https://i.postimg.cc/B6X5rkRv/Carbonara-1.webp"},{"code":"WEB-P3","name":"Spaghetti","price":110000,"currency":"LAK","description":"Classic spaghetti packed with fresh, bright tomato goodness.","sourceIngredients":"Classic spaghetti packed with fresh, bright tomato goodness.","sourceMenu118":"p3","sourceCategory":"Pasta","itemType":"single","active":true,"posCustom118":false,"posSetupPending120":true,"recipe":[],"posOptions118":[],"photoUrl":"https://i.postimg.cc/k4BN0zLD/spaghetti-1.webp"},{"code":"WEB-P4","name":"Pesto Pasta","price":110000,"currency":"LAK","description":"Herb, fresh, vibrant, and aromatic basil pesto.","sourceIngredients":"Herb, fresh, vibrant, and aromatic basil pesto.","sourceMenu118":"p4","sourceCategory":"Pasta","itemType":"single","active":true,"posCustom118":false,"posSetupPending120":true,"recipe":[],"posOptions118":[],"photoUrl":"https://i.postimg.cc/gJnyCQ12/Pesto-1.webp"},{"code":"WEB-BW1","name":"Bowl Combo","price":160000,"currency":"LAK","description":"Protein pack + Wellness drink of your choice + Banana bread.","sourceIngredients":"Protein pack + Wellness drink of your choice + Banana bread.","sourceMenu118":"bw1","sourceCategory":"Build Your Bowl","itemType":"single","active":true,"posCustom118":true,"posSetupPending120":true,"recipe":[],"posOptions118":[{"id":"sauces","name":"Sauces","min":0,"max":2,"included":2,"extraPrice":0,"options":[{"id":"garlic-mayo","name":"Garlic mayo","price":0,"recipe":[]},{"id":"basil-mayo","name":"Basil mayo","price":0,"recipe":[]},{"id":"chili-mayo","name":"Chili mayo","price":0,"recipe":[]},{"id":"tahini-sauce","name":"Tahini sauce","price":0,"recipe":[]},{"id":"hummus","name":"Hummus","price":0,"recipe":[]},{"id":"cheese-sauce","name":"Cheese sauce","price":0,"recipe":[]}]},{"id":"veggies","name":"Veggies","min":0,"max":12,"included":4,"extraPrice":7000,"options":[{"id":"grilled-mushrooms","name":"Grilled mushrooms","price":0,"recipe":[]},{"id":"grilled-bell-peppers","name":"Grilled bell peppers","price":0,"recipe":[]},{"id":"grilled-eggplant","name":"Grilled eggplant","price":0,"recipe":[]},{"id":"caramelized-onion","name":"Caramelized onion","price":0,"recipe":[]},{"id":"microgreens","name":"Microgreens","price":0,"recipe":[]},{"id":"avocado","name":"Avocado","price":0,"recipe":[]},{"id":"lettuce","name":"Lettuce","price":0,"recipe":[]},{"id":"tomatoes","name":"Tomatoes","price":0,"recipe":[]},{"id":"onions","name":"Onions","price":0,"recipe":[]},{"id":"carrots","name":"Carrots","price":0,"recipe":[]},{"id":"olives","name":"Olives","price":0,"recipe":[]},{"id":"corn","name":"Corn","price":0,"recipe":[]}]},{"id":"proteins","name":"Proteins","min":0,"max":7,"included":2,"extraPrice":7000,"options":[{"id":"beans","name":"Beans","price":0,"recipe":[]},{"id":"sautéed-tofu","name":"Sautéed tofu","price":0,"recipe":[]},{"id":"lemon-chicken","name":"Lemon chicken","price":0,"recipe":[]},{"id":"ground-meat","name":"Ground meat","price":0,"recipe":[]},{"id":"spicy-sausage","name":"Spicy sausage","price":0,"recipe":[]},{"id":"regular-sausage","name":"Regular sausage","price":0,"recipe":[]},{"id":"falafel","name":"Falafel","price":0,"recipe":[]}]},{"id":"wellness","name":"Wellness drink","min":1,"max":1,"options":[{"id":"summer-in-my-heart","name":"Summer in My Heart","price":0,"recipe":[]},{"id":"wish-upon-a-heart","name":"Wish Upon a Heart","price":0,"recipe":[]},{"id":"heartwarmer","name":"Heartwarmer","price":0,"recipe":[]},{"id":"red-heart","name":"Red Heart","price":0,"recipe":[]}]}],"photoUrl":"https://i.postimg.cc/gcyfc0xL/Bowl-combo.webp"},{"code":"WEB-BW2","name":"Veggie Pack","price":110000,"currency":"LAK","description":"Includes 2 sauces, 5 veggies, and 1 protein. Additional choices (+7,000 Kip each).","sourceIngredients":"Includes 2 sauces, 5 veggies, and 1 protein. Additional choices (+7,000 Kip each).","sourceMenu118":"bw2","sourceCategory":"Build Your Bowl","itemType":"single","active":true,"posCustom118":true,"posSetupPending120":true,"recipe":[],"posOptions118":[{"id":"sauces","name":"Sauces","min":0,"max":2,"included":2,"extraPrice":0,"options":[{"id":"garlic-mayo","name":"Garlic mayo","price":0,"recipe":[]},{"id":"basil-mayo","name":"Basil mayo","price":0,"recipe":[]},{"id":"chili-mayo","name":"Chili mayo","price":0,"recipe":[]},{"id":"tahini-sauce","name":"Tahini sauce","price":0,"recipe":[]},{"id":"hummus","name":"Hummus","price":0,"recipe":[]},{"id":"cheese-sauce","name":"Cheese sauce","price":0,"recipe":[]}]},{"id":"veggies","name":"Veggies","min":0,"max":12,"included":5,"extraPrice":7000,"options":[{"id":"grilled-mushrooms","name":"Grilled mushrooms","price":0,"recipe":[]},{"id":"grilled-bell-peppers","name":"Grilled bell peppers","price":0,"recipe":[]},{"id":"grilled-eggplant","name":"Grilled eggplant","price":0,"recipe":[]},{"id":"caramelized-onion","name":"Caramelized onion","price":0,"recipe":[]},{"id":"microgreens","name":"Microgreens","price":0,"recipe":[]},{"id":"avocado","name":"Avocado","price":0,"recipe":[]},{"id":"lettuce","name":"Lettuce","price":0,"recipe":[]},{"id":"tomatoes","name":"Tomatoes","price":0,"recipe":[]},{"id":"onions","name":"Onions","price":0,"recipe":[]},{"id":"carrots","name":"Carrots","price":0,"recipe":[]},{"id":"olives","name":"Olives","price":0,"recipe":[]},{"id":"corn","name":"Corn","price":0,"recipe":[]}]},{"id":"proteins","name":"Proteins","min":0,"max":7,"included":1,"extraPrice":7000,"options":[{"id":"beans","name":"Beans","price":0,"recipe":[]},{"id":"sautéed-tofu","name":"Sautéed tofu","price":0,"recipe":[]},{"id":"lemon-chicken","name":"Lemon chicken","price":0,"recipe":[]},{"id":"ground-meat","name":"Ground meat","price":0,"recipe":[]},{"id":"spicy-sausage","name":"Spicy sausage","price":0,"recipe":[]},{"id":"regular-sausage","name":"Regular sausage","price":0,"recipe":[]},{"id":"falafel","name":"Falafel","price":0,"recipe":[]}]}],"photoUrl":"https://i.postimg.cc/MZ0hZGnM/Build-Your-own.webp"},{"code":"WEB-BW3","name":"Protein Pack","price":115000,"currency":"LAK","description":"Includes 2 sauces, 4 veggies, and 2 proteins. Additional choices (+7,000 Kip each).","sourceIngredients":"Includes 2 sauces, 4 veggies, and 2 proteins. Additional choices (+7,000 Kip each).","sourceMenu118":"bw3","sourceCategory":"Build Your Bowl","itemType":"single","active":true,"posCustom118":true,"posSetupPending120":true,"recipe":[],"posOptions118":[{"id":"sauces","name":"Sauces","min":0,"max":2,"included":2,"extraPrice":0,"options":[{"id":"garlic-mayo","name":"Garlic mayo","price":0,"recipe":[]},{"id":"basil-mayo","name":"Basil mayo","price":0,"recipe":[]},{"id":"chili-mayo","name":"Chili mayo","price":0,"recipe":[]},{"id":"tahini-sauce","name":"Tahini sauce","price":0,"recipe":[]},{"id":"hummus","name":"Hummus","price":0,"recipe":[]},{"id":"cheese-sauce","name":"Cheese sauce","price":0,"recipe":[]}]},{"id":"veggies","name":"Veggies","min":0,"max":12,"included":4,"extraPrice":7000,"options":[{"id":"grilled-mushrooms","name":"Grilled mushrooms","price":0,"recipe":[]},{"id":"grilled-bell-peppers","name":"Grilled bell peppers","price":0,"recipe":[]},{"id":"grilled-eggplant","name":"Grilled eggplant","price":0,"recipe":[]},{"id":"caramelized-onion","name":"Caramelized onion","price":0,"recipe":[]},{"id":"microgreens","name":"Microgreens","price":0,"recipe":[]},{"id":"avocado","name":"Avocado","price":0,"recipe":[]},{"id":"lettuce","name":"Lettuce","price":0,"recipe":[]},{"id":"tomatoes","name":"Tomatoes","price":0,"recipe":[]},{"id":"onions","name":"Onions","price":0,"recipe":[]},{"id":"carrots","name":"Carrots","price":0,"recipe":[]},{"id":"olives","name":"Olives","price":0,"recipe":[]},{"id":"corn","name":"Corn","price":0,"recipe":[]}]},{"id":"proteins","name":"Proteins","min":0,"max":7,"included":2,"extraPrice":7000,"options":[{"id":"beans","name":"Beans","price":0,"recipe":[]},{"id":"sautéed-tofu","name":"Sautéed tofu","price":0,"recipe":[]},{"id":"lemon-chicken","name":"Lemon chicken","price":0,"recipe":[]},{"id":"ground-meat","name":"Ground meat","price":0,"recipe":[]},{"id":"spicy-sausage","name":"Spicy sausage","price":0,"recipe":[]},{"id":"regular-sausage","name":"Regular sausage","price":0,"recipe":[]},{"id":"falafel","name":"Falafel","price":0,"recipe":[]}]}],"photoUrl":"https://i.postimg.cc/MZ0hZGnM/Build-Your-own.webp"},{"code":"WEB-BW4","name":"Mini Pack","price":99000,"currency":"LAK","description":"Includes 1 sauce, 3 veggies, and 1 protein. Additional choices (+7,000 Kip each).","sourceIngredients":"Includes 1 sauce, 3 veggies, and 1 protein. Additional choices (+7,000 Kip each).","sourceMenu118":"bw4","sourceCategory":"Build Your Bowl","itemType":"single","active":true,"posCustom118":true,"posSetupPending120":true,"recipe":[],"posOptions118":[{"id":"sauces","name":"Sauces","min":0,"max":1,"included":1,"extraPrice":0,"options":[{"id":"garlic-mayo","name":"Garlic mayo","price":0,"recipe":[]},{"id":"basil-mayo","name":"Basil mayo","price":0,"recipe":[]},{"id":"chili-mayo","name":"Chili mayo","price":0,"recipe":[]},{"id":"tahini-sauce","name":"Tahini sauce","price":0,"recipe":[]},{"id":"hummus","name":"Hummus","price":0,"recipe":[]},{"id":"cheese-sauce","name":"Cheese sauce","price":0,"recipe":[]}]},{"id":"veggies","name":"Veggies","min":0,"max":12,"included":3,"extraPrice":7000,"options":[{"id":"grilled-mushrooms","name":"Grilled mushrooms","price":0,"recipe":[]},{"id":"grilled-bell-peppers","name":"Grilled bell peppers","price":0,"recipe":[]},{"id":"grilled-eggplant","name":"Grilled eggplant","price":0,"recipe":[]},{"id":"caramelized-onion","name":"Caramelized onion","price":0,"recipe":[]},{"id":"microgreens","name":"Microgreens","price":0,"recipe":[]},{"id":"avocado","name":"Avocado","price":0,"recipe":[]},{"id":"lettuce","name":"Lettuce","price":0,"recipe":[]},{"id":"tomatoes","name":"Tomatoes","price":0,"recipe":[]},{"id":"onions","name":"Onions","price":0,"recipe":[]},{"id":"carrots","name":"Carrots","price":0,"recipe":[]},{"id":"olives","name":"Olives","price":0,"recipe":[]},{"id":"corn","name":"Corn","price":0,"recipe":[]}]},{"id":"proteins","name":"Proteins","min":0,"max":7,"included":1,"extraPrice":7000,"options":[{"id":"beans","name":"Beans","price":0,"recipe":[]},{"id":"sautéed-tofu","name":"Sautéed tofu","price":0,"recipe":[]},{"id":"lemon-chicken","name":"Lemon chicken","price":0,"recipe":[]},{"id":"ground-meat","name":"Ground meat","price":0,"recipe":[]},{"id":"spicy-sausage","name":"Spicy sausage","price":0,"recipe":[]},{"id":"regular-sausage","name":"Regular sausage","price":0,"recipe":[]},{"id":"falafel","name":"Falafel","price":0,"recipe":[]}]}],"photoUrl":"https://i.postimg.cc/MZ0hZGnM/Build-Your-own.webp"},{"code":"WEB-SM1","name":"Kickstart","price":70000,"currency":"LAK","description":"Banana, pineapple, and spinach. No ice or sugar added, sweetened by dates.","sourceIngredients":"Banana, pineapple, and spinach. No ice or sugar added, sweetened by dates.","sourceMenu118":"sm1","sourceCategory":"Smoothies","itemType":"single","active":true,"posCustom118":false,"posSetupPending120":true,"recipe":[],"posOptions118":[],"photoUrl":"https://i.postimg.cc/5222wwfM/Kickstart.webp"},{"code":"WEB-SM2","name":"Fruitopia","price":70000,"currency":"LAK","description":"Mango, strawberry, and pineapple. No ice or sugar added, sweetened by dates.","sourceIngredients":"Mango, strawberry, and pineapple. No ice or sugar added, sweetened by dates.","sourceMenu118":"sm2","sourceCategory":"Smoothies","itemType":"single","active":true,"posCustom118":false,"posSetupPending120":true,"recipe":[],"posOptions118":[],"photoUrl":"https://i.postimg.cc/vZZZWWGF/Fruitopia.webp"},{"code":"WEB-SM3","name":"Paradise Point","price":70000,"currency":"LAK","description":"Passion fruit and pineapple. No ice or sugar added, sweetened by dates.","sourceIngredients":"Passion fruit and pineapple. No ice or sugar added, sweetened by dates.","sourceMenu118":"sm3","sourceCategory":"Smoothies","itemType":"single","active":true,"posCustom118":false,"posSetupPending120":true,"recipe":[],"posOptions118":[],"photoUrl":"https://i.postimg.cc/T333rrT8/Paradise-point-1.webp"},{"code":"WEB-SM4","name":"Mary Jane","price":80000,"currency":"LAK","description":"Strawberry, mulberry, and banana. No ice or sugar added, sweetened by dates.","sourceIngredients":"Strawberry, mulberry, and banana. No ice or sugar added, sweetened by dates.","sourceMenu118":"sm4","sourceCategory":"Smoothies","itemType":"single","active":true,"posCustom118":false,"posSetupPending120":true,"recipe":[],"posOptions118":[],"photoUrl":"https://i.postimg.cc/9QQQGGC6/Mary-Jane-1.webp"},{"code":"WEB-SM5","name":"Reese''s Cup","price":70000,"currency":"LAK","description":"Banana, peanut butter, and cocoa powder. No ice or sugar added, sweetened by dates.","sourceIngredients":"Banana, peanut butter, and cocoa powder. No ice or sugar added, sweetened by dates.","sourceMenu118":"sm5","sourceCategory":"Smoothies","itemType":"single","active":true,"posCustom118":false,"posSetupPending120":true,"recipe":[],"posOptions118":[],"photoUrl":"https://i.postimg.cc/T333rrfF/Reese-s-Cup-1.webp"},{"code":"WEB-R1","name":"Mint Pineapple","price":45000,"currency":"LAK","description":"Fresh mint and pineapple.","sourceIngredients":"Fresh mint and pineapple.","sourceMenu118":"r1","sourceCategory":"Refreshers","itemType":"single","active":true,"posCustom118":false,"posSetupPending120":true,"recipe":[],"posOptions118":[],"photoUrl":""},{"code":"WEB-R2","name":"Strawberry Lemonade","price":50000,"currency":"LAK","description":"Strawberry and lime.","sourceIngredients":"Strawberry and lime.","sourceMenu118":"r2","sourceCategory":"Refreshers","itemType":"single","active":true,"posCustom118":false,"posSetupPending120":true,"recipe":[],"posOptions118":[],"photoUrl":""},{"code":"WEB-R3","name":"Sparkling Lime","price":45000,"currency":"LAK","description":"Sparkling water and fresh lime.","sourceIngredients":"Sparkling water and fresh lime.","sourceMenu118":"r3","sourceCategory":"Refreshers","itemType":"single","active":true,"posCustom118":false,"posSetupPending120":true,"recipe":[],"posOptions118":[],"photoUrl":""},{"code":"WEB-R4","name":"Honey Passion","price":45000,"currency":"LAK","description":"Passion fruit and honey.","sourceIngredients":"Passion fruit and honey.","sourceMenu118":"r4","sourceCategory":"Refreshers","itemType":"single","active":true,"posCustom118":false,"posSetupPending120":true,"recipe":[],"posOptions118":[],"photoUrl":""},{"code":"WEB-W1","name":"Summer in My Heart","price":47000,"currency":"LAK","description":"Pineapple juice and coconut water.","sourceIngredients":"Pineapple juice and coconut water.","sourceMenu118":"w1","sourceCategory":"Wellness Drinks","itemType":"single","active":true,"posCustom118":false,"posSetupPending120":true,"recipe":[],"posOptions118":[],"photoUrl":"https://i.postimg.cc/pTpQw43P/Summer-1.webp"},{"code":"WEB-W2","name":"Wish Upon a Heart","price":47000,"currency":"LAK","description":"Green apple, basil cordial, lemon juice, and tapioca pearls.","sourceIngredients":"Green apple, basil cordial, lemon juice, and tapioca pearls.","sourceMenu118":"w2","sourceCategory":"Wellness Drinks","itemType":"single","active":true,"posCustom118":false,"posSetupPending120":true,"recipe":[],"posOptions118":[],"photoUrl":"https://i.postimg.cc/4dmvDqjs/Wish-1.webp"},{"code":"WEB-W3","name":"Heartwarmer","price":47000,"currency":"LAK","description":"Ginger and turmeric tea, lemon juice, honey, and chia seeds.","sourceIngredients":"Ginger and turmeric tea, lemon juice, honey, and chia seeds.","sourceMenu118":"w3","sourceCategory":"Wellness Drinks","itemType":"single","active":true,"posCustom118":false,"posSetupPending120":true,"recipe":[],"posOptions118":[],"photoUrl":"https://i.postimg.cc/xCcGwhBQ/heartwarmer-1.webp"},{"code":"WEB-W4","name":"Red Heart","price":47000,"currency":"LAK","description":"Lemongrass cordial, lemon, beetroot, and apple.","sourceIngredients":"Lemongrass cordial, lemon, beetroot, and apple.","sourceMenu118":"w4","sourceCategory":"Wellness Drinks","itemType":"single","active":true,"posCustom118":false,"posSetupPending120":true,"recipe":[],"posOptions118":[],"photoUrl":"https://i.postimg.cc/DZ8Q9HR2/Red-heart-1.webp"}],"ingredients":["Grilled mushrooms","Grilled bell peppers","Grilled eggplant","Caramelized onion","Microgreens","Avocado","Lettuce","Tomatoes","Onions","Carrots","Olives","Corn","Beans","Sautéed tofu","Lemon chicken","Ground meat","Spicy sausage","Regular sausage","Falafel","Garlic mayo","Basil mayo","Chili mayo","Tahini sauce","Hummus","Cheese sauce","Meaty patty","Pickles","Fries","Grilled pineapple","Mint","Cilantro","Grilled tofu","Sautéed veggies","Plant-based chicken","Flour tortilla","Pico de gallo","Black beans","Peanut butter","Coconut milk","Banana","Pineapple","Spinach","Dates","Mango","Strawberry","Passion fruit","Mulberry","Cocoa powder","Lime","Sparkling water","Honey","Pineapple juice","Coconut water","Green apple","Basil cordial","Lemon juice","Tapioca pearls","Ginger","Turmeric tea","Chia seeds","Lemongrass cordial","Lemon","Beetroot","Apple"]}'::jsonb; r jsonb; category_id uuid; d jsonb;
begin
 if not public.is_admin() then raise exception 'Administrator access required'; end if;
 for r in select value from jsonb_array_elements(source->'categories') loop
  if not exists(select 1 from public.menu_categories104 where lower(data->>'name')=lower(r#>>'{}')) then
   insert into public.menu_categories104(data) values(jsonb_build_object('code','WEB-CAT-'||upper(regexp_replace(r#>>'{}','[^a-zA-Z0-9]+','-','g')),'name',r#>>'{}','description','Imported from the public online menu'));
  end if;
 end loop;
 for r in select value from jsonb_array_elements(source->'ingredients') loop
  if not exists(select 1 from public.menu_ingredients105 where lower(data->>'name')=lower(r#>>'{}')) then
   insert into public.menu_ingredients105(data) values(jsonb_build_object('code','WEB-ING-'||upper(regexp_replace(r#>>'{}','[^a-zA-Z0-9]+','-','g')),'name',r#>>'{}','unit','each','currency','LAK','active',false,'purchaseQuantity',1,'purchasePrice',0,'cost',0,'sourceNote120','Name from online menu; set the real unit, cost and inventory link before use'));
  end if;
 end loop;
 for r in select value from jsonb_array_elements(source->'menu') loop
  select id into category_id from public.menu_categories104 where lower(data->>'name')=lower(r->>'sourceCategory') limit 1;
  if not exists(select 1 from public.menu_items104 where lower(data->>'name')=lower(r->>'name') or lower(data->>'code')=lower(r->>'code')) then
   d=(r-'sourceCategory')||jsonb_build_object('category',category_id);
   insert into public.menu_items104(data) values(d);
  end if;
 end loop;
 return jsonb_build_object('menu',(select count(*) from public.menu_items104 where data ? 'sourceMenu118'),'ingredients',(select count(*) from public.menu_ingredients105 where data ? 'sourceNote120'));
end $import$;
revoke all on function public.pos_import_online_menu120() from public,anon;
grant execute on function public.pos_import_online_menu120() to authenticated;

create table if not exists public.restaurant_members121 (
 user_id uuid primary key references public.profiles(id) on delete cascade,
 email text not null default '', display_name text not null default '', enabled boolean not null default true,
 permissions jsonb not null default '{}' check(jsonb_typeof(permissions)='object'),
 must_change_password boolean not null default false, created_at timestamptz not null default now()
);
create table if not exists public.restaurant_presentation121 (
 area text primary key,data jsonb not null default '{}' check(jsonb_typeof(data)='object'),
 updated_by uuid references public.profiles(id),updated_at timestamptz not null default now()
);
create or replace function public.restaurant_can121(p_scope text,p_action text default 'view') returns boolean
language sql stable security definer set search_path=public,pg_temp as $$
 select restaurant_private.active_user() and (public.is_admin() or exists(
 select 1 from public.restaurant_members121 m where m.user_id=auth.uid() and m.enabled and not m.must_change_password
 and m.permissions->p_scope->>'view'='true' and m.permissions->p_scope->>p_action='true'))
$$;
create or replace function public.restaurant_signed_in121() returns boolean language sql stable security definer set search_path=public,pg_temp as $$
 select restaurant_private.active_user() and (public.is_admin() or exists(select 1 from restaurant_members121 where user_id=auth.uid() and enabled and not must_change_password))
$$;
alter table public.restaurant_members121 enable row level security;
alter table public.restaurant_presentation121 enable row level security;
revoke all on public.restaurant_members121,public.restaurant_presentation121 from anon,authenticated;
grant select,insert,update,delete on public.restaurant_members121 to authenticated;
grant select,insert,update on public.restaurant_presentation121 to authenticated;
drop policy if exists restaurant_member_read121 on public.restaurant_members121;
create policy restaurant_member_read121 on public.restaurant_members121 for select to authenticated using(user_id=auth.uid() or public.is_admin());
drop policy if exists restaurant_member_admin121 on public.restaurant_members121;
create policy restaurant_member_admin121 on public.restaurant_members121 for all to authenticated using(public.is_admin()) with check(public.is_admin());
drop policy if exists restaurant_presentation_read121 on public.restaurant_presentation121;
create policy restaurant_presentation_read121 on public.restaurant_presentation121 for select to authenticated using(public.restaurant_signed_in121());
drop policy if exists restaurant_presentation_write121 on public.restaurant_presentation121;
create policy restaurant_presentation_write121 on public.restaurant_presentation121 for all to authenticated using(public.restaurant_can121('settings','appearance')) with check(public.restaurant_can121('settings','appearance'));
create or replace function public.restaurant_password_changed121() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if new.encrypted_password is distinct from old.encrypted_password then
  update restaurant_members121 set must_change_password=false where user_id=new.id and must_change_password;
 end if;return new;
end $$;
drop trigger if exists restaurant_password_changed121 on auth.users;
create trigger restaurant_password_changed121 after update of encrypted_password on auth.users for each row execute function public.restaurant_password_changed121();

create or replace function public.restaurant_table_can121(p_table text,p_action text,p_data jsonb default '{}') returns boolean
language plpgsql stable security definer set search_path=public,pg_temp as $$
begin
 if auth.uid() is null then return false;end if;
 if public.is_admin() then return true;end if;
 if p_table not in ('inventory_items104','inventory_movements104','menu_ingredients105','menu_items104','menu_categories104','menu_sales108') then return false;end if;
 if p_action='view' then
  if p_table in ('inventory_items104','inventory_movements104') then return restaurant_can121('inventory') or restaurant_can121('menu');end if;
  return restaurant_can121('menu');
 end if;
 if p_table='inventory_movements104' then
  if p_action='delete' then return false;end if;
  return restaurant_can121('inventory',case p_data->>'kind' when 'in' then 'stock_in' when 'out' then 'stock_out' when 'adjust-in' then 'adjust' when 'adjust-out' then 'adjust' else 'invalid' end);
 end if;
 if p_table='inventory_items104' then return restaurant_can121('inventory',p_action);end if;
 return restaurant_can121('menu',case when p_table='menu_sales108' and p_action='edit' then 'sales' else p_action end);
end $$;
do $$ declare t text;begin
 foreach t in array array['inventory_items104','inventory_movements104','menu_ingredients105','menu_items104','menu_categories104','menu_sales108'] loop
  if to_regclass('public.'||t) is null then raise exception 'Install the existing restaurant migrations first: missing %',t;end if;
  execute format('grant select,insert,update,delete on public.%I to authenticated',t);
  execute format('drop policy if exists restaurant_read121 on public.%I',t);
  execute format('create policy restaurant_read121 on public.%I for select to authenticated using(public.restaurant_table_can121(%L,''view''))',t,t);
  execute format('drop policy if exists restaurant_insert121 on public.%I',t);
  execute format('create policy restaurant_insert121 on public.%I for insert to authenticated with check(public.restaurant_table_can121(%L,''edit'',data))',t,t);
  execute format('drop policy if exists restaurant_update121 on public.%I',t);
  execute format('create policy restaurant_update121 on public.%I for update to authenticated using(public.restaurant_table_can121(%L,''edit'',data)) with check(public.restaurant_table_can121(%L,''edit'',data))',t,t,t);
  execute format('drop policy if exists restaurant_delete121 on public.%I',t);
  execute format('create policy restaurant_delete121 on public.%I for delete to authenticated using(public.restaurant_table_can121(%L,''delete'',data))',t,t);
 end loop;
end $$;
do $$ declare r record;body text;clone text;check_expr text;definition text;begin
 for r in select distinct p.oid,p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='public' and p.proname in ('stamp_inventory_menu104','stamp_workspace105','guard_sales108','guard_delete108') loop
  clone='restaurant_'||r.proname||'_121';body=pg_get_functiondef(r.oid);
  body=replace(body,'public.'||r.proname||'(', 'public.'||clone||'(');
  check_expr='public.restaurant_table_can121(TG_TABLE_NAME,case when TG_OP=''DELETE'' then ''delete'' else ''edit'' end,case when TG_OP=''DELETE'' then OLD.data else NEW.data end)';
  body=replace(body,'public.is_admin()',check_expr);
  -- These installed triggers use the qualified admin predicate. Fail closed if unexpected.
  if position(check_expr in body)=0 then raise exception 'Unrecognized guard %; migration rolled back for review',r.proname;end if;
  execute body;
  for definition in select pg_get_triggerdef(t.oid) from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and not t.tgisinternal and t.tgfoid=r.oid and c.relname in ('inventory_items104','inventory_movements104','menu_ingredients105','menu_items104','menu_categories104','menu_sales108') loop
   definition=replace(definition,'CREATE TRIGGER ','CREATE OR REPLACE TRIGGER ');
   definition=replace(definition,'public.'||r.proname||'()', 'public.'||clone||'()');
   definition=replace(definition,'FUNCTION '||r.proname||'()', 'FUNCTION public.'||clone||'()');
   execute definition;
  end loop;
 end loop;
end $$;
create or replace function public.restaurant_delete121(p_table text,p_id uuid,p_version integer) returns boolean language plpgsql security invoker set search_path=public,pg_temp as $$
declare n integer;begin
 if p_table not in ('inventory_items104','menu_ingredients105','menu_items104','menu_categories104','menu_sales108') or not restaurant_table_can121(p_table,'delete') then raise exception 'Delete access required';end if;
 execute format('delete from public.%I where id=$1 and version=$2',p_table) using p_id,p_version;
 get diagnostics n=row_count;if n<>1 then raise exception 'Record changed or unavailable; reload before deleting';end if;return true;
end $$;
create or replace function public.pos_allowed118() returns boolean language sql stable security definer set search_path=public,pg_temp as $$select public.restaurant_can121('pos')$$;
do $$ declare body text;begin
 body=pg_get_functiondef('public.pos_order118(uuid,integer,text,jsonb)'::regprocedure);
 if position('restaurant_can121' in body)=0 then
  body=regexp_replace(body,'\mbegin\M',E'begin\n if not public.restaurant_can121(''pos'',case p_action when ''refund'' then ''refund'' when ''cancel'' then ''void'' else ''sell'' end) then raise exception ''Restaurant action access required'';end if;','i');
  body=replace(body,$text$or not public.is_admin()) then raise exception 'An administrator must approve a paid-order refund'$text$, $text$or not public.restaurant_can121('pos','refund')) then raise exception 'Refund access required'$text$);
  execute body;
 end if;
 body=pg_get_functiondef('public.pos_manage118(text,jsonb,integer)'::regprocedure);
 if position('restaurant_can121' in body)=0 then
  body=regexp_replace(body,'\mbegin\M',E'begin\n if not public.restaurant_can121(''pos'',case when p_action=''config'' then ''manage'' else ''sell'' end) then raise exception ''Restaurant action access required'';end if;','i');
  body=replace(body,$text$if not is_admin() then raise exception 'Administrator access required'$text$, $text$if not public.restaurant_can121('pos','manage') then raise exception 'POS settings access required'$text$);
  execute body;
 end if;
end $$;
drop policy if exists restaurant_stock_read121 on public.pos_stock118;
create policy restaurant_stock_read121 on public.pos_stock118 for select to authenticated using(restaurant_can121('inventory') or restaurant_can121('menu'));
revoke all on function public.restaurant_can121(text,text),public.restaurant_signed_in121(),public.restaurant_table_can121(text,text,jsonb),public.restaurant_delete121(text,uuid,integer),public.restaurant_password_changed121() from public,anon;
grant execute on function public.restaurant_can121(text,text),public.restaurant_signed_in121(),public.restaurant_table_can121(text,text,jsonb),public.restaurant_delete121(text,uuid,integer) to authenticated;
notify pgrst,'reload schema';

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


notify pgrst,'reload schema';

create index if not exists inventory_item_lookup125 on public.inventory_movements104 ((data->>'itemId'));
create index if not exists pos_stock_item125 on public.pos_stock118(item_id);
create index if not exists pos_orders_receipt125 on public.pos_orders118(paid_at desc,id) where status in ('paid','refunded');
create index if not exists pos_orders_open125 on public.pos_orders118(created_at desc) where status='unpaid';
create index if not exists pos_orders_shift125 on public.pos_orders118((data->>'shiftId'));
create index if not exists pos_orders_refund_shift125 on public.pos_orders118((data->>'refundShiftId')) where status='refunded';
create index if not exists pos_cash_shift125 on public.pos_cash118(shift_id);

create or replace function public.restaurant_pos_tab125(p_tab text) returns boolean
language sql stable security definer set search_path=public,pg_temp as $$
 select public.restaurant_can121('pos') and (public.is_admin() or exists(
 select 1 from restaurant_members121 m where m.user_id=auth.uid()
 and (m.permissions->'pos'->'tabs' is null or m.permissions->'pos'->'tabs'->>p_tab='true')))
$$;
revoke all on function public.restaurant_pos_tab125(text) from public,anon,authenticated;

create or replace function public.pos_cashier_snapshot125(p_catalog_version text default null,p_receipt_date date default null,p_pending_ids uuid[] default '{}')
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare result jsonb;catalog_version text;receipt_date date=coalesce(p_receipt_date,(now() at time zone 'Asia/Vientiane')::date);
 start_at timestamptz;end_at timestamptz;today_at timestamptz;today_end timestamptz;sid uuid;
begin
 if not public.pos_allowed118() then raise exception 'POS access required';end if;
 if cardinality(p_pending_ids)>1000 then raise exception 'Too many pending orders; sync in smaller groups';end if;
 start_at=receipt_date::timestamp at time zone 'Asia/Vientiane';end_at=(receipt_date+1)::timestamp at time zone 'Asia/Vientiane';
 today_at=((now() at time zone 'Asia/Vientiane')::date)::timestamp at time zone 'Asia/Vientiane';today_end=today_at+interval '1 day';
 select id into sid from pos_shifts118 where cashier=auth.uid() and closed_at is null;
 select md5(coalesce(string_agg(k,',' order by k),'')) into catalog_version from (
 select 'm'||id||':'||version as k from menu_items104 union all select 'i'||id||':'||version from menu_ingredients105
 union all select 'c'||id||':'||version from menu_categories104 union all select 's'||id||':'||version from inventory_items104) catalog;
 -- Return current balances, never the movement/consumption history.
 with relevant as (select distinct (data->>'inventoryItemId118')::uuid id from menu_ingredients105 where nullif(data->>'inventoryItemId118','') is not null),
 movements as (select m.data->>'itemId' id,sum(case when m.data->>'kind' in ('in','adjust-in') then (m.data->>'quantity')::numeric else -(m.data->>'quantity')::numeric end) qty from inventory_movements104 m join relevant i on i.id::text=m.data->>'itemId' group by m.data->>'itemId'),
 consumption as (select s.item_id id,sum(s.quantity) qty from pos_stock118 s join relevant i on i.id=s.item_id group by s.item_id),
 receipts as (select o.* from pos_orders118 o where restaurant_pos_tab125('pos-sales-receipts') and o.status in ('paid','refunded') and o.paid_at>=start_at and o.paid_at<end_at order by o.number desc limit 100),
 orders as (select o.* from pos_orders118 o where o.status='unpaid' and (restaurant_pos_tab125('pos-sales-open') or (restaurant_pos_tab125('pos-sales-online') and o.data->>'service'='Online')) union all select * from receipts)
 select jsonb_build_object('schema125',true,'catalogVersion125',catalog_version,'config',(select data from pos_config118 where id),'configVersion',(select version from pos_config118 where id),
 'balances125',coalesce((select jsonb_object_agg(i.id::text,coalesce(m.qty,0)-coalesce(c.qty,0)) from relevant i left join movements m on m.id=i.id::text left join consumption c on c.id=i.id),'{}'::jsonb),
 'acknowledged125',coalesce((select jsonb_agg(id) from pos_orders118 where id=any(p_pending_ids) and status in ('paid','refunded','cancelled')),'[]'::jsonb),
 'moves','[]'::jsonb,'stock','[]'::jsonb,'orders',coalesce((select jsonb_agg(to_jsonb(o) order by o.created_at desc) from orders o),'[]'::jsonb),
 'shifts',coalesce((select jsonb_agg(to_jsonb(s)) from pos_shifts118 s where s.id=sid),'[]'::jsonb),
 'cash',coalesce((select jsonb_agg(to_jsonb(c)) from pos_cash118 c where c.shift_id=sid),'[]'::jsonb),
 'shiftExpected125',coalesce((select s.opening+coalesce((select sum(amount) from pos_cash118 where shift_id=s.id),0)
 +coalesce((select sum((data->>'total')::numeric) from pos_orders118 where data->>'shiftId'=s.id::text and data->>'payment'='Cash' and status in ('paid','refunded')),0)
 -coalesce((select sum((data->>'total')::numeric) from pos_orders118 where data->>'refundShiftId'=s.id::text and data->>'payment'='Cash' and status='refunded'),0) from pos_shifts118 s where s.id=sid),0),
 'receiptCount125',(select count(*) from pos_orders118 where restaurant_pos_tab125('pos-sales-receipts') and status in ('paid','refunded') and paid_at>=start_at and paid_at<end_at),
 'refreshedAt125',now()) into result;
 if public.restaurant_pos_tab125('pos-overview') then
  result=result||jsonb_build_object('summary125',jsonb_build_object(
   'received',coalesce((select sum((data->>'total')::numeric) from pos_orders118 where status in ('paid','refunded') and paid_at>=today_at and paid_at<today_end),0),
   'refunds',coalesce((select sum((data->>'total')::numeric) from pos_orders118 where status='refunded' and refunded_at>=today_at and refunded_at<today_end),0),
   'paidCount',(select count(*) from pos_orders118 where status='paid' and paid_at>=today_at and paid_at<today_end),
   'openCount',(select count(*) from pos_orders118 where status='unpaid')));
 end if;
 if p_catalog_version is distinct from catalog_version then
  result=result||jsonb_build_object('menu',coalesce((select jsonb_agg(to_jsonb(m)) from menu_items104 m),'[]'::jsonb),
  'ingredients',coalesce((select jsonb_agg(to_jsonb(m)) from menu_ingredients105 m),'[]'::jsonb),
  'items',coalesce((select jsonb_agg(to_jsonb(m)) from inventory_items104 m where exists(select 1 from menu_ingredients105 i where i.data->>'inventoryItemId118'=m.id::text)),'[]'::jsonb),
  'categories',coalesce((select jsonb_agg(to_jsonb(m)) from menu_categories104 m),'[]'::jsonb));
 end if;
 return result;
end $$;
revoke all on function public.pos_cashier_snapshot125(text,date,uuid[]) from public,anon;
grant execute on function public.pos_cashier_snapshot125(text,date,uuid[]) to authenticated;
create or replace function public.pos_receipt_page125(p_date date,p_before_number bigint)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare result jsonb;begin
 if not public.restaurant_pos_tab125('pos-sales-receipts') then raise exception 'Receipt access required';end if;
 if p_date is null or p_before_number is null then raise exception 'Choose a receipt date and page';end if;
 select coalesce(jsonb_agg(to_jsonb(o) order by o.number desc),'[]'::jsonb) into result from
 (select * from pos_orders118 where status in ('paid','refunded') and paid_at>=(p_date::timestamp at time zone 'Asia/Vientiane')
 and paid_at<((p_date+1)::timestamp at time zone 'Asia/Vientiane') and number<p_before_number order by number desc limit 100) o;
 return result;
end $$;
revoke all on function public.pos_receipt_page125(date,bigint) from public,anon;
grant execute on function public.pos_receipt_page125(date,bigint) to authenticated;
create or replace function public.pos_report_page125(p_from date,p_to date,p_before_number bigint default null)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare result jsonb;begin
 if not public.restaurant_pos_tab125('pos-management') or not public.restaurant_pos_tab125('pos-sales-receipts') then raise exception 'Report access required';end if;
 if p_from is null or p_to is null or p_to<p_from or p_to-p_from>366 then raise exception 'Choose an export period of up to one year';end if;
 select coalesce(jsonb_agg(to_jsonb(o) order by o.number desc),'[]'::jsonb) into result from
 (select * from pos_orders118 where status in ('paid','refunded') and paid_at>=(p_from::timestamp at time zone 'Asia/Vientiane')
 and paid_at<((p_to+1)::timestamp at time zone 'Asia/Vientiane') and (p_before_number is null or number<p_before_number) order by number desc limit 250) o;
 return result;
end $$;
revoke all on function public.pos_report_page125(date,date,bigint) from public,anon;
grant execute on function public.pos_report_page125(date,date,bigint) to authenticated;

notify pgrst,'reload schema';

create or replace function public.restaurant_tab_can125(p_scope text,p_tab text,p_action text default 'view')
returns boolean language sql stable security definer set search_path=public,pg_temp as $$
 select public.restaurant_can121(p_scope,p_action) and (public.is_admin() or exists(
 select 1 from restaurant_members121 m where m.user_id=auth.uid()
 and (m.permissions->p_scope->'tabs' is null or m.permissions->p_scope->'tabs'->>p_tab='true')))
$$;
revoke all on function public.restaurant_tab_can125(text,text,text) from public,anon;
grant execute on function public.restaurant_tab_can125(text,text,text) to authenticated;
create or replace function public.restaurant_access_ready125() returns boolean
language plpgsql security definer set search_path=public,pg_temp as $$
begin if not public.is_admin() then raise exception 'Administrator access required';end if;return true;end $$;
revoke all on function public.restaurant_access_ready125() from public,anon;
grant execute on function public.restaurant_access_ready125() to authenticated;
drop policy if exists restaurant_presentation_tab_insert125 on public.restaurant_presentation121;
create policy restaurant_presentation_tab_insert125 on public.restaurant_presentation121 as restrictive for insert to authenticated
 with check(public.restaurant_tab_can125('settings',case when area='brand' then 'branding' else 'appearance' end,'appearance'));
drop policy if exists restaurant_presentation_tab_update125 on public.restaurant_presentation121;
create policy restaurant_presentation_tab_update125 on public.restaurant_presentation121 as restrictive for update to authenticated
 using(public.restaurant_tab_can125('settings',case when area='brand' then 'branding' else 'appearance' end,'appearance'))
 with check(public.restaurant_tab_can125('settings',case when area='brand' then 'branding' else 'appearance' end,'appearance'));
drop policy if exists restaurant_batches_tab125 on public.restaurant_batches124;
create policy restaurant_batches_tab125 on public.restaurant_batches124 as restrictive for select to authenticated
 using(public.restaurant_tab_can125('inventory','inv-preparation124') or public.restaurant_tab_can125('inventory','inv-waste124'));
drop policy if exists restaurant_waste_tab125 on public.restaurant_waste124;
create policy restaurant_waste_tab125 on public.restaurant_waste124 as restrictive for select to authenticated
 using(public.restaurant_tab_can125('inventory','inv-waste124'));
create or replace function public.restaurant_table_can121(p_table text,p_action text,p_data jsonb default '{}') returns boolean
language plpgsql stable security definer set search_path=public,pg_temp as $$
declare action text;tab text;begin
 if auth.uid() is null then return false;end if;if public.is_admin() then return true;end if;
 if p_table not in ('inventory_items104','inventory_movements104','menu_ingredients105','menu_items104','menu_categories104','menu_sales108') then return false;end if;
 if p_action='view' then
  if p_table in ('inventory_items104','inventory_movements104') then return restaurant_can121('inventory') or restaurant_can121('menu');end if;
  if p_table='menu_ingredients105' then return restaurant_can121('menu') or restaurant_tab_can125('inventory','inv-preparation124');end if;
  return restaurant_can121('menu');
 end if;
 if p_table='inventory_movements104' then
  if p_action='delete' then return false;end if;
  action=case p_data->>'kind' when 'in' then 'stock_in' when 'out' then 'stock_out' when 'adjust-in' then 'adjust' when 'adjust-out' then 'adjust' else 'invalid' end;
  tab=case action when 'stock_in' then 'inv-stock-in' when 'stock_out' then 'inv-stock-out' else 'inv-adj' end;
  return restaurant_tab_can125('inventory',tab,action);
 end if;
 if p_table='inventory_items104' then return restaurant_tab_can125('inventory','inv-items',p_action);end if;
 if p_table='menu_ingredients105' then return restaurant_tab_can125('menu','menu-ingredients',p_action);end if;
 if p_table='menu_categories104' then return restaurant_tab_can125('menu','menu-categories',p_action);end if;
 if p_table='menu_sales108' then return restaurant_tab_can125('menu','menu-engineering108',case when p_action='edit' then 'sales' else p_action end);end if;
 return restaurant_tab_can125('menu','menu-recipe',p_action) or restaurant_tab_can125('menu','menu-pricing',p_action) or restaurant_tab_can125('menu','menu-costing',p_action) or restaurant_tab_can125('menu','menu-avail',p_action);
end $$;
do $$declare name text;body text;original text;replacement text;begin
 original=$expr$public.restaurant_table_can121(TG_TABLE_NAME,case when TG_OP='DELETE' then 'delete' else 'edit' end,case when TG_OP='DELETE' then OLD.data else NEW.data end)$expr$;
 replacement='('||original||$expr$ or (current_user=(select pg_get_userbyid(proowner) from pg_proc where oid='public.restaurant_prepare124(uuid,jsonb)'::regprocedure) and public.restaurant_tab_can125('inventory','inv-preparation124','prepare') and TG_TABLE_NAME in ('inventory_items104','inventory_movements104','menu_ingredients105') and TG_OP in ('INSERT','UPDATE')) or (current_user=(select pg_get_userbyid(proowner) from pg_proc where oid='public.restaurant_record_waste124(uuid,jsonb)'::regprocedure) and TG_TABLE_NAME='inventory_movements104' and TG_OP='INSERT' and NEW.data ? 'waste124' and (public.restaurant_tab_can125('inventory','inv-waste124','stock_out') or public.restaurant_tab_can125('inventory','inv-waste124','adjust'))))$expr$;
 foreach name in array array['restaurant_stamp_inventory_menu104_121','restaurant_stamp_workspace105_121'] loop
  body=pg_get_functiondef((name||'()')::regprocedure);
  if position('restaurant_tab_can125' in body)=0 then
   if position(original in body)=0 then raise exception 'Catalog trigger differs; review before installing';end if;
   body=replace(body,original,replacement);execute body;
  end if;
 end loop;
end $$;
do $$declare body text;guard text;begin
 body=pg_get_functiondef('public.restaurant_prepare124(uuid,jsonb)'::regprocedure);
 if position('restaurant_tab_can125' in body)=0 then
  if position('if not public.is_admin()' in body)=0 then raise exception 'Preparation implementation differs; review before installing';end if;
  body=replace(body,$guard$if not public.is_admin() then raise exception 'Administrator access required for cooking batches';end if;$guard$,
   $guard$if not public.restaurant_tab_can125('inventory','inv-preparation124','prepare') then raise exception 'Preparation access required';end if;$guard$);execute body;
 end if;
 body=pg_get_functiondef('public.restaurant_record_waste124(uuid,jsonb)'::regprocedure);
 if position('restaurant_tab_can125' in body)=0 then
  guard=$guard$if not public.restaurant_tab_can125('inventory','inv-waste124','stock_out') then raise exception 'Wastage access required';end if;$guard$;
  body=regexp_replace(body,'\mbegin\M',E'begin\n '||guard,'i');execute body;
 end if;
 body=pg_get_functiondef('public.restaurant_reverse_waste124(uuid,uuid,text)'::regprocedure);
 if position('restaurant_tab_can125' in body)=0 then
  guard=$guard$if not public.restaurant_tab_can125('inventory','inv-waste124','adjust') then raise exception 'Waste correction access required';end if;$guard$;
  body=regexp_replace(body,'\mbegin\M',E'begin\n '||guard,'i');execute body;
 end if;
 body=pg_get_functiondef('public.pos_order118(uuid,integer,text,jsonb)'::regprocedure);
 if position('restaurant_tab_can125' in body)=0 then
  guard=$guard$if not (case p_action when 'refund' then public.restaurant_tab_can125('pos','pos-sales-receipts','refund') when 'cancel' then public.restaurant_tab_can125('pos','pos-sales-open','void') or public.restaurant_tab_can125('pos','pos-sales-online','void') else public.restaurant_tab_can125('pos','pos-sales-new','sell') or public.restaurant_tab_can125('pos','pos-sales-open','sell') or public.restaurant_tab_can125('pos','pos-sales-online','sell') end) then raise exception 'POS tab action access required';end if;$guard$;
  body=regexp_replace(body,'\mbegin\M',E'begin\n '||guard,'i');execute body;
 end if;
 body=pg_get_functiondef('public.pos_manage118(text,jsonb,integer)'::regprocedure);
 if position('restaurant_tab_can125' in body)=0 then
  guard=$guard$if not public.restaurant_tab_can125('pos',case when p_action='config' then 'pos-management' else 'pos-overview' end,case when p_action='config' then 'manage' else 'sell' end) then raise exception 'POS management tab access required';end if;$guard$;
  body=regexp_replace(body,'\mbegin\M',E'begin\n '||guard,'i');execute body;
 end if;
 -- A restricted staff account cannot obtain closed orders via the old full snapshot.
 body=pg_get_functiondef('public.pos_snapshot118()'::regprocedure);
 if position('pos_cashier_snapshot125' in body)=0 then
  guard=$guard$if not public.is_admin() and exists(select 1 from restaurant_members121 where user_id=auth.uid() and permissions->'pos'->'tabs' is not null) then return public.pos_cashier_snapshot125();end if;$guard$;
  body=regexp_replace(body,'\mbegin\M',E'begin\n '||guard,'i');execute body;
 end if;
end $$;
drop policy if exists pos_order_tabs125 on public.pos_orders118;
create policy pos_order_tabs125 on public.pos_orders118 as restrictive for select to authenticated using(
 public.is_admin() or case when status='unpaid' then
 public.restaurant_pos_tab125('pos-sales-open') or (data->>'service'='Online' and public.restaurant_pos_tab125('pos-sales-online'))
 else public.restaurant_pos_tab125('pos-sales-receipts') end);
grant execute on function public.restaurant_pos_tab125(text) to authenticated;
notify pgrst,'reload schema';


-- Restrict all exposed objects explicitly; a public storefront projection will
-- be a separate, reviewed API. Recipes, costs and staff records are private.
revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;
revoke execute on all functions in schema public from public,anon;
revoke execute on all functions in schema restaurant_private from public,anon;
grant all on all tables in schema public,restaurant_private to service_role;
grant usage,select on all sequences in schema public to service_role;
-- Inactive profiles cannot keep using a previous grant or a still-valid token.
do $$declare r record;begin
 for r in select c.relname from pg_class c where c.relnamespace='public'::regnamespace and c.relkind='r' and c.relname<>'profiles' loop
  execute format('create policy restaurant_active_user on public.%I as restrictive for all to authenticated using(restaurant_private.active_user()) with check(restaurant_private.active_user())',r.relname);
 end loop;
end $$;
notify pgrst,'reload schema';
commit;

