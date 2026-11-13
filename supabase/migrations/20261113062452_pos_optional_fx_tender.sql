-- Unpaid orders and older queued payments may contain JSON null for foreign tender.
-- A supplied non-null value must still pass the full foreign payment validation.
do $migration$
declare
 original text := pg_get_functiondef('public.pos_order118(uuid,integer,text,jsonb)'::regprocedure);
 updated text;
begin
 updated := replace(original,
  $old$if p_action='pay' and p_data ? 'fxTender' then$old$,
  $new$if p_action='pay' and nullif(p_data->'fxTender','null'::jsonb) is not null then$new$);
 if updated = original then raise exception 'Expected foreign tender check missing'; end if;
 execute updated;
end
$migration$;
