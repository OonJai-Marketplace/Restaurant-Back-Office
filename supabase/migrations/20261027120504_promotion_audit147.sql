-- Release 147: verified promotion audit fixes.
create or replace function promotions_private.quote146(p_id uuid,p_lines jsonb,p_channel text,p_voucher text default '') returns jsonb
language plpgsql security definer set search_path='' as $$
declare v public.restaurant_vouchers146; reserved numeric=0; reservations integer=0; promo public.storefront_promotions146; s public.storefront_items127; m jsonb; l jsonb; g jsonb; choice text; opt jsonb; picked jsonb; normalized jsonb; names jsonb; lines jsonb='[]'; r jsonb; d jsonb; q integer; price numeric; subtotal numeric=0; eligible numeric=0; units integer=0; discount numeric=0; gift numeric=0; giftline jsonb; laos_now timestamp=now() at time zone 'Asia/Vientiane'; begin
 if p_channel is null or p_channel not in ('website','pos') or (p_channel='pos' and (auth.uid() is null or not public.restaurant_can121('pos','sell'))) then raise exception 'POS access required'; end if;
 if coalesce(p_voucher,'')<>'' then
  select * into v from public.restaurant_vouchers146 where code=upper(trim(p_voucher));
  if v.id is null or not v.enabled or v.expires_at<=now() or v.used_count>=v.max_uses then raise exception 'Voucher unavailable, expired or fully used.'; end if;
  p_id=v.promotion_id;
 end if;
 select * into promo from public.storefront_promotions146 where id=p_id;
 if promo.id is null or not promo.enabled or promo.starts_at>now() or promo.ends_at<=now() then raise exception 'This offer is not live now.'; end if;
 d=promo.data; r=coalesce(d->'rules','{}');
 if v.id is not null and coalesce(r->>'kind','none') not in ('percent','amount') then raise exception 'This voucher’s linked offer has changed. Please contact the restaurant.'; end if;
 if coalesce((r->>'voucherOnly')::boolean,false) and v.id is null then raise exception 'Enter a valid voucher ID to use this offer.'; end if;
 if not coalesce(d->'weekdays','[0,1,2,3,4,5,6]') @> to_jsonb(array[extract(dow from laos_now)::integer]) or (coalesce(d->>'from','')<>'' and (laos_now::time<(d->>'from')::time or laos_now::time>=(d->>'until')::time)) then raise exception 'This offer is outside its scheduled days or hours.'; end if;
 if coalesce(r->>'channel','all') not in ('all',p_channel) then raise exception 'This offer is for a different ordering channel.'; end if;
 if jsonb_typeof(p_lines) is distinct from 'array' or jsonb_array_length(p_lines) not between 1 and 50 then raise exception 'Add 1–50 items to your basket.'; end if;
 for l in select value from jsonb_array_elements(p_lines) loop
  select * into s from public.storefront_items127 where id=l->>'id' and stage131='active' and available and case when p_channel='website' then published else pos_visible131 end;
  if s.id is null or s.menu_item_id is null then raise exception 'An item is no longer available. Refresh your menu.'; end if;
  select data into m from public.menu_items104 where id=s.menu_item_id;
  if m is null or m->>'active'='false' then raise exception 'An item is unavailable'; end if;
  if (l->>'qty')::numeric<>trunc((l->>'qty')::numeric) then raise exception 'Use whole item quantities'; end if;
  q=(l->>'qty')::integer; if q is null or q not between 1 and 99 then raise exception 'Use a quantity between 1 and 99.'; end if;
  price=s.price; normalized='{}'; names='[]';
  for g in select value from jsonb_array_elements(coalesce(m->'posOptions118','[]')) loop
   picked=coalesce(l->'choices'->(g->>'id'),case when g->>'id'='wellness' and coalesce(l->'choices'->>'drink','')<>'' then jsonb_build_array(l->'choices'->>'drink') else '[]'::jsonb end);
   if jsonb_typeof(picked)<>'array' or jsonb_array_length(picked)<coalesce((g->>'min')::integer,0) or jsonb_array_length(picked)>coalesce((g->>'max')::integer,1) then raise exception 'Review choices for %',g->>'name'; end if;
   normalized=normalized||jsonb_build_object(g->>'id','[]'::jsonb);
   for choice in select jsonb_array_elements_text(picked) loop
    select x into opt from jsonb_array_elements(g->'options') x where x->>'id'=choice or lower(x->>'name')=lower(choice) limit 1;
    if opt is null or opt->>'available'='false' then raise exception 'A chosen option is unavailable.'; end if;
    if normalized->(g->>'id') @> jsonb_build_array(opt->>'id') then raise exception 'Duplicate option'; end if;
    normalized=jsonb_set(normalized,array[g->>'id'],(normalized->(g->>'id'))||jsonb_build_array(opt->>'id'));
    names=names||jsonb_build_array(opt->>'name');price=price+coalesce((opt->>'price')::numeric,0);
   end loop;
   price=price+greatest(0,jsonb_array_length(picked)-coalesce((g->>'included')::integer,jsonb_array_length(picked)))*coalesce((g->>'extraPrice')::numeric,0);
  end loop;
  if m->>'posCustom118'='true' and not exists(select 1 from jsonb_each(normalized) x where x.key<>'wellness' and jsonb_array_length(x.value)>0) then raise exception 'Choose your sauce, vegetables or protein.'; end if;
  subtotal=subtotal+price*q;
  if coalesce(jsonb_array_length(r->'items'),0)=0 or r->'items' ? s.id then eligible=eligible+price*q;units=units+q; end if;
  lines=lines||jsonb_build_array(jsonb_build_object('menuId',s.menu_item_id,'publicId',s.id,'name',s.name,'quantity',q,'unitPrice',price,'choices',normalized,'options',names,'note',''));
 end loop;
 if subtotal<coalesce((r->>'minSpend')::numeric,0) then raise exception 'Spend at least % LAK before discounts for this offer.',r->>'minSpend'; end if;
 if units<coalesce((r->>'minQty')::integer,0) or eligible<=0 then raise exception 'Add the required eligible items to your basket.'; end if;
 if r->>'kind'='percent' then discount=round(eligible*(r->>'value')::numeric/100,0);
 elsif r->>'kind'='amount' then discount=least(eligible,(r->>'value')::numeric);
 elsif r->>'kind'='gift' then
  select * into s from public.storefront_items127 where id=r->>'giftId' and stage131='active' and available and case when p_channel='website' then published else pos_visible131 end;
  if s.id is null or coalesce((s.options->>'isCustom')::boolean,false) then raise exception 'The free item is unavailable or needs choices. Contact the restaurant.'; end if;
  select data into m from public.menu_items104 where id=s.menu_item_id;
  if m is null or m->>'active'='false' or m->>'currency' is distinct from 'LAK' or coalesce((m->>'posCustom118')::boolean,false) or exists(select 1 from jsonb_array_elements(coalesce(m->'posOptions118','[]')) x where coalesce((x->>'min')::integer,0)>0) then raise exception 'The free item is unavailable in POS or needs choices. Choose another free item.'; end if;
  select coalesce(jsonb_object_agg(x->>'id','[]'::jsonb),'{}'::jsonb) into normalized from jsonb_array_elements(coalesce(m->'posOptions118','[]')) x;
  gift=s.price*coalesce((r->>'giftQty')::integer,1);discount=gift;
  giftline=jsonb_build_object('menuId',s.menu_item_id,'publicId',s.id,'name',s.name,'quantity',coalesce((r->>'giftQty')::integer,1),'unitPrice',s.price,'choices',normalized,'options','[]'::jsonb,'note','Promotion gift');lines=lines||jsonb_build_array(giftline);subtotal=subtotal+gift;
 else raise exception 'This is an announcement, without an automatic offer.';
 end if;
 if coalesce((r->>'maxDiscount')::numeric,0)>0 and r->>'kind'<>'gift' then discount=least(discount,(r->>'maxDiscount')::numeric); end if;
 if v.id is not null then
  select coalesce(sum((quote->>'discount')::numeric),0),count(*) into reserved,reservations from public.promotion_claims146 where voucher_id=v.id and status='approved' and expires_at>now();
  if v.used_count+reservations>=v.max_uses then raise exception 'This voucher is already in use or has reached its use limit.'; end if;
  discount=case v.kind when 'percent' then round(eligible*v.value/100,0) when 'balance' then least(eligible,v.balance-reserved) else least(eligible,v.value) end;
  if v.max_per_use>0 then discount=least(discount,v.max_per_use); end if;
  if coalesce((r->>'maxDiscount')::numeric,0)>0 then discount=least(discount,(r->>'maxDiscount')::numeric); end if;
  if discount<=0 then raise exception 'This voucher has no available balance.'; end if;
 end if;
 discount=least(subtotal,greatest(0,discount));
 return jsonb_build_object('voucher',case when v.id is not null then jsonb_build_object('code',v.code,'kind',v.kind,'balance',v.balance,'used',v.used_count,'maxUses',v.max_uses,'reserved',reserved) else null end,'promotionId',p_id,'promotionVersion',promo.version,'name',d->>'name','title',d->>'title','subtotal',subtotal,'discount',discount,'total',subtotal-discount,'lines',lines,'gift',giftline,'approval',coalesce((r->>'approval')::boolean,false) or coalesce((r->>'proof')::boolean,false),'proofRequired',coalesce((r->>'proof')::boolean,false),'proofLabel',r->>'proofLabel','terms',d->>'terms','currency','LAK');
end $$;

create or replace function promotions_private.claim_response146(c public.promotion_claims146) returns jsonb language sql stable security invoker set search_path='' as $$
 select jsonb_build_object('code',c.code,'customer',c.customer,'phone',c.phone,'note',c.note,'unavailable',c.status='approved' and (not exists(select 1 from public.storefront_promotions146 p where p.id=c.promotion_id and p.enabled and (p.starts_at is null or p.starts_at<=now()) and (p.ends_at is null or p.ends_at>now())) or (c.voucher_id is not null and not exists(select 1 from public.restaurant_vouchers146 v where v.id=c.voucher_id and v.enabled and (v.expires_at is null or v.expires_at>now()) and v.used_count<v.max_uses and (v.kind<>'balance' or v.balance>=(c.quote->>'discount')::numeric)))),'status',c.status,'expiresAt',c.expires_at,'quote',c.quote,'reviewNote',c.review_note,'expired',c.expires_at<=now() and c.status in ('approved','pending'))
$$;

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




create or replace function public.issue_vouchers146(p_promotion uuid,p_codes jsonb,p_batch text,p_kind text,p_value numeric,p_uses integer,p_max numeric,p_expires timestamptz default null) returns integer language plpgsql security invoker set search_path='' as $$
declare c jsonb; n integer=0; begin
 if not public.is_admin() then raise exception 'Administrator access required'; end if;
 if jsonb_typeof(p_codes) is distinct from 'array' or jsonb_array_length(p_codes) not between 1 and 200 or length(trim(p_batch)) not between 1 and 100 then raise exception 'Name the batch and enter 1–200 voucher codes.'; end if;
 if not exists(select 1 from public.restaurant_promotions146 where id=p_promotion and coalesce(data->'rules'->>'kind','none') in ('percent','amount')) then raise exception 'Choose a percentage or amount promotion to supply the voucher restrictions.'; end if;
 if p_kind is null or p_kind not in ('percent','amount','balance') or p_value is null or p_value<=0 or p_value>1000000000 or p_value::text='NaN' or (p_kind='percent' and p_value>100) then raise exception 'Enter a percentage between 1 and 100, or a positive voucher amount.'; end if;
 if p_uses is null or p_uses not between 1 and 1000 or p_max is null or p_max<0 or p_max>1000000000 or p_max::text='NaN' then raise exception 'Use 1–1000 redemptions and a valid per-use cap.'; end if;
 if p_expires<=now() then raise exception 'Choose a future voucher expiry.'; end if;
 if exists(select 1 from jsonb_array_elements(p_codes) x where coalesce(upper(trim(x->>'code')),'') !~ '^[A-Z0-9][A-Z0-9-]{5,39}$') then raise exception 'Voucher IDs need 6–40 letters, numbers or hyphens.'; end if;
 for c in select value from jsonb_array_elements(p_codes) loop
 insert into public.restaurant_vouchers146(code,batch,promotion_id,kind,value,balance,max_uses,max_per_use,expires_at,recipient) values(upper(trim(c->>'code')),trim(p_batch),p_promotion,p_kind,p_value,case when p_kind='balance' then p_value else 0 end,p_uses,p_max,p_expires,left(coalesce(c->>'recipient',''),100));n=n+1;
 end loop;
 return n;
exception when unique_violation then raise exception 'A voucher ID is duplicated or already registered. No vouchers in this batch were added.';
end $$;

create index if not exists restaurant_promotion_costs147_campaign on public.restaurant_promotion_costs146(promotion_id,day);
create or replace function promotions_private.request146(p_id uuid,p_token uuid,p_lines jsonb,p_customer text,p_phone text,p_channel text,p_note text,p_proof text,p_voucher text default '') returns jsonb language plpgsql security definer set search_path='' as $$
declare v public.restaurant_vouchers146; c public.promotion_claims146; q jsonb; v_phone text=regexp_replace(p_phone,'[^0-9]','','g'); approval boolean; begin
 if p_token is null or length(trim(p_customer)) not between 1 and 100 or length(v_phone) not between 8 and 15 or length(coalesce(p_note,''))>500 then raise exception 'Enter your name and full phone number, including country code.'; end if;
 -- Canonical local and international Laos formats share one limit key.
 if left(v_phone,1)='0' then v_phone='856'||substr(v_phone,2); elsif length(v_phone) in (9,10) and left(v_phone,2)='20' then v_phone='856'||v_phone; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_token::text,147));
 select * into c from public.promotion_claims146 where token_hash=md5(p_token::text);
 if c.id is not null then return promotions_private.claim_response146(c); end if;
 perform pg_advisory_xact_lock(hashtextextended(v_phone,148));
 if (select count(*) from public.promotion_claims146 where promotion_claims146.phone=v_phone and created_at>now()-interval '1 hour')>=5 then raise exception 'Please try again later.'; end if;
 if coalesce(p_voucher,'')<>'' then
 select * into v from public.restaurant_vouchers146 where code=upper(trim(p_voucher));
 if v.id is null then raise exception 'Voucher not found. Check the ID.'; end if;
 p_id=v.promotion_id;
 end if;
 perform pg_advisory_xact_lock(hashtextextended(p_id::text,146));
 if v.id is not null then perform 1 from public.restaurant_vouchers146 where id=v.id for update; end if;
 if exists(select 1 from public.promotion_claims146 x where x.phone=v_phone and x.promotion_id=p_id and x.status in ('approved','pending') and x.expires_at>now()) then raise exception 'You already have an active request for this offer. Open it on the device used to submit it, or ask staff to find it.'; end if;
 q=promotions_private.quote146(p_id,p_lines,p_channel,p_voucher);approval=(q->>'approval')::boolean;
 if (q->>'proofRequired')::boolean and coalesce(p_proof,'')='' then raise exception 'Please attach the requested proof for private staff review.'; end if;
 if coalesce(p_proof,'')<>'' and not coalesce((q->>'proofRequired')::boolean,false) then raise exception 'This offer does not require a proof image. Remove it and try again.'; end if;
 if p_proof is not null and (octet_length(p_proof)>449999 or p_proof !~ '^data:image/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$') then raise exception 'Use a small JPEG, PNG or WebP photo.'; end if;
 if not approval then perform promotions_private.capacity146(p_id,v_phone); end if;
 insert into public.promotion_claims146(token_hash,promotion_id,promotion_version,voucher_id,customer,phone,channel,status,input_lines,quote,proof,note,expires_at) values(md5(p_token::text),p_id,(q->>'promotionVersion')::integer,v.id,trim(p_customer),v_phone,p_channel,case when approval then 'pending' else 'approved' end,p_lines,q,nullif(p_proof,''),coalesce(p_note,''),now()+case when approval then interval '24 hours' else interval '30 minutes' end) returning * into c;
 -- Minimize retained proof: expired submissions are cleared whenever new work arrives.
 -- Expired proof is cleared by the dedicated retention job.
 return promotions_private.claim_response146(c);
end $$;
create or replace function promotions_private.inbox146() returns jsonb language plpgsql security definer set search_path='' as $$begin
 if auth.uid() is null or not public.restaurant_can121('pos','sell') then raise exception 'POS access required'; end if;
 return (select coalesce(jsonb_agg(x),'[]') from (select id,code,customer,phone,status,quote,note,expires_at,created_at,order_id from public.promotion_claims146 where status in ('pending','approved') and expires_at>now() order by created_at desc) x);
end $$;
