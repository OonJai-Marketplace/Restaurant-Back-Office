-- Active-workspace POS reads. Apply after migrations 01-08 (09 may also be installed).
-- No order/payment implementation is replaced: its existing stock locks,
-- idempotent receipts, price checks and version checks remain in force.
begin;
create index if not exists inventory_item_lookup125 on public.inventory_movements104 ((data->>'itemId'));
create index if not exists pos_stock_item125 on public.pos_stock118(item_id);
create index if not exists pos_orders_receipt125 on public.pos_orders118(paid_at desc,id) where status in ('paid','refunded');
create index if not exists pos_orders_open125 on public.pos_orders118(created_at desc) where status='unpaid';
create index if not exists pos_orders_shift125 on public.pos_orders118((data->>'shiftId'));
create index if not exists pos_orders_refund_shift125 on public.pos_orders118((data->>'refundShiftId')) where status='refunded';
create index if not exists pos_cash_shift125 on public.pos_cash118(shift_id);

create or replace function public.restaurant_pos_tab125(p_tab text) returns boolean
language sql stable security definer set search_path=public,pg_temp as $$
 select public.restaurant_can121('pos') and (public.is_admin() or exists(
 select 1 from restaurant_members121 m where m.user_id=auth.uid()
 and (m.permissions->'pos'->'tabs' is null or m.permissions->'pos'->'tabs'->>p_tab='true')))
$$;
revoke all on function public.restaurant_pos_tab125(text) from public,anon,authenticated;

create or replace function public.pos_cashier_snapshot125(p_catalog_version text default null,p_receipt_date date default null,p_pending_ids uuid[] default '{}')
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare result jsonb;catalog_version text;receipt_date date=coalesce(p_receipt_date,(now() at time zone 'Asia/Vientiane')::date);
 start_at timestamptz;end_at timestamptz;today_at timestamptz;today_end timestamptz;sid uuid;
begin
 if not public.pos_allowed118() then raise exception 'POS access required';end if;
 if cardinality(p_pending_ids)>1000 then raise exception 'Too many pending orders; sync in smaller groups';end if;
 start_at=receipt_date::timestamp at time zone 'Asia/Vientiane';end_at=(receipt_date+1)::timestamp at time zone 'Asia/Vientiane';
 today_at=((now() at time zone 'Asia/Vientiane')::date)::timestamp at time zone 'Asia/Vientiane';today_end=today_at+interval '1 day';
 select id into sid from pos_shifts118 where cashier=auth.uid() and closed_at is null;
 select md5(coalesce(string_agg(k,',' order by k),'')) into catalog_version from (
 select 'm'||id||':'||version as k from menu_items104 union all select 'i'||id||':'||version from menu_ingredients105
 union all select 'c'||id||':'||version from menu_categories104 union all select 's'||id||':'||version from inventory_items104) catalog;
 -- Return current balances, never the movement/consumption history.
 with relevant as (select distinct (data->>'inventoryItemId118')::uuid id from menu_ingredients105 where nullif(data->>'inventoryItemId118','') is not null),
 movements as (select m.data->>'itemId' id,sum(case when m.data->>'kind' in ('in','adjust-in') then (m.data->>'quantity')::numeric else -(m.data->>'quantity')::numeric end) qty from inventory_movements104 m join relevant i on i.id::text=m.data->>'itemId' group by m.data->>'itemId'),
 consumption as (select s.item_id id,sum(s.quantity) qty from pos_stock118 s join relevant i on i.id=s.item_id group by s.item_id),
 receipts as (select o.* from pos_orders118 o where restaurant_pos_tab125('pos-sales-receipts') and o.status in ('paid','refunded') and o.paid_at>=start_at and o.paid_at<end_at order by o.number desc limit 100),
 orders as (select o.* from pos_orders118 o where o.status='unpaid' and (restaurant_pos_tab125('pos-sales-open') or (restaurant_pos_tab125('pos-sales-online') and o.data->>'service'='Online')) union all select * from receipts)
 select jsonb_build_object('schema125',true,'catalogVersion125',catalog_version,'config',(select data from pos_config118 where id),'configVersion',(select version from pos_config118 where id),
 'balances125',coalesce((select jsonb_object_agg(i.id::text,coalesce(m.qty,0)-coalesce(c.qty,0)) from relevant i left join movements m on m.id=i.id::text left join consumption c on c.id=i.id),'{}'::jsonb),
 'acknowledged125',coalesce((select jsonb_agg(id) from pos_orders118 where id=any(p_pending_ids) and status in ('paid','refunded','cancelled')),'[]'::jsonb),
 'moves','[]'::jsonb,'stock','[]'::jsonb,'orders',coalesce((select jsonb_agg(to_jsonb(o) order by o.created_at desc) from orders o),'[]'::jsonb),
 'shifts',coalesce((select jsonb_agg(to_jsonb(s)) from pos_shifts118 s where s.id=sid),'[]'::jsonb),
 'cash',coalesce((select jsonb_agg(to_jsonb(c)) from pos_cash118 c where c.shift_id=sid),'[]'::jsonb),
 'shiftExpected125',coalesce((select s.opening+coalesce((select sum(amount) from pos_cash118 where shift_id=s.id),0)
 +coalesce((select sum((data->>'total')::numeric) from pos_orders118 where data->>'shiftId'=s.id::text and data->>'payment'='Cash' and status in ('paid','refunded')),0)
 -coalesce((select sum((data->>'total')::numeric) from pos_orders118 where data->>'refundShiftId'=s.id::text and data->>'payment'='Cash' and status='refunded'),0) from pos_shifts118 s where s.id=sid),0),
 'receiptCount125',(select count(*) from pos_orders118 where restaurant_pos_tab125('pos-sales-receipts') and status in ('paid','refunded') and paid_at>=start_at and paid_at<end_at),
 'refreshedAt125',now()) into result;
 if public.restaurant_pos_tab125('pos-overview') then
  result=result||jsonb_build_object('summary125',jsonb_build_object(
   'received',coalesce((select sum((data->>'total')::numeric) from pos_orders118 where status in ('paid','refunded') and paid_at>=today_at and paid_at<today_end),0),
   'refunds',coalesce((select sum((data->>'total')::numeric) from pos_orders118 where status='refunded' and refunded_at>=today_at and refunded_at<today_end),0),
   'paidCount',(select count(*) from pos_orders118 where status='paid' and paid_at>=today_at and paid_at<today_end),
   'openCount',(select count(*) from pos_orders118 where status='unpaid')));
 end if;
 if p_catalog_version is distinct from catalog_version then
  result=result||jsonb_build_object('menu',coalesce((select jsonb_agg(to_jsonb(m)) from menu_items104 m),'[]'::jsonb),
  'ingredients',coalesce((select jsonb_agg(to_jsonb(m)) from menu_ingredients105 m),'[]'::jsonb),
  'items',coalesce((select jsonb_agg(to_jsonb(m)) from inventory_items104 m where exists(select 1 from menu_ingredients105 i where i.data->>'inventoryItemId118'=m.id::text)),'[]'::jsonb),
  'categories',coalesce((select jsonb_agg(to_jsonb(m)) from menu_categories104 m),'[]'::jsonb));
 end if;
 return result;
end $$;
revoke all on function public.pos_cashier_snapshot125(text,date,uuid[]) from public,anon;
grant execute on function public.pos_cashier_snapshot125(text,date,uuid[]) to authenticated;
create or replace function public.pos_receipt_page125(p_date date,p_before_number bigint)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare result jsonb;begin
 if not public.restaurant_pos_tab125('pos-sales-receipts') then raise exception 'Receipt access required';end if;
 if p_date is null or p_before_number is null then raise exception 'Choose a receipt date and page';end if;
 select coalesce(jsonb_agg(to_jsonb(o) order by o.number desc),'[]'::jsonb) into result from
 (select * from pos_orders118 where status in ('paid','refunded') and paid_at>=(p_date::timestamp at time zone 'Asia/Vientiane')
 and paid_at<((p_date+1)::timestamp at time zone 'Asia/Vientiane') and number<p_before_number order by number desc limit 100) o;
 return result;
end $$;
revoke all on function public.pos_receipt_page125(date,bigint) from public,anon;
grant execute on function public.pos_receipt_page125(date,bigint) to authenticated;
-- Large exports are an explicit Management operation, loaded one page at a time.
create or replace function public.pos_report_page125(p_from date,p_to date,p_before_number bigint default null)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare result jsonb;begin
 if not public.restaurant_pos_tab125('pos-management') or not public.restaurant_pos_tab125('pos-sales-receipts') then raise exception 'Report access required';end if;
 if p_from is null or p_to is null or p_to<p_from or p_to-p_from>366 then raise exception 'Choose an export period of up to one year';end if;
 select coalesce(jsonb_agg(to_jsonb(o) order by o.number desc),'[]'::jsonb) into result from
 (select * from pos_orders118 where status in ('paid','refunded') and paid_at>=(p_from::timestamp at time zone 'Asia/Vientiane')
 and paid_at<((p_to+1)::timestamp at time zone 'Asia/Vientiane') and (p_before_number is null or number<p_before_number) order by number desc limit 250) o;
 return result;
end $$;
revoke all on function public.pos_report_page125(date,date,bigint) from public,anon;
grant execute on function public.pos_report_page125(date,date,bigint) to authenticated;
do $$declare body text;begin
 body=pg_get_functiondef('public.check_workspace_request123()'::regprocedure);
 if position('pos_cashier_snapshot125' in body)=0 then
  if position('''pos_snapshot118''' in body)=0 then raise exception 'Workspace gate differs; review before installing';end if;
  body=replace(body,'''pos_snapshot118''','''pos_cashier_snapshot125'',''pos_receipt_page125'',''pos_report_page125'',''pos_snapshot118''');execute body;
 end if;
end $$;
notify pgrst,'reload schema';
commit;
