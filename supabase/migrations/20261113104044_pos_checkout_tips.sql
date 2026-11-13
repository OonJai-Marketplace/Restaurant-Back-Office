-- Keep food sales and tips separate. Amount collected excludes change returned.
do $migration$
declare
 original text;
 updated text;
 fn regprocedure;
 old_text text;
 new_text text;
begin
 original:=pg_get_functiondef('public.pos_order118(uuid,integer,text,jsonb)'::regprocedure);
 updated:=original;
 for old_text,new_text in select * from (values
  ($old$declare verified_fx jsonb;$old$,$new$declare tip_amount numeric:=0; collected numeric; change_due numeric:=0; verified_fx jsonb;$new$),
  ($old$method=p_data->>'payment';$old$,$new$
 if p_action='pay' and p_data ? 'tip' then
  if coalesce(p_data->>'tip','') !~ '^[0-9]{1,10}([.][0-9]{1,2})?$' then raise exception 'Enter a valid tip'; end if;
  tip_amount:=(p_data->>'tip')::numeric;
 end if;
 collected:=subtotal-discount+tip_amount;
 method=p_data->>'payment';$new$),
  ($old$pos_fx_tender(p_data->'fxTender',subtotal-discount)$old$,$new$pos_fx_tender(p_data->'fxTender',collected)$new$),
  ($old$if method<>'Cash' and length(trim(coalesce(p_data->>'paymentReference','')))<3 then raise exception 'Enter the verified bank payment reference';end if;$old$,
   $new$if p_data ? 'tip' then
    if coalesce(p_data->>'tendered','') !~ '^[0-9]{1,14}([.][0-9]{1,2})?$' or (p_data->>'tendered')::numeric<collected then
     raise exception 'Amount received must cover the total including tip';
    end if;
    change_due:=(p_data->>'tendered')::numeric-collected;
   else change_due:=coalesce((verified_fx->>'changeLak')::numeric,0); end if;$new$),
  ($old$'tendered',p_data->>'tendered'$old$,$new$'tip',case when p_action='pay' then tip_amount end,'collectedTotal',case when p_action='pay' then collected end,
   'tendered',case when p_action='pay' and method<>'Cash' and not p_data ? 'tip' and verified_fx is null then collected::text else p_data->>'tendered' end$new$),
  ($old$method<>'Cash' and (verified_fx->>'changeLak')::numeric>0$old$,$new$method<>'Cash' and change_due>0$new$),
  ($old$-(verified_fx->>'changeLak')::numeric,'FX change for receipt '$old$,$new$-change_due,'Change for receipt '$new$)
 ) as patches(before,after) loop
  if strpos(updated,old_text)=0 then raise exception 'Unexpected order function near %',left(old_text,60); end if;
  updated:=replace(updated,old_text,new_text);
 end loop;
 execute updated;
 -- Drawer reconciliation includes tips for both the original sale and its refund.
 foreach fn in array array['public.pos_cashier_snapshot125(text,date,uuid[])'::regprocedure,'public.pos_manage118(text,jsonb,integer)'::regprocedure] loop
  original:=pg_get_functiondef(fn);
  updated:=regexp_replace(original,
   $pattern$sum\(\(data->>'total'\)::numeric\)( from pos_orders118 where data->>'(shiftId|payment|refundShiftId)')$pattern$,
   $replacement$sum(coalesce((data->>'collectedTotal')::numeric,(data->>'total')::numeric))\1$replacement$,'g');
  if updated=original then raise exception 'Expected drawer arithmetic in %',fn; end if;
  execute updated;
 end loop;
end
$migration$;
