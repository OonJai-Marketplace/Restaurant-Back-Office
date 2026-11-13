-- Previously issued blocks occupy 1..128 in this restaurant. All existing blocks
-- must fit before the first offline page. Concurrent allocations wait for cutover.
lock table restaurant_private.receipt_counters in share row exclusive mode;
do $$ begin
 if exists(select from restaurant_private.receipt_counters where last_issued>512) then
   raise exception 'Existing receipt ranges exceed the first page. Increase the shared page size before upgrading.';
 end if;
end $$;

create function restaurant_private.next_online_ordinal(y integer, qty integer)
returns bigint language plpgsql set search_path='' as $$
declare highest bigint; candidate bigint; page bigint; origin bigint;
begin
 insert into restaurant_private.receipt_counters(sale_year,last_issued) values(y,qty)
   on conflict(sale_year) do nothing;
 if found then return 1; end if;
 select last_issued into highest from restaurant_private.receipt_counters where sale_year=y for update;
 candidate:=highest+1;
 origin:=513;
 if candidate<origin then
   if candidate+qty>origin then candidate:=origin+512; end if;
 else
   page:=(candidate-origin)/512;
   if page%2=0 then candidate:=origin+(page+1)*512;
   elsif (candidate-origin)%512+qty>512 then candidate:=origin+(page+2)*512; end if;
 end if;
 update restaurant_private.receipt_counters set last_issued=candidate+qty-1 where sale_year=y;
 return candidate;
end $$;
revoke all on function restaurant_private.next_online_ordinal(integer,integer) from public,anon,authenticated;

-- Cantor pairing gives every (original block, age in years, continuation page)
-- a different odd page. Separate years restart the local counter.
create function restaurant_private.receipt_pair(a numeric,b numeric) returns numeric
language sql immutable strict set search_path='' as $$
 select trunc((a+b)*(a+b+1)/2)+b
$$;
create function restaurant_private.continuation_ordinal(witness bigint,age integer,serial bigint,origin bigint)
returns numeric language sql immutable strict set search_path='' as $$
 select origin + 1024*restaurant_private.receipt_pair(
   restaurant_private.receipt_pair(((witness-1)%128),restaurant_private.receipt_pair((witness-1)/128,age)),
   (serial-1)/512) + (serial-1)%512
$$;
revoke all on function restaurant_private.receipt_pair(numeric,numeric),restaurant_private.continuation_ordinal(bigint,integer,bigint,bigint) from public,anon,authenticated;
create or replace function restaurant_private.reserve_receipts(p_year integer,p_token uuid)
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
    last_no:=restaurant_private.next_online_ordinal(p_year,128)+127;
    insert into restaurant_private.pos_receipt_blocks values(p_token,auth.uid(),p_year,last_no-127,last_no)
    returning * into block;
  end if;
  return jsonb_build_object('token',block.token,'year',block.sale_year,'first',block.first_no,'last',block.last_no);
end $$;
create or replace function restaurant_private.number_paid_receipt() returns trigger
language plpgsql set search_path='' as $$
declare
  payment_year integer := extract(year from new.paid_at at time zone 'Asia/Vientiane');
  ordinal numeric;
  ticket jsonb := new.data->'receiptTicket';
  code text;
  anchor restaurant_private.pos_receipt_blocks;
  serial bigint; witness bigint; origin bigint;
begin
  new.data := new.data-'receiptTicket';
  if ticket ? 'continuation' then
    select * into anchor from restaurant_private.pos_receipt_blocks
      where token=(ticket->>'token')::uuid and cashier=auth.uid();
    serial:=(ticket->>'continuation')::bigint;
    if anchor.token is null or serial is null or serial<1 or payment_year<anchor.sale_year then
      raise exception 'Invalid offline receipt series';
    end if;
    witness:=(ticket->>'witness')::bigint;
    if witness is null or witness not between anchor.first_no and anchor.last_no then
      raise exception 'Invalid receipt book anchor'; end if;
    origin:=513;
    ordinal:=restaurant_private.continuation_ordinal(witness,payment_year-anchor.sale_year,serial,origin);
    code:=restaurant_private.receipt_code(payment_year,mod(ordinal-1,25974)::bigint+1);
    if ordinal is distinct from (ticket->>'ordinal')::numeric or code is distinct from ticket->>'code' then
      raise exception 'Offline receipt differs from the register copy';
    end if;
    new.data:=new.data||jsonb_build_object('receiptYear',payment_year,'receiptOrdinal',ordinal::text);
  elsif nullif(ticket,'null'::jsonb) is not null then
    ordinal := (ticket->>'ordinal')::bigint;
    code := restaurant_private.receipt_code(payment_year,ordinal::bigint);
    if ordinal is null or code is distinct from ticket->>'code' or not exists (
      select from restaurant_private.pos_receipt_blocks b
      where b.token=(ticket->>'token')::uuid and b.cashier=auth.uid()
        and b.sale_year=payment_year and ordinal between b.first_no and b.last_no
    ) then raise exception 'Receipt number differs from its reservation. Retain the device copy for review.'; end if;
    new.data := new.data || jsonb_build_object('receiptYear',payment_year,'receiptOrdinal',ordinal);
  else
    ordinal:=restaurant_private.next_online_ordinal(payment_year,1);
    code := restaurant_private.receipt_code(payment_year,ordinal::bigint);
  end if;
  new.data := new.data || jsonb_build_object('receiptCode',code);
  return new;
end $$;

do $patch$
declare fn regprocedure:='public.pos_manage118(text,jsonb,integer)'::regprocedure;
 original text:=pg_get_functiondef(fn); revised text;
begin
 revised:=replace(original,'not in(58,80)','not in(56,58,80)');
 if revised=original then raise exception 'POS paper validation changed'; end if;
 execute revised;
end $patch$;
update public.pos_config118 set data=jsonb_set(data,'{receiptWidth}','56'),version=version+1
 where id and data->>'receiptWidth' is distinct from '56';
