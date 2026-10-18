-- Restaurant only. Saved preparation formulas and immutable sale-cost snapshots.
do $$begin if to_regclass('public.accounts') is not null or to_regclass('public.storefront_items127') is null then raise exception 'Restaurant database required';end if;end$$;
create table public.restaurant_preparations132(
 id uuid primary key default gen_random_uuid(),name text not null check(length(trim(name)) between 1 and 200),
 output_item_id uuid not null references public.inventory_items104(id),
 yield numeric not null check(yield>0 and yield::text not in ('NaN','Infinity','-Infinity')),
 inputs jsonb not null check(jsonb_typeof(inputs)='array' and jsonb_array_length(inputs) between 1 and 100),
 costs jsonb not null default '{}' check(jsonb_typeof(costs)='object'),active boolean not null default true,
 version integer not null default 1,updated_at timestamptz not null default now(),updated_by uuid references public.profiles(id)
);
create unique index preparation_output132 on public.restaurant_preparations132(output_item_id) where active;
create index preparation_author132 on public.restaurant_preparations132(updated_by);
alter table public.restaurant_preparations132 enable row level security;
revoke all on public.restaurant_preparations132 from public,anon,authenticated;
grant select,insert,update on public.restaurant_preparations132 to authenticated;
create policy preparation_read132 on public.restaurant_preparations132 for select to authenticated using((select public.restaurant_tab_can125('inventory','inv-preparation124')) or (select public.restaurant_tab_can125('menu','menu-recipe')));
create policy preparation_insert132 on public.restaurant_preparations132 for insert to authenticated with check((select public.restaurant_tab_can125('inventory','inv-preparation124','prepare')));
create policy preparation_update132 on public.restaurant_preparations132 for update to authenticated using((select public.restaurant_tab_can125('inventory','inv-preparation124','prepare'))) with check((select public.restaurant_tab_can125('inventory','inv-preparation124','prepare')));
create function restaurant_private.preparation_guard132() returns trigger language plpgsql set search_path=public,pg_temp as $$
declare l jsonb;i menu_ingredients105;o inventory_items104;k text;v numeric;seen uuid[]='{}';begin
 if auth.uid() is null or not restaurant_tab_can125('inventory','inv-preparation124','prepare') then raise exception 'Preparation access required';end if;
 if TG_OP='UPDATE' and (new.id<>old.id or new.version<>old.version+1) then raise exception 'Recipe changed. Reload before saving';end if;
 if TG_OP='INSERT' and new.version<>1 then raise exception 'Invalid initial version';end if;
 select * into o from inventory_items104 where id=new.output_item_id;if not found or coalesce((o.data->>'active')::boolean,true)=false then raise exception 'Choose active prepared stock';end if;
 for l in select value from jsonb_array_elements(new.inputs) loop
  select * into i from menu_ingredients105 where id=(l->>'ingredientId')::uuid;
  if not found or i.id=any(seen) then raise exception 'Choose unique existing ingredients';end if;seen=array_append(seen,i.id);
  v=(l->>'quantity')::numeric;if v is null or v<=0 or v::text in ('NaN','Infinity','-Infinity') then raise exception 'Ingredient quantity must be positive';end if;
  if i.data->>'inventoryItemId118'=new.output_item_id::text then raise exception 'Prepared output cannot be its own input';end if;
  if i.data->>'currency' is distinct from o.data->>'currency' then raise exception 'Use one currency for the whole batch';end if;
 end loop;
 foreach k in array array['minutes','hourlyRate','energy','otherCost'] loop v=coalesce((new.costs->>k)::numeric,0);if v<0 or v::text in ('NaN','Infinity','-Infinity') then raise exception 'Costs and worker minutes must be nonnegative';end if;end loop;
 new.updated_by=auth.uid();new.updated_at=now();return new;
end$$;
revoke all on function restaurant_private.preparation_guard132() from public,anon,authenticated;
create trigger preparation_guard132 before insert or update on public.restaurant_preparations132 for each row execute function restaurant_private.preparation_guard132();
-- Kitchen staff need the recipe catalog for production planning, but no sales/customer records.
create policy kitchen_recipes132 on public.menu_items104 for select to authenticated using((select public.restaurant_tab_can125('inventory','inv-preparation124')));
create policy kitchen_categories132 on public.menu_categories104 for select to authenticated using((select public.restaurant_tab_can125('inventory','inv-preparation124')));
alter table public.pos_stock118 add column unit_cost132 numeric,add column full_unit_cost132 numeric,add column currency132 text;
create function restaurant_private.stock_cost132() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare d jsonb;c numeric;begin
 if auth.uid() is null or not public.pos_allowed118() then raise exception 'POS access required';end if;
 if new.kind='return' then
  select unit_cost132,full_unit_cost132,currency132 into new.unit_cost132,new.full_unit_cost132,new.currency132 from pos_stock118 where order_id=new.order_id and item_id=new.item_id and kind='sale';
 else
  select data into d from inventory_items104 where id=new.item_id;
  select (data->>'cost')::numeric into c from inventory_movements104 where data->>'itemId'=new.item_id::text and data->>'kind' in ('in','adjust-in') and (data->>'cost')::numeric>0 order by created_at desc,id desc limit 1;
  c=coalesce(c,nullif((d->>'cost')::numeric,0));new.unit_cost132=case when c>0 then c end;
  new.full_unit_cost132=case when new.unit_cost132 is not null then coalesce((d->>'fullPreparedCost124')::numeric,c) end;new.currency132=d->>'currency';
 end if;return new;
end$$;
revoke all on function restaurant_private.stock_cost132() from public,anon,authenticated;
create trigger stock_cost132 before insert on public.pos_stock118 for each row execute function restaurant_private.stock_cost132();
-- Aggregate only: private implementation can read all paid orders without exposing customer/cashier data to Menu staff.
create function restaurant_private.usage132(p_from date,p_to date) returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare result jsonb;begin
 if auth.uid() is null or not restaurant_tab_can125('menu','menu-recipe') then raise exception 'Recipe access required';end if;
 if p_from is null or p_to is null or p_to<p_from or p_to-p_from>366 then raise exception 'Choose a period of at most 366 days';end if;
 with events as (
  select data,1 as sign from pos_orders118 where status in ('paid','refunded') and (paid_at at time zone 'Asia/Vientiane')::date between p_from and p_to
  union all select data,-1 from pos_orders118 where status='refunded' and (refunded_at at time zone 'Asia/Vientiane')::date between p_from and p_to
 ), sales as (
  select l->>'menuId' as id,coalesce(l->'choices','{}') as choices,sum((l->>'quantity')::numeric*e.sign) as quantity,
   sum((l->>'quantity')::numeric*(l->>'unitPrice')::numeric*e.sign*coalesce((e.data->>'total')::numeric/nullif((e.data->>'subtotal')::numeric,0),1)) as revenue
  from events e cross join lateral jsonb_array_elements(e.data->'lines') l group by l->>'menuId',coalesce(l->'choices','{}')
 ), usage as (
  select s.item_id,s.currency132 as currency,sum(s.quantity) as quantity,sum(s.quantity*s.unit_cost132) as cost,sum(s.quantity*s.full_unit_cost132) as full_cost,
  count(*) filter(where s.unit_cost132 is null or s.full_unit_cost132 is null or s.currency132 is null) as missing_cost
  from pos_stock118 s join pos_orders118 o on o.id=s.order_id
  where (case when s.kind='sale' then o.paid_at else o.refunded_at end at time zone 'Asia/Vientiane')::date between p_from and p_to group by s.item_id,s.currency132
 ), waste as (
  select item_id,data->>'currency' as currency,sum((data->>'stockQuantity')::numeric) as quantity,sum((data->>'ingredientLoss')::numeric) as cost,sum((data->>'fullLoss')::numeric) as full_cost
  from restaurant_waste124 where (data->>'date')::date between p_from and p_to group by item_id,data->>'currency'
 ) select jsonb_build_object('sales',coalesce((select jsonb_agg(to_jsonb(sales)) from sales),'[]'),'netSales',coalesce((select sum((data->>'total')::numeric*sign) from events),0),'currency','LAK','stock',coalesce((select jsonb_agg(to_jsonb(usage)) from usage),'[]'),'waste',coalesce((select jsonb_agg(to_jsonb(waste)) from waste),'[]')) into result;
 return result;
end$$;
revoke all on function restaurant_private.usage132(date,date) from public,anon,authenticated;
grant execute on function restaurant_private.usage132(date,date) to authenticated;
create function public.restaurant_usage132(p_from date,p_to date) returns jsonb language sql stable security invoker set search_path=public,pg_temp as $$select restaurant_private.usage132(p_from,p_to)$$;
revoke all on function public.restaurant_usage132(date,date) from public,anon,authenticated;
grant execute on function public.restaurant_usage132(date,date) to authenticated;
notify pgrst,'reload schema';
