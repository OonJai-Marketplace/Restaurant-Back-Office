-- Retain just the recipe and ingredient inputs needed by delayed offline payments.
create table restaurant_private.cost_versions (
 source_table text not null, record_id uuid not null, effective_at timestamptz not null,
 data jsonb, primary key(source_table,record_id,effective_at)
);
revoke all on restaurant_private.cost_versions from public,anon,authenticated;
alter table restaurant_private.cost_versions enable row level security;

create function restaurant_private.cost_fields(kind text,d jsonb) returns jsonb
language sql immutable strict set search_path='' as $$
 select jsonb_strip_nulls(case when kind='menu_items104' then
 jsonb_build_object('recipe',d->'recipe','posOptions118',d->'posOptions118','recipeReview135',d->'recipeReview135',
 'itemType',d->'itemType','currency',d->'currency')
 else jsonb_build_object('cost',d->'cost','unitReview135',d->'unitReview135','currency',d->'currency') end)
$$;

create function restaurant_private.remember_cost() returns trigger
language plpgsql security definer set search_path='' as $$
declare fields jsonb; target uuid;begin
 if tg_op='DELETE' then target=old.id;else target=new.id;fields=restaurant_private.cost_fields(tg_table_name,new.data);end if;
 if tg_op='UPDATE' and restaurant_private.cost_fields(tg_table_name,old.data) is not distinct from fields then return null;end if;
 insert into restaurant_private.cost_versions(source_table,record_id,effective_at,data)
 values(tg_table_name,target,statement_timestamp(),fields)
 on conflict(source_table,record_id,effective_at) do update set data=excluded.data;
 return null;
end $$;
create trigger remember_menu_cost after insert or update or delete on public.menu_items104
 for each row execute function restaurant_private.remember_cost();
create trigger remember_ingredient_cost after insert or update or delete on public.menu_ingredients105
 for each row execute function restaurant_private.remember_cost();
-- The baseline starts at installation. Pending receipts before this point have no verifiable cost history.
insert into restaurant_private.cost_versions
 select 'menu_items104',id,statement_timestamp(),restaurant_private.cost_fields('menu_items104',data) from public.menu_items104
 union all select 'menu_ingredients105',id,statement_timestamp(),restaurant_private.cost_fields('menu_ingredients105',data) from public.menu_ingredients105;

create function restaurant_private.cost_record_at(kind text,record uuid,at_time timestamptz) returns jsonb
language sql stable set search_path='' as $$
 select data from restaurant_private.cost_versions where source_table=kind and record_id=record
 and effective_at<=at_time order by effective_at desc limit 1
$$;
create or replace function restaurant_private.recipe_cost_at(p_menu uuid,p_choices jsonb,p_seen uuid[],p_at timestamptz) returns numeric
language plpgsql stable security invoker set search_path=public,pg_temp as $$
declare d jsonb;lines jsonb;l jsonb;i jsonb;g jsonb;o jsonb;chosen jsonb;option_id text;
 total numeric=0;c numeric;q numeric;child_currency text;
begin
 if p_menu=any(p_seen) or cardinality(p_seen)>12 then return null;end if;
 d=restaurant_private.cost_record_at('menu_items104',p_menu,p_at);
 if d is null or jsonb_array_length(coalesce(d->'recipeReview135','[]'))>0 then return null;end if;
 lines=coalesce(d->'recipe','[]');
 if jsonb_array_length(coalesce(d->'posOptions118','[]'))>0 and p_choices is null then return null;end if;
 for g in select value from jsonb_array_elements(coalesce(d->'posOptions118','[]')) loop
  chosen=coalesce(p_choices->(g->>'id'),'[]');
  if jsonb_typeof(chosen)<>'array' or jsonb_array_length(chosen)<coalesce((g->>'min')::integer,0) then return null;end if;
  if jsonb_array_length(chosen)>0 then
   select coalesce(jsonb_agg(l2 order by seq),'[]'::jsonb) into lines
   from jsonb_array_elements(lines) with ordinality as x(l2,seq)
   where not (coalesce(g->'replaces','[]'::jsonb) ? (l2->>'itemId'));
  end if;
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
   child_currency=restaurant_private.cost_record_at('menu_items104',(l->>'itemId')::uuid,p_at)->>'currency';
   if child_currency is distinct from d->>'currency' then return null;end if;
   c=restaurant_private.recipe_cost_at((l->>'itemId')::uuid,null,p_seen||p_menu,p_at);
  else
   i=restaurant_private.cost_record_at('menu_ingredients105',(l->>'itemId')::uuid,p_at);
   if i is null or i->>'unitReview135'='true' or i->>'currency' is distinct from d->>'currency' then return null;end if;
   c=(i->>'cost')::numeric;
  end if;
  if c is null or c<=0 then return null;end if;total=total+c*q;
 end loop;
 return total;
exception when data_exception then return null;
end$$;
create or replace function restaurant_private.sale_cost_snapshot143() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
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
  if new.paid_at<transaction_timestamp() then
   c=restaurant_private.recipe_cost_at((l->>'menuId')::uuid,l->'choices','{}',new.paid_at);
  else c=restaurant_private.recipe_cost143((l->>'menuId')::uuid,l->'choices');end if;
  select data->>'currency' into cur from menu_items104 where id=(l->>'menuId')::uuid;
  out_lines=out_lines||jsonb_build_array(l||jsonb_build_object('cost143',jsonb_build_object('basis','ingredient-recipe','unitCost',c,'currency',cur,'recordedAt',now(),'effectiveAt',new.paid_at)));
 end loop;
 new.data=jsonb_set(new.data,'{lines}',out_lines);return new;
end$$;
revoke all on function restaurant_private.sale_cost_snapshot143() from public,anon,authenticated;
revoke all on function restaurant_private.cost_fields(text,jsonb), restaurant_private.remember_cost(),
 restaurant_private.cost_record_at(text,uuid,timestamptz),restaurant_private.recipe_cost_at(uuid,jsonb,uuid[],timestamptz) from public,anon,authenticated;
