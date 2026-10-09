-- Apply after 09 and 10. Keeps existing staff grants compatible until edited.
-- Module/actions authorize shared data; tab grants also restrict workflows.
begin;
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
-- Preparation runs as its server function owner. Allow its internal stock/cost
-- updates through the invoker triggers without granting cooks general edit access.
-- Ordinary REST writes run as authenticated, so this exception cannot apply there.
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
-- Add tab authorization ahead of the installed implementations; never replace
-- their pricing, stock guards, version checks, idempotency or audit behavior.
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
-- Direct table reads honor the same order tabs; summaries remain server aggregates.
drop policy if exists pos_order_tabs125 on public.pos_orders118;
create policy pos_order_tabs125 on public.pos_orders118 as restrictive for select to authenticated using(
 public.is_admin() or case when status='unpaid' then
 public.restaurant_pos_tab125('pos-sales-open') or (data->>'service'='Online' and public.restaurant_pos_tab125('pos-sales-online'))
 else public.restaurant_pos_tab125('pos-sales-receipts') end);
-- The policy runs as the caller, so only this boolean helper needs execute.
grant execute on function public.restaurant_pos_tab125(text) to authenticated;
notify pgrst,'reload schema';
commit;
