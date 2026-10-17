begin;
-- Public menu prices and choices are authoritative. Private quantities remain private.
drop trigger sync_storefront_recipe127 on public.menu_items104;
-- Channel selection is independent; lifecycle overrides both channels.
alter table public.storefront_items127 add column pos_visible131 boolean not null default true,
 add column stage131 text not null default 'active' check(stage131 in ('active','development','archived'));
alter table public.storefront_items127 alter column pos_visible131 set default false,
 alter column published set default false, alter column stage131 set default 'development';
alter policy storefront_public_read on public.storefront_items127 using(published and available and stage131='active');
create unique index storefront_recipe_unique131 on public.storefront_items127(menu_item_id) where menu_item_id is not null;
create or replace function restaurant_private.guard_storefront127() returns trigger language plpgsql security invoker set search_path='' as $$
declare image jsonb;begin
 if tg_op='UPDATE' and new.version<>old.version+1 then raise exception 'Content changed. Reload before saving.';
 elsif tg_op='INSERT' and new.version<>1 then raise exception 'New content must start at version 1';end if;
 new.updated_at=now();
 if tg_table_name='storefront_items127' then
  for image in select value from jsonb_array_elements(new.images) loop
   if jsonb_typeof(image)<>'string' or (image#>>'{}') !~ '^(https://[^[:space:]<>"'']+|assets/images/[a-zA-Z0-9._/-]+|data:image/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+)$' then raise exception 'Use HTTPS, a site image, or an uploaded PNG/JPEG/WebP';end if;
  end loop;
 end if;return new;
end$$;
create function restaurant_private.pos_public_data131(s jsonb,previous jsonb) returns jsonb language plpgsql immutable security invoker set search_path='' as $$
declare rules jsonb := $rules${"extraPrice": 7000, "choices": {"sauces": [{"id": "garlic-mayo", "name": "Garlic mayo"}, {"id": "basil-mayo", "name": "Basil mayo"}, {"id": "chili-mayo", "name": "Chili mayo"}, {"id": "tahini-sauce", "name": "Tahini sauce"}, {"id": "hummus", "name": "Hummus"}, {"id": "cheese-sauce", "name": "Cheese sauce"}], "veggies": [{"id": "grilled-mushrooms", "name": "Grilled mushrooms"}, {"id": "grilled-bell-peppers", "name": "Grilled bell peppers"}, {"id": "grilled-eggplant", "name": "Grilled eggplant"}, {"id": "caramelized-onion", "name": "Caramelized onion"}, {"id": "microgreens", "name": "Microgreens"}, {"id": "avocado", "name": "Avocado"}, {"id": "lettuce", "name": "Lettuce"}, {"id": "tomatoes", "name": "Tomatoes"}, {"id": "onions", "name": "Onions"}, {"id": "carrots", "name": "Carrots"}, {"id": "olives", "name": "Olives"}, {"id": "corn", "name": "Corn"}], "proteins": [{"id": "beans", "name": "Beans"}, {"id": "sautéed-tofu", "name": "Sautéed tofu"}, {"id": "lemon-chicken", "name": "Lemon chicken"}, {"id": "ground-meat", "name": "Ground meat"}, {"id": "spicy-sausage", "name": "Spicy sausage"}, {"id": "regular-sausage", "name": "Regular sausage"}, {"id": "falafel", "name": "Falafel"}], "wellness": [{"id": "summer-in-my-heart", "name": "Summer in My Heart"}, {"id": "wish-upon-a-heart", "name": "Wish Upon a Heart"}, {"id": "heartwarmer", "name": "Heartwarmer"}, {"id": "red-heart", "name": "Red Heart"}], "sandwichProteins": [{"id": "sautéed-tofu", "name": "Sautéed tofu"}, {"id": "lemon-chicken", "name": "Lemon chicken"}, {"id": "ground-meat", "name": "Ground meat"}, {"id": "spicy-sausage", "name": "Spicy sausage"}, {"id": "regular-sausage", "name": "Regular sausage"}]}, "categories": {"burgers": "Burgers", "sandwiches": "Sandwiches", "texmex": "Tex-Mex", "pasta": "Pasta", "bowl": "Build Your Bowl", "smoothies": "Smoothies", "refreshers": "Refreshers", "wellness": "Wellness Drinks"}}$rules$; groups jsonb='[]';g jsonb;o jsonb;prior jsonb;options jsonb;k text;included integer;maximum integer;custom boolean=coalesce((s->'options'->>'isCustom')::boolean,false); names jsonb;image text=s->'images'->>0;
begin
 if custom then
  foreach k in array array['sauces','veggies','proteins','wellness'] loop
   if k='wellness' and coalesce((s->'options'->>'needsWellnessChoice')::boolean,false)=false then continue;end if;
   names=rules->'choices'->case when k='proteins' and s->'options'->>'specificProteins'='sandwichProteins' then 'sandwichProteins' else k end;
   included=case k when 'sauces' then (s->'options'->>'maxSauces')::integer when 'veggies' then (s->'options'->>'maxVeggies')::integer when 'proteins' then (s->'options'->>'maxProteins')::integer else 1 end;
   if included is null or included<0 or included>jsonb_array_length(names) then raise exception 'Invalid public menu choice allowances';end if;
   maximum=case when k in ('sauces','wellness') then included else jsonb_array_length(names) end;
   options='[]';
   for o in select value from jsonb_array_elements(names) loop
    select v into prior from jsonb_array_elements(coalesce(previous->'posOptions118','[]')) pg cross join lateral jsonb_array_elements(pg->'options') v where pg->>'id'=k and v->>'id'=o->>'id';
    options=options||jsonb_build_array(coalesce(prior,'{}')||o||jsonb_build_object('price',0,'recipe',coalesce(prior->'recipe','[]')));
   end loop;
   select value into g from jsonb_array_elements(coalesce(previous->'posOptions118','[]')) where value->>'id'=k;
   g=coalesce(g,'{}')||jsonb_build_object('id',k,'name',case k when 'sauces' then 'Sauces' when 'veggies' then 'Vegetables' when 'proteins' then 'Proteins' else 'Wellness drink' end,'min',case when k='wellness' then 1 else 0 end,'max',maximum,'options',options);
   if k<>'wellness' then g=g||jsonb_build_object('included',included,'extraPrice',case when k='sauces' then 0 else (rules->>'extraPrice')::numeric end);end if;
   groups=groups||jsonb_build_array(g);
  end loop;
 end if;
 if previous->>'storefrontManaged131' is distinct from 'true' and jsonb_array_length(coalesce(previous->'posOptions118','[]'))>0 then previous=previous||jsonb_build_object('legacyPosOptions131',previous->'posOptions118');end if;
 return previous||jsonb_build_object('name',s->>'name','price',(s->>'price')::numeric,'currency','LAK','active',coalesce((s->>'pos_visible131')::boolean,false) and coalesce((s->>'available')::boolean,true) and s->>'stage131'='active','posVisible131',coalesce((s->>'pos_visible131')::boolean,false),'publicVisible131',coalesce((s->>'published')::boolean,false),'stage131',s->>'stage131','description',s->>'description','sourceIngredients',s->>'description','sourceMenu118',s->>'id','storefrontManaged131',true,'publicPosition131',(s->>'position')::integer,'sourceCategory131',s->>'category','posCustom118',custom,'posOptions118',groups,'photoData',case when image like 'data:image/%' then image else '' end,'photoUrl',case when image like 'assets/images/%' then 'public-restaurant/'||image when image like 'https://%' then image else '' end);
end$$;
revoke all on function restaurant_private.pos_public_data131(jsonb,jsonb) from public,anon;
-- Pure transformation of supplied values; no database reads or privileged access.
grant execute on function restaurant_private.pos_public_data131(jsonb,jsonb) to authenticated;
create function restaurant_private.sync_public_pos131() returns trigger language plpgsql security invoker set search_path='' as $$
declare m public.menu_items104;category_id uuid;category_name text;rules jsonb := $rules${"extraPrice": 7000, "choices": {"sauces": [{"id": "garlic-mayo", "name": "Garlic mayo"}, {"id": "basil-mayo", "name": "Basil mayo"}, {"id": "chili-mayo", "name": "Chili mayo"}, {"id": "tahini-sauce", "name": "Tahini sauce"}, {"id": "hummus", "name": "Hummus"}, {"id": "cheese-sauce", "name": "Cheese sauce"}], "veggies": [{"id": "grilled-mushrooms", "name": "Grilled mushrooms"}, {"id": "grilled-bell-peppers", "name": "Grilled bell peppers"}, {"id": "grilled-eggplant", "name": "Grilled eggplant"}, {"id": "caramelized-onion", "name": "Caramelized onion"}, {"id": "microgreens", "name": "Microgreens"}, {"id": "avocado", "name": "Avocado"}, {"id": "lettuce", "name": "Lettuce"}, {"id": "tomatoes", "name": "Tomatoes"}, {"id": "onions", "name": "Onions"}, {"id": "carrots", "name": "Carrots"}, {"id": "olives", "name": "Olives"}, {"id": "corn", "name": "Corn"}], "proteins": [{"id": "beans", "name": "Beans"}, {"id": "sautéed-tofu", "name": "Sautéed tofu"}, {"id": "lemon-chicken", "name": "Lemon chicken"}, {"id": "ground-meat", "name": "Ground meat"}, {"id": "spicy-sausage", "name": "Spicy sausage"}, {"id": "regular-sausage", "name": "Regular sausage"}, {"id": "falafel", "name": "Falafel"}], "wellness": [{"id": "summer-in-my-heart", "name": "Summer in My Heart"}, {"id": "wish-upon-a-heart", "name": "Wish Upon a Heart"}, {"id": "heartwarmer", "name": "Heartwarmer"}, {"id": "red-heart", "name": "Red Heart"}], "sandwichProteins": [{"id": "sautéed-tofu", "name": "Sautéed tofu"}, {"id": "lemon-chicken", "name": "Lemon chicken"}, {"id": "ground-meat", "name": "Ground meat"}, {"id": "spicy-sausage", "name": "Spicy sausage"}, {"id": "regular-sausage", "name": "Regular sausage"}]}, "categories": {"burgers": "Burgers", "sandwiches": "Sandwiches", "texmex": "Tex-Mex", "pasta": "Pasta", "bowl": "Build Your Bowl", "smoothies": "Smoothies", "refreshers": "Refreshers", "wellness": "Wellness Drinks"}}$rules$;begin
 if not restaurant_private.is_admin() then raise exception 'Administrator access required';end if;
 category_name=rules->'categories'->>new.category;
 select id into category_id from public.menu_categories104 where lower(data->>'name')=lower(category_name) order by id limit 1;
 if category_id is null then insert into public.menu_categories104(data) values(jsonb_build_object('code','WEB-CAT-'||upper(new.category),'name',category_name)) returning id into category_id;end if;
 if new.menu_item_id is not null then select * into m from public.menu_items104 where id=new.menu_item_id for update;
 else select * into m from public.menu_items104 where data->>'sourceMenu118'=new.id order by id limit 1 for update;end if;
 if m.id is not null and exists(select 1 from public.storefront_items127 where menu_item_id=m.id and id<>new.id) then raise exception 'This recipe already belongs to another public menu item';end if;
 if m.id is null then
  insert into public.menu_items104(data) values(restaurant_private.pos_public_data131(to_jsonb(new),jsonb_build_object('code','WEB-'||upper(new.id),'recipe','[]'::jsonb,'posSetupPending120',true,'itemType','single'))||jsonb_build_object('category',category_id)) returning id into new.menu_item_id;
 else
  update public.menu_items104 set data=restaurant_private.pos_public_data131(to_jsonb(new),m.data)||jsonb_build_object('category',category_id),version=version+1 where id=m.id;new.menu_item_id=m.id;
 end if;return new;
end$$;
revoke all on function restaurant_private.sync_public_pos131() from public,anon,authenticated;
create trigger zz_sync_public_pos131 before insert or update on public.storefront_items127 for each row execute function restaurant_private.sync_public_pos131();
-- Direct recipe edits retain private quantities, while public prices/choices stay authoritative.
create function restaurant_private.retain_public_menu131() returns trigger language plpgsql security definer set search_path='' as $$
declare s public.storefront_items127;begin
 if pg_trigger_depth()>1 then return new;end if;
 select * into s from public.storefront_items127 where menu_item_id=new.id limit 1;
 if s.id is not null then new.data=restaurant_private.pos_public_data131(to_jsonb(s),new.data);end if;return new;
end$$;
revoke all on function restaurant_private.retain_public_menu131() from public,anon,authenticated;
create trigger zz_retain_public_menu131 before update on public.menu_items104 for each row execute function restaurant_private.retain_public_menu131();
create function public.pos_sync_public_catalog131() returns jsonb language plpgsql security invoker set search_path='' as $$
declare ingredient text;names jsonb := $names$["Grilled mushrooms", "Grilled bell peppers", "Grilled eggplant", "Caramelized onion", "Microgreens", "Avocado", "Lettuce", "Tomatoes", "Onions", "Carrots", "Olives", "Corn", "Beans", "Sautéed tofu", "Lemon chicken", "Ground meat", "Spicy sausage", "Regular sausage", "Falafel", "Garlic mayo", "Basil mayo", "Chili mayo", "Tahini sauce", "Hummus", "Cheese sauce", "Meaty patty", "Pickles", "Fries", "Grilled pineapple", "Mint", "Cilantro", "Grilled tofu", "Sautéed veggies", "Plant-based chicken", "Flour tortilla", "Pico de gallo", "Black beans", "Peanut butter", "Coconut milk", "Banana", "Pineapple", "Spinach", "Dates", "Mango", "Strawberry", "Passion fruit", "Mulberry", "Cocoa powder", "Lime", "Sparkling water", "Honey", "Pineapple juice", "Coconut water", "Green apple", "Basil cordial", "Lemon juice", "Tapioca pearls", "Ginger", "Turmeric tea", "Chia seeds", "Lemongrass cordial", "Lemon", "Beetroot", "Apple"]$names$;begin
 if not restaurant_private.is_admin() then raise exception 'Administrator access required';end if;
 perform pg_advisory_xact_lock(131,131);
 for ingredient in select jsonb_array_elements_text(names) loop
  if not exists(select 1 from public.menu_ingredients105 where lower(data->>'name')=lower(ingredient)) then
   insert into public.menu_ingredients105(data) values(jsonb_build_object('code','WEB-ING-'||upper(regexp_replace(ingredient,'[^a-zA-Z0-9]+','-','g')),'name',ingredient,'unit','each','currency','LAK','active',false,'cost',0,'purchasePrice',0,'purchaseQuantity',1,'sourceNote120','Public menu ingredient name; enter the actual unit, cost and stock link before consumption.'));
  end if;
 end loop;
 update public.storefront_items127 set version=version+1;
 return jsonb_build_object('menu',(select count(*) from public.menu_items104 where data->>'storefrontManaged131'='true'),'custom',(select count(*) from public.menu_items104 where data->>'storefrontManaged131'='true' and data->>'posCustom118'='true'));
end$$;
revoke all on function public.pos_sync_public_catalog131() from public,anon;
grant execute on function public.pos_sync_public_catalog131() to authenticated;
notify pgrst,'reload schema';
commit;
