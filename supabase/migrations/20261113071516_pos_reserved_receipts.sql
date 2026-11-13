-- Reserve disjoint ranges on the same annual counter used by older POS clients.
create table restaurant_private.pos_receipt_blocks (
  token uuid primary key,
  cashier uuid not null,
  sale_year integer not null,
  first_no bigint not null,
  last_no bigint not null,
  check (last_no = first_no + 127)
);
revoke all on restaurant_private.pos_receipt_blocks from public, anon, authenticated;
alter table restaurant_private.pos_receipt_blocks enable row level security;

create function restaurant_private.reserve_receipts(p_year integer,p_token uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  y integer := extract(year from now() at time zone 'Asia/Vientiane');
  block restaurant_private.pos_receipt_blocks;
  last_no bigint;
begin
  if auth.uid() is null or not public.pos_allowed118() or not (
    public.restaurant_tab_can125('pos','pos-sales-new','sell') or
    public.restaurant_tab_can125('pos','pos-sales-open','sell') or
    public.restaurant_tab_can125('pos','pos-sales-online','sell')
  ) then raise exception 'Cashier access required'; end if;
  if p_token is null or p_year is null or p_year not in (y,y+1) then
    raise exception 'Invalid receipt reservation'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_token::text, 119));
  select * into block from restaurant_private.pos_receipt_blocks where token=p_token;
  if found then
    if block.cashier<>auth.uid() or block.sale_year<>p_year then raise exception 'Invalid receipt reservation'; end if;
  else
    insert into restaurant_private.receipt_counters as c values (p_year,128)
    on conflict(sale_year) do update set last_issued=c.last_issued+128
    returning last_issued into last_no;
    insert into restaurant_private.pos_receipt_blocks values(p_token,auth.uid(),p_year,last_no-127,last_no)
    returning * into block;
  end if;
  return jsonb_build_object('token',block.token,'year',block.sale_year,'first',block.first_no,'last',block.last_no);
end $$;
revoke all on function restaurant_private.reserve_receipts(integer,uuid) from public,anon;
grant execute on function restaurant_private.reserve_receipts(integer,uuid) to authenticated;
create function public.pos_reserve_receipts(p_year integer,p_token uuid)
returns jsonb language sql security invoker set search_path='' as $$
 select restaurant_private.reserve_receipts(p_year,p_token)
$$;
revoke all on function public.pos_reserve_receipts(integer,uuid) from public,anon;
grant execute on function public.pos_reserve_receipts(integer,uuid) to authenticated;

-- Enforce one sale per reserved ordinal, including retry/cross-device conflicts.
-- The human-facing code can repeat after Z999, as requested.
create unique index pos_paid_receipt_slot on public.pos_orders118
 ((data->>'receiptYear'),(data->>'receiptOrdinal')) where data ? 'receiptOrdinal';

create or replace function restaurant_private.number_paid_receipt() returns trigger
language plpgsql set search_path='' as $$
declare
  payment_year integer := extract(year from new.paid_at at time zone 'Asia/Vientiane');
  ordinal bigint;
  ticket jsonb := new.data->'receiptTicket';
  code text;
begin
  new.data := new.data-'receiptTicket';
  if nullif(ticket,'null'::jsonb) is not null then
    ordinal := (ticket->>'ordinal')::bigint;
    code := restaurant_private.receipt_code(payment_year,ordinal);
    if ordinal is null or code is distinct from ticket->>'code' or not exists (
      select from restaurant_private.pos_receipt_blocks b
      where b.token=(ticket->>'token')::uuid and b.cashier=auth.uid()
        and b.sale_year=payment_year and ordinal between b.first_no and b.last_no
    ) then raise exception 'Receipt number differs from its reservation. Retain the device copy for review.'; end if;
    new.data := new.data || jsonb_build_object('receiptYear',payment_year,'receiptOrdinal',ordinal);
  else
    insert into restaurant_private.receipt_counters as c values(payment_year,1)
    on conflict(sale_year) do update set last_issued=c.last_issued+1
    returning last_issued into ordinal;
    code := restaurant_private.receipt_code(payment_year,ordinal);
  end if;
  new.data := new.data || jsonb_build_object('receiptCode',code);
  return new;
end $$;

do $migration$
declare
 original text := pg_get_functiondef('public.pos_order118(uuid,integer,text,jsonb)'::regprocedure);
 updated text;
begin
 -- Bind the year and timestamp to the original payment even if an online reply is lost at midnight.
 updated:=replace(original,$old$then coalesce(offline_at,now()) else null end$old$,
   $new$then coalesce(offline_at,(p_data->>'receiptIssuedAt')::timestamptz,now()) else null end$new$);
 if updated=original then raise exception 'Expected paid timestamp missing'; end if;
 original:=updated;
 updated:=replace(original,$old$method=p_data->>'payment';$old$,$new$
 if p_action='pay' and p_data ? 'receiptIssuedAt' and not p_data ? 'offlineCapturedAt' and
    abs(extract(epoch from (now()-(p_data->>'receiptIssuedAt')::timestamptz)))>300 then
   raise exception 'Check the date and time on this register.'; end if;
 method=p_data->>'payment';$new$);
 if updated=original then raise exception 'Expected payment verification missing'; end if;
 original:=updated;
 updated:=replace(original,$old$'localReceiptRef',case when p_action='pay' and p_data ? 'offlineCapturedAt'$old$,
   $new$'receiptTicket',case when p_action='pay' then p_data->'receiptTicket' end,
   'receiptFooter',case when p_action='pay' then left(coalesce(p_data->>'receiptFooter',config->>'receiptFooter'),500) end,
   'localReceiptRef',case when p_action='pay' and not p_data ? 'receiptTicket' and p_data ? 'offlineCapturedAt'$new$);
 if updated=original then raise exception 'Expected receipt projection missing'; end if;
 execute updated;
end
$migration$;
