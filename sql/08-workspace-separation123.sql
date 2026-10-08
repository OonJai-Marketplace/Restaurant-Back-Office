-- ADMINISTRATOR-ONLY SHARED WORKSPACE ACCESS.
-- Run once in the existing Supabase project's SQL editor BEFORE publishing.
-- This does not change profile roles, passwords, accounts, journals or calculations.
-- Existing non-admin users with BOTH Restaurant membership and Accounting grants
-- cause a rollback for administrator review; no existing access is silently removed.
begin;

do $$ begin
 if to_regclass('public.restaurant_members121') is null then raise exception 'Install Restaurant migration 07 first.';end if;
 if exists(select 1 from public.restaurant_members121 m join public.profiles p on p.id=m.user_id join public.user_permissions u on u.user_id=p.id
   where p.role<>'admin' and (coalesce(to_jsonb(u)->'modules','[]') not in ('[]'::jsonb,'null'::jsonb)
    or coalesce(to_jsonb(u)->'assigned_fund_account_ids','[]') not in ('[]'::jsonb,'null'::jsonb))) then
  raise exception 'STOP: a non-admin account has both Restaurant membership and Accounting grants. Preserve the Accounting account; use a separate Restaurant account. No changes were applied.';
 end if;
 if exists(select 1 from pg_db_role_setting s join pg_roles r on r.oid=s.setrole,
 unnest(s.setconfig) v where r.rolname='authenticator'
 and s.setdatabase in (0,(select oid from pg_database where datname=current_database()))
 and v like 'pgrst.db_pre_request=%' and split_part(v,'=',2)<>'public.check_workspace_request123'
 and (s.setdatabase<>0 or split_part(v,'=',2)<>'')) then
  raise exception 'STOP: an existing API pre-request hook must be reviewed before adding the workspace gate. No changes were applied.';
 end if;
end $$;

create or replace function public.accounting_workspace_allowed123() returns boolean
language sql stable security definer set search_path=public,pg_temp as $$
 select exists(select 1 from public.profiles p where p.id=auth.uid() and p.status='active'
  and (p.role='admin' or not exists(select 1 from public.restaurant_members121 m where m.user_id=p.id)))
$$;
revoke all on function public.accounting_workspace_allowed123() from public,anon;
grant execute on function public.accounting_workspace_allowed123() to authenticated;

-- Reject future accidental reuse of Accounting staff accounts in Restaurant.
create or replace function public.guard_separate_members123() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if exists(select 1 from profiles where id=new.user_id and role='admin') then return new;end if;
 if tg_table_name='restaurant_members121' then
  if exists(select 1 from user_permissions u where u.user_id=new.user_id and
    (coalesce(to_jsonb(u)->'modules','[]') not in ('[]'::jsonb,'null'::jsonb)
     or coalesce(to_jsonb(u)->'assigned_fund_account_ids','[]') not in ('[]'::jsonb,'null'::jsonb))) then
   raise exception 'Keep this Accounting account unchanged. Create a separate Restaurant staff account.';
  end if;
 elsif exists(select 1 from restaurant_members121 where user_id=new.user_id) then
  raise exception 'This is a Restaurant staff account. Create a separate Accounting sub-user account.';
 end if;return new;
end $$;
revoke all on function public.guard_separate_members123() from public,anon,authenticated;
drop trigger if exists guard_separate_members123 on public.restaurant_members121;
create trigger guard_separate_members123 before insert or update on public.restaurant_members121 for each row execute function public.guard_separate_members123();
drop trigger if exists guard_separate_members123 on public.user_permissions;
create trigger guard_separate_members123 before insert or update on public.user_permissions for each row execute function public.guard_separate_members123();

-- Additional restrictive policies AND existing policies must pass. These policies
-- do not grant any access. Restaurant/POS policies continue to govern those tables.
do $$ declare r record;begin
 for r in select c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace
  where n.nspname='public' and c.relkind in ('r','p') and c.relrowsecurity
   and c.relname not in ('profiles','restaurant_members121','restaurant_presentation121',
    'inventory_items104','inventory_movements104','menu_ingredients105','menu_items104','menu_categories104','menu_sales108',
    'pos_config118','pos_orders118','pos_shifts118','pos_cash118','pos_stock118') loop
  execute format('drop policy if exists workspace_accounting123 on public.%I',r.relname);
  execute format('create policy workspace_accounting123 on public.%I as restrictive for all to authenticated using(public.accounting_workspace_allowed123()) with check(public.accounting_workspace_allowed123())',r.relname);
 end loop;
 -- Restaurant uses base64 images in its permitted tables, not Accounting Storage.
 if to_regclass('storage.objects') is not null then
  execute 'drop policy if exists workspace_accounting123 on storage.objects';
  execute 'create policy workspace_accounting123 on storage.objects as restrictive for all to authenticated using(public.accounting_workspace_allowed123()) with check(public.accounting_workspace_allowed123())';
 end if;
end $$;

-- RLS does not guard SECURITY DEFINER RPC calls. Restrict the Data API entry
-- points as well; existing function bodies and business validations are untouched.
create or replace function public.check_workspace_request123() returns void
language plpgsql security definer set search_path=public,pg_temp as $$
declare endpoint text;begin
 if auth.uid() is null then return;end if;
 if public.accounting_workspace_allowed123() then return;end if;
 if not exists(select 1 from public.profiles where id=auth.uid() and status='active') then
  raise insufficient_privilege using message='Active account required';
 end if;
 endpoint:=regexp_replace(rtrim(coalesce(current_setting('request.path',true),''),'/'),'^.*/','');
 if endpoint = any(array['profiles','restaurant_members121','restaurant_presentation121',
 'inventory_items104','inventory_movements104','menu_ingredients105','menu_items104','menu_categories104','menu_sales108',
 'pos_config118','pos_orders118','pos_shifts118','pos_cash118','pos_stock118',
 'is_admin','accounting_workspace_allowed123','restaurant_can121','restaurant_signed_in121','restaurant_table_can121','restaurant_delete121',
 'pos_snapshot118','pos_order118','pos_manage118','pos_import_online_menu120']) then return;end if;
 raise insufficient_privilege using message='Restaurant accounts cannot access Accounting data or operations';
end $$;
revoke all on function public.check_workspace_request123() from public,anon;
grant execute on function public.check_workspace_request123() to authenticated,service_role;
alter role authenticator set pgrst.db_pre_request='public.check_workspace_request123';
notify pgrst,'reload config';
notify pgrst,'reload schema';
commit;
