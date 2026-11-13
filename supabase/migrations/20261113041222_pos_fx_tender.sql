-- Keep sales in LAK. Recalculate the original foreign tender and LAK change at payment.
create or replace function restaurant_private.pos_fx_tender(fx jsonb, total_lak numeric)
returns jsonb language plpgsql immutable strict set search_path=pg_catalog as $$
declare foreign_amount numeric; rate numeric; equivalent numeric;
begin
 if jsonb_typeof(fx) <> 'object' or coalesce(fx->>'currency','') !~ '^[A-Z]{3}$'
    or fx->>'currency'='LAK' or coalesce(fx->>'amount','') !~ '^[0-9]{1,10}([.][0-9]{1,2})?$'
    or coalesce(fx->>'rate','') !~ '^[0-9]{1,8}([.][0-9]{1,6})?$' then
  raise exception 'Enter a foreign currency, amount and exchange rate';
 end if;
 foreign_amount=(fx->>'amount')::numeric; rate=(fx->>'rate')::numeric;
 equivalent=round(foreign_amount*rate,2);
 if foreign_amount<=0 or rate<=0 or equivalent<total_lak or equivalent>90071992547409.91 then
  raise exception 'Foreign payment does not cover the total or exceeds the supported range';
 end if;
 if (fx->>'changeLak')::numeric is distinct from equivalent-total_lak then
  raise exception 'Total or rate changed. Review the FX change before confirming';
 end if;
 return jsonb_build_object('currency',fx->>'currency','amount',foreign_amount,'rate',rate,'equivalentLak',equivalent,'changeLak',equivalent-total_lak);
end $$;
revoke all on function restaurant_private.pos_fx_tender(jsonb,numeric) from public,anon,authenticated;

do $migration$
declare original text:=pg_get_functiondef('public.pos_order118(uuid,integer,text,jsonb)'::regprocedure); updated text;
begin
 updated:=replace(original,'declare promo146 jsonb;', 'declare verified_fx jsonb; promo146 jsonb;');
 if updated=original then raise exception 'Unexpected order declaration'; end if;
 original:=updated;
 updated:=replace(original,$old$method=p_data->>'payment';$old$,$new$method=p_data->>'payment';
 if p_action='pay' and p_data ? 'fxTender' then
  verified_fx=restaurant_private.pos_fx_tender(p_data->'fxTender',subtotal-discount);
  if (p_data->>'tendered')::numeric is distinct from (verified_fx->>'equivalentLak')::numeric then raise exception 'FX tender mismatch'; end if;
 end if;$new$);
 if original=updated then raise exception 'Expected payment verification missing'; end if;
 original:=updated;
 updated:=replace(original,$old$'tendered',p_data->>'tendered','shiftId',sid$old$,$new$'tendered',p_data->>'tendered','fxTender',verified_fx,'shiftId',sid$new$);
 if original=updated then raise exception 'Expected receipt projection missing'; end if;
 original:=updated;
 updated:=replace(original,$old$if promo146 is not null then perform promotions_private.pos_finish146$old$,$new$if p_action='pay' and method<>'Cash' and (verified_fx->>'changeLak')::numeric>0 then
  insert into public.pos_cash118(shift_id,amount,reason,created_by) values(sid,-(verified_fx->>'changeLak')::numeric,'FX change for receipt R-'||result.number,auth.uid());
 end if;
 if promo146 is not null then perform promotions_private.pos_finish146$new$);
 if original=updated then raise exception 'Expected payment completion missing'; end if;
 execute updated;
end $migration$;
