begin;
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
commit;
