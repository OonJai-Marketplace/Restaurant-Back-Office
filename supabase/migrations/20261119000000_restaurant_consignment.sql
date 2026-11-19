create table restaurant_private.consignment_partners (
 id uuid primary key, name text not null check(length(trim(name)) between 1 and 100),
 percent numeric(5,2) not null check(percent between 0 and 100), version integer not null default 1
);
create unique index consign_partner_name on restaurant_private.consignment_partners(lower(name));
create table restaurant_private.consignment_products (
 id uuid primary key, partner uuid not null references restaurant_private.consignment_partners,
 name text not null check(length(trim(name)) between 1 and 160),
 original numeric(12,2) not null check(original>=0), price numeric(12,2) not null check(price between original and 1000000000),
 quantity integer not null check(quantity>=0), published boolean not null, deleted boolean not null default false,
 version integer not null default 1
);
revoke all on restaurant_private.consignment_products, restaurant_private.consignment_partners from public,anon,authenticated;
create function public.restaurant_consignment166(action text, payload jsonb default '{}') returns jsonb
language plpgsql security definer set search_path='' as $$
declare p restaurant_private.consignment_products; k restaurant_private.consignment_partners;
 item uuid:=(payload->>'id')::uuid; v integer:=(payload->>'version')::int; projection jsonb;
begin
 if public.restaurant_tab_can125('inventory','inv-items',case action when 'list' then 'view' when 'remove' then 'delete' else 'edit' end) is not true then raise exception 'Inventory access required';end if;
 if action='partner' then
  if v=0 then insert into restaurant_private.consignment_partners(id,name,percent) values(item,trim(payload->>'name'),(payload->>'percent')::numeric);
  else update restaurant_private.consignment_partners set percent=(payload->>'percent')::numeric,version=version+1 where id=item and version=v;
   if not found then raise exception 'Partner changed. Refresh and try again.';end if;
  end if;
 elsif action in ('product','remove') then
  perform pg_advisory_xact_lock(118,118);
  if action='remove' then
   update restaurant_private.consignment_products set deleted=true,published=false,version=version+1 where id=item and version=v and not deleted returning * into p;
  elsif v=0 then
   insert into restaurant_private.consignment_products(id,partner,name,original,price,quantity,published) values(item,(payload->>'partner')::uuid,trim(payload->>'name'),(payload->>'original')::numeric,(payload->>'price')::numeric,(payload->>'quantity')::integer,(payload->>'published')::boolean) returning * into p;
  else
   update restaurant_private.consignment_products set partner=(payload->>'partner')::uuid,name=trim(payload->>'name'),original=(payload->>'original')::numeric,price=(payload->>'price')::numeric,quantity=(payload->>'quantity')::integer,published=(payload->>'published')::boolean,version=version+1 where id=item and version=v and not deleted returning * into p;
  end if;
  if p.id is null then raise exception 'Stock or product details changed. Refresh before editing.';end if;
  select * into strict k from restaurant_private.consignment_partners where id=p.partner;
  projection=jsonb_build_object('name',p.name,'code','CS-'||p.id,'category','Consignment · '||k.name,'consigned166',true,'price',p.price,'currency','LAK','active',p.published and not p.deleted,'recipe','[]'::jsonb,'itemType','standard');
  if exists(select 1 from public.menu_items104 where id=p.id) then
   update public.menu_items104 set data=projection,version=version+1 where id=p.id and data->>'consigned166'='true';
   if not found then raise exception 'Product ID already in use';end if;
  else insert into public.menu_items104(id,data) values(p.id,projection);end if;
 elsif action<>'list' or action is null then raise exception 'Unknown consignment action';end if;
 return jsonb_build_object('partners',coalesce((select jsonb_agg(to_jsonb(a) order by name) from restaurant_private.consignment_partners a),'[]'::jsonb),'products',coalesce((select jsonb_agg(to_jsonb(b) order by name) from restaurant_private.consignment_products b where not deleted),'[]'::jsonb));
end $$;
revoke all on function public.restaurant_consignment166(text,jsonb) from public,anon;
grant execute on function public.restaurant_consignment166(text,jsonb) to authenticated;

create function restaurant_private.consignment_sale166() returns trigger language plpgsql security definer set search_path='' as $$
declare l jsonb; lines jsonb='[]'; p restaurant_private.consignment_products; k restaurant_private.consignment_partners;
 qty int; gross numeric; accumulated numeric=0; prior_net numeric=0; cumulative_net numeric; paid numeric; share numeric; subtotal numeric;
begin
 if old.status='paid' and new.status='refunded' then
  if (new.data->>'restocked')::boolean then
   for l in select value from jsonb_array_elements(old.data->'lines') where value ? 'consignment' loop
    update restaurant_private.consignment_products set quantity=quantity+(l->>'quantity')::int,version=version+1 where id=(l->>'menuId')::uuid;
   end loop;
  end if;return new;
 end if;
 if new.status<>'paid' or old.status='paid' then return new;end if;
 paid=(new.data->>'total')::numeric;subtotal=(new.data->>'subtotal')::numeric;
 for l in select value from jsonb_array_elements(new.data->'lines') loop
  qty=(l->>'quantity')::int;gross=round(qty*(l->>'unitPrice')::numeric,2);accumulated=accumulated+gross;
  cumulative_net=case when subtotal>0 then round(paid*accumulated/subtotal,2) else 0 end;
  select * into p from restaurant_private.consignment_products where id=(l->>'menuId')::uuid for update;
  if found then
   if p.deleted or not p.published or p.price<>(l->>'unitPrice')::numeric then raise exception 'Consigned product changed. Refresh the order.';end if;
   if p.quantity<qty then raise exception 'Insufficient consigned stock for %',p.name;end if;
   select * into strict k from restaurant_private.consignment_partners where id=p.partner for share;
   share=round(qty*p.original*k.percent/100,2);
   l=l||jsonb_build_object('consignment',jsonb_build_object('partnerId',k.id,'partner',k.name,'originalPrice',p.original,'percent',k.percent,'partnerShare',share,'companyShare',cumulative_net-prior_net-share));
   update restaurant_private.consignment_products set quantity=quantity-qty,version=version+1 where id=p.id;
  end if;
  lines=lines||jsonb_build_array(l);prior_net=cumulative_net;
 end loop;
 new.data=jsonb_set(new.data,'{lines}',lines);return new;
end $$;
revoke all on function restaurant_private.consignment_sale166() from public,authenticated,anon;
create trigger consignment_sale before update of status on public.pos_orders118 for each row when(old.status is distinct from new.status) execute function restaurant_private.consignment_sale166();
create function restaurant_private.consignment_summary166(sales jsonb,refunds jsonb) returns jsonb language sql immutable set search_path='' as $$
 with events as (select value,1 sign from jsonb_array_elements(sales) union all select value,-1 from jsonb_array_elements(refunds)),
 shares as (select l->'consignment' c,sign from events cross join lateral jsonb_array_elements(value->'data'->'lines') l where l ? 'consignment'),
 partners as (select c->>'partnerId' id,c->>'partner' name,sum(sign*(c->>'partnerShare')::numeric) partner,sum(sign*(c->>'companyShare')::numeric) company from shares group by 1,2)
 select jsonb_build_object('partners',coalesce(jsonb_agg(to_jsonb(partners) order by name),'[]'::jsonb),'partner',coalesce(sum(partner),0),'company',coalesce(sum(company),0)) from partners
$$;
revoke all on function restaurant_private.consignment_summary166(jsonb,jsonb) from public,anon,authenticated;

CREATE OR REPLACE FUNCTION restaurant_private.pos_shift_totals152(p_opening jsonb, p_sales jsonb, p_refunds jsonb, p_moves jsonb)
 RETURNS jsonb
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$
with sales as (
 select o->'data' d from jsonb_array_elements(p_sales) o
), refunds as (
 select o->'data' d from jsonb_array_elements(p_refunds) o
), paid as (
 select d->>'payment' method,coalesce((d->>'total')::numeric,0) sales,coalesce((d->>'subtotal')::numeric,(d->>'total')::numeric,0) gross,
 coalesce((d->>'tip')::numeric,0) tips,coalesce((d->>'collectedTotal')::numeric,(d->>'total')::numeric,0) collected,
 greatest(coalesce((d->>'tendered')::numeric,(d->>'collectedTotal')::numeric,(d->>'total')::numeric,0)-coalesce((d->>'collectedTotal')::numeric,(d->>'total')::numeric,0),0) change,
 coalesce(d->'fxTender'->>'currency','LAK') currency,
 coalesce((d->'fxTender'->>'amount')::numeric,(d->>'tendered')::numeric,(d->>'collectedTotal')::numeric,(d->>'total')::numeric,0) received from sales
), returned as (
 select d->>'payment' method,coalesce((d->>'total')::numeric,0) sales,coalesce((d->>'tip')::numeric,0) tips,
 coalesce((d->>'collectedTotal')::numeric,(d->>'total')::numeric,0) collected from refunds
), moves as (
 select coalesce(m->>'currency','LAK') currency,(m->>'amount')::numeric amount from jsonb_array_elements(p_moves) m where coalesce(m->>'kind','manual')='manual'
), currencies as (
 select unnest(array['LAK','USD','THB']) currency union select jsonb_object_keys(p_opening) union select currency from paid where method='Cash' union select currency from moves
), balances as (
 select c.currency,coalesce((p_opening->>c.currency)::numeric,0) opening,
 coalesce((select sum(received) from paid where method='Cash' and currency=c.currency),0) received,
 case when c.currency='LAK' then coalesce((select sum(change) from paid),0) else 0 end change,
 case when c.currency='LAK' then coalesce((select sum(collected) from returned where method='Cash'),0) else 0 end refunds,
 coalesce((select sum(amount) from moves where currency=c.currency and amount>0),0) cash_in,
 -coalesce((select sum(amount) from moves where currency=c.currency and amount<0),0) cash_out from currencies c
), methods as (select method from paid union select method from returned), method_totals as (
 select method,coalesce((select sum(collected) from paid p where p.method=m.method),0) paid,
 coalesce((select sum(collected) from returned r where r.method=m.method),0) refunds from methods m
)
select jsonb_build_object(
 'consignment',restaurant_private.consignment_summary166(p_sales,p_refunds),
 'totals',jsonb_build_object('paidCount',(select count(*) from paid),'refundCount',(select count(*) from returned),
 'grossSales',coalesce((select sum(gross) from paid),0),'discounts',coalesce((select sum(gross-sales) from paid),0),
 'sales',coalesce((select sum(sales) from paid),0),'refunds',coalesce((select sum(sales) from returned),0),
 'companyNetSales',-(restaurant_private.consignment_summary166(p_sales,p_refunds)->>'partner')::numeric+coalesce((select sum(sales) from paid),0)-coalesce((select sum(sales) from returned),0),
 'netSales',coalesce((select sum(sales) from paid),0)-coalesce((select sum(sales) from returned),0),
 'tips',coalesce((select sum(tips) from paid),0)-coalesce((select sum(tips) from returned),0),
 'collected',coalesce((select sum(collected) from paid),0)-coalesce((select sum(collected) from returned),0)),
 'methods',coalesce((select jsonb_agg(jsonb_build_object('method',method,'paid',paid,'refunds',refunds,'net',paid-refunds) order by method) from method_totals),'[]'::jsonb),
 'cash',coalesce((select jsonb_agg(jsonb_build_object('currency',currency,'opening',opening,'received',received,'change',change,'refunds',refunds,'cashIn',cash_in,'cashOut',cash_out,'expected',round(opening+received-change-refunds+cash_in-cash_out,2)) order by case currency when 'LAK' then 0 when 'USD' then 1 when 'THB' then 2 else 3 end,currency) from balances),'[]'::jsonb));
$function$
;
CREATE OR REPLACE FUNCTION public.restaurant_stamp_inventory_menu104_121()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare on_hand numeric;
begin
 if not ((TG_TABLE_NAME='menu_items104' and TG_OP in ('INSERT','UPDATE') and current_user=(select pg_get_userbyid(proowner) from pg_proc where oid='public.restaurant_consignment166(text,jsonb)'::regprocedure) and NEW.data->>'consigned166'='true' and (public.restaurant_tab_can125('inventory','inv-items','edit') or public.restaurant_tab_can125('inventory','inv-items','delete'))) or public.restaurant_table_can121(TG_TABLE_NAME,case when TG_OP='DELETE' then 'delete' else 'edit' end,case when TG_OP='DELETE' then OLD.data else NEW.data end) or (current_user=(select pg_get_userbyid(proowner) from pg_proc where oid='public.restaurant_prepare124(uuid,jsonb)'::regprocedure) and public.restaurant_tab_can125('inventory','inv-preparation124','prepare') and TG_TABLE_NAME in ('inventory_items104','inventory_movements104','menu_ingredients105') and TG_OP in ('INSERT','UPDATE')) or (current_user=(select pg_get_userbyid(proowner) from pg_proc where oid='public.restaurant_record_waste124(uuid,jsonb)'::regprocedure) and TG_TABLE_NAME='inventory_movements104' and TG_OP='INSERT' and NEW.data ? 'waste124' and (public.restaurant_tab_can125('inventory','inv-waste124','stock_out') or public.restaurant_tab_can125('inventory','inv-waste124','adjust')))) then raise exception 'Administrator access required'; end if;
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
end $function$
;
