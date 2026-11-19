-- The subtotal is the only ceiling on an ordinary cashier discount.
do $migration$
declare
  order_def text := pg_get_functiondef('public.pos_order118(uuid,integer,text,jsonb)'::regprocedure);
  manage_def text := pg_get_functiondef('public.pos_manage118(text,jsonb,integer)'::regprocedure);
  approval text := $old$if promo146 is null and not is_admin() and discount>subtotal*coalesce((config->>'discountLimit')::numeric,0)/100 then raise exception 'This discount requires administrator approval';end if;$old$;
  setting_check text := $old$ or coalesce((p_data->>'discountLimit')::numeric,-1) not between 0 and 100$old$;
  write_config text := 'update pos_config118 set data=p_data,version=version+1';
begin
  if strpos(order_def,approval)=0 or strpos(manage_def,setting_check)=0 or strpos(manage_def,write_config)=0 then
    raise exception 'Expected POS discount configuration does not match this migration';
  end if;
  execute replace(order_def,approval,'');
  -- Older apps interpret an absent field as zero. Even an old settings form
  -- must leave those devices able to discount the entire order.
  execute replace(replace(manage_def,setting_check,''),write_config,
    $new$update pos_config118 set data=p_data || '{"discountLimit":100}'::jsonb,version=version+1$new$);
end
$migration$;
alter table public.pos_config118 alter column data set default
  '{"methods":["Cash","BCEL QR","Bank"],"cashiers":[],"discountLimit":100,"receiptWidth":80,"receiptFooter":"Thank you for visiting."}'::jsonb;
update public.pos_config118 set data=data || '{"discountLimit":100}'::jsonb,version=version+1
where data->'discountLimit' is distinct from '100'::jsonb;
