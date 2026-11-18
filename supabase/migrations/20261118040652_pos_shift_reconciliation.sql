-- Compact, immutable close-shift receipts. Physical money stays in its original currency.
alter table public.pos_shifts118 add column if not exists opening_cash jsonb;
alter table public.pos_shifts118 add column if not exists opening_nonce uuid;
alter table public.pos_shifts118 add column if not exists closing_report jsonb;
alter table public.pos_cash118 add column if not exists currency text not null default 'LAK' check(currency ~ '^[A-Z]{3}$');
alter table public.pos_cash118 add column if not exists kind text not null default 'manual' check(kind in ('manual','change'));
-- Classify only generated change entries tied to an existing non-cash payment.
update public.pos_cash118 c set kind='change' where kind='manual' and exists(
 select 1 from public.pos_orders118 o where o.data->>'shiftId'=c.shift_id::text and o.data->>'payment'<>'Cash'
 and c.amount=-greatest(coalesce((o.data->>'tendered')::numeric,(o.data->'fxTender'->>'equivalentLak')::numeric,coalesce((o.data->>'collectedTotal')::numeric,(o.data->>'total')::numeric))-coalesce((o.data->>'collectedTotal')::numeric,(o.data->>'total')::numeric),0)
 and c.reason in ('Change for receipt '||(o.data->>'receiptCode'),'FX change for receipt R-'||o.number));

create or replace function restaurant_private.pos_shift_totals152(p_opening jsonb,p_sales jsonb,p_refunds jsonb,p_moves jsonb)
returns jsonb language sql immutable set search_path='' as $$
with sales as (
 select o->'data' d from jsonb_array_elements(p_sales) o
), refunds as (
 select o->'data' d from jsonb_array_elements(p_refunds) o
), paid as (
 select d->>'payment' method,coalesce((d->>'total')::numeric,0) sales,coalesce((d->>'subtotal')::numeric,(d->>'total')::numeric,0) gross,
 coalesce((d->>'tip')::numeric,0) tips,coalesce((d->>'collectedTotal')::numeric,(d->>'total')::numeric,0) collected,
 greatest(coalesce((d->>'tendered')::numeric,(d->>'collectedTotal')::numeric,(d->>'total')::numeric,0)-coalesce((d->>'collectedTotal')::numeric,(d->>'total')::numeric,0),0) change,
 coalesce(d->'fxTender'->>'currency','LAK') currency,
 coalesce((d->'fxTender'->>'amount')::numeric,(d->>'tendered')::numeric,(d->>'collectedTotal')::numeric,(d->>'total')::numeric,0) received from sales
), returned as (
 select d->>'payment' method,coalesce((d->>'total')::numeric,0) sales,coalesce((d->>'tip')::numeric,0) tips,
 coalesce((d->>'collectedTotal')::numeric,(d->>'total')::numeric,0) collected from refunds
), moves as (
 select coalesce(m->>'currency','LAK') currency,(m->>'amount')::numeric amount from jsonb_array_elements(p_moves) m where coalesce(m->>'kind','manual')='manual'
), currencies as (
 select unnest(array['LAK','USD','THB']) currency union select jsonb_object_keys(p_opening) union select currency from paid where method='Cash' union select currency from moves
), balances as (
 select c.currency,coalesce((p_opening->>c.currency)::numeric,0) opening,
 coalesce((select sum(received) from paid where method='Cash' and currency=c.currency),0) received,
 case when c.currency='LAK' then coalesce((select sum(change) from paid),0) else 0 end change,
 case when c.currency='LAK' then coalesce((select sum(collected) from returned where method='Cash'),0) else 0 end refunds,
 coalesce((select sum(amount) from moves where currency=c.currency and amount>0),0) cash_in,
 -coalesce((select sum(amount) from moves where currency=c.currency and amount<0),0) cash_out from currencies c
), methods as (select method from paid union select method from returned), method_totals as (
 select method,coalesce((select sum(collected) from paid p where p.method=m.method),0) paid,
 coalesce((select sum(collected) from returned r where r.method=m.method),0) refunds from methods m
)
select jsonb_build_object(
 'totals',jsonb_build_object('paidCount',(select count(*) from paid),'refundCount',(select count(*) from returned),
 'grossSales',coalesce((select sum(gross) from paid),0),'discounts',coalesce((select sum(gross-sales) from paid),0),
 'sales',coalesce((select sum(sales) from paid),0),'refunds',coalesce((select sum(sales) from returned),0),
 'netSales',coalesce((select sum(sales) from paid),0)-coalesce((select sum(sales) from returned),0),
 'tips',coalesce((select sum(tips) from paid),0)-coalesce((select sum(tips) from returned),0),
 'collected',coalesce((select sum(collected) from paid),0)-coalesce((select sum(collected) from returned),0)),
 'methods',coalesce((select jsonb_agg(jsonb_build_object('method',method,'paid',paid,'refunds',refunds,'net',paid-refunds) order by method) from method_totals),'[]'::jsonb),
 'cash',coalesce((select jsonb_agg(jsonb_build_object('currency',currency,'opening',opening,'received',received,'change',change,'refunds',refunds,'cashIn',cash_in,'cashOut',cash_out,'expected',round(opening+received-change-refunds+cash_in-cash_out,2)) order by case currency when 'LAK' then 0 when 'USD' then 1 when 'THB' then 2 else 3 end,currency) from balances),'[]'::jsonb));
$$;
revoke all on function restaurant_private.pos_shift_totals152(jsonb,jsonb,jsonb,jsonb) from public,anon,authenticated;

create or replace function restaurant_private.pos_shift_report152(p_shift uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare s public.pos_shifts118; sales jsonb; refunds jsonb; moves jsonb; report jsonb;
begin
 if auth.uid() is null or public.pos_allowed118() is not true then raise exception 'POS access required';end if;
 select * into s from public.pos_shifts118 where id=p_shift;
 if s.id is null or (s.cashier=auth.uid() or public.restaurant_can121('pos','manage')) is not true then raise exception 'Shift access required';end if;
 if s.closing_report is not null then return s.closing_report;end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',o.id,'data',o.data) order by o.id),'[]') into sales from public.pos_orders118 o where o.data->>'shiftId'=s.id::text and o.status in ('paid','refunded');
 select coalesce(jsonb_agg(jsonb_build_object('id',o.id,'data',o.data) order by o.id),'[]') into refunds from public.pos_orders118 o where o.status='refunded' and (o.data->>'refundShiftId'=s.id::text or
 (o.data->>'refundShiftId' is null and o.data->>'actionBy'=s.cashier::text and o.refunded_at>=s.opened_at and (s.closed_at is null or o.refunded_at<=s.closed_at)));
 select coalesce(jsonb_agg(to_jsonb(c) order by c.id),'[]') into moves from public.pos_cash118 c where c.shift_id=s.id;
 report:=restaurant_private.pos_shift_totals152(coalesce(s.opening_cash,jsonb_build_object('LAK',s.opening)),sales,refunds,moves)||jsonb_build_object(
 'version',1,'shiftId',s.id,'cashierId',s.cashier,'cashier',coalesce((select full_name from public.profiles where id=s.cashier),'Cashier'),
 'openedAt',s.opened_at,'closedAt',s.closed_at,'legacy',s.closed_at is not null);
 if s.closed_at is not null then
  select jsonb_agg(x||case when x->>'currency'='LAK' then jsonb_build_object('counted',s.counted,'variance',s.counted-(x->>'expected')::numeric) else '{}'::jsonb end) into moves from jsonb_array_elements(report->'cash') x;
  report:=jsonb_set(report,'{cash}',moves);
 end if;
 return report||jsonb_build_object('reviewToken',md5(report::text));
end$$;
revoke all on function restaurant_private.pos_shift_report152(uuid) from public,anon;
grant execute on function restaurant_private.pos_shift_report152(uuid) to authenticated;
create or replace function public.pos_shift_report152(p_shift uuid) returns jsonb language sql security invoker set search_path='' as $$select restaurant_private.pos_shift_report152(p_shift)$$;
revoke all on function public.pos_shift_report152(uuid) from public,anon;
grant execute on function public.pos_shift_report152(uuid) to authenticated;

create or replace function restaurant_private.pos_shift_history152() returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or public.pos_allowed118() is not true then raise exception 'POS access required';end if;
 return (select coalesce(jsonb_agg(row order by row->>'closed_at' desc),'[]') from (select jsonb_build_object('id',s.id,'opened_at',s.opened_at,'closed_at',s.closed_at,'cashier',coalesce(p.full_name,'Cashier')) row from public.pos_shifts118 s left join public.profiles p on p.id=s.cashier where s.closed_at is not null and (s.cashier=auth.uid() or public.restaurant_can121('pos','manage')) order by s.closed_at desc limit 50) q);
end$$;
revoke all on function restaurant_private.pos_shift_history152() from public,anon;
grant execute on function restaurant_private.pos_shift_history152() to authenticated;
create or replace function public.pos_shift_history152() returns jsonb language sql security invoker set search_path='' as $$select restaurant_private.pos_shift_history152()$$;
revoke all on function public.pos_shift_history152() from public,anon;
grant execute on function public.pos_shift_history152() to authenticated;

-- Preserve all existing payment, stock, offline receipt and permission checks.
do $patch$
declare original text; revised text; begin
 original:=pg_get_functiondef('public.pos_order118(uuid,integer,text,jsonb)'::regprocedure);
 revised:=replace(original,$a$if p_action='refund' and old.data->>'payment'='Cash' then select id into sid$a$,$b$if p_action='refund' then select id into sid$b$);
 if revised=original then raise exception 'Expected refund shift guard missing';end if;
 original:=revised;
 revised:=replace(original,$a$pos_cash118(shift_id,amount,reason,created_by) values(sid,-change_due,$a$,$b$pos_cash118(shift_id,amount,kind,reason,created_by) values(sid,-change_due,'change',$b$);
 if revised=original then raise exception 'Expected change record missing';end if;
 execute revised;
 -- The overview's kip drawer must exclude foreign notes; non-cash change is already a cash movement.
 original:=pg_get_functiondef('public.pos_cashier_snapshot125(text,date,uuid[])'::regprocedure);
 revised:=replace(original,'sum(amount) from pos_cash118 where shift_id=s.id', $b$sum(amount) from pos_cash118 where shift_id=s.id and currency='LAK'$b$);
 if revised=original then raise exception 'Expected kip cash movement calculation missing';end if;
 original:=revised;
 revised:=replace(original,$a$sum(coalesce((data->>'collectedTotal')::numeric,(data->>'total')::numeric)) from pos_orders118 where data->>'shiftId'=s.id::text and data->>'payment'='Cash'$a$,
 $b$sum(case when data->'fxTender'->>'currency' is not null then -greatest(coalesce((data->>'tendered')::numeric,0)-coalesce((data->>'collectedTotal')::numeric,(data->>'total')::numeric),0) else coalesce((data->>'collectedTotal')::numeric,(data->>'total')::numeric) end) from pos_orders118 where data->>'shiftId'=s.id::text and data->>'payment'='Cash'$b$);
 if revised=original then raise exception 'Expected kip drawer calculation missing';end if;
 execute revised;
end$patch$;

create or replace function public.pos_manage118(p_action text,p_data jsonb,p_version integer default 0) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare s pos_shifts118; r jsonb; v integer; opening_values jsonb; counts jsonb; report jsonb; rows jsonb:='[]'; x jsonb; code text; value text; amount numeric; nonce uuid; close_time timestamptz;
begin
 if auth.uid() is null or public.restaurant_tab_can125('pos',case when p_action='config' then 'pos-management' else 'pos-overview' end,case when p_action='config' then 'manage' else 'sell' end) is not true then raise exception 'POS management tab access required';end if;
 if public.restaurant_can121('pos',case when p_action='config' then 'manage' else 'sell' end) is not true or pos_allowed118() is not true then raise exception 'POS action access required';end if;
 if p_action='config' then
  if jsonb_typeof(p_data->'methods')<>'array' or jsonb_array_length(p_data->'methods')=0 or exists(select 1 from jsonb_array_elements_text(p_data->'methods') as method_name(val) where method_name.val not in ('Cash','BCEL QR','Bank')) or jsonb_typeof(p_data->'cashiers')<>'array' or coalesce((p_data->>'discountLimit')::numeric,-1) not between 0 and 100 or coalesce((p_data->>'receiptWidth')::integer,0) not in(56,58,80) then raise exception 'Invalid POS settings';end if;
  update pos_config118 set data=p_data,version=version+1 where id and version=p_version returning version into v;
  if v is null then raise exception 'Settings changed. Reload before saving';end if;return jsonb_build_object('version',v);
 elsif p_action='open' then
  perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text,152));
  nonce:=nullif(p_data->>'openingNonce','')::uuid;
  select * into s from pos_shifts118 where cashier=auth.uid() and closed_at is null for update;
  if s.id is not null then
   if nonce is not null and s.opening_nonce=nonce then return to_jsonb(s);end if;
   raise exception 'Your shift is already open. Refresh the POS to view it.';
  end if;
  opening_values:=coalesce(p_data->'openingCash',jsonb_build_object('LAK',p_data->>'amount'));
  if jsonb_typeof(opening_values)<>'object' or not opening_values ? 'LAK' then raise exception 'Enter the starting cash by currency';end if;
  for code,value in select * from jsonb_each_text(opening_values) loop
   if code !~ '^[A-Z]{3}$' or coalesce(value,'') !~ '^[0-9]{1,12}([.][0-9]{1,2})?$' then raise exception 'Enter valid starting cash for %',code;end if;
  end loop;
  insert into pos_shifts118(cashier,opening,opening_cash,opening_nonce) values(auth.uid(),(opening_values->>'LAK')::numeric,opening_values,nonce) returning to_jsonb(pos_shifts118.*) into r;return r;
 end if;
 if p_data ? 'shiftId' then select * into s from pos_shifts118 where id=(p_data->>'shiftId')::uuid and cashier=auth.uid() for update;
 else select * into s from pos_shifts118 where cashier=auth.uid() and closed_at is null for update;end if;
 if s.id is null then raise exception 'Open your shift first';end if;
 if s.closed_at is not null then
  if p_action='close' and s.closing_report is not null then return to_jsonb(s);end if;
  raise exception 'This shift is already closed';
 end if;
 if p_action='cash' then
  code:=coalesce(p_data->>'currency','LAK');value:=p_data->>'amount';
  if code !~ '^[A-Z]{3}$' or coalesce(value,'') !~ '^-?[0-9]{1,12}([.][0-9]{1,2})?$' or value::numeric=0 or length(trim(coalesce(p_data->>'reason','')))<3 then raise exception 'Enter a nonzero cash movement and reason';end if;
  insert into pos_cash118(shift_id,amount,currency,reason,created_by) values(s.id,value::numeric,code,p_data->>'reason',auth.uid()) returning to_jsonb(pos_cash118.*) into r;return r;
 elsif p_action='close' then
  report:=restaurant_private.pos_shift_report152(s.id);
  if p_data ? 'reviewToken' and p_data->>'reviewToken' is distinct from report->>'reviewToken' then raise exception 'Shift activity changed. Refresh totals and review before closing.';end if;
  counts:=p_data->'countedCash';
  if counts is null then
   if exists(select 1 from jsonb_array_elements(report->'cash') c where c->>'currency'<>'LAK' and (c->>'expected')::numeric<>0) then raise exception 'Refresh the POS to count each currency before closing';end if;
   counts:=jsonb_build_object('LAK',p_data->>'amount','USD',0,'THB',0);
  end if;
  if jsonb_typeof(counts)<>'object' then raise exception 'Enter the actual count for each currency';end if;
  for code,value in select * from jsonb_each_text(counts) loop
   if code !~ '^[A-Z]{3}$' or coalesce(value,'') !~ '^[0-9]{1,12}([.][0-9]{1,2})?$' then raise exception 'Enter a valid actual count for %',code;end if;
   if not exists(select 1 from jsonb_array_elements(report->'cash') c where c->>'currency'=code) then
    report:=jsonb_set(report,'{cash}',(report->'cash')||jsonb_build_array(jsonb_build_object('currency',code,'opening',0,'received',0,'change',0,'refunds',0,'cashIn',0,'cashOut',0,'expected',0)));
   end if;
  end loop;
  for x in select * from jsonb_array_elements(report->'cash') loop
   code:=x->>'currency';value:=counts->>code;
   if coalesce(value,'') !~ '^[0-9]{1,12}([.][0-9]{1,2})?$' then raise exception 'Enter the actual count for %',code;end if;
   amount:=value::numeric;rows:=rows||jsonb_build_array(x||jsonb_build_object('counted',amount,'variance',round(amount-(x->>'expected')::numeric,2)));
  end loop;
  close_time:=now();report:=(report-'reviewToken')||jsonb_build_object('cash',rows,'closedAt',close_time,'legacy',false);
  update pos_shifts118 set closed_at=close_time,counted=(counts->>'LAK')::numeric,expected=(select (balance.val->>'expected')::numeric from jsonb_array_elements(rows) as balance(val) where balance.val->>'currency'='LAK'),closing_report=report where id=s.id returning to_jsonb(pos_shifts118.*) into r;
  return r;
 end if;
 raise exception 'Unknown management action';
end$$;
