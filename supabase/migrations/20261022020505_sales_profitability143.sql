-- Additive Restaurant-only setup. No prices, stock quantities or historical receipts are changed.
create table public.restaurant_sales_plans143 (
 id uuid primary key default gen_random_uuid(),
 name text not null check(length(trim(name)) between 1 and 80),
 from_date date not null,
 to_date date not null check(to_date>=from_date and to_date-from_date<=366),
 data jsonb not null check(jsonb_typeof(data)='object'),
 version integer not null default 1,
 created_by uuid not null default auth.uid() references public.profiles(id),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
alter table public.restaurant_sales_plans143 enable row level security;
revoke all on public.restaurant_sales_plans143 from public,anon;
grant select,insert,update,delete on public.restaurant_sales_plans143 to authenticated;
create policy sales_plans_admin143 on public.restaurant_sales_plans143 for all to authenticated
 using((select auth.uid()) is not null and (select public.is_admin()))
 with check((select auth.uid()) is not null and (select public.is_admin()));
create index sales_plans_creator143 on public.restaurant_sales_plans143(created_by);
create function restaurant_private.sales_plan_guard143() returns trigger language plpgsql security invoker set search_path=public,pg_temp as $$
begin
 if tg_op='UPDATE' then
  if new.version<>old.version+1 then raise exception 'Scenario changed; refresh before updating';end if;
  new.id=old.id;new.created_by=old.created_by;new.created_at=old.created_at;
 else new.created_by=auth.uid();new.version=1;end if;
 new.updated_at=now();return new;
end$$;
revoke all on function restaurant_private.sales_plan_guard143() from public,anon,authenticated;
create trigger sales_plan_guard143 before insert or update on public.restaurant_sales_plans143 for each row execute function restaurant_private.sales_plan_guard143();

-- Standard ingredient cost at payment time; separate from actual inventory valuation and overhead.
create function restaurant_private.recipe_cost143(p_menu uuid,p_choices jsonb default null,p_seen uuid[] default '{}') returns numeric
language plpgsql stable security invoker set search_path=public,pg_temp as $$
declare d jsonb;lines jsonb;l jsonb;i jsonb;g jsonb;o jsonb;chosen jsonb;option_id text;
 total numeric=0;c numeric;q numeric;child_currency text;
begin
 if p_menu=any(p_seen) or cardinality(p_seen)>12 then return null;end if;
 select data into d from menu_items104 where id=p_menu;
 if d is null or jsonb_array_length(coalesce(d->'recipeReview135','[]'))>0 then return null;end if;
 lines=coalesce(d->'recipe','[]');
 if jsonb_array_length(coalesce(d->'posOptions118','[]'))>0 and p_choices is null then return null;end if;
 for g in select value from jsonb_array_elements(coalesce(d->'posOptions118','[]')) loop
  chosen=coalesce(p_choices->(g->>'id'),'[]');
  if jsonb_typeof(chosen)<>'array' or jsonb_array_length(chosen)<coalesce((g->>'min')::integer,0) then return null;end if;
  for option_id in select jsonb_array_elements_text(chosen) loop
   select value into o from jsonb_array_elements(g->'options') where value->>'id'=option_id;
   if o is null or jsonb_array_length(coalesce(o->'recipe','[]'))=0 then return null;end if;
   lines=lines||(select jsonb_agg(value||'{"option":true}'::jsonb) from jsonb_array_elements(o->'recipe'));
  end loop;
 end loop;
 if jsonb_array_length(lines)=0 then return null;end if;
 for l in select value from jsonb_array_elements(lines) loop
  q=(l->>'quantity')::numeric;if q is null or q<=0 then return null;end if;
  if d->>'itemType'='bundle' and coalesce(l->>'option','false')<>'true' then
   select data->>'currency' into child_currency from menu_items104 where id=(l->>'itemId')::uuid;
   if child_currency is distinct from d->>'currency' then return null;end if;
   c=restaurant_private.recipe_cost143((l->>'itemId')::uuid,null,p_seen||p_menu);
  else
   select data into i from menu_ingredients105 where id=(l->>'itemId')::uuid;
   if i is null or i->>'unitReview135'='true' or i->>'currency' is distinct from d->>'currency' then return null;end if;
   c=(i->>'cost')::numeric;
  end if;
  if c is null or c<=0 then return null;end if;total=total+c*q;
 end loop;
 return total;
exception when data_exception then return null;
end$$;
revoke all on function restaurant_private.recipe_cost143(uuid,jsonb,uuid[]) from public,anon,authenticated;

create function restaurant_private.sale_cost_snapshot143() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare l jsonb;out_lines jsonb='[]';old_line jsonb;c numeric;cur text;idx integer=0;
begin
 if auth.uid() is null or not public.pos_allowed118() then raise exception 'POS access required';end if;
 if old.status in ('paid','refunded','cancelled') then
  -- Existing closed receipt fields remain under the POS workflow; cost history stays immutable.
  for l in select value from jsonb_array_elements(coalesce(new.data->'lines','[]')) loop
   old_line=old.data->'lines'->idx;
   l=l-'cost143';if old_line ? 'cost143' then l=l||jsonb_build_object('cost143',old_line->'cost143');end if;
   out_lines=out_lines||jsonb_build_array(l);idx=idx+1;
  end loop;
  new.data=jsonb_set(new.data,'{lines}',out_lines);return new;
 end if;
 if new.status<>'paid' then return new;end if;
 for l in select value from jsonb_array_elements(coalesce(new.data->'lines','[]')) loop
  c=restaurant_private.recipe_cost143((l->>'menuId')::uuid,l->'choices');
  select data->>'currency' into cur from menu_items104 where id=(l->>'menuId')::uuid;
  out_lines=out_lines||jsonb_build_array(l||jsonb_build_object('cost143',jsonb_build_object('basis','ingredient-recipe','unitCost',c,'currency',cur,'recordedAt',now())));
 end loop;
 new.data=jsonb_set(new.data,'{lines}',out_lines);return new;
end$$;
revoke all on function restaurant_private.sale_cost_snapshot143() from public,anon,authenticated;
create trigger zz_sale_cost_snapshot143 before update on public.pos_orders118 for each row execute function restaurant_private.sale_cost_snapshot143();
