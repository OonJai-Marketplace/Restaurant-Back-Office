-- Self-service promotions: private drafts, public snapshots, administrator writes.
begin;
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
commit;
