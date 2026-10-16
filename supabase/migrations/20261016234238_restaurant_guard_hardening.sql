begin;
do $$declare f record;begin
 if to_regclass('restaurant_private.migration_archive') is null or to_regclass('public.journal_entries') is not null then
  raise exception 'This migration belongs in the separate Restaurant project';
 end if;
 -- Trigger routines run through their bound table triggers, not direct RPC calls.
 for f in select p.oid::regprocedure as signature from pg_proc p
  where p.pronamespace='public'::regnamespace and p.prorettype='trigger'::regtype loop
  execute format('revoke execute on function %s from public,anon,authenticated',f.signature);
 end loop;
end $$;
alter function public.stamp_inventory_menu104() set search_path='';
alter function public.restaurant_stamp_inventory_menu104_121() set search_path='';
alter default privileges for role postgres in schema public revoke execute on functions from public,anon,authenticated;
alter default privileges for role postgres in schema public revoke all on tables from anon,authenticated;
alter default privileges for role postgres in schema restaurant_private revoke execute on functions from public,anon,authenticated;
create policy archive_service_only on restaurant_private.migration_archive for all to service_role using(true) with check(true);
notify pgrst,'reload schema';
commit;
