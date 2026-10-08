-- Apply after setup/106-install.sql and payroll setup/83.
-- Adds version-checked deletion, server-side history protection, a deletion audit,
-- and sales snapshots for menu engineering. Does not delete or seed any records.
begin;
create table if not exists public.record_deletions108 (
 id uuid primary key default gen_random_uuid(), table_name text not null,
 record_id uuid not null, record_data jsonb not null, deleted_at timestamptz not null default now(),
 deleted_by uuid not null default auth.uid()
);
alter table public.record_deletions108 enable row level security;
drop policy if exists admin_read108 on public.record_deletions108;
create policy admin_read108 on public.record_deletions108 for select to authenticated using(public.is_admin());
grant select on public.record_deletions108 to authenticated;
revoke insert,update,delete on public.record_deletions108 from authenticated,anon;
create table if not exists public.menu_sales108 (
 id uuid primary key default gen_random_uuid(), data jsonb not null,
 version integer not null default 1, created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(), created_by uuid default auth.uid(), updated_by uuid default auth.uid()
);
create unique index if not exists menu_sales_product_date108 on public.menu_sales108 ((data->>'productId'),(data->>'date'));
alter table public.menu_sales108 enable row level security;
drop policy if exists admin_sales108 on public.menu_sales108;
create policy admin_sales108 on public.menu_sales108 for all to authenticated using(public.is_admin()) with check(public.is_admin());
grant select,insert,update,delete on public.menu_sales108 to authenticated;
create or replace function public.guard_sales108() returns trigger language plpgsql set search_path=public as $$
begin
 if not public.is_admin() then raise exception 'Administrator access required'; end if;
 if tg_op='UPDATE' and new.version<>old.version+1 then raise exception 'Record version conflict'; end if;
 if (new.data->>'date')::date is null or (new.data->>'quantity')::numeric<=0 or (new.data->>'unitCost')::numeric<=0 or (new.data->>'revenue')::numeric<0 or not (new.data ?& array['date','quantity','unitCost','revenue','productId','currency']) then raise exception 'Invalid sales values'; end if;
 if not exists(select 1 from public.menu_items104 where id::text=new.data->>'productId' and data->>'currency'=new.data->>'currency') then raise exception 'Product or currency no longer matches'; end if;
 new.updated_at=now();new.updated_by=auth.uid();return new;
end $$;
drop trigger if exists guard_sales108 on public.menu_sales108;
create trigger guard_sales108 before insert or update on public.menu_sales108 for each row execute function public.guard_sales108();
create or replace function public.guard_delete108() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if not public.is_admin() then raise exception 'Administrator access required'; end if;
 if tg_table_name='payroll_runs' and old.data->>'status'='finalized' then raise exception 'Finalized payroll is immutable. Use a correction run.'; end if;
 if tg_table_name='payroll_employees' then
  lock table public.payroll_leave_records,public.payroll_runs in share row exclusive mode;
  if exists(select 1 from public.payroll_leave_records where data->>'employeeId'=old.id::text)
   or exists(select 1 from public.payroll_runs r cross join lateral jsonb_array_elements(coalesce(r.data->'rows','[]')) e where e->>'employeeId'=old.id::text)
   or jsonb_array_length(coalesce(old.data->'contracts99','[]'))>0 or jsonb_array_length(coalesce(old.data->'assessments99','[]'))>0 then raise exception 'Employee has linked history. Archive instead.'; end if;
 end if;
 if tg_table_name='payroll_leave_records' then
  lock table public.payroll_runs in share row exclusive mode;
  if old.data->>'status'='approved' then raise exception 'Cancel an approved leave record before deleting it.'; end if;
  if exists(select 1 from public.payroll_runs r cross join lateral jsonb_array_elements(coalesce(r.data->'rows','[]')) e where r.data->>'status'='finalized' and r.data->>'month'=old.data->>'month' and e->>'employeeId'=old.data->>'employeeId') then raise exception 'Leave included in finalized payroll is immutable.'; end if;
 end if;
 if tg_table_name in ('menu_items104','menu_ingredients105','menu_categories104') then
  lock table public.menu_items104,public.menu_sales108 in share row exclusive mode;
  if tg_table_name='menu_categories104' and exists(select 1 from public.menu_items104 where data->>'category'=old.id::text) then raise exception 'Category is in use.'; end if;
  if tg_table_name in ('menu_items104','menu_ingredients105') and exists(select 1 from public.menu_items104 m cross join lateral jsonb_array_elements(coalesce(m.data->'recipe','[]')) line where line->>'itemId'=old.id::text) then raise exception 'Component is used in a recipe or bundle.'; end if;
  if tg_table_name='menu_items104' and exists(select 1 from public.menu_sales108 where data->>'productId'=old.id::text) then raise exception 'Product has sales history. Make it unavailable instead.'; end if;
 end if;
 if tg_table_name='inventory_items104' then
  lock table public.inventory_movements104 in share row exclusive mode;
  if exists(select 1 from public.inventory_movements104 where data->>'itemId'=old.id::text) then raise exception 'Stock movements exist. Make the item inactive instead.'; end if;
 end if;
 insert into public.record_deletions108(table_name,record_id,record_data) values(tg_table_name,old.id,to_jsonb(old));
 return old;
end $$;
do $$ declare t text;begin
 foreach t in array array['payroll_employees','payroll_leave_records','payroll_runs','operational_reports','company_documents105','inventory_items104','menu_ingredients105','menu_items104','menu_categories104','menu_sales108'] loop
  execute format('drop trigger if exists guard_delete108 on public.%I',t);
  execute format('create trigger guard_delete108 before delete on public.%I for each row execute function public.guard_delete108()',t);
 end loop;
end $$;
create or replace function public.delete_record108(p_table text,p_id uuid,p_version integer) returns boolean language plpgsql security invoker set search_path=public,pg_temp as $$
declare count_deleted integer;
begin
 if not public.is_admin() then raise exception 'Administrator access required'; end if;
 if p_table<>all(array['payroll_employees','payroll_leave_records','payroll_runs','operational_reports','company_documents105','inventory_items104','menu_ingredients105','menu_items104','menu_categories104','menu_sales108']) then raise exception 'Record type does not support deletion'; end if;
 execute format('delete from public.%I where id=$1 and version=$2',p_table) using p_id,p_version;
 get diagnostics count_deleted=row_count;
 if count_deleted<>1 then raise exception 'Record changed or was already deleted. Reload before trying again.'; end if;
 return true;
end $$;
revoke all on function public.delete_record108(text,uuid,integer) from public;
grant execute on function public.delete_record108(text,uuid,integer) to authenticated;
create unique index if not exists inventory_one_reversal108 on public.inventory_movements104 ((data->>'reverses108')) where data ? 'reverses108';
notify pgrst,'reload schema';
commit;
