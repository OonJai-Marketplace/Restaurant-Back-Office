begin;
create function promotions_private.pos_check146(p_claim uuid,p_order uuid,p_lines jsonb,p_subtotal numeric) returns jsonb language plpgsql security definer set search_path='' as $$
declare c public.promotion_claims146; a jsonb; b jsonb; begin
 if auth.uid() is null or not public.restaurant_can121('pos','sell') then raise exception 'POS sales access required'; end if;
 select * into c from public.promotion_claims146 where id=p_claim for update;
 if c.id is null or c.status<>'approved' or c.expires_at<=now() then raise exception 'Promotion approval/reservation is unavailable or expired. Request it again before payment.'; end if;
 if c.order_id is not null and c.order_id<>p_order then raise exception 'This offer is already assigned to another order.'; end if;
 perform pg_advisory_xact_lock(hashtextextended(c.promotion_id::text,146));
 if not exists(select 1 from public.storefront_promotions146 where id=c.promotion_id and enabled and (ends_at is null or ends_at>now())) then raise exception 'This promotion has ended or was paused.'; end if;
 select jsonb_agg(jsonb_build_object('menuId',x->>'menuId','quantity',(x->>'quantity')::numeric,'price',(x->>'unitPrice')::numeric,'choices',x->'choices') order by ord) into a from jsonb_array_elements(p_lines) with ordinality t(x,ord);
 select jsonb_agg(jsonb_build_object('menuId',x->>'menuId','quantity',(x->>'quantity')::numeric,'price',(x->>'unitPrice')::numeric,'choices',x->'choices') order by ord) into b from jsonb_array_elements(c.quote->'lines') with ordinality t(x,ord);
 if a is distinct from b or p_subtotal<>(c.quote->>'subtotal')::numeric then raise exception 'Basket or menu prices changed. Cancel this promotion request and submit it again.'; end if;
 if c.voucher_id is not null then
  perform 1 from public.restaurant_vouchers146 where id=c.voucher_id for update;
  if not exists(select 1 from public.restaurant_vouchers146 where id=c.voucher_id and enabled and (expires_at is null or expires_at>now()) and used_count<max_uses and (kind<>'balance' or balance>=(c.quote->>'discount')::numeric)) then raise exception 'Voucher is expired, disabled, or has insufficient balance.'; end if;
 end if;
 return jsonb_build_object('claim',c.id,'name',c.quote->>'title','code',c.code,'voucher',c.quote->'voucher'->>'code','discount',(c.quote->>'discount')::numeric);
end $$;
revoke all on function promotions_private.pos_check146(uuid,uuid,jsonb,numeric) from public,anon,authenticated;
create function promotions_private.pos_finish146(p_claim uuid,p_order uuid,p_paid boolean) returns void language plpgsql security definer set search_path='' as $$
declare c public.promotion_claims146; begin
 if auth.uid() is null or not public.restaurant_can121('pos','sell') then raise exception 'POS sales access required'; end if;
 select * into c from public.promotion_claims146 where id=p_claim for update;
 if c.status='redeemed' and c.order_id=p_order then return; end if;
 if c.status<>'approved' then raise exception 'This offer cannot be redeemed'; end if;
 update public.promotion_claims146 set order_id=p_order,status=case when p_paid then 'redeemed' else status end,redeemed_at=case when p_paid then now() else null end where id=p_claim;
 if p_paid and c.voucher_id is not null then
 update public.restaurant_vouchers146 set used_count=used_count+1,spent=spent+(c.quote->>'discount')::numeric,balance=case when kind='balance' then balance-(c.quote->>'discount')::numeric else balance end where id=c.voucher_id;
 end if;
end $$;
revoke all on function promotions_private.pos_finish146(uuid,uuid,boolean) from public,anon,authenticated;
create function promotions_private.import146(p_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare c public.promotion_claims146; result jsonb; begin
 if auth.uid() is null or not public.restaurant_can121('pos','sell') then raise exception 'POS sales access required'; end if;
 -- Same order as POS: global order allocator, then claim.
 perform pg_advisory_xact_lock(118,118);
 select * into c from public.promotion_claims146 where id=p_id for update;
 if c.id is null or c.status<>'approved' or c.expires_at<=now() then raise exception 'This request is not ready for POS.'; end if;
 if c.order_id is not null then return (select to_jsonb(o) from public.pos_orders118 o where id=c.order_id); end if;
 result=public.pos_order118(gen_random_uuid(),0,'save',jsonb_build_object('lines',c.quote->'lines','service',case when c.channel='pos' then 'Dine in' else 'Online' end,'customer',c.customer||' · '||c.phone,'note',c.note||' · Offer '||c.code,'discountType','amount','discount',c.quote->'discount','promotionClaim146',c.id));
 return result;
end $$;
revoke all on function promotions_private.import146(uuid) from public,anon;
grant execute on function promotions_private.import146(uuid) to authenticated;
create function public.import_promotion_order146(p_id uuid) returns jsonb language sql security invoker set search_path='' as $$select promotions_private.import146(p_id)$$;
revoke all on function public.import_promotion_order146(uuid) from public,anon;
grant execute on function public.import_promotion_order146(uuid) to authenticated;
commit;
