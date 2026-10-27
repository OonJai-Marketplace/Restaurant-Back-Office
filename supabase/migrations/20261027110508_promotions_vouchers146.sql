-- Release 146: promotion studio, vouchers, secure checkout and reporting.
-- Self-service promotions: private drafts, public snapshots, administrator writes.
create table public.restaurant_promotions146 (
 id uuid primary key, data jsonb not null check (jsonb_typeof(data)='object' and octet_length(data::text)<30000),
 version integer not null default 1 check(version>0), archived boolean not null default false,
 updated_at timestamptz not null default now()
);
create table public.storefront_promotions146 (
 id uuid primary key references public.restaurant_promotions146(id) on delete cascade,
 data jsonb not null check (jsonb_typeof(data)='object' and octet_length(data::text)<30000),
 version integer not null, enabled boolean not null default true,
 starts_at timestamptz, ends_at timestamptz, updated_at timestamptz not null default now(),
 check(ends_at is null or starts_at is null or ends_at>starts_at)
);
alter table public.restaurant_promotions146 enable row level security;
alter table public.storefront_promotions146 enable row level security;
create policy promotions_admin on public.restaurant_promotions146 for all to authenticated using ((select restaurant_private.is_admin())) with check ((select restaurant_private.is_admin()));
create policy promotions_snapshot_admin on public.storefront_promotions146 for all to authenticated using ((select restaurant_private.is_admin())) with check ((select restaurant_private.is_admin()));
create policy promotions_public on public.storefront_promotions146 for select to anon using (enabled and (starts_at is null or starts_at<=now()) and (ends_at is null or ends_at>now()));
revoke all on public.restaurant_promotions146 from anon;
grant select,insert,update,delete on public.restaurant_promotions146,public.storefront_promotions146 to authenticated;
revoke all on public.storefront_promotions146 from anon;
grant select on public.storefront_promotions146 to anon;
create policy promotions_staff146 on public.storefront_promotions146 for select to authenticated using(enabled and (select public.restaurant_can121('pos','view')) and (starts_at is null or starts_at<=now()) and (ends_at is null or ends_at>now()));
create function public.save_promotion146(p_id uuid,p_data jsonb,p_expected integer,p_action text)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare existing public.restaurant_promotions146; saved public.restaurant_promotions146; begin
 if not public.is_admin() then raise exception 'Only restaurant administrators can manage promotions.'; end if;
 if p_action not in ('save','publish','pause','archive') then raise exception 'Unknown promotion action'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_id::text,149));
 select * into existing from public.restaurant_promotions146 where id=p_id for update;
 if (existing.id is null and p_expected<>0) or (existing.id is not null and existing.version<>p_expected) then raise exception 'This promotion changed on another device. Close the editor and reload before saving.'; end if;
 if p_data is null or jsonb_typeof(p_data)<>'object' or octet_length(p_data::text)>29900 or length(trim(coalesce(p_data->>'name','')))=0 or length(trim(coalesce(p_data->>'title','')))=0 then raise exception 'Add a promotion name and headline.'; end if;
 if p_data->>'placement' not in ('ribbon','hero','card','popup','slide','floating','bottom','menu') then raise exception 'Choose a promotion placement.'; end if;
 if coalesce(p_data->>'starts','')<>'' and coalesce(p_data->>'ends','')<>'' and (p_data->>'ends')::timestamptz <= (p_data->>'starts')::timestamptz then raise exception 'End date must follow start date'; end if;
 if p_data ? 'rules' then
  if p_data->'rules'->>'kind' not in ('none','percent','amount','gift') then raise exception 'Choose an offer type'; end if;
  if exists(select 1 from jsonb_each_text(p_data->'rules') x where x.key in ('value','minSpend','minQty','maxDiscount','limitTotal','perPhone','giftQty') and (x.value::numeric<0 or x.value::numeric>1000000000 or x.value::numeric::text='NaN')) then raise exception 'Offer values must be between zero and one billion.'; end if;
  if p_data->'rules'->>'kind'='percent' and (p_data->'rules'->>'value')::numeric>100 then raise exception 'Percentage must not exceed 100'; end if;
  if p_data->'rules'->>'kind' in ('percent','amount') and coalesce((p_data->'rules'->>'value')::numeric,0)<=0 then raise exception 'Enter a discount greater than zero'; end if;
  if p_data->'rules'->>'kind'='gift' and (coalesce(p_data->'rules'->>'giftId','')='' or coalesce((p_data->'rules'->>'giftQty')::integer,0) not between 1 and 10) then raise exception 'Choose 1–10 free items'; end if;
 end if;
 if p_action='publish' and coalesce(p_data->>'ends','')<>'' and (p_data->>'ends')::timestamptz<=now() then raise exception 'Choose a future end date before publishing.'; end if;
 if p_action='publish' and (select count(*) from public.storefront_promotions146 where enabled and id<>p_id and (ends_at is null or ends_at>now()))>=30 then raise exception 'Pause an older promotion before publishing another (30 active maximum).'; end if;
 insert into public.restaurant_promotions146(id,data,version,archived) values(p_id,p_data,1,p_action='archive') on conflict(id) do update set data=excluded.data,version=restaurant_promotions146.version+1,archived=excluded.archived,updated_at=now() returning * into saved;
 if p_action='publish' then
 insert into public.storefront_promotions146(id,data,version,enabled,starts_at,ends_at) values(p_id,p_data,saved.version,true,nullif(p_data->>'starts','')::timestamptz,nullif(p_data->>'ends','')::timestamptz) on conflict(id) do update set data=excluded.data,version=excluded.version,enabled=true,starts_at=excluded.starts_at,ends_at=excluded.ends_at,updated_at=now();
 elsif p_action in ('pause','archive') then update public.storefront_promotions146 set enabled=false,updated_at=now() where id=p_id;
 end if;
 return to_jsonb(saved);
end $$;
revoke all on function public.save_promotion146(uuid,jsonb,integer,text) from public,anon;
grant execute on function public.save_promotion146(uuid,jsonb,integer,text) to authenticated;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('promotion-images146','promotion-images146',true,2097152,array['image/jpeg','image/png','image/webp']);
create policy promotion_images_admin on storage.objects for all to authenticated using (bucket_id='promotion-images146' and (select restaurant_private.is_admin())) with check (bucket_id='promotion-images146' and (select restaurant_private.is_admin()));

create table public.restaurant_vouchers146 (
 id uuid primary key default gen_random_uuid(), code text not null unique check(code ~ '^[A-Z0-9][A-Z0-9-]{5,39}$'),
 batch text not null, promotion_id uuid not null references public.restaurant_promotions146(id),
 kind text not null check(kind in ('percent','amount','balance')), value numeric not null check(value>0 and value<=1000000000),
 balance numeric not null check(balance>=0), max_uses integer not null check(max_uses between 1 and 1000),
 max_per_use numeric not null default 0 check(max_per_use>=0 and max_per_use<=1000000000),
 used_count integer not null default 0, spent numeric not null default 0, enabled boolean not null default true,
 expires_at timestamptz, recipient text not null default '', created_at timestamptz not null default now(),
 check(kind<>'percent' or value<=100)
);
create index restaurant_vouchers146_promotion on public.restaurant_vouchers146(promotion_id);
alter table public.restaurant_vouchers146 enable row level security;
revoke all on public.restaurant_vouchers146 from public,anon,authenticated;
grant select,insert,update on public.restaurant_vouchers146 to authenticated;
create policy vouchers_admin146 on public.restaurant_vouchers146 for all to authenticated using((select restaurant_private.is_admin())) with check((select restaurant_private.is_admin()));
-- Unique constraint makes batch issuance all-or-nothing, including concurrent duplicates.
create function public.issue_vouchers146(p_promotion uuid,p_codes jsonb,p_batch text,p_kind text,p_value numeric,p_uses integer,p_max numeric,p_expires timestamptz default null) returns integer language plpgsql security invoker set search_path='' as $$
declare c jsonb; n integer=0; begin
 if not public.is_admin() then raise exception 'Administrator access required'; end if;
 if jsonb_typeof(p_codes) is distinct from 'array' or jsonb_array_length(p_codes) not between 1 and 200 or length(trim(p_batch)) not between 1 and 100 then raise exception 'Name the batch and enter 1–200 voucher codes.'; end if;
 if not exists(select 1 from public.restaurant_promotions146 where id=p_promotion and coalesce(data->'rules'->>'kind','none') in ('percent','amount')) then raise exception 'Choose a percentage or amount promotion to supply the voucher restrictions.'; end if;
 for c in select value from jsonb_array_elements(p_codes) loop
 insert into public.restaurant_vouchers146(code,batch,promotion_id,kind,value,balance,max_uses,max_per_use,expires_at,recipient) values(upper(trim(c->>'code')),trim(p_batch),p_promotion,p_kind,p_value,case when p_kind='balance' then p_value else 0 end,p_uses,p_max,p_expires,left(coalesce(c->>'recipient',''),100));n=n+1;
 end loop;
 return n;
exception when unique_violation then raise exception 'A voucher ID is duplicated or already registered. No vouchers in this batch were added.';
end $$;
revoke all on function public.issue_vouchers146(uuid,jsonb,text,text,numeric,integer,numeric,timestamptz) from public,anon;
grant execute on function public.issue_vouchers146(uuid,jsonb,text,text,numeric,integer,numeric,timestamptz) to authenticated;

-- Public promotion requests never trust client prices or grant direct POS writes.
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



create table public.restaurant_promotion_costs146(id uuid primary key default gen_random_uuid(),promotion_id uuid not null references public.restaurant_promotions146(id),day date not null,kind text not null check(kind in ('marketing','direct')),amount numeric not null check(amount>=0 and amount<=1000000000),note text not null default '');
create index restaurant_promotion_costs146_period on public.restaurant_promotion_costs146(day,promotion_id);
alter table public.restaurant_promotion_costs146 enable row level security;
grant select,insert,update,delete on public.restaurant_promotion_costs146 to authenticated;
revoke all on public.restaurant_promotion_costs146 from anon;
create policy promotion_costs_admin146 on public.restaurant_promotion_costs146 for all to authenticated using((select restaurant_private.is_admin())) with check((select restaurant_private.is_admin()));
create function public.promotion_report146(p_from date,p_to date) returns jsonb language plpgsql security invoker set search_path='' as $$ begin
 if not public.is_admin() then raise exception 'Administrator access required'; end if;
 if p_from is null or p_to is null or p_to<p_from then raise exception 'Choose a valid reporting period'; end if;
 return (select coalesce(jsonb_agg(t),'[]') from (
 select p.id,p.data->>'name' name,
 (select count(*) from public.promotion_claims146 c where c.promotion_id=p.id and (c.created_at at time zone 'Asia/Vientiane')::date between p_from and p_to) requests,
 (select count(*) from public.promotion_claims146 c join public.pos_orders118 o on o.id=c.order_id where c.promotion_id=p.id and o.status='paid' and (c.redeemed_at at time zone 'Asia/Vientiane')::date between p_from and p_to) orders,
 (select coalesce(sum((o.data->>'total')::numeric),0) from public.promotion_claims146 c join public.pos_orders118 o on o.id=c.order_id where c.promotion_id=p.id and o.status='paid' and (c.redeemed_at at time zone 'Asia/Vientiane')::date between p_from and p_to) sales,
 (select coalesce(sum((c.quote->>'discount')::numeric),0) from public.promotion_claims146 c join public.pos_orders118 o on o.id=c.order_id where c.promotion_id=p.id and o.status='paid' and (c.redeemed_at at time zone 'Asia/Vientiane')::date between p_from and p_to) discounts,
 (select count(*) from public.promotion_claims146 c join public.pos_orders118 o on o.id=c.order_id where c.promotion_id=p.id and o.status='refunded' and (o.refunded_at at time zone 'Asia/Vientiane')::date between p_from and p_to) refunds,
 (select sum(amount) from public.restaurant_promotion_costs146 where promotion_id=p.id and kind='marketing' and day between p_from and p_to) marketing,
 (select sum(amount) from public.restaurant_promotion_costs146 where promotion_id=p.id and kind='direct' and day between p_from and p_to) direct
 from public.restaurant_promotions146 p order by p.updated_at desc) t);
end $$;
revoke all on function public.promotion_report146(date,date) from public,anon;
grant execute on function public.promotion_report146(date,date) to authenticated;
create function public.voucher_register146() returns jsonb language plpgsql security invoker set search_path='' as $$begin
 if not public.is_admin() then raise exception 'Administrator access required'; end if;
 return (select coalesce(jsonb_agg(x),'[]') from (select v.*,(select count(*) from public.promotion_claims146 c where c.voucher_id=v.id and c.status='approved' and c.expires_at>now()) reserved_count,(select coalesce(sum((c.quote->>'discount')::numeric),0) from public.promotion_claims146 c where c.voucher_id=v.id and c.status='approved' and c.expires_at>now()) reserved_amount from public.restaurant_vouchers146 v order by v.created_at desc) x);
end $$;
revoke all on function public.voucher_register146() from public,anon;
grant execute on function public.voucher_register146() to authenticated;

