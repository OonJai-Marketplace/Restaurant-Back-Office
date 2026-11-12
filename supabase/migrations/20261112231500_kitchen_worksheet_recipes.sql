-- Operational worksheets stay in the authenticated Kitchen catalog.
create table public.restaurant_kitchen_worksheets (
  menu_id uuid primary key references public.menu_items104(id) on delete cascade,
  sections jsonb not null check (jsonb_typeof(sections) = 'array')
);
alter table public.restaurant_kitchen_worksheets enable row level security;
revoke all on public.restaurant_kitchen_worksheets from public, anon, authenticated;
grant select on public.restaurant_kitchen_worksheets to authenticated;
create policy kitchen_worksheet_read on public.restaurant_kitchen_worksheets
  for select to authenticated using (
    (select public.restaurant_tab_can125('inventory', 'inv-preparation124'))
    or (select public.restaurant_tab_can125('menu', 'menu-recipe'))
  );
