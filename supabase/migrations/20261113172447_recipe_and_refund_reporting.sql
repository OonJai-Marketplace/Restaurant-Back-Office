-- Business dates use the local payment and refund timestamps. Private bundle components may be prepared without separate POS publication.
create or replace function public.pos_report_page125(p_from date,p_to date,p_before_number bigint default null)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare result jsonb;begin
 if not public.restaurant_pos_tab125('pos-management') or not public.restaurant_pos_tab125('pos-sales-receipts') then raise exception 'Report access required';end if;
 if p_from is null or p_to is null or p_to<p_from or p_to-p_from>366 then raise exception 'Choose an export period of up to one year';end if;
 select coalesce(jsonb_agg(to_jsonb(o) order by o.number desc),'[]'::jsonb) into result from
 (select * from pos_orders118 where status in ('paid','refunded') and ((paid_at>=(p_from::timestamp at time zone 'Asia/Vientiane')
 and paid_at<((p_to+1)::timestamp at time zone 'Asia/Vientiane')  ) or (status='refunded' and refunded_at>=(p_from::timestamp at time zone 'Asia/Vientiane') and refunded_at<((p_to+1)::timestamp at time zone 'Asia/Vientiane'))) and (p_before_number is null or number<p_before_number) order by number desc limit 250) o;
 return result;
end $$;
revoke all on function public.pos_report_page125(date,date,bigint) from public,anon;
grant execute on function public.pos_report_page125(date,date,bigint) to authenticated;

create or replace function public.pos_recipe118(p_menu uuid,p_quantity numeric,p_seen uuid[] default '{}') returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare d jsonb;l jsonb;result jsonb='[]';begin
 if p_menu=any(p_seen) or cardinality(p_seen)>12 then raise exception 'Recipe contains a circular bundle';end if;
 select data into d from menu_items104 where id=p_menu;
 if d is null or (cardinality(p_seen)=0 and d->>'active'='false') or (cardinality(p_seen)>0 and d->>'stage131'='archived') then raise exception 'Menu item unavailable';end if;
 for l in select value from jsonb_array_elements(coalesce(d->'recipe','[]')) loop
  if coalesce((l->>'quantity')::numeric,0)<=0 then raise exception 'Invalid recipe quantity';end if;
  if d->>'itemType'='bundle' then result=result||pos_recipe118((l->>'itemId')::uuid,(l->>'quantity')::numeric*p_quantity,p_seen||p_menu);
  else result=result||jsonb_build_array(jsonb_build_object('itemId',l->>'itemId','quantity',(l->>'quantity')::numeric*p_quantity));end if;
 end loop;return result;end$$;
create or replace function restaurant_private.recipe_cost143(p_menu uuid,p_choices jsonb default null,p_seen uuid[] default '{}') returns numeric
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

notify pgrst,'reload schema';
