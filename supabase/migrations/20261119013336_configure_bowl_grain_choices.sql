-- The old list of allowed option keys still rejects the existing grain editor.
alter table public.storefront_items127 drop constraint storefront_items127_options_check,
 add constraint storefront_items127_options_check check (
  jsonb_typeof(options)='object'
  and options-array['isCustom','maxSauces','maxVeggies','maxProteins','specificProteins','needsWellnessChoice','grains154']='{}'::jsonb
  and (not (options ? 'grains154') or (options->>'isCustom'='true' and jsonb_typeof(options->'grains154')='array'))
 );

-- Backfill the four original bowls through the versioned catalog and recipe triggers.
-- Follow the restaurant's catalog-maintenance convention with its active owner.
do $catalog$
declare
 actor uuid;
 prior_sub text:=current_setting('request.jwt.claim.sub',true);
 item record; groups jsonb; grp jsonb; opt jsonb; portion record; ingredient uuid; gi int; oi int;
begin
 if not exists(select 1 from public.storefront_items127 where id in ('bw1','bw2','bw3','bw4') and category='bowl' and options->>'isCustom'='true' and not (options ? 'grains154')) then return; end if;
 -- New installations have no connected menu until an administrator sets it up.
 if not exists(select 1 from public.storefront_items127 where id in ('bw1','bw2','bw3','bw4') and menu_item_id is not null) then return; end if;
 select p.id into actor from public.profiles p join auth.users u on u.id=p.id
 where p.role='admin' and p.status='active' and lower(u.email)='santos@oonjai.org';
 if actor is null then raise exception 'Restaurant catalog owner is required for this backfill'; end if;
 perform set_config('request.jwt.claim.sub',actor::text,true);
 update public.storefront_items127 set
  options=jsonb_set(options,'{grains154}','[{"id":"brown-rice","name":"Brown rice","price":0},{"id":"quinoa","name":"Quinoa","price":0}]'),
  version=version+1
 where id in ('bw1','bw2','bw3','bw4') and category='bowl' and options->>'isCustom'='true' and not (options ? 'grains154');
 -- Only ingredients with a unique active match and an explicit worksheet portion qualify.
 for item in select m.id,m.data,s.id as source,w.sections
  from public.storefront_items127 s join public.menu_items104 m on m.id=s.menu_item_id
  join public.restaurant_kitchen_worksheets w on w.menu_id=m.id
  where s.id in ('bw2','bw3','bw4') and s.category='bowl' for update of m
 loop
  groups=item.data->'posOptions118';
  for grp,gi in select value,(ordinality-1)::integer from jsonb_array_elements(groups) with ordinality where value->>'id'='grains154' loop
   for opt,oi in select value,(ordinality-1)::integer from jsonb_array_elements(grp->'options') with ordinality loop
    if opt->>'id' not in ('brown-rice','quinoa') or jsonb_array_length(coalesce(opt->'recipe','[]'))<>0 then continue;end if;
    select r->>'unit' unit,(r->>'quantity')::numeric qty into portion
     from jsonb_array_elements(item.sections) sec cross join lateral jsonb_array_elements(sec->'rows') r
     where lower(sec->>'title')=lower(opt->>'name') and lower(r->>'name')=lower(opt->>'name') limit 1;
    if not found or portion.qty is null or portion.qty<=0 then continue;end if;
    select (array_agg(i.id))[1] into ingredient from public.menu_ingredients105 i
     where lower(i.data->>'name')=lower(opt->>'name') and i.data->>'unit'=portion.unit and i.data->>'active'='true' having count(*)=1;
    if ingredient is null then continue;end if;
    groups=jsonb_set(groups,array[gi::text,'options',oi::text,'recipe'],jsonb_build_array(jsonb_build_object('itemId',ingredient,'quantity',portion.qty)));
   end loop;
  end loop;
  if groups is distinct from item.data->'posOptions118' then
   update public.menu_items104 set data=jsonb_set(data,'{posOptions118}',groups),version=version+1 where id=item.id;
  end if;
 end loop;
 perform set_config('request.jwt.claim.sub',coalesce(prior_sub,''),true);
end $catalog$;
