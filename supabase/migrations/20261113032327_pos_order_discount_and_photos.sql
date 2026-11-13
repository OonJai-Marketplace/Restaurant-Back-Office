-- Keep the cashier's editable discount alongside the server-calculated amount.
-- Existing clients and reports still read discount and discountType as an amount.
DO $migration$
DECLARE
 original text := pg_get_functiondef('public.pos_order118(uuid,integer,text,jsonb)'::regprocedure);
 updated text;
BEGIN
 updated := replace(original, $old$'photoData',d->>'photoData','photo118'$old$, $new$'photoData',d->>'photoData','photoUrl',d->>'photoUrl','photo118'$new$);
 IF updated = original THEN RAISE EXCEPTION 'Expected order photo projection missing'; END IF;
 original := updated;
 updated := replace(original, $old$'discountType','amount','total',subtotal-discount$old$, $new$'discountType','amount','discountInput',case when promo146 is null then coalesce((p_data->>'discount')::numeric,0) else discount end,'discountInputType',case when promo146 is null and p_data->>'discountType'='percent' then 'percent' else 'amount' end,'discountName',case when promo146 is null then left(p_data->>'discountName',80) end,'discountPresetId',case when promo146 is null then left(p_data->>'discountPresetId',64) end,'total',subtotal-discount$new$);
 IF updated = original THEN RAISE EXCEPTION 'Expected order discount projection missing'; END IF;
 EXECUTE updated;
END
$migration$;
