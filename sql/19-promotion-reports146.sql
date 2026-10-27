begin;
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
commit;
