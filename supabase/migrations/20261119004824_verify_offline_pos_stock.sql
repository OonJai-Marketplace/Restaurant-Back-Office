-- Older packets without a stock snapshot retain their existing replay behavior.
-- Compare the server's calculated deductions before issuing a receipt or moving stock.
do $migration$
declare
  existing text := pg_get_functiondef('public.pos_order118(uuid,integer,text,jsonb)'::regprocedure);
  anchor text := $anchor$  offline_at=(p_data->>'offlineCapturedAt')::timestamptz;$anchor$;
  guard text := $check$
  if p_action='pay' and p_data ? 'offlineUsage124' then
    if jsonb_typeof(p_data->'offlineUsage124') is distinct from 'object' then
      raise exception 'Invalid offline stock snapshot';
    end if;
    if exists (
      with recorded as (
        select key as id, value as qty from jsonb_each(p_data->'offlineUsage124')
      ), calculated as (
        select row->>'itemId' as id, sum((row->>'quantity')::numeric) as qty
        from jsonb_array_elements(uses) row group by row->>'itemId'
      )
      select 1 from recorded full join calculated using (id)
      where case when jsonb_typeof(recorded.qty) is distinct from 'number' or calculated.qty is null then true
        else abs(recorded.qty::text::numeric-calculated.qty)>abs(calculated.qty)*0.000000000001 end
    ) then
      raise exception 'Inventory links or quantities changed after this offline payment. Review the original stock allocation before retrying sync.';
    end if;
  end if;
$check$;
begin
  if strpos(existing,guard)>0 then return; end if;
  if strpos(existing,anchor)=0 then raise exception 'Expected offline payment validation is missing'; end if;
  execute replace(existing,anchor,guard||anchor);
end
$migration$;
