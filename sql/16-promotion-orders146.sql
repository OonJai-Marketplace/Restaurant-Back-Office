-- Public promotion requests never trust client prices or grant direct POS writes.
begin;
create schema if not exists promotions_private;
revoke all on schema promotions_private from public;
grant usage on schema promotions_private to anon,authenticated;
create table public.promotion_claims146 (
 id uuid primary key default gen_random_uuid(), token_hash text not null unique,
 code text not null unique default upper(substr(replace(gen_random_uuid()::text,'-',''),1,12)),
 promotion_id uuid not null references public.restaurant_promotions146(id), promotion_version integer not null, voucher_id uuid references public.restaurant_vouchers146(id),
 customer text not null, phone text not null, channel text not null check(channel in ('website','pos')),
 status text not null check(status in ('pending','approved','rejected','redeemed','cancelled')),
 input_lines jsonb not null, quote jsonb not null, proof text, note text not null default '',
 created_at timestamptz not null default now(), expires_at timestamptz not null,
 reviewed_at timestamptz, reviewed_by uuid, review_note text not null default '',
 order_id uuid unique references public.pos_orders118(id), redeemed_at timestamptz,
 check(proof is null or (octet_length(proof)<450000 and proof ~ '^data:image/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$'))
);
create index promotion_claims146_capacity on public.promotion_claims146(promotion_id,status,expires_at);
create index promotion_claims146_voucher on public.promotion_claims146(voucher_id,status,expires_at);
create index promotion_claims146_phone on public.promotion_claims146(phone,created_at);
alter table public.promotion_claims146 enable row level security;
revoke all on public.promotion_claims146 from public,anon,authenticated;
grant select on public.promotion_claims146 to authenticated;
create policy promotion_claims_admin on public.promotion_claims146 for select to authenticated using ((select restaurant_private.is_admin()));
-- Internal quote: canonical menu/options, schedule, all configured conditions and reward.
create function promotions_private.quote146(p_id uuid,p_lines jsonb,p_channel text,p_voucher text default '') returns jsonb
language plpgsql security definer set search_path='' as $$
declare v public.restaurant_vouchers146; reserved numeric=0; reservations integer=0; promo public.storefront_promotions146; s public.storefront_items127; m jsonb; l jsonb; g jsonb; choice text; opt jsonb; picked jsonb; normalized jsonb; names jsonb; lines jsonb='[]'; r jsonb; d jsonb; q integer; price numeric; subtotal numeric=0; eligible numeric=0; units integer=0; discount numeric=0; gift numeric=0; giftline jsonb; laos_now timestamp=now() at time zone 'Asia/Vientiane'; begin
 if p_channel not in ('website','pos') or (p_channel='pos' and (auth.uid() is null or not public.restaurant_can121('pos','sell'))) then raise exception 'POS access required'; end if;
 if coalesce(p_voucher,'')<>'' then
  select * into v from public.restaurant_vouchers146 where code=upper(trim(p_voucher));
  if v.id is null or not v.enabled or v.expires_at<=now() or v.used_count>=v.max_uses then raise exception 'Voucher unavailable, expired or fully used.'; end if;
  p_id=v.promotion_id;
 end if;
 select * into promo from public.storefront_promotions146 where id=p_id;
 if promo.id is null or not promo.enabled or promo.starts_at>now() or promo.ends_at<=now() then raise exception 'This offer is not live now.'; end if;
 d=promo.data; r=coalesce(d->'rules','{}');
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
   if jsonb_typeof(picked)<>'array' or jsonb_array_length(picked)<coalesce((g->>'min')::integer,0) or jsonb_array_length(picked)>coalesce((g->>'max')::integer,0) then raise exception 'Review choices for %',g->>'name'; end if;
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
  gift=s.price*coalesce((r->>'giftQty')::integer,1);discount=gift;
  giftline=jsonb_build_object('menuId',s.menu_item_id,'publicId',s.id,'name',s.name,'quantity',coalesce((r->>'giftQty')::integer,1),'unitPrice',s.price,'choices','{}'::jsonb,'options','[]'::jsonb,'note','Promotion gift');lines=lines||jsonb_build_array(giftline);subtotal=subtotal+gift;
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
revoke all on function promotions_private.quote146(uuid,jsonb,text,text) from public,anon,authenticated;
grant execute on function promotions_private.quote146(uuid,jsonb,text,text) to anon,authenticated;
create function public.promotion_quote146(p_id uuid,p_lines jsonb,p_channel text default 'website',p_voucher text default '') returns jsonb language sql security invoker set search_path='' as $$select promotions_private.quote146(p_id,p_lines,p_channel,p_voucher)$$;
revoke all on function public.promotion_quote146(uuid,jsonb,text,text) from public;
grant execute on function public.promotion_quote146(uuid,jsonb,text,text) to anon,authenticated;
-- All capacity changes serialize on the same campaign lock, including approval/payment.
create function promotions_private.capacity146(p_id uuid,p_phone text,p_exclude uuid default null) returns void language plpgsql security definer set search_path='' as $$
declare r jsonb; used integer; per_phone integer; begin
 perform pg_advisory_xact_lock(hashtextextended(p_id::text,146));
 select data->'rules' into r from public.storefront_promotions146 where id=p_id;
 select count(*),count(*) filter(where phone=p_phone) into used,per_phone from public.promotion_claims146 where promotion_id=p_id and (p_exclude is null or id<>p_exclude) and (status='redeemed' or status='approved' and expires_at>now());
 if coalesce((r->>'limitTotal')::integer,0)>0 and used>=(r->>'limitTotal')::integer then raise exception 'All available offers have been claimed. Please choose another offer.'; end if;
 if coalesce((r->>'perPhone')::integer,0)>0 and per_phone>=(r->>'perPhone')::integer then raise exception 'The offer limit for this phone number has been reached.'; end if;
end $$;
revoke all on function promotions_private.capacity146(uuid,text,uuid) from public,anon,authenticated;
create function promotions_private.claim_response146(c public.promotion_claims146) returns jsonb language sql stable security invoker set search_path='' as $$
 select jsonb_build_object('code',c.code,'status',c.status,'expiresAt',c.expires_at,'quote',c.quote,'reviewNote',c.review_note,'expired',c.expires_at<=now() and c.status in ('approved','pending'))
$$;
revoke all on function promotions_private.claim_response146(public.promotion_claims146) from public,anon,authenticated;
create function promotions_private.request146(p_id uuid,p_token uuid,p_lines jsonb,p_customer text,p_phone text,p_channel text,p_note text,p_proof text,p_voucher text default '') returns jsonb language plpgsql security definer set search_path='' as $$
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
 if p_proof is not null and (octet_length(p_proof)>449999 or p_proof !~ '^data:image/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$') then raise exception 'Use a small JPEG, PNG or WebP photo.'; end if;
 if not approval then perform promotions_private.capacity146(p_id,v_phone); end if;
 insert into public.promotion_claims146(token_hash,promotion_id,promotion_version,voucher_id,customer,phone,channel,status,input_lines,quote,proof,note,expires_at) values(md5(p_token::text),p_id,(q->>'promotionVersion')::integer,v.id,trim(p_customer),v_phone,p_channel,case when approval then 'pending' else 'approved' end,p_lines,q,nullif(p_proof,''),coalesce(p_note,''),now()+case when approval then interval '24 hours' else interval '30 minutes' end) returning * into c;
 -- Minimize retained proof: expired submissions are cleared whenever new work arrives.
 -- Expired proof is cleared by the dedicated retention job.
 return promotions_private.claim_response146(c);
end $$;
revoke all on function promotions_private.request146(uuid,uuid,jsonb,text,text,text,text,text,text) from public;
grant execute on function promotions_private.request146(uuid,uuid,jsonb,text,text,text,text,text,text) to anon,authenticated;
create function public.request_promotion146(p_id uuid,p_token uuid,p_lines jsonb,p_customer text,p_phone text,p_channel text default 'website',p_note text default '',p_proof text default null,p_voucher text default '') returns jsonb language sql security invoker set search_path='' as $$select promotions_private.request146(p_id,p_token,p_lines,p_customer,p_phone,p_channel,p_note,p_proof,p_voucher)$$;
revoke all on function public.request_promotion146(uuid,uuid,jsonb,text,text,text,text,text,text) from public;
grant execute on function public.request_promotion146(uuid,uuid,jsonb,text,text,text,text,text,text) to anon,authenticated;
create function promotions_private.status146(p_token uuid,p_cancel boolean default false) returns jsonb language plpgsql security definer set search_path='' as $$
declare c public.promotion_claims146; begin
 select * into c from public.promotion_claims146 where token_hash=md5(p_token::text) for update;
 if c.id is null then raise exception 'Request not found on this device.'; end if;
 if p_cancel then
  if c.order_id is not null then raise exception 'This order is already in POS. Ask staff to cancel it.'; end if;
  if c.status not in ('pending','approved') then raise exception 'This request is already closed.'; end if;
  update public.promotion_claims146 set status='cancelled',proof=null where id=c.id returning * into c;
 end if;
 if c.proof is not null and c.expires_at<now() then update public.promotion_claims146 set proof=null where id=c.id; end if;
 return promotions_private.claim_response146(c);
end $$;
revoke all on function promotions_private.status146(uuid,boolean) from public;
grant execute on function promotions_private.status146(uuid,boolean) to anon,authenticated;
create function public.promotion_status146(p_token uuid,p_cancel boolean default false) returns jsonb language sql security invoker set search_path='' as $$select promotions_private.status146(p_token,p_cancel)$$;
revoke all on function public.promotion_status146(uuid,boolean) from public;
grant execute on function public.promotion_status146(uuid,boolean) to anon,authenticated;
create function promotions_private.review146(p_id uuid,p_approve boolean,p_note text) returns jsonb language plpgsql security definer set search_path='' as $$
declare c public.promotion_claims146; q jsonb; begin
 if auth.uid() is null or not public.is_admin() then raise exception 'Administrator approval required.'; end if;
 select * into c from public.promotion_claims146 where id=p_id for update;
 if c.id is null or c.status<>'pending' or c.expires_at<=now() then raise exception 'This request is no longer pending.'; end if;
 if p_approve then
  perform pg_advisory_xact_lock(hashtextextended(c.promotion_id::text,146));
  if c.voucher_id is not null then perform 1 from public.restaurant_vouchers146 where id=c.voucher_id for update; end if;
  q=promotions_private.quote146(c.promotion_id,c.input_lines,c.channel,coalesce((select code from public.restaurant_vouchers146 where id=c.voucher_id),''));
  if q->>'promotionVersion'<>c.quote->>'promotionVersion' or q->'total'<>c.quote->'total' then raise exception 'The offer or menu changed. Decline this request and ask the customer to submit again.'; end if;
  perform promotions_private.capacity146(c.promotion_id,c.phone,c.id);
 end if;
 update public.promotion_claims146 set status=case when p_approve then 'approved' else 'rejected' end,reviewed_by=auth.uid(),reviewed_at=now(),review_note=left(coalesce(p_note,''),500),proof=null,expires_at=case when p_approve then now()+interval '30 minutes' else now() end where id=p_id returning * into c;
 return promotions_private.claim_response146(c);
end $$;
revoke all on function promotions_private.review146(uuid,boolean,text) from public,anon;
grant execute on function promotions_private.review146(uuid,boolean,text) to authenticated;
create function public.review_promotion146(p_id uuid,p_approve boolean,p_note text default '') returns jsonb language sql security invoker set search_path='' as $$select promotions_private.review146(p_id,p_approve,p_note)$$;
revoke all on function public.review_promotion146(uuid,boolean,text) from public,anon;
grant execute on function public.review_promotion146(uuid,boolean,text) to authenticated;
-- Staff-only order inbox omits proof images and customer tokens.
create function promotions_private.inbox146() returns jsonb language plpgsql security definer set search_path='' as $$begin
 if auth.uid() is null or not public.restaurant_can121('pos','sell') then raise exception 'POS access required'; end if;
 return (select coalesce(jsonb_agg(x),'[]') from (select id,code,customer,phone,status,quote,note,expires_at,created_at,order_id from public.promotion_claims146 where status in ('pending','approved') and expires_at>now() order by created_at desc limit 200) x);
end $$;
revoke all on function promotions_private.inbox146() from public,anon;
grant execute on function promotions_private.inbox146() to authenticated;
create function public.promotion_inbox146() returns jsonb language sql security invoker set search_path='' as $$select promotions_private.inbox146()$$;
revoke all on function public.promotion_inbox146() from public,anon;
grant execute on function public.promotion_inbox146() to authenticated;
commit;
