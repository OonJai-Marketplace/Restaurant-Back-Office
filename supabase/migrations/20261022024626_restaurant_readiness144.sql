-- A compact, administrator-only setup read. Existing table RLS still applies.
create or replace function public.restaurant_readiness144() returns jsonb
language plpgsql stable security invoker set search_path=public,pg_temp as $$
declare result jsonb;
begin
 if auth.uid() is null or not public.is_admin() then raise exception 'Administrator access required'; end if;
 with movements as (
  select data->>'itemId' id,sum(case when data->>'kind' in ('in','adjust-in') then 1 else -1 end * (data->>'quantity')::numeric) quantity
  from inventory_movements104 group by 1
 ), sales as (select item_id,sum(quantity) quantity from pos_stock118 group by 1)
 select jsonb_build_object(
  'checkedAt',now(),
  'menu',coalesce((select jsonb_agg(jsonb_build_object('id',id,'data',data-'photoData'-'photoUrl'-'description'-'sourceIngredients'-'recipeSource135'-'sourceNote135')) from menu_items104),'[]'),
  'ingredients',coalesce((select jsonb_agg(jsonb_build_object('id',id,'data',data-'sourceNote120'-'unitConvention135')) from menu_ingredients105),'[]'),
  'items',coalesce((select jsonb_agg(jsonb_build_object('id',i.id,'data',i.data,'available',coalesce(m.quantity,0)-coalesce(s.quantity,0))) from inventory_items104 i left join movements m on m.id=i.id::text left join sales s on s.item_id=i.id),'[]'),
  'counts',jsonb_build_object('stockMovements',(select count(*) from inventory_movements104),'paidReceipts',(select count(*) from pos_orders118 where status in ('paid','refunded')),'openShifts',(select count(*) from pos_shifts118 where closed_at is null),'publicItems',(select count(*) from storefront_items127 where stage131='active' and available and published))
 ) into result;
 return result;
end $$;
revoke all on function public.restaurant_readiness144() from public,anon;
grant execute on function public.restaurant_readiness144() to authenticated;

-- Keep the identical existing indexes; remove only their redundant copies.
drop index if exists public.inventory_item_lookup125;
drop index if exists public.pos_stock_item125;
alter policy restaurant_member_read121 on public.restaurant_members121
 using (user_id=(select auth.uid()) or public.is_admin());
