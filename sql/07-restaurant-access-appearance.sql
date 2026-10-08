-- Restaurant v121. Apply once to the EXISTING shared Supabase project.
-- Existing restaurant tables and POS migrations 01-06 must already be installed.
-- No accounting records, roles or accounting permissions are changed.
begin;
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
 select auth.uid() is not null and (public.is_admin() or exists(
 select 1 from public.restaurant_members121 m where m.user_id=auth.uid() and m.enabled and not m.must_change_password
 and m.permissions->p_scope->>'view'='true' and m.permissions->p_scope->>p_action='true'))
$$;
create or replace function public.restaurant_signed_in121() returns boolean language sql stable security definer set search_path=public,pg_temp as $$
 select auth.uid() is not null and (public.is_admin() or exists(select 1 from restaurant_members121 where user_id=auth.uid() and enabled and not must_change_password))
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
-- A password must actually change in Auth; a browser cannot clear this flag itself.
create or replace function public.restaurant_password_changed121() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if new.encrypted_password is distinct from old.encrypted_password then
  update restaurant_members121 set must_change_password=false where user_id=new.id and must_change_password;
 end if;return new;
end $$;
drop trigger if exists restaurant_password_changed121 on auth.users;
create trigger restaurant_password_changed121 after update of encrypted_password on auth.users for each row execute function public.restaurant_password_changed121();
-- Copy current accounting appearance once, preserving independent restaurant changes thereafter.
do $$ begin
 if to_regclass('public.presentation_settings113') is not null then
  insert into restaurant_presentation121(area,data) select area,data from presentation_settings113 where area in ('inventory','menu','pos','online','settings','brand') or area like 'inventory:%' or area like 'menu:%' on conflict do nothing;
 end if;
end $$;
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
-- Existing admin policies remain. Add narrowly scoped staff policies.
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
-- Clone installed trigger bodies before adapting authorization. Preserve installed validation,
-- stock locks, immutable movements, version checks and reference/history checks.
-- Only the six restaurant tables are rebound; accounting triggers keep their original functions.
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
-- POS checks use restaurant membership. Legacy cashier lists no longer grant POS access.
create or replace function public.pos_allowed118() returns boolean language sql stable security definer set search_path=public,pg_temp as $$select public.restaurant_can121('pos')$$;
-- Keep the current installed order implementation (including newer stock/customization fixes).
-- Add the action check before the original implementation, including offline replay.
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
-- Inventory and Menu readers need stock consumption to calculate accurate stock on hand.
drop policy if exists restaurant_stock_read121 on public.pos_stock118;
create policy restaurant_stock_read121 on public.pos_stock118 for select to authenticated using(restaurant_can121('inventory') or restaurant_can121('menu'));
revoke all on function public.restaurant_can121(text,text),public.restaurant_signed_in121(),public.restaurant_table_can121(text,text,jsonb),public.restaurant_delete121(text,uuid,integer),public.restaurant_password_changed121() from public,anon;
grant execute on function public.restaurant_can121(text,text),public.restaurant_signed_in121(),public.restaurant_table_can121(text,text,jsonb),public.restaurant_delete121(text,uuid,integer) to authenticated;
notify pgrst,'reload schema';
commit;
