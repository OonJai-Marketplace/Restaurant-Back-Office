-- Consumption is derived from the saved catalog, using stock units per menu unit.
create or replace function restaurant_private.sale_stock_links(
 menu_id text, menu_qty numeric, recipe jsonb, choices jsonb, service text, packaging jsonb, actual jsonb, bonus jsonb
) returns table(item_id uuid, quantity numeric)
language sql stable set search_path = pg_catalog, public as $stock$
 with explicit_links as (
   select i.id, link->>'kind' kind, link->>'stockMode' mode, (link->>'quantity')::numeric qty
   from public.inventory_items104 i
   cross join lateral jsonb_array_elements(coalesce(i.data->'posMenuUse','[]')) link
   where i.data->>'active' is distinct from 'false' and link->>'menuId'=menu_id
     and (coalesce(link->>'groupId','')='' or
       coalesce(choices->(link->>'groupId'),'[]') ? (link->>'optionId'))
 ), amounts as (
   select it.id, (r->>'quantity')::numeric * coalesce((ing.data->>'inventoryFactor118')::numeric,1) * menu_qty qty
   from jsonb_array_elements(recipe) r join public.menu_ingredients105 ing on ing.id::text=r->>'itemId'
   join public.inventory_items104 it on it.id::text=ing.data->>'inventoryItemId118'
   where ing.data->>'active' is distinct from 'false' and it.data->>'active' is distinct from 'false'
   and not (coalesce(it.data->'posMenuExclude','[]'::jsonb) ? menu_id)
   and not exists(select 1 from explicit_links e where e.kind in ('ingredient','supply') and e.id=it.id)
   union all
   select e.id,e.qty * case when service='Online' or coalesce(e.mode,case when e.kind='ingredient' then 'all' else 'online' end)='all' then menu_qty
     when e.kind='packaging' then coalesce((packaging->>e.id::text)::numeric,0) else 0 end
   from explicit_links e
 )
 , selected as (
   select id,case when service='Online' then sum(qty)+coalesce((bonus->>id::text)::numeric,0)
     else coalesce((actual->>id::text)::numeric,sum(qty)) end as used
   from amounts group by id
 )
 select id,used from selected where used>0
$stock$;
revoke all on function restaurant_private.sale_stock_links(text,numeric,jsonb,jsonb,text,jsonb,jsonb,jsonb) from public, anon, authenticated;

