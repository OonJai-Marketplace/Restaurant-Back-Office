-- Add a category only. Products remain private until the owner enables a channel.
begin;
alter table public.storefront_items127 drop constraint storefront_items127_category_check;
alter table public.storefront_items127 add constraint storefront_items127_category_check
 check(category in ('burgers','sandwiches','texmex','pasta','bowl','smoothies','refreshers','wellness','bakery'));
do $$declare body text;begin
 body=pg_get_functiondef('restaurant_private.sync_public_pos131()'::regprocedure);
 if position('category_name=rules->''categories''->>new.category;' in body)=0 then raise exception 'Unexpected catalog trigger definition';end if;
 body=replace(body,'category_name=rules->''categories''->>new.category;',
 'category_name=case when new.category=''bakery'' then ''Bakery'' else rules->''categories''->>new.category end;');
 execute body;
end$$;
notify pgrst,'reload schema';
commit;
