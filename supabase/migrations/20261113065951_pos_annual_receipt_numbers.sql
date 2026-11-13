-- A number belongs to a completed sale. Rollbacks, open orders and reprints do not advance it.
create table restaurant_private.receipt_counters (
  sale_year integer primary key,
  last_issued bigint not null check (last_issued > 0)
);
revoke all on restaurant_private.receipt_counters from public, anon, authenticated;
alter table restaurant_private.receipt_counters enable row level security;

create function restaurant_private.receipt_code(sale_year integer, ordinal bigint)
returns text language sql immutable strict set search_path = '' as $$
  select 'OJM' || right(sale_year::text, 2) || '-4' ||
         chr(65 + (((ordinal - 1) / 999) % 26)::int) ||
         lpad((((ordinal - 1) % 999) + 1)::text, 3, '0')
$$;
revoke all on function restaurant_private.receipt_code(integer,bigint) from public, anon, authenticated;

create function restaurant_private.number_paid_receipt() returns trigger
language plpgsql set search_path = '' as $$
declare
  payment_year integer := extract(year from new.paid_at at time zone 'Asia/Vientiane');
  serial_no bigint;
begin
  insert into restaurant_private.receipt_counters as c values (payment_year, 1)
  on conflict (sale_year) do update set last_issued = c.last_issued + 1
  returning last_issued into serial_no;
  new.data := new.data || jsonb_build_object('receiptCode', restaurant_private.receipt_code(payment_year, serial_no));
  return new;
end
$$;
revoke all on function restaurant_private.number_paid_receipt() from public, anon, authenticated;
create trigger number_paid_receipt before update of status on public.pos_orders118
for each row when (new.status = 'paid' and old.status = 'unpaid')
execute function restaurant_private.number_paid_receipt();

-- The write still uses the server menu. If it differs from what this cashier
-- confirmed, stop before charging and let the cashier review the updated order.
do $migration$
declare
  original text := pg_get_functiondef('public.pos_order118(uuid,integer,text,jsonb)'::regprocedure);
  updated text;
begin
  updated := replace(original, $old$method=p_data->>'payment';$old$, $new$
  if p_action='pay' and p_data ? 'reviewedTotal' and (
    (p_data->>'reviewedTotal')::numeric is distinct from subtotal-discount or exists (
      select from jsonb_array_elements(lines) with ordinality as l(item,i)
      where (l.item->>'unitPrice')::numeric is distinct from (p_data->'lines'->(i::int-1)->>'unitPrice')::numeric
        or l.item->>'name' is distinct from p_data->'lines'->(i::int-1)->>'name'
        or l.item->'options' is distinct from coalesce(p_data->'lines'->(i::int-1)->'options','[]'::jsonb)
    )
  ) then raise exception 'The menu or price changed. Close and reopen checkout to review the updated order.'; end if;
  method=p_data->>'payment';$new$);
  if updated=original then raise exception 'Expected payment validation missing'; end if;
  updated := replace(updated, $old$'FX change for receipt R-'||result.number$old$, $new$'FX change for receipt '||(result.data->>'receiptCode')$new$);
  updated := replace(updated, $old$'tendered',p_data->>'tendered'$old$,
    $new$'localReceiptRef',case when p_action='pay' and p_data ? 'offlineCapturedAt'
      then 'R-L'||upper(replace(p_id::text,'-','')) end,'tendered',p_data->>'tendered'$new$);
  execute updated;
end
$migration$;
