-- New registers reserve contiguous ordinals on the same annual counter as older
-- clients. The long reserve is replenished before it runs low, even mid-shift.
alter table restaurant_private.pos_receipt_blocks drop constraint pos_receipt_blocks_check;
alter table restaurant_private.pos_receipt_blocks add constraint pos_receipt_book_size
 check (last_no-first_no between 0 and 4095);

-- Reservations never cross Z999. A new cycle opens only after every number
-- of the current cycle has actually reached a paid receipt in Supabase.
-- Disconnected registers can continue taking payments by order reference.
create or replace function restaurant_private.next_online_ordinal(y integer, qty integer)
returns bigint language plpgsql set search_path='' as $$
declare
 highest bigint; boundary bigint; n integer;
begin
 if qty not in(1,128,4096) or qty is null then raise exception 'Invalid receipt book size'; end if;
 insert into restaurant_private.receipt_counters(sale_year,last_issued) values(y,qty)
 on conflict(sale_year) do nothing;
 if found then return 1; end if;
 select last_issued into highest from restaurant_private.receipt_counters where sale_year=y for update;
 if highest%25974=0 then
  select count(distinct o.data->>'receiptCode') into n from public.pos_orders118 o
   where o.data->>'receiptYear'=y::text and o.data ? 'receiptOrdinal'
    and (o.data->>'receiptOrdinal')::numeric between highest-25973 and highest
    and o.status in ('paid','refunded');
  if n<>25974 then raise exception using message='Receipt cycle is still in use'; end if;
 end if;
 boundary:=(highest/25974+1)*25974;
 if qty=128 and boundary-highest<qty then raise exception 'Update this register to use the remaining receipt numbers'; end if;
 update restaurant_private.receipt_counters set last_issued=least(highest+qty,boundary) where sale_year=y;
 return highest+1;
end $$;

create function restaurant_private.reserve_receipt_book(p_year integer,p_token uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
 y integer:=extract(year from now() at time zone 'Asia/Vientiane');
 book restaurant_private.pos_receipt_blocks;
begin
 if auth.uid() is null or not public.pos_allowed118() or not (
  public.restaurant_tab_can125('pos','pos-sales-new','sell') or
  public.restaurant_tab_can125('pos','pos-sales-open','sell') or
  public.restaurant_tab_can125('pos','pos-sales-online','sell')
 ) then raise exception 'Cashier access required'; end if;
 if p_token is null or p_year is null or p_year not in (y,y+1) then
  raise exception 'Invalid receipt reservation'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_token::text,119));
 select * into book from restaurant_private.pos_receipt_blocks where token=p_token;
 if found then
  if book.cashier<>auth.uid() or book.sale_year<>p_year then raise exception 'Invalid receipt reservation'; end if;
 else
  begin
   book.first_no:=restaurant_private.next_online_ordinal(p_year,4096);
  exception when raise_exception then
   if sqlerrm<>'Receipt cycle is still in use' then raise; end if;
   return jsonb_build_object('token',p_token,'year',p_year,'cyclePending',true);
  end;
  insert into restaurant_private.pos_receipt_blocks values(p_token,auth.uid(),p_year,book.first_no,least(book.first_no+4095,((book.first_no-1)/25974+1)*25974))
   returning * into book;
 end if;
 return jsonb_build_object('token',book.token,'year',book.sale_year,'first',book.first_no,'last',book.last_no);
end $$;
revoke all on function restaurant_private.reserve_receipt_book(integer,uuid) from public,anon;
grant execute on function restaurant_private.reserve_receipt_book(integer,uuid) to authenticated;
create function public.pos_reserve_receipt_book(p_year integer,p_token uuid)
returns jsonb language sql security invoker set search_path='' as $$
 select restaurant_private.reserve_receipt_book(p_year,p_token)
$$;
revoke all on function public.pos_reserve_receipt_book(integer,uuid) from public,anon;
grant execute on function public.pos_reserve_receipt_book(integer,uuid) to authenticated;

-- Keep previously issued receipts and old queued continuation packets valid.
-- Exhausted devices can use the existing order UUID as a permanent lookup key.
-- Sync assigns a central number when available and always preserves the reference.
do $migration$
declare
 original text:=pg_get_functiondef('restaurant_private.number_paid_receipt()'::regprocedure);
 revised text;
begin
 revised:=replace(original,$old$if ticket ? 'continuation' then$old$,$new$if ticket ? 'localRef' then
    if ticket->>'localRef' is distinct from ('R-L'||upper(replace(new.id::text,'-','')))
       or ticket->>'code' is distinct from ticket->>'localRef' then
      raise exception 'Offline reference differs from the order'; end if;
    new.data:=new.data||jsonb_build_object('localReceiptRef',ticket->>'localRef');
    begin
      ordinal:=restaurant_private.next_online_ordinal(payment_year,1);
      code:=restaurant_private.receipt_code(payment_year,ordinal::bigint);
      new.data:=new.data||jsonb_build_object('receiptYear',payment_year,'receiptOrdinal',ordinal);
    exception when raise_exception then
      if sqlerrm<>'Receipt cycle is still in use' then raise; end if;
      code:=ticket->>'localRef';
    end;
  elsif ticket ? 'continuation' then$new$);
 if revised=original then raise exception 'Expected receipt trigger missing'; end if;
 revised:=replace(revised,$old$code := restaurant_private.receipt_code(payment_year,ordinal::bigint);
  end if;$old$,$new$code := restaurant_private.receipt_code(payment_year,ordinal::bigint);
    new.data:=new.data||jsonb_build_object('receiptYear',payment_year,'receiptOrdinal',ordinal);
  end if;$new$);
 execute revised;
end $migration$;
