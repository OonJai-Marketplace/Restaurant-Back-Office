-- Run after v119 offline guard. Server validates custom selections and add-on prices.
-- Run after the v118 database update. Preserve the actual offline payment time and flag price changes for review.
create or replace function public.pos_order118(p_id uuid,p_version integer,p_action text,p_data jsonb default '{}') returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare old pos_orders118;result pos_orders118;line jsonb;d jsonb;g jsonb;o jsonb;pick jsonb;recipe jsonb;ing jsonb;r jsonb;item inventory_items104;config jsonb;lines jsonb='[]';uses jsonb='[]';choices jsonb;names jsonb;qty numeric;price numeric;subtotal numeric=0;discount numeric;amount numeric;on_hand numeric;consumption numeric;sid uuid;method text;count_selected integer;ref text;offline_at timestamptz;selected_custom integer;
begin
 if not pos_allowed118() then raise exception 'POS access required';end if;
 if p_id is null or p_action not in ('save','pay','cancel','refund') then raise exception 'Invalid order action';end if;
 perform pg_advisory_xact_lock(118,118);
 perform pg_advisory_xact_lock(hashtextextended(p_id::text,118));
 select * into old from pos_orders118 where id=p_id for update;
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
  if p_action='refund' and (old.status<>'paid' or not public.is_admin()) then raise exception 'An administrator must approve a paid-order refund';end if;
  if length(trim(coalesce(p_data->>'reason','')))<3 then raise exception 'Enter a reason';end if;
  if p_action='refund' and old.data->>'payment'='Cash' then select id into sid from pos_shifts118 where cashier=auth.uid() and closed_at is null for update;if sid is null then raise exception 'Open your shift before refunding cash';end if;end if;
  if p_action='refund' and coalesce((p_data->>'restock')::boolean,false) then
   for r in select to_jsonb(x) from pos_stock118 x where order_id=p_id and kind='sale' order by item_id loop
    perform 1 from inventory_items104 where id=(r->>'item_id')::uuid for update;
    insert into pos_stock118(order_id,item_id,quantity,kind,created_by) values(p_id,(r->>'item_id')::uuid,-(r->>'quantity')::numeric,'return',auth.uid());
   end loop;
  end if;
  update pos_orders118 set status=case when p_action='refund' then 'refunded' else 'cancelled' end,version=version+1,updated_at=now(),refunded_at=case when p_action='refund' then now() else null end,data=data||jsonb_build_object('reason',p_data->>'reason','restocked',coalesce((p_data->>'restock')::boolean,false),'actionBy',auth.uid(),'refundShiftId',sid) where id=p_id returning * into result;return to_jsonb(result);
 end if;
 if old.id is not null and old.status<>'unpaid' then raise exception 'This order is already closed';end if;
 if coalesce(jsonb_typeof(p_data->'lines'),'')<>'array' or jsonb_array_length(p_data->'lines') not between 1 and 100 then raise exception 'Add between 1 and 100 order lines';end if;
 if coalesce(p_data->>'service','') not in ('Dine in','Takeaway','Delivery','Online') or length(coalesce(p_data->>'customer',''))>200 or length(coalesce(p_data->>'note',''))>2000 then raise exception 'Invalid order details';end if;
 for line in select value from jsonb_array_elements(p_data->'lines') loop
  select data into d from menu_items104 where id=(line->>'menuId')::uuid;
  if d is null or d->>'active'='false' or d->>'currency'<>'LAK' then raise exception 'Choose an available LAK menu item';end if;
  qty=(line->>'quantity')::numeric;if qty is null or qty<>trunc(qty) or qty not between 1 and 999 then raise exception 'Invalid order quantity';end if;
  price=(d->>'price')::numeric;if price is null or price<0 or price>1000000000 then raise exception 'Invalid menu price';end if;
  if p_action='pay' and d->>'posSetupPending120'='true' then raise exception 'Review this menu recipe and Inventory links in Menu before taking payment';end if;
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
    if p_action='pay' and d->>'posCustom118'='true' and jsonb_array_length(coalesce(o->'recipe','[]'::jsonb))=0 and o->>'posNoStock118' is distinct from 'true' then raise exception 'Link the selected customization to Inventory before payment';end if;
    if coalesce((o->>'price')::numeric,0)<0 then raise exception 'Invalid option price';end if;
    price=price+coalesce((o->>'price')::numeric,0);recipe=recipe||coalesce(o->'recipe','[]');names=names||jsonb_build_array(o->>'name');
   end loop;
   if g ? 'included' then price=price+greatest(0,count_selected-(g->>'included')::integer)*(g->>'extraPrice')::numeric;end if;
   choices=choices||jsonb_build_object(g->>'id',pick);
  end loop;
  if d->>'posCustom118'='true' and selected_custom=0 then raise exception 'Select a sauce, veggie or protein';end if;
  if p_action='pay' then
   if jsonb_array_length(recipe)=0 and coalesce(d->>'posNoStock118','false')<>'true' then raise exception 'Link the recipe to Inventory, or mark this item as non-stock in POS Management';end if;
   for r in select value from jsonb_array_elements(recipe) loop
    select data into ing from menu_ingredients105 where id=(r->>'itemId')::uuid;
    if ing is null or ing->>'active'='false' or coalesce(ing->>'inventoryItemId118','')='' then raise exception 'Link every selected ingredient to Inventory in POS Management';end if;
    amount=(r->>'quantity')::numeric*coalesce((ing->>'inventoryFactor118')::numeric,1)*qty;
    if amount is null or amount<=0 then raise exception 'Invalid ingredient unit conversion';end if;
    uses=uses||jsonb_build_array(jsonb_build_object('itemId',ing->>'inventoryItemId118','quantity',amount));
   end loop;
  end if;
  subtotal=subtotal+round(price*qty,2);lines=lines||jsonb_build_array(jsonb_build_object('menuId',line->>'menuId','name',d->>'name','photoData',d->>'photoData','photo118',d->>'photo118','quantity',qty,'unitPrice',price,'choices',choices,'options',names,'note',left(coalesce(line->>'note',''),500)));
 end loop;
 discount=coalesce((p_data->>'discount')::numeric,0);if p_data->>'discountType'='percent' then discount=round(subtotal*discount/100,2);end if;
 if discount<0 or discount>subtotal then raise exception 'Discount exceeds the order amount';end if;
 if not is_admin() and discount>subtotal*coalesce((config->>'discountLimit')::numeric,0)/100 then raise exception 'This discount requires administrator approval';end if;
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
 update pos_orders118 set data=jsonb_build_object('lines',lines,'service',p_data->>'service','customer',left(coalesce(p_data->>'customer',''),200),'note',left(coalesce(p_data->>'note',''),2000),'subtotal',subtotal,'discount',discount,'discountType','amount','total',subtotal-discount,'currency','LAK','payment',case when p_action='pay' then method else null end,'paymentReference',p_data->>'paymentReference','tendered',p_data->>'tendered','shiftId',sid,'cashier',(select full_name from profiles where id=auth.uid()),'offlineNonce',p_data->>'offlineNonce'),status=case when p_action='pay' then 'paid' else 'unpaid' end,version=coalesce(old.version,0)+1,updated_at=now(),paid_at=case when p_action='pay' then coalesce(offline_at,now()) else null end where id=p_id returning * into result;
 return to_jsonb(result);
end$$;
