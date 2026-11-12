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

CREATE OR REPLACE FUNCTION public.pos_order118(p_id uuid, p_version integer, p_action text, p_data jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare promo146 jsonb; old pos_orders118;result pos_orders118;line jsonb;d jsonb;g jsonb;o jsonb;pick jsonb;recipe jsonb;ing jsonb;r jsonb;item inventory_items104;config jsonb;lines jsonb='[]';uses jsonb='[]';choices jsonb;names jsonb;qty numeric;price numeric;subtotal numeric=0;discount numeric;amount numeric;on_hand numeric;consumption numeric;sid uuid;method text;count_selected integer;ref text;offline_at timestamptz;selected_custom integer;
begin
 if not (case p_action when 'refund' then public.restaurant_tab_can125('pos','pos-sales-receipts','refund') when 'cancel' then public.restaurant_tab_can125('pos','pos-sales-open','void') or public.restaurant_tab_can125('pos','pos-sales-online','void') else public.restaurant_tab_can125('pos','pos-sales-new','sell') or public.restaurant_tab_can125('pos','pos-sales-open','sell') or public.restaurant_tab_can125('pos','pos-sales-online','sell') end) then raise exception 'POS tab action access required';end if;
 if not public.restaurant_can121('pos',case p_action when 'refund' then 'refund' when 'cancel' then 'void' else 'sell' end) then raise exception 'Restaurant action access required';end if;
 if not pos_allowed118() then raise exception 'POS access required';end if;
 if p_id is null or p_action not in ('save','pay','cancel','refund') then raise exception 'Invalid order action';end if;
 perform pg_advisory_xact_lock(118,118);
 perform pg_advisory_xact_lock(hashtextextended(p_id::text,118));
 select * into old from pos_orders118 where id=p_id for update;
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
 
 if old.id is not null and p_data ? 'offlineNonce' and old.data->>'offlineNonce'=p_data->>'offlineNonce' then return to_jsonb(old);end if;
 select data into config from pos_config118 where id;
 if old.id is not null and old.status=p_action then return to_jsonb(old);end if;
 -- Repeated payment requests return the original receipt; never consume twice.
 if p_action='pay' and old.status='paid' then return to_jsonb(old);end if;
 if p_action='refund' and old.status='refunded' then return to_jsonb(old);end if;
 if old.id is not null and old.version<>p_version then raise exception 'Order changed on another device. Reload before continuing';end if;
 if old.id is null and p_version<>0 then raise exception 'Order no longer exists';end if;
 if p_action in ('cancel','refund') then
  if old.id is null then raise exception 'Save the order first';end if;
  if p_action='cancel' and old.status<>'unpaid' then raise exception 'Only unpaid orders can be cancelled';end if;
  if p_action='refund' and (old.status<>'paid' or not public.restaurant_can121('pos','refund')) then raise exception 'Refund access required';end if;
  if length(trim(coalesce(p_data->>'reason','')))<3 then raise exception 'Enter a reason';end if;
  if p_action='refund' and old.data->>'payment'='Cash' then select id into sid from pos_shifts118 where cashier=auth.uid() and closed_at is null for update;if sid is null then raise exception 'Open your shift before refunding cash';end if;end if;
  if p_action='refund' and coalesce((p_data->>'restock')::boolean,false) then
   for r in select to_jsonb(x) from pos_stock118 x where order_id=p_id and kind='sale' order by item_id loop
    perform 1 from inventory_items104 where id=(r->>'item_id')::uuid for update;
    insert into pos_stock118(order_id,item_id,quantity,kind,created_by) values(p_id,(r->>'item_id')::uuid,-(r->>'quantity')::numeric,'return',auth.uid());
   end loop;
  end if;
  update pos_orders118 set status=case when p_action='refund' then 'refunded' else 'cancelled' end,version=version+1,updated_at=now(),refunded_at=case when p_action='refund' then now() else null end,data=data||jsonb_build_object('reason',p_data->>'reason','restocked',coalesce((p_data->>'restock')::boolean,false),'actionBy',auth.uid(),'refundShiftId',sid) where id=p_id returning * into result;
  if p_action='cancel' and old.data->>'promotionClaim146' is not null then update public.promotion_claims146 set status='cancelled',proof=null where id=(old.data->>'promotionClaim146')::uuid and status='approved'; end if;
  return to_jsonb(result);
 end if;
 if old.data->>'promotionClaim146' is not null and p_data ? 'promotionClaim146' and p_data->>'promotionClaim146' is distinct from old.data->>'promotionClaim146' then raise exception 'An offer attached to an order cannot be removed or replaced. Cancel the unpaid order and create a new one.'; end if;
 if old.id is not null and old.status<>'unpaid' then raise exception 'This order is already closed';end if;
 if coalesce(jsonb_typeof(p_data->'lines'),'')<>'array' or jsonb_array_length(p_data->'lines') not between 1 and 100 then raise exception 'Add between 1 and 100 order lines';end if;
 if coalesce(p_data->>'service','') not in ('Dine in','Takeaway','Delivery','Online') or length(coalesce(p_data->>'customer',''))>200 or length(coalesce(p_data->>'note',''))>2000 then raise exception 'Invalid order details';end if;
 for line in select value from jsonb_array_elements(p_data->'lines') loop
  select data into d from menu_items104 where id=(line->>'menuId')::uuid;
  if d is null or d->>'active'='false' or d->>'currency'<>'LAK' then raise exception 'Choose an available LAK menu item';end if;
  qty=(line->>'quantity')::numeric;if qty is null or qty<>trunc(qty) or qty not between 1 and 999 then raise exception 'Invalid order quantity';end if;
  price=(d->>'price')::numeric;if price is null or price<0 or price>1000000000 then raise exception 'Invalid menu price';end if;
  recipe=pos_recipe118((line->>'menuId')::uuid,1);choices='{}';names='[]';selected_custom=0;
  for g in select value from jsonb_array_elements(coalesce(d->'posOptions118','[]')) loop
   pick=coalesce(line->'choices'->(g->>'id'),'[]');if jsonb_typeof(pick)<>'array' then raise exception 'Invalid customization';end if;
   count_selected=jsonb_array_length(pick);
   if g->>'id'<>'wellness' then selected_custom=selected_custom+count_selected;end if;
   if g ? 'included' and (coalesce((g->>'included')::integer,-1)<0 or coalesce((g->>'extraPrice')::numeric,-1)<0) then raise exception 'Invalid menu customization pricing';end if;
   if count_selected<coalesce((g->>'min')::integer,0) or count_selected>coalesce((g->>'max')::integer,1) then raise exception 'Review choices for %',g->>'name';end if;
   if (select count(distinct value) from jsonb_array_elements(pick))<>count_selected then raise exception 'Duplicate choice';end if;
   if count_selected>0 then select coalesce(jsonb_agg(x),'[]') into recipe from jsonb_array_elements(recipe) x where not coalesce(g->'replaces','[]') ? (x->>'itemId');end if;
   for ref in select jsonb_array_elements_text(pick) loop
    select x into o from jsonb_array_elements(g->'options') x where x->>'id'=ref;
    if o is null or o->>'available'='false' then raise exception 'An option is unavailable';end if;
    if coalesce((o->>'price')::numeric,0)<0 then raise exception 'Invalid option price';end if;
    price=price+coalesce((o->>'price')::numeric,0);recipe=recipe||coalesce(o->'recipe','[]');names=names||jsonb_build_array(o->>'name');
   end loop;
   if g ? 'included' then price=price+greatest(0,count_selected-(g->>'included')::integer)*(g->>'extraPrice')::numeric;end if;
   choices=choices||jsonb_build_object(g->>'id',pick);
  end loop;
  if d->>'posCustom118'='true' and selected_custom=0 then raise exception 'Select a sauce, veggie or protein';end if;
  if jsonb_typeof(coalesce(line->'stockUsed','{}')) <> 'object'
    or jsonb_typeof(coalesce(line->'onlineStockExtra','{}')) <> 'object' then
    raise exception 'Invalid linked stock quantities';
  end if;
  for r in select value from jsonb_each(coalesce(line->'stockUsed','{}'))
    union all select value from jsonb_each(coalesce(line->'onlineStockExtra','{}')) loop
    if jsonb_typeof(r)<>'number' then raise exception 'Stock quantities must be numbers';end if;
    if (r::text)::numeric<0 then raise exception 'Stock quantities must be nonnegative';end if;
  end loop;
  if jsonb_typeof(coalesce(line->'packaging','{}')) <> 'object' then raise exception 'Invalid packaging selection';end if;
  for r in select value from jsonb_each(coalesce(line->'packaging','{}')) loop
    if jsonb_typeof(r)<>'number' or (r::text)::numeric not between 0 and qty or trunc((r::text)::numeric)<>(r::text)::numeric then
      raise exception 'Packaging count must be a whole number within the order quantity';
    end if;
  end loop;
  if p_action='pay' then
    select uses || coalesce(jsonb_agg(jsonb_build_object('itemId',s.item_id,'quantity',s.quantity)),'[]'::jsonb)
      into uses from restaurant_private.sale_stock_links(line->>'menuId',qty,recipe,choices,p_data->>'service',coalesce(line->'packaging','{}'),coalesce(line->'stockUsed','{}'),coalesce(line->'onlineStockExtra','{}')) s;
  end if;
  subtotal=subtotal+round(price*qty,2);lines=lines||jsonb_build_array(jsonb_build_object('menuId',line->>'menuId','name',d->>'name','photoData',d->>'photoData','photo118',d->>'photo118','quantity',qty,'packaging',coalesce(line->'packaging','{}'),'stockUsed',coalesce(line->'stockUsed','{}'),'onlineStockExtra',coalesce(line->'onlineStockExtra','{}'),'unitPrice',price,'choices',choices,'options',names,'note',left(coalesce(line->>'note',''),500)));
 end loop;
 if coalesce(p_data->>'promotionClaim146',old.data->>'promotionClaim146','')<>'' then
  if p_data ? 'offlineCapturedAt' then raise exception 'Connect before redeeming a promotion or voucher.'; end if;
  promo146=promotions_private.pos_check146(coalesce(p_data->>'promotionClaim146',old.data->>'promotionClaim146')::uuid,p_id,lines,subtotal);
 end if;
 discount=coalesce((p_data->>'discount')::numeric,0);if p_data->>'discountType'='percent' then discount=round(subtotal*discount/100,2);end if;
 if promo146 is not null then discount=(promo146->>'discount')::numeric; end if;
 if discount<0 or discount>subtotal then raise exception 'Discount exceeds the order amount';end if;
 if promo146 is null and not is_admin() and discount>subtotal*coalesce((config->>'discountLimit')::numeric,0)/100 then raise exception 'This discount requires administrator approval';end if;
 if p_data ? 'offlineCapturedAt' then
  offline_at=(p_data->>'offlineCapturedAt')::timestamptz;
  if offline_at is null or offline_at>now()+interval '5 minutes' or offline_at<now()-interval '30 days' then raise exception 'Offline sale date needs review';end if;
  if round(coalesce((p_data->>'offlineTotal')::numeric,-1),2)<>round(subtotal-discount,2) then raise exception 'Menu price or discount changed while offline. Review this sale before syncing';end if;
 end if;
 method=p_data->>'payment';
 if p_action='pay' then
  if method is null or not config->'methods' ? method or coalesce(p_data->>'confirmed','false')<>'true' then raise exception 'Confirm the actual payment received';end if;
  if method<>'Cash' and length(trim(coalesce(p_data->>'paymentReference','')))<3 then raise exception 'Enter the verified bank payment reference';end if;
  select id into sid from pos_shifts118 where cashier=auth.uid() and closed_at is null for update;
  if sid is null then raise exception 'Open your shift in Overview before charging';end if;
  if offline_at is not null and offline_at<(select opened_at from pos_shifts118 where id=sid) then raise exception 'Offline sale predates this shift. Manager review required';end if;
  if method='Cash' and coalesce((p_data->>'tendered')::numeric,0)<subtotal-discount then raise exception 'Cash received is less than the total';end if;
 end if;
 insert into pos_orders118(id,number,data,created_by) select p_id,coalesce(max(number),1000)+1,'{}',auth.uid() from pos_orders118 on conflict(id) do nothing;
 if p_action='pay' then
  for r in select jsonb_build_object('itemId',x->>'itemId','quantity',sum((x->>'quantity')::numeric)) from jsonb_array_elements(uses) x group by x->>'itemId' order by x->>'itemId' loop
   select * into item from inventory_items104 where id=(r->>'itemId')::uuid for update;
   if item.id is null or item.data->>'active'='false' then raise exception 'Inventory item unavailable';end if;
   select coalesce(sum(case when data->>'kind' in ('in','adjust-in') then (data->>'quantity')::numeric else -(data->>'quantity')::numeric end),0) into on_hand from inventory_movements104 where data->>'itemId'=item.id::text;
   select coalesce(sum(quantity),0) into consumption from pos_stock118 where item_id=item.id;
   if on_hand-consumption<(r->>'quantity')::numeric then raise exception 'Insufficient stock: %',item.data->>'name';end if;
   insert into pos_stock118(order_id,item_id,quantity,kind,created_by) values(p_id,item.id,(r->>'quantity')::numeric,'sale',auth.uid());
  end loop;
 end if;
 update pos_orders118 set data=jsonb_build_object('lines',lines,'service',p_data->>'service','customer',left(coalesce(p_data->>'customer',''),200),'note',left(coalesce(p_data->>'note',''),2000),'subtotal',subtotal,'discount',discount,'discountType','amount','total',subtotal-discount,'currency','LAK','payment',case when p_action='pay' then method else null end,'paymentReference',p_data->>'paymentReference','tendered',p_data->>'tendered','shiftId',sid,'cashier',(select full_name from profiles where id=auth.uid()),'offlineNonce',p_data->>'offlineNonce','promotionClaim146',promo146->>'claim','promotion146',promo146),status=case when p_action='pay' then 'paid' else 'unpaid' end,version=coalesce(old.version,0)+1,updated_at=now(),paid_at=case when p_action='pay' then coalesce(offline_at,now()) else null end where id=p_id returning * into result;
 if promo146 is not null then perform promotions_private.pos_finish146((promo146->>'claim')::uuid,p_id,p_action='pay'); end if;
 return to_jsonb(result);
end$function$;
