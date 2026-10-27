-- Run as one transaction against the Restaurant project. Every fixture is rolled back.
begin;
create temp table boundary_results148(test text primary key);
grant insert,select on boundary_results148 to anon,authenticated;
do $$
declare t text; denied boolean;
begin
 if exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' and not c.relrowsecurity) then raise exception 'Public table without RLS';end if;
 if exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' and has_table_privilege('anon',c.oid,'INSERT,UPDATE,DELETE,TRUNCATE')) then raise exception 'Anonymous table write grant';end if;
 insert into boundary_results148 values('All public tables use RLS and anonymous visitors have no direct table write privileges');
 if exists(select 1 from pg_proc p where p.pronamespace='public'::regnamespace and has_function_privilege('anon',p.oid,'execute') and p.proname not in ('promotion_quote146','request_promotion146','promotion_status146')) then raise exception 'Unexpected anonymous RPC';end if;
 insert into boundary_results148 values('Anonymous RPC allowlist contains only quote, request and token-protected status');
 execute 'set local role anon';
 foreach t in array array['profiles','restaurant_members121','restaurant_presentation121','inventory_items104','inventory_movements104','menu_items104','menu_ingredients105','menu_categories104','menu_sales108','pos_orders118','pos_shifts118','pos_cash118','pos_stock118','pos_config118','record_deletions108','restaurant_batches124','restaurant_waste124','restaurant_preparations132','restaurant_sales_plans143','restaurant_promotions146','restaurant_vouchers146','promotion_claims146','restaurant_promotion_costs146'] loop
  denied=false;begin execute format('select * from public.%I limit 1',t);exception when insufficient_privilege then denied=true;end;
  if not denied then raise exception 'Anonymous private-table access: %',t;end if;
  insert into boundary_results148 values('Anonymous read denied: '||t);
 end loop;
 perform id,name,price from public.storefront_items127 limit 1;
 perform title from public.storefront_content127 limit 1;
 perform id from public.storefront_promotions146 limit 1;
 insert into boundary_results148 values('Public menu, page content and published promotions remain readable');
 denied=false;begin perform menu_item_id from public.storefront_items127 limit 1;exception when insufficient_privilege then denied=true;end;
 if not denied then raise exception 'Internal recipe link exposed';end if;
 insert into boundary_results148 values('Public menu hides internal recipe linkage');
 denied=false;begin perform public.pos_cashier_snapshot125();exception when insufficient_privilege then denied=true;end;
 if not denied then raise exception 'Anonymous POS snapshot accessible';end if;
 denied=false;begin perform public.voucher_register146();exception when insufficient_privilege then denied=true;end;
 if not denied then raise exception 'Anonymous voucher register accessible';end if;
 insert into boundary_results148 values('Anonymous POS and voucher-register calls are denied');
 denied=false;begin perform public.promotion_status146(gen_random_uuid());exception when others then if sqlerrm='Request not found on this device.' then denied=true;else raise;end if;end;
 if not denied then raise exception 'Unknown token exposed claim';end if;
 insert into boundary_results148 values('An unrelated request token cannot retrieve customer details');
 execute 'reset role';
end $$;
do $$
declare actor uuid=gen_random_uuid(); t text; n integer; denied boolean;
begin
 insert into auth.users(id,email,raw_user_meta_data) values(actor,'boundary-'||actor||'@example.invalid','{"role":"admin","is_admin":true}');
 if (select role from public.profiles where id=actor)='admin' then raise exception 'User metadata granted admin';end if;
 update public.profiles set status='active' where id=actor;
 insert into public.restaurant_members121(user_id,permissions) values(actor,'{}');
 perform set_config('request.jwt.claim.sub',actor::text,true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',actor,'role','authenticated','user_metadata',jsonb_build_object('role','admin'))::text,true);
 execute 'set local role authenticated';
 if public.is_admin() or public.restaurant_can121('pos') then raise exception 'Unassigned account has staff access';end if;
 insert into boundary_results148 values('Self-declared admin metadata and an unassigned signed-in account grant no staff permissions');
 foreach t in array array['inventory_items104','menu_items104','pos_orders118','pos_shifts118','pos_cash118','restaurant_vouchers146','restaurant_promotions146','promotion_claims146','restaurant_promotion_costs146','restaurant_sales_plans143'] loop
  execute format('select count(*) from public.%I',t) into n;
  if n<>0 then raise exception 'Unassigned account read rows from %',t;end if;
 end loop;
 insert into boundary_results148 values('Signed-in accounts without assignments cannot read private business records');
 denied=false;begin update public.profiles set role='admin' where id=actor;exception when insufficient_privilege then denied=true;end;
 if not denied then raise exception 'Account changed its own role';end if;
 update public.restaurant_members121 set permissions='{"pos":{"view":true,"sell":true}}' where user_id=actor;
 get diagnostics n=row_count;
 if n<>0 then raise exception 'Account changed its own permissions';end if;
 insert into boundary_results148 values('An account cannot promote itself or alter its assigned permissions');
 denied=false;begin perform public.pos_cashier_snapshot125();exception when others then if sqlerrm='POS access required' then denied=true;else raise;end if;end;
 if not denied then raise exception 'Unassigned POS RPC access';end if;
 insert into boundary_results148 values('Server rejects POS RPC even with a valid signed-in identity');
 execute 'reset role';
 update public.restaurant_members121 set permissions='{"pos":{"view":true,"sell":true,"tabs":{"pos-sales-new":true}}}' where user_id=actor;
 execute 'set local role authenticated';
 if not public.restaurant_can121('pos','sell') then raise exception 'Assigned cashier unexpectedly blocked';end if;
 execute 'reset role';
 update public.restaurant_members121 set enabled=false where user_id=actor;
 execute 'set local role authenticated';
 if public.restaurant_can121('pos','sell') then raise exception 'Disabled member still authorized';end if;
 insert into boundary_results148 values('Assigned access works and revocation takes effect without issuing a new token');
 execute 'reset role';
end $$;
select * from boundary_results148 order by test;
rollback;
