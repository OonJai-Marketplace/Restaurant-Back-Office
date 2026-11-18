-- Extend the existing catalog projection without changing permissions or recipe quantities.
CREATE OR REPLACE FUNCTION restaurant_private.pos_public_data131(s jsonb, previous jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO ''
AS $function$
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
 if custom and s->'options' ? 'grains154' then
  names=s->'options'->'grains154';
  if jsonb_typeof(names)<>'array' or jsonb_array_length(names)>20 then raise exception 'Use up to 20 grain choices';end if;
  options='[]';
  for o in select value from jsonb_array_elements(names) loop
   if length(trim(coalesce(o->>'name','')))=0 or length(o->>'name')>60 or coalesce(o->>'id','')='' or coalesce(o->>'price','') !~ '^[0-9]+([.][0-9]{1,2})?$' or (o->>'price')::numeric>1000000000 then raise exception 'Enter a grain name and valid extra price';end if;
   select v into prior from jsonb_array_elements(coalesce(previous->'posOptions118','[]')) pg cross join lateral jsonb_array_elements(pg->'options') v where pg->>'id'='grains154' and v->>'id'=o->>'id';
   options=options||jsonb_build_array(coalesce(prior,'{}')||jsonb_build_object('id',o->>'id','name',o->>'name','price',(o->>'price')::numeric,'available',coalesce((o->>'available')::boolean,true),'recipe',coalesce(prior->'recipe','[]')));
  end loop;
  if jsonb_array_length(options)>0 then
   select value into g from jsonb_array_elements(coalesce(previous->'posOptions118','[]')) where value->>'id'='grains154';
   groups=groups||jsonb_build_array(coalesce(g,'{}')||jsonb_build_object('id','grains154','name','Grains','min',0,'max',1,'options',options));
  end if;
 end if;
 if previous->>'storefrontManaged131' is distinct from 'true' and jsonb_array_length(coalesce(previous->'posOptions118','[]'))>0 then previous=previous||jsonb_build_object('legacyPosOptions131',previous->'posOptions118');end if;
 return previous||jsonb_build_object('name',s->>'name','price',(s->>'price')::numeric,'currency','LAK','active',coalesce((s->>'pos_visible131')::boolean,false) and coalesce((s->>'available')::boolean,true) and s->>'stage131'='active','posVisible131',coalesce((s->>'pos_visible131')::boolean,false),'publicVisible131',coalesce((s->>'published')::boolean,false),'stage131',s->>'stage131','description',s->>'description','sourceIngredients',s->>'description','sourceMenu118',s->>'id','storefrontManaged131',true,'publicPosition131',(s->>'position')::integer,'sourceCategory131',s->>'category','posCustom118',custom,'posOptions118',groups,'photoData',case when image like 'data:image/%' then image else '' end,'photoUrl',case when image like 'assets/images/%' then 'public-restaurant/'||image when image like 'https://%' then image else '' end);
end$function$
;
