"""Build the independent Restaurant foundation from the retained restaurant logic.

Historical sql/ files describe a shared Accounting installation. They must never
be applied individually to the new project. This build removes that coupling.
No business records, passwords, keys, or user IDs belong in this migration.
"""
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]
TARGET = next((ROOT / 'supabase/migrations').glob('*_standalone_restaurant_foundation.sql'))

def source(name):
    text = (ROOT / 'sql' / name).read_text()
    text = re.sub(r'^begin;\s*|^commit;\s*', '', text, flags=re.M | re.I)
    text = re.sub(r'^--.*\n', '', text, flags=re.M)
    return text.strip()

bootstrap = """
-- New Restaurant project only. No Accounting schema, data or authentication tokens.
begin;
do $$begin
 if to_regclass('public.journal_entries') is not null or to_regclass('public.accounts') is not null then
  raise exception 'STOP: this migration belongs in the separate Restaurant project';
 end if;
end $$;
create schema if not exists restaurant_private;
revoke all on schema restaurant_private from public,anon;
grant usage on schema restaurant_private to authenticated,service_role;
create table public.profiles (
 id uuid primary key references auth.users(id) on delete cascade,
 email text not null,full_name text not null default '',
 role text not null default 'submitter' check(role in ('admin','submitter','staff')),
 status text not null default 'active' check(status in ('active','inactive','disabled')),
 created_at timestamptz not null default now(),updated_at timestamptz not null default now()
);
alter table public.profiles enable row level security;
revoke all on public.profiles from public,anon,authenticated;
grant select on public.profiles to authenticated;
grant update(full_name,status) on public.profiles to authenticated;
create function restaurant_private.is_admin() returns boolean language sql stable security definer
 set search_path='' as $$select auth.uid() is not null and exists(select 1 from public.profiles where id=auth.uid() and role='admin' and status='active')$$;
create function restaurant_private.active_user() returns boolean language sql stable security definer
 set search_path='' as $$select auth.uid() is not null and exists(select 1 from public.profiles where id=auth.uid() and status='active')$$;
revoke all on function restaurant_private.is_admin(),restaurant_private.active_user() from public,anon;
grant execute on function restaurant_private.is_admin(),restaurant_private.active_user() to authenticated;
create function public.is_admin() returns boolean language sql stable security invoker set search_path='' as $$select restaurant_private.is_admin()$$;
revoke all on function public.is_admin() from public,anon;
grant execute on function public.is_admin() to authenticated;
create policy profiles_read on public.profiles for select to authenticated using(id=(select auth.uid()) or (select public.is_admin()));
create policy profiles_admin_update on public.profiles for update to authenticated using((select public.is_admin())) with check((select public.is_admin()));
create function restaurant_private.new_profile() returns trigger language plpgsql security definer set search_path='' as $$
 begin
  insert into public.profiles(id,email,full_name) values(new.id,coalesce(new.email,''),left(coalesce(new.raw_user_meta_data->>'full_name',''),120)) on conflict(id) do nothing;
  return new;
 end $$;
revoke all on function restaurant_private.new_profile() from public,anon,authenticated;
create trigger restaurant_new_profile after insert on auth.users for each row execute function restaurant_private.new_profile();
create table restaurant_private.migration_archive (
 source_project text not null,source_table text not null,record_key text not null,
 record_data jsonb not null,captured_at timestamptz not null default now(),
 primary key(source_project,source_table,record_key)
);
alter table restaurant_private.migration_archive enable row level security;
revoke all on restaurant_private.migration_archive from public,anon,authenticated;
"""

parts = [bootstrap, source('01-inventory-menu.sql')]
deletion = source('02-menu-record-actions.sql')
start = deletion.index(" if tg_table_name='payroll_runs'")
end = deletion.index(" if tg_table_name in ('menu_items104'", start)
deletion = deletion[:start] + deletion[end:]
deletion = deletion.replace("'payroll_employees','payroll_leave_records','payroll_runs','operational_reports','company_documents105',", '')
parts.append(deletion)
for file in ['03-pos-core.sql','04-pos-offline-guard.sql','05-pos-customization.sql','06-online-menu-import.sql','07-restaurant-access-appearance.sql']:
    text = source(file)
    # Shared Accounting backup registration and appearance copying are obsolete.
    text = re.sub(r'do \$\$begin if to_regclass\(\'public\.backup_registry113\'\).*?end if;end\$\$;', '', text, flags=re.S)
    if file.startswith('07-'):
        text = re.sub(r'do \$\$ begin\s*if to_regclass\(\'public\.presentation_settings113\'\).*?end \$\$;', '', text, flags=re.S)
        text = text.replace('select auth.uid() is not null and (public.is_admin()', 'select restaurant_private.active_user() and (public.is_admin()')
    parts.append(text)
for file in ['09-preparation-waste124.sql','10-pos-priority125.sql','11-restaurant-tabs125.sql']:
    text = source(file)
    # A dedicated project has no cross-workspace API gate to extend.
    text = re.sub(r'do \$\$declare body text;begin\s*(?:if to_regprocedure\(\'public\.check_workspace_request123\(\)\'\).*?|body=pg_get_functiondef\(\'public\.check_workspace_request123\(\)\'.*?)end \$\$;', '', text, flags=re.S)
    text = re.sub(r'do \$\$begin if to_regclass\(\'public\.backup_registry113\'\).*?end if;end\$\$;', '', text, flags=re.S)
    parts.append(text)

parts.append("""
-- Restrict all exposed objects explicitly; a public storefront projection will
-- be a separate, reviewed API. Recipes, costs and staff records are private.
revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;
revoke execute on all functions in schema public from public,anon;
revoke execute on all functions in schema restaurant_private from public,anon;
grant all on all tables in schema public,restaurant_private to service_role;
grant usage,select on all sequences in schema public to service_role;
-- Inactive profiles cannot keep using a previous grant or a still-valid token.
do $$declare r record;begin
 for r in select c.relname from pg_class c where c.relnamespace='public'::regnamespace and c.relkind='r' and c.relname<>'profiles' loop
  execute format('create policy restaurant_active_user on public.%I as restrictive for all to authenticated using(restaurant_private.active_user()) with check(restaurant_private.active_user())',r.relname);
 end loop;
end $$;
notify pgrst,'reload schema';
commit;
""")
result = '\n\n'.join(parts) + '\n'
for forbidden in ['payroll_', 'user_permissions', 'check_workspace_request123', 'backup_registry113', 'presentation_settings113', 'accounting_workspace_allowed123']:
    if forbidden in result:
        raise RuntimeError(f'Unexpected shared-project dependency: {forbidden}')
TARGET.write_text(result)
print(f'Built {TARGET.name}: {len(result)} characters')
