-- Restaurant-only authorization fixes. No records or account assignments change.
begin;
do $$begin
 if to_regclass('public.accounts') is not null or to_regclass('public.storefront_items127') is null then
  raise exception 'Apply only to the separate Restaurant project after public_storefront127';
 end if;
end$$;

-- A checked module with no checked tabs must not grant underlying API access.
-- Missing tab maps preserve explicitly supported legacy module-wide grants.
create or replace function public.restaurant_can121(p_scope text,p_action text default 'view') returns boolean
language sql stable security definer set search_path='' as $$
 select restaurant_private.active_user() and (restaurant_private.is_admin() or exists(
  select 1 from public.restaurant_members121 m where m.user_id=auth.uid() and m.enabled and not m.must_change_password
  and m.permissions->p_scope->'view'='true'::jsonb and m.permissions->p_scope->p_action='true'::jsonb
  and (m.permissions->p_scope->'tabs' is null or exists(
   select 1 from unnest(case p_scope
    when 'inventory' then array['inv-overview','inv-items','inv-stock-in','inv-stock-out','inv-adj','inv-val','inv-preparation124','inv-waste124']
    when 'menu' then array['menu-ingredients','menu-recipe','menu-pricing','menu-categories','menu-costing','menu-engineering108','menu-avail']
    when 'pos' then array['pos-overview','pos-sales-new','pos-sales-open','pos-sales-receipts','pos-sales-online','pos-management']
    when 'settings' then array['appearance','branding','security'] else '{}'::text[] end) as t(tab)
   where m.permissions->p_scope->'tabs'->t.tab='true'::jsonb
  ))
 ))
$$;
revoke all on function public.restaurant_can121(text,text) from public,anon;
grant execute on function public.restaurant_can121(text,text) to authenticated;

-- Check the actual locked order before returning idempotent results or writing.
-- New-order cashiers may continue their own draft and safely retry its payment.
-- An Online Orders grant never authorizes changing an unrelated dine-in order.
do $$declare body text;anchor text;guard text;begin
 body=pg_get_functiondef('public.pos_order118(uuid,integer,text,jsonb)'::regprocedure);
 anchor='select * into old from pos_orders118 where id=p_id for update;';
 guard=$guard$
 if not public.is_admin() then
  if p_action='refund' then
   if not public.restaurant_tab_can125('pos','pos-sales-receipts','refund') then raise exception 'Order access required';end if;
  elsif p_action='cancel' then
   if not (public.restaurant_tab_can125('pos','pos-sales-open','void') or
    (coalesce(old.data->>'service','')='Online' and public.restaurant_tab_can125('pos','pos-sales-online','void'))) then raise exception 'Order access required';end if;
  elsif old.id is null then
   if not (public.restaurant_tab_can125('pos','pos-sales-new','sell') or
    (coalesce(p_data->>'service','')='Online' and public.restaurant_tab_can125('pos','pos-sales-online','sell'))) then raise exception 'Order access required';end if;
  elsif not ((old.created_by=auth.uid() and public.restaurant_tab_can125('pos','pos-sales-new','sell')) or
   public.restaurant_tab_can125('pos','pos-sales-open','sell') or
   (coalesce(old.data->>'service','')='Online' and public.restaurant_tab_can125('pos','pos-sales-online','sell'))) then raise exception 'Order access required';
  end if;
  if p_action='pay' and old.status in ('paid','refunded') and old.created_by<>auth.uid()
   and not public.restaurant_tab_can125('pos','pos-sales-receipts') then raise exception 'Order access required';end if;
  if p_action in ('save','pay') and (old.id is null or old.status='unpaid')
   and not public.restaurant_tab_can125('pos','pos-sales-new','sell')
   and not public.restaurant_tab_can125('pos','pos-sales-open','sell')
   and p_data->>'service' is distinct from 'Online' then raise exception 'Order access required';end if;
 end if;
 $guard$;
 if position('Order access required' in body)=0 then
  if position(anchor in body)=0 then raise exception 'POS implementation changed; review the order guard before applying';end if;
  execute replace(body,anchor,anchor||guard);
 end if;
end$$;

-- Direct REST queries must not reveal another cashier's cash drawer/history.
create policy pos_shift_owner128 on public.pos_shifts118 as restrictive for select to authenticated
 using((select restaurant_private.is_admin()) or cashier=(select auth.uid()));
create policy pos_cash_owner128 on public.pos_cash118 as restrictive for select to authenticated
 using((select restaurant_private.is_admin()) or exists(select 1 from public.pos_shifts118 s where s.id=shift_id and s.cashier=(select auth.uid())));
create policy pos_stock_scope128 on public.pos_stock118 as restrictive for select to authenticated
 using((select restaurant_private.is_admin()) or public.restaurant_can121('inventory') or public.restaurant_can121('menu'));
notify pgrst,'reload schema';
commit;
