-- Run after the proposed schema inside one transaction; always roll back.
create temp table promotion_test_results146(name text);
do $$
declare admin_id uuid; p uuid=gen_random_uuid(); v uuid; voucher_code text='TEST146-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,12)); d jsonb; q jsonb; result jsonb; orderrow jsonb; claim_id uuid; token uuid; snapshot jsonb; fail boolean; n integer; original public.storefront_items127; sid uuid;
begin
 select id into admin_id from public.profiles where role='admin' and status='active' limit 1;
 if admin_id is null then raise exception 'Test needs an existing active administrator'; end if;
 perform set_config('request.jwt.claim.sub',admin_id::text,true);
 select * into original from public.storefront_items127 where id='b1';
 if original.id is null then raise exception 'Expected test menu reference missing'; end if;
 -- Isolate the test item using a transaction-local fixture; no real catalog changes survive.
 insert into public.storefront_items127(id,category,name,description,price,images,options,published,pos_visible131,stage131,available,position) values('test-promo146','burgers','Promotion rollback test', '',100000,'[]','{}',true,true,'active',true,9999) returning * into original;
 update public.menu_items104 set data=data||'{"posSetupPending120":false,"posNoStock118":true,"recipe":[]}',version=version+1 where id=original.menu_item_id;
 d=jsonb_build_object('name','Rollback test','title','Rollback test','placement','hero','starts','','ends','','weekdays','[0,1,2,3,4,5,6]'::jsonb,'rules',jsonb_build_object('kind','amount','value',100000,'minSpend',0,'minQty',0,'items','[]'::jsonb,'giftQty',1,'maxDiscount',0,'limitTotal',0,'perPhone',0,'approval',false,'proof',false,'channel','all','voucherOnly',true));
 perform public.save_promotion146(p,d,0,'publish');
 fail=false;begin perform public.promotion_quote146(p,'[{"id":"test-promo146","qty":1,"price":1}]','website');exception when others then fail=true;end;if not fail then raise exception 'Voucher-only campaign bypass';end if;
 perform public.issue_vouchers146(p,jsonb_build_array(jsonb_build_object('code',voucher_code)),'Rollback batch','balance',100000,2,50000,null);
 select id into v from public.restaurant_vouchers146 where restaurant_vouchers146.code=voucher_code;
 q=public.promotion_quote146(null,'[{"id":"test-promo146","qty":1,"price":1}]','website',voucher_code);
 if (q->>'subtotal')::numeric<>100000 or (q->>'discount')::numeric<>50000 or (q->>'total')::numeric<>50000 then raise exception 'Canonical pricing / voucher cap failed: %',q;end if;
 insert into promotion_test_results146 values('Canonical server prices override client price; voucher cap gives 50,000 discount');
 fail=false;begin perform public.issue_vouchers146(p,jsonb_build_array(jsonb_build_object('code',lower(voucher_code))),'Duplicate','balance',100000,2,50000,null);exception when others then fail=true;end;if not fail then raise exception 'Case-insensitive voucher duplicate accepted';end if;
 insert into promotion_test_results146 values('Duplicate voucher ID rejected without partial issuance');
 token=gen_random_uuid();result=public.request_promotion146(null,token,'[{"id":"test-promo146","qty":1}]','QA customer','8562099999901','website','',null,voucher_code);
 if result->>'status'<>'approved' then raise exception 'Expected approved reservation';end if;
 select id into claim_id from public.promotion_claims146 where promotion_claims146.code=result->>'code';
 if public.request_promotion146(null,token,'[{"id":"test-promo146","qty":1}]','QA customer','8562099999901','website','',null,voucher_code)->>'code'<>result->>'code' then raise exception 'Request retry not idempotent';end if;
 select balance into n from public.restaurant_vouchers146 where id=v;if n<>100000 then raise exception 'Reservation spent voucher prematurely';end if;
 insert into promotion_test_results146 values('Request retry is idempotent; reservation does not spend credit');
 orderrow=public.import_promotion_order146(claim_id);
 select id into sid from public.pos_shifts118 where cashier=admin_id and closed_at is null limit 1;
 if sid is null then perform public.pos_manage118('open','{"amount":0}',0);end if;
 snapshot=public.pos_order118((orderrow->>'id')::uuid,(orderrow->>'version')::integer,'pay',orderrow->'data'||jsonb_build_object('payment','Cash','confirmed',true,'tendered',100000));
 if (snapshot->'data'->>'total')::numeric<>50000 then raise exception 'POS lost the verified voucher total';end if;
 if (select balance<>50000 or used_count<>1 from public.restaurant_vouchers146 where id=v) then raise exception 'First redemption ledger incorrect';end if;
 perform public.pos_order118((orderrow->>'id')::uuid,(orderrow->>'version')::integer,'pay',orderrow->'data'||jsonb_build_object('payment','Cash','confirmed',true,'tendered',100000));
 if (select balance<>50000 or used_count<>1 from public.restaurant_vouchers146 where id=v) then raise exception 'Repeated payment double-spent';end if;
 insert into promotion_test_results146 values('POS payment spends 50,000 once; repeated payment never spends twice');
 token=gen_random_uuid();result=public.request_promotion146(null,token,'[{"id":"test-promo146","qty":1}]','QA second visit','8562099999902','website','',null,voucher_code);select id into claim_id from public.promotion_claims146 where promotion_claims146.code=result->>'code';orderrow=public.import_promotion_order146(claim_id);
 perform public.pos_order118((orderrow->>'id')::uuid,(orderrow->>'version')::integer,'pay',orderrow->'data'||jsonb_build_object('payment','Cash','confirmed',true,'tendered',100000));
 if (select balance<>0 or used_count<>2 from public.restaurant_vouchers146 where id=v) then raise exception 'Second redemption ledger incorrect';end if;
 fail=false;begin perform public.promotion_quote146(null,'[{"id":"test-promo146","qty":1}]','website',voucher_code);exception when others then fail=true;end;if not fail then raise exception 'Fully used voucher accepted';end if;
 insert into promotion_test_results146 values('Second use exhausts balance and use limit; third use rejected');
 -- A smaller first purchase preserves money but still consumes one allowed use.
 voucher_code='PARTIAL146-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,12));
 perform public.issue_vouchers146(p,jsonb_build_array(jsonb_build_object('code',voucher_code)),'Partial test','balance',100000,2,50000,null);
 select id into v from public.restaurant_vouchers146 where restaurant_vouchers146.code=voucher_code;
 update public.storefront_items127 set price=30000,version=storefront_items127.version+1 where id='test-promo146';
 token=gen_random_uuid();result=public.request_promotion146(null,token,'[{"id":"test-promo146","qty":1}]','QA partial','8562099999911','website','',null,voucher_code);select id into claim_id from public.promotion_claims146 where promotion_claims146.code=result->>'code';orderrow=public.import_promotion_order146(claim_id);
 perform public.pos_order118((orderrow->>'id')::uuid,(orderrow->>'version')::integer,'pay',orderrow->'data'||jsonb_build_object('payment','Cash','confirmed',true,'tendered',100000));
 if (select balance<>70000 or used_count<>1 from public.restaurant_vouchers146 where id=v) then raise exception 'Partial redemption failed';end if;
 update public.storefront_items127 set price=100000,version=storefront_items127.version+1 where id='test-promo146';
 result=public.request_promotion146(null,gen_random_uuid(),'[{"id":"test-promo146","qty":1}]','QA partial visit two','8562099999912','website','',null,voucher_code);select id into claim_id from public.promotion_claims146 where promotion_claims146.code=result->>'code';orderrow=public.import_promotion_order146(claim_id);
 perform public.pos_order118((orderrow->>'id')::uuid,(orderrow->>'version')::integer,'pay',orderrow->'data'||jsonb_build_object('payment','Cash','confirmed',true,'tendered',100000));
 if (select balance<>20000 or used_count<>2 from public.restaurant_vouchers146 where id=v) then raise exception 'Partial second redemption failed';end if;
 fail=false;begin perform public.promotion_quote146(null,'[{"id":"test-promo146","qty":1}]','website',voucher_code);exception when others then fail=true;end;if not fail then raise exception 'Remaining balance bypassed use limit';end if;
 insert into promotion_test_results146 values('Partial 30,000 + 50,000 use leaves 20,000, but exhausted two-use limit blocks further redemption');
 -- One-place campaign: a reservation consumes availability and cancellation releases it.
 p=gen_random_uuid();d=jsonb_set(d,'{rules,voucherOnly}','false');d=jsonb_set(d,'{rules,limitTotal}','1');d=jsonb_set(d,'{rules,value}','10000');perform public.save_promotion146(p,d,0,'publish');
 token=gen_random_uuid();result=public.request_promotion146(p,token,'[{"id":"test-promo146","qty":1}]','QA first','8562099999903');
 fail=false;begin perform public.request_promotion146(p,gen_random_uuid(),'[{"id":"test-promo146","qty":1}]','QA next','8562099999904');exception when others then fail=true;end;if not fail then raise exception 'Overbooked campaign';end if;
 perform public.promotion_status146(token,true);perform public.request_promotion146(p,gen_random_uuid(),'[{"id":"test-promo146","qty":1}]','QA next','8562099999904');
 insert into promotion_test_results146 values('Limited capacity includes active reservations; cancellation releases the slot');
 -- Combined eligibility and expiry conditions reject before any reservation.
 p=gen_random_uuid();d=jsonb_set(d,'{rules,limitTotal}','0');d=jsonb_set(d,'{rules,minSpend}','200000');d=jsonb_set(d,'{rules,minQty}','2');perform public.save_promotion146(p,d,0,'publish');
 fail=false;begin perform public.promotion_quote146(p,'[{"id":"test-promo146","qty":1}]');exception when others then fail=true;end;if not fail then raise exception 'Minimum spend/quantity bypass';end if;
 q=public.promotion_quote146(p,'[{"id":"test-promo146","qty":2}]');if (q->>'total')::numeric<>190000 then raise exception 'Combined conditions total wrong';end if;
 update public.storefront_promotions146 set ends_at=now()-interval '1 second' where id=p;
 fail=false;begin perform public.promotion_quote146(p,'[{"id":"test-promo146","qty":2}]');exception when others then fail=true;end;if not fail then raise exception 'Expired promotion accepted';end if;
 d=jsonb_set(d,'{rules,minSpend}','0');d=jsonb_set(d,'{rules,minQty}','0');
 insert into promotion_test_results146 values('Minimum spend and quantity combine; expired offer rejected');
 -- Real anonymous execution can quote a public offer, but cannot list private rows.
 p=gen_random_uuid();perform public.save_promotion146(p,d,0,'publish');
 perform set_config('request.jwt.claim.sub','',true);perform set_config('role','anon',true);
 q=public.promotion_quote146(p,'[{"id":"test-promo146","qty":1}]');
 fail=false;begin perform count(*) from public.restaurant_vouchers146;exception when insufficient_privilege then fail=true;end;
 perform set_config('role','postgres',true);perform set_config('request.jwt.claim.sub',admin_id::text,true);
 if not fail or (q->>'total')::numeric<>90000 then raise exception 'Anonymous quote/privacy test failed';end if;
 insert into promotion_test_results146 values('Anonymous customer quote works; direct access to private voucher register is denied');
 -- Private proof must wait for approval and disappear after review.
 p=gen_random_uuid();d=jsonb_set(d,'{rules,limitTotal}','0');d=jsonb_set(d,'{rules,proof}','true');perform public.save_promotion146(p,d,0,'publish');
 token=gen_random_uuid();result=public.request_promotion146(p,token,'[{"id":"test-promo146","qty":1}]','QA proof','8562099999905','website','','data:image/jpeg;base64,/9j/AA==');
 select id into claim_id from public.promotion_claims146 where promotion_claims146.code=result->>'code';
 if result->>'status'<>'pending' then raise exception 'Proof bypassed approval';end if;
 fail=false;begin perform public.import_promotion_order146(claim_id);exception when others then fail=true;end;if not fail then raise exception 'Pending request entered POS';end if;
 result=public.review_promotion146(claim_id,true,'Verified test fixture');
 if result->>'status'<>'approved' or (select proof is not null from public.promotion_claims146 where id=claim_id) then raise exception 'Approval / proof cleanup failed';end if;
 insert into promotion_test_results146 values('Proof request stays pending; staff approval removes proof and reserves offer');
 -- Draft updates do not change the published snapshot, and stale edits cannot overwrite.
 d=jsonb_set(d,'{title}','"Unpublished edit"');perform public.save_promotion146(p,d,1,'save');
 if (select data->>'title' from public.storefront_promotions146 where id=p)='Unpublished edit' then raise exception 'Draft leaked to public';end if;
 fail=false;begin perform public.save_promotion146(p,d,1,'save');exception when others then fail=true;end;if not fail then raise exception 'Stale draft overwrite';end if;
 insert into promotion_test_results146 values('Published snapshot isolated from draft; stale version rejected');
 if has_table_privilege('anon','public.restaurant_vouchers146','select') or has_table_privilege('anon','public.promotion_claims146','select') or has_table_privilege('anon','public.restaurant_promotions146','select') then raise exception 'Private table exposed';end if;
 insert into promotion_test_results146 values('Anonymous visitors cannot list vouchers, proofs, claims or draft promotions');
 perform public.promotion_report146(current_date-1,current_date+1);
 insert into promotion_test_results146 values('Results report calculates successfully from paid promotion orders');
end $$;
select name as passed from promotion_test_results146;
