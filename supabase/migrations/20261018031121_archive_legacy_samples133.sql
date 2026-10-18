-- Retire only the confirmed original sample seed, preserving every recipe and history.
-- Public menu records and subsequently created engineering recipes are excluded.
begin;
do $archive$
declare actor uuid; prior_sub text=current_setting('request.jwt.claim.sub',true);
begin
 if not exists(select 1 from public.menu_items104 where created_at='2026-09-27 11:44:52.669984+00' and data->>'code'='MENU-01' and data->>'name'='Tofu Garden Bowl') then return;end if;
 select id into actor from public.profiles where role='admin' and status='active' order by id limit 1;
 if actor is null then raise exception 'An active restaurant administrator is required to archive the confirmed samples';end if;
 perform set_config('request.jwt.claim.sub',actor::text,true);
 with samples(code,name) as (values
  ('MENU-01','Tofu Garden Bowl'),
  ('MENU-02','Chickpea Nourish Bowl'),
  ('MENU-03','Black Bean Bowl'),
  ('MENU-04','Mushroom Rice Bowl'),
  ('MENU-05','Classic Bean Burger'),
  ('MENU-06','Tofu Burger'),
  ('MENU-07','Mushroom Burger'),
  ('MENU-08','Avocado Sandwich'),
  ('MENU-09','Chickpea Sandwich'),
  ('MENU-10','Tofu Club Sandwich'),
  ('MENU-11','Bean Burrito'),
  ('MENU-12','Tofu Wrap'),
  ('MENU-13','Tomato Mushroom Pasta'),
  ('MENU-14','Creamy Coconut Pasta'),
  ('MENU-15','Banana Date Smoothie'),
  ('MENU-16','Mango Smoothie'),
  ('MENU-17','Berry Smoothie'),
  ('MENU-18','Peanut Banana Smoothie'),
  ('MENU-19','Lemon Ginger Refresher'),
  ('MENU-20','Carrot Ginger Refresher')
 )
 update public.menu_items104 m set data=m.data||jsonb_build_object('active',false,'stage131','archived','legacySample133',true,'archiveReason133','Original sample recipe; not part of the public restaurant menu','activeBeforeArchive133',m.data->'active'),version=m.version+1
 from samples s where m.data->>'code'=s.code and m.data->>'name'=s.name
 and m.created_at='2026-09-27 11:44:52.669984+00'
 and m.data->>'storefrontManaged131' is distinct from 'true'
 and not exists(select 1 from public.storefront_items127 w where w.menu_item_id=m.id)
 and m.data->>'legacySample133' is distinct from 'true';
 -- These seed-only names do not occur in the original public ingredient list.
 -- Keep any ingredient subsequently used by a real recipe or kitchen formula.
 with samples(code,name) as (values
  ('ING-01','Brown rice'),
  ('ING-02','Firm tofu'),
  ('ING-03','Cooked black beans'),
  ('ING-04','Cooked chickpeas'),
  ('ING-06','Tomato'),
  ('ING-07','Carrot'),
  ('ING-09','Wholegrain bread'),
  ('ING-10','Burger bun'),
  ('ING-11','Tortilla'),
  ('ING-12','Dry pasta'),
  ('ING-13','Mushrooms'),
  ('ING-17','Mixed berries'),
  ('ING-18','Oat milk'),
  ('ING-19','Pitted dates'),
  ('ING-23','Potato'),
  ('ING-24','Cooking oil'),
  ('ING-25','House sauce'),
  ('ING-26','Onion'),
  ('ING-28','Food packaging')
 )
 update public.menu_ingredients105 i set data=i.data||jsonb_build_object('active',false,'stage131','archived','legacySample133',true,'archiveReason133','Unused sample ingredient; not in the original public ingredient list','activeBeforeArchive133',i.data->'active'),version=i.version+1
 from samples s where i.data->>'code'=s.code and i.data->>'name'=s.name
 and i.created_at='2026-09-27 11:44:52.669984+00' and i.data->>'legacySample133' is distinct from 'true'
 and not exists(select 1 from public.menu_items104 m where m.data->>'stage131' is distinct from 'archived' and (
 exists(select 1 from jsonb_array_elements(coalesce(m.data->'recipe','[]')) l where l->>'itemId'=i.id::text)
 or exists(select 1 from jsonb_array_elements(coalesce(m.data->'posOptions118','[]')) g cross join lateral jsonb_array_elements(coalesce(g->'options','[]')) o cross join lateral jsonb_array_elements(coalesce(o->'recipe','[]')) l where l->>'itemId'=i.id::text)))
 and not exists(select 1 from public.restaurant_preparations132 p cross join lateral jsonb_array_elements(p.inputs) l where l->>'ingredientId'=i.id::text);
 perform set_config('request.jwt.claim.sub',coalesce(prior_sub,''),true);
end $archive$;
commit;
