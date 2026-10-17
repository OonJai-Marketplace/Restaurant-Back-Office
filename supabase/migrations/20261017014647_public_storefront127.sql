-- Public content is a narrow projection; recipes, inventory and staff stay private.
begin;
do $$begin
 if to_regclass('public.accounts') is not null or to_regclass('public.restaurant_members121') is null then
  raise exception 'Apply only to the independent Restaurant project';
 end if;
end$$;
create table public.storefront_items127 (
 id text primary key check(id ~ '^[a-zA-Z0-9_-]{1,60}$'),
 category text not null check(category in ('burgers','sandwiches','texmex','pasta','bowl','smoothies','refreshers','wellness')),
 name text not null check(length(trim(name)) between 1 and 150),
 description text not null default '' check(length(description)<=3000),
 price numeric not null check(price>=0 and price<=1000000000),
 images jsonb not null default '[]' check(jsonb_typeof(images)='array' and jsonb_array_length(images)<=6 and octet_length(images::text)<=2000000),
 options jsonb not null default '{}' check(jsonb_typeof(options)='object' and options - array['isCustom','maxSauces','maxVeggies','maxProteins','specificProteins','needsWellnessChoice']::text[]='{}'),
 published boolean not null default true,
 available boolean not null default true,
 position integer not null default 0,
 menu_item_id uuid references public.menu_items104(id) on delete restrict,
 version integer not null default 1 check(version>0),
 updated_at timestamptz not null default now()
);
create index storefront_items127_recipe on public.storefront_items127(menu_item_id) where menu_item_id is not null;
alter table public.storefront_items127 enable row level security;
revoke all on public.storefront_items127 from public,anon,authenticated;
grant select(id,category,name,description,price,images,options,position) on public.storefront_items127 to anon;
grant select,insert,update,delete on public.storefront_items127 to authenticated;
grant all on public.storefront_items127 to service_role;
create policy storefront_public_read on public.storefront_items127 for select to anon using(published and available);
create policy storefront_admin on public.storefront_items127 for all to authenticated using((select restaurant_private.is_admin())) with check((select restaurant_private.is_admin()));

create table public.storefront_content127 (
 id boolean primary key default true check(id),
 title text not null default 'Welcome to Oon Jai Marketplace' check(length(title)<=200),
 subtitle text not null default 'Where every meal supports hope, health, and community' check(length(subtitle)<=500),
 intro_title text not null default 'Nourish - Inspire - Connect' check(length(intro_title)<=200),
 intro_text text not null default 'Discover what makes Oon Jai special — enjoy wholesome food, find encouragement through Words of Hope, and stay connected with our growing community.' check(length(intro_text)<=3000),
 announcement text not null default '' check(length(announcement)<=1000),
 phone text not null default '8562057048174' check(phone ~ '^[0-9]{6,18}$'),
 messenger text not null default 'oon.jai.laos' check(messenger ~ '^[a-zA-Z0-9._-]{1,100}$'),
 version integer not null default 1,
 updated_at timestamptz not null default now()
);
alter table public.storefront_content127 enable row level security;
revoke all on public.storefront_content127 from public,anon,authenticated;
grant select on public.storefront_content127 to anon;
grant select,update on public.storefront_content127 to authenticated;
grant all on public.storefront_content127 to service_role;
create policy storefront_content_read on public.storefront_content127 for select to anon using(true);
create policy storefront_content_admin on public.storefront_content127 for all to authenticated using((select restaurant_private.is_admin())) with check((select restaurant_private.is_admin()));

create function restaurant_private.guard_storefront127() returns trigger language plpgsql security invoker set search_path='' as $$
declare recipe jsonb; image jsonb;begin
 if tg_op='UPDATE' then
  if new.version<>old.version+1 then raise exception 'Content changed. Reload before saving.';end if;
 elsif new.version<>1 then raise exception 'New content must start at version 1';end if;
 new.updated_at=now();
 if tg_table_name='storefront_items127' then
  for image in select value from jsonb_array_elements(new.images) loop
   if jsonb_typeof(image)<>'string' or (image#>>'{}') !~ '^(https://[^[:space:]<>"'']+|assets/images/[a-zA-Z0-9._/-]+|data:image/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+)$' then raise exception 'Use HTTPS, a site image, or an uploaded PNG/JPEG/WebP';end if;
  end loop;
  if new.menu_item_id is not null then
   select data into recipe from public.menu_items104 where id=new.menu_item_id;
   if recipe is null or coalesce(recipe->>'currency','LAK')<>'LAK' then raise exception 'Link a Restaurant recipe priced in LAK';end if;
   new.price=(recipe->>'price')::numeric;
   new.available=coalesce((recipe->>'active')::boolean,true);
  end if;
 end if;
 return new;
end$$;
revoke all on function restaurant_private.guard_storefront127() from public,anon,authenticated;
create trigger storefront_guard127 before insert or update on public.storefront_items127 for each row execute function restaurant_private.guard_storefront127();
create trigger storefront_content_guard127 before update on public.storefront_content127 for each row execute function restaurant_private.guard_storefront127();

-- The private trigger copies only public price/availability, never the recipe body.
create function restaurant_private.sync_storefront_recipe127() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if coalesce(new.data->>'currency','LAK')<>'LAK' and exists(select 1 from public.storefront_items127 where menu_item_id=new.id) then
  raise exception 'Unlink the public menu item before changing its currency from LAK';
 end if;
 if new.data->'price' is distinct from old.data->'price' or new.data->'active' is distinct from old.data->'active' then
  update public.storefront_items127 set price=(new.data->>'price')::numeric,available=coalesce((new.data->>'active')::boolean,true),version=version+1 where menu_item_id=new.id;
 end if;
 return new;
end$$;
revoke all on function restaurant_private.sync_storefront_recipe127() from public,anon,authenticated;
create trigger sync_storefront_recipe127 after update on public.menu_items104 for each row execute function restaurant_private.sync_storefront_recipe127();
insert into public.storefront_content127(id) values(true);
-- Public-catalog seed is appended from the preserved public website. No recipes are overwritten.
insert into public.storefront_items127(id,category,name,price,description,images,options,position) select id,category,name,price,description,images,options,position from jsonb_to_recordset($catalog127$[{"id":"b1","category":"burgers","name":"Burger Combo","price":199000,"description":"The Classic Burger + Mint Pineapple Refresher + Lemon Oat Cookie.","images":["assets/images/burger-combo-1-full.d9dca0b9e9.webp"],"options":{},"position":0},{"id":"b2","category":"burgers","name":"The Classic","price":120000,"description":"Meaty patty, lettuce, tomato, onion, pickles, garlic mayo, and cheese sauce. Served with a portion of fries.","images":["assets/images/classic-1-full.a7893f03e0.webp"],"options":{},"position":1},{"id":"b3","category":"burgers","name":"The Cheeser","price":110000,"description":"Meaty patty, tomato, garlic mayo, and cheese sauce. Served with a portion of fries.","images":["https://i.postimg.cc/v87p8m4T/cheeser.webp"],"options":{},"position":2},{"id":"b4","category":"burgers","name":"The Bougie","price":130000,"description":"Meaty patty, microgreens, tomato, caramelized onion, sautéed mushroom, grilled pineapple, and basil mayo. Served with a portion of fries.","images":["assets/images/bougie-1-full.69f1d28ecd.webp"],"options":{},"position":3},{"id":"b5","category":"burgers","name":"French Fries","price":60000,"description":"Crispy golden French fries with seasoning.","images":["assets/images/placeholder-french-fries.56d2c70569.svg"],"options":{},"position":4},{"id":"s1","category":"sandwiches","name":"Sandwich Combo","price":180000,"description":"Chickelicious sandwich + Paradise Point Refresher + Brownie.","images":["assets/images/chickelious-1-full.89a0d01486.webp"],"options":{},"position":0},{"id":"s2","category":"sandwiches","name":"Mediterranean","price":105000,"description":"Falafel, hummus, tahini sauce, tomato, pickles, mint, and cilantro.","images":["assets/images/mediteranian-1-full.0b58ddcbc9.webp"],"options":{},"position":1},{"id":"s3","category":"sandwiches","name":"Italian","price":105000,"description":"Grilled tofu, sautéed veggies, tomato, lettuce, onion, and basil mayo.","images":["assets/images/italian-1-full.849cf0670b.webp"],"options":{},"position":2},{"id":"s4","category":"sandwiches","name":"Chickelicious","price":110000,"description":"Plant-based chicken, caramelized onion, olives, microgreens, tomato, cheese sauce, and basil mayo.","images":["assets/images/chickelious-1-full.89a0d01486.webp"],"options":{},"position":3},{"id":"s5","category":"sandwiches","name":"Build Your Own Sandwich","price":110000,"description":"Customizable sandwich. Choose your sauces, veggies, and protein.","images":["assets/images/placeholder-byo-sandwich.dfbb1b0122.svg"],"options":{"isCustom":true,"maxSauces":2,"maxVeggies":3,"maxProteins":1,"specificProteins":"sandwichProteins"},"position":4},{"id":"tx1","category":"texmex","name":"Tex-Mex Combo","price":210000,"description":"Tacos + Quesadilla + Mint Pineapple Refresher.","images":["assets/images/tex-mex-combo-1-full.3be46349e4.webp"],"options":{},"position":0},{"id":"tx2","category":"texmex","name":"Quesadilla","price":85000,"description":"Flour tortilla with cheese sauce, ground meat, and pico de gallo.","images":["assets/images/review-3-full.447f2d1f52.webp"],"options":{},"position":1},{"id":"tx3","category":"texmex","name":"Tacos","price":99000,"description":"Two soft shell tacos filled with ground meat or black beans, grilled bell pepper, avocado, pico de gallo, and cheese sauce.","images":["assets/images/review-3-full.447f2d1f52.webp"],"options":{},"position":2},{"id":"p1","category":"pasta","name":"Miso-Seaweed","price":110000,"description":"Herb, fresh, vibrant, and aromatic miso-seaweed fusion.","images":["assets/images/miso-pasta-1-full.52d03c78fc.webp"],"options":{},"position":0},{"id":"p2","category":"pasta","name":"Carbonara","price":110000,"description":"Rich and creamy pasta made with peanut butter and coconut milk.","images":["assets/images/carbonara-1-full.5a711363e4.webp"],"options":{},"position":1},{"id":"p3","category":"pasta","name":"Spaghetti","price":110000,"description":"Classic spaghetti packed with fresh, bright tomato goodness.","images":["assets/images/spaghetti-1-full.ceeb5d7c53.webp"],"options":{},"position":2},{"id":"p4","category":"pasta","name":"Pesto Pasta","price":110000,"description":"Herb, fresh, vibrant, and aromatic basil pesto.","images":["assets/images/pesto-1-full.ab8b99c070.webp"],"options":{},"position":3},{"id":"bw1","category":"bowl","name":"Bowl Combo","price":160000,"description":"Protein pack + Wellness drink of your choice + Banana bread.","images":["assets/images/bowl-combo-full.4bf98ebc33.webp"],"options":{"isCustom":true,"maxSauces":2,"maxVeggies":4,"maxProteins":2,"needsWellnessChoice":true},"position":0},{"id":"bw2","category":"bowl","name":"Veggie Pack","price":110000,"description":"Includes 2 sauces, 5 veggies, and 1 protein. Additional choices (+7,000 Kip each).","images":["assets/images/build-your-own-full.0ec7dfadd3.webp"],"options":{"isCustom":true,"maxSauces":2,"maxVeggies":5,"maxProteins":1},"position":1},{"id":"bw3","category":"bowl","name":"Protein Pack","price":115000,"description":"Includes 2 sauces, 4 veggies, and 2 proteins. Additional choices (+7,000 Kip each).","images":["assets/images/build-your-own-full.0ec7dfadd3.webp"],"options":{"isCustom":true,"maxSauces":2,"maxVeggies":4,"maxProteins":2},"position":2},{"id":"bw4","category":"bowl","name":"Mini Pack","price":99000,"description":"Includes 1 sauce, 3 veggies, and 1 protein. Additional choices (+7,000 Kip each).","images":["assets/images/build-your-own-full.0ec7dfadd3.webp"],"options":{"isCustom":true,"maxSauces":1,"maxVeggies":3,"maxProteins":1},"position":3},{"id":"sm1","category":"smoothies","name":"Kickstart","price":70000,"description":"Banana, pineapple, and spinach. No ice or sugar added, sweetened by dates.","images":["assets/images/kickstart-full.c0755e222e.webp"],"options":{},"position":0},{"id":"sm2","category":"smoothies","name":"Fruitopia","price":70000,"description":"Mango, strawberry, and pineapple. No ice or sugar added, sweetened by dates.","images":["assets/images/fruitopia-full.986656e2a8.webp"],"options":{},"position":1},{"id":"sm3","category":"smoothies","name":"Paradise Point","price":70000,"description":"Passion fruit and pineapple. No ice or sugar added, sweetened by dates.","images":["assets/images/paradise-point-1-full.63d58ed0c9.webp"],"options":{},"position":2},{"id":"sm4","category":"smoothies","name":"Mary Jane","price":80000,"description":"Strawberry, mulberry, and banana. No ice or sugar added, sweetened by dates.","images":["assets/images/mary-jane-1-full.654593f767.webp"],"options":{},"position":3},{"id":"sm5","category":"smoothies","name":"Reese's Cup","price":70000,"description":"Banana, peanut butter, and cocoa powder. No ice or sugar added, sweetened by dates.","images":["assets/images/reese-s-cup-1-full.d7bf35bcaf.webp"],"options":{},"position":4},{"id":"r1","category":"refreshers","name":"Mint Pineapple","price":45000,"description":"Fresh mint and pineapple.","images":["assets/images/placeholder-mint-pineapple.09a8c35c73.svg"],"options":{},"position":0},{"id":"r2","category":"refreshers","name":"Strawberry Lemonade","price":50000,"description":"Strawberry and lime.","images":["assets/images/placeholder-strawberry-lemonade.129947a09b.svg"],"options":{},"position":1},{"id":"r3","category":"refreshers","name":"Sparkling Lime","price":45000,"description":"Sparkling water and fresh lime.","images":["assets/images/placeholder-sparkling-lime.110fc22dab.svg"],"options":{},"position":2},{"id":"r4","category":"refreshers","name":"Honey Passion","price":45000,"description":"Passion fruit and honey.","images":["assets/images/placeholder-honey-passion.7a30702f9a.svg"],"options":{},"position":3},{"id":"w1","category":"wellness","name":"Summer in My Heart","price":47000,"description":"Pineapple juice and coconut water.","images":["assets/images/summer-1-full.49e8ec999d.webp"],"options":{},"position":0},{"id":"w2","category":"wellness","name":"Wish Upon a Heart","price":47000,"description":"Green apple, basil cordial, lemon juice, and tapioca pearls.","images":["assets/images/wish-1-full.28e6039506.webp"],"options":{},"position":1},{"id":"w3","category":"wellness","name":"Heartwarmer","price":47000,"description":"Ginger and turmeric tea, lemon juice, honey, and chia seeds.","images":["assets/images/heartwarmer-1-full.d805be1e7a.webp"],"options":{},"position":2},{"id":"w4","category":"wellness","name":"Red Heart","price":47000,"description":"Lemongrass cordial, lemon, beetroot, and apple.","images":["assets/images/red-heart-1-full.f39a86f461.webp"],"options":{},"position":3}]$catalog127$::jsonb) as s(id text,category text,name text,price numeric,description text,images jsonb,options jsonb,position integer);
notify pgrst,'reload schema';
commit;
