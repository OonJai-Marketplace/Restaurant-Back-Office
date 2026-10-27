-- Append after promotions-db146.sql inside BEGIN ... ROLLBACK only.
create temp table promotion_audit147(test text,passed boolean,detail text);
do $$
declare p uuid=gen_random_uuid(); d jsonb='{"name":"Audit rollback","title":"Audit rollback","placement":"hero","weekdays":[0,1,2,3,4,5,6],"rules":{"kind":"gift","value":10,"giftId":"test-promo146","giftQty":1,"channel":"all"}}'; q jsonb; c jsonb; o jsonb; cid uuid; tok uuid; err text; audit_code text='AUDIT147-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,12));
begin
 perform public.save_promotion146(p,d,0,'publish');
 begin
  c=public.request_promotion146(p,gen_random_uuid(),'[{"id":"test-promo146","qty":1}]','Gift QA','8562099999970');
  select id into cid from public.promotion_claims146 where promotion_claims146.code=c->>'code';
  o=public.import_promotion_order146(cid);
  insert into promotion_audit147 values('Ordinary free-item offer imports into POS',(o->'data'->>'total')::numeric=100000,null);
 exception when others then insert into promotion_audit147 values('Ordinary free-item offer imports into POS',false,sqlerrm);end;
 update public.storefront_items127 set pos_visible131=false,version=version+1 where id='test-promo146';
 -- Separate plain paid item so the failure must concern the gift, not the paid line.
 insert into public.storefront_items127(id,category,name,description,price,images,options,published,pos_visible131,stage131,available,position) values('audit-paid147','burgers','Audit rollback paid item','',100000,'[]','{}',true,true,'active',true,9998);
 update public.menu_items104 set data=data||'{"posSetupPending120":false,"posNoStock118":true,"recipe":[]}',version=version+1 where id=(select menu_item_id from public.storefront_items127 where id='audit-paid147');
 err=null;begin perform public.promotion_quote146(p,'[{"id":"audit-paid147","qty":1}]');exception when others then err=sqlerrm;end;
 insert into promotion_audit147 values('Gift unavailable in POS rejected before reservation',err is not null,err);
 update public.storefront_items127 set pos_visible131=true,version=version+1 where id='test-promo146';
 p=gen_random_uuid();d=jsonb_set(d,'{rules,kind}','"amount"');d=jsonb_set(d,'{rules,value}','10000');perform public.save_promotion146(p,d,0,'publish');
 err=null;begin perform public.promotion_quote146(p,'[{"id":"audit-paid147","qty":1}]',null);exception when others then err=sqlerrm;end;
 insert into promotion_audit147 values('Missing channel cannot bypass channel authorization',err is not null,err);
 tok=gen_random_uuid();c=public.request_promotion146(p,tok,'[{"id":"audit-paid147","qty":1}]','Binding QA','8562099999971');select id into cid from public.promotion_claims146 where promotion_claims146.code=c->>'code';o=public.import_promotion_order146(cid);
 err=null;begin perform public.pos_order118((o->>'id')::uuid,(o->>'version')::int,'save',(o->'data')||'{"promotionClaim146":"","discount":0}');exception when others then err=sqlerrm;end;
 insert into promotion_audit147 values('Saved POS offer binding cannot be cleared to bypass redemption',err is not null,err);
 update public.storefront_promotions146 set enabled=false where id=p;
 q=public.promotion_status146(tok);
 insert into promotion_audit147 values('Paused campaign is unavailable in customer status',coalesce((q->>'unavailable')::boolean,false),null);
 update public.storefront_promotions146 set enabled=true where id=p;
 perform public.issue_vouchers146(p,jsonb_build_array(jsonb_build_object('code',audit_code)),'Audit','balance',100000,2,50000,null);
 d=jsonb_set(d,'{rules,kind}','"gift"');perform public.save_promotion146(p,d,1,'publish');
 err=null;begin perform public.promotion_quote146(p,'[{"id":"audit-paid147","qty":1}]','website',audit_code);exception when others then err=sqlerrm;end;
 insert into promotion_audit147 values('Voucher cannot add a gift after linked offer type changes',err is not null,err);

 p=gen_random_uuid();d=jsonb_set(d,'{rules,kind}','"amount"');perform public.save_promotion146(p,d,0,'publish');
 audit_code='VALID147-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,12));
 perform public.issue_vouchers146(p,jsonb_build_array(jsonb_build_object('code',audit_code)),'Audit limits','balance',100000,2,50000,now()+interval '1 day');
 update public.restaurant_vouchers146 set enabled=false where restaurant_vouchers146.code=audit_code;
 err=null;begin perform public.promotion_quote146(null,'[{"id":"audit-paid147","qty":1}]','website',audit_code);exception when others then err=sqlerrm;end;
 insert into promotion_audit147 values('Disabled voucher cannot be quoted',err is not null,err);
 update public.restaurant_vouchers146 set enabled=true,expires_at=now()-interval '1 second' where restaurant_vouchers146.code=audit_code;
 err=null;begin perform public.promotion_quote146(null,'[{"id":"audit-paid147","qty":1}]','website',audit_code);exception when others then err=sqlerrm;end;
 insert into promotion_audit147 values('Expired voucher cannot be quoted',err is not null,err);
 err=null;begin perform public.issue_vouchers146(p,'[{"code":"BAD-PERCENT147"}]','Audit limits','percent',101,1,0,null);exception when others then err=sqlerrm;end;
 insert into promotion_audit147 values('Percentage voucher validates before insert with a readable error',err like 'Enter a percentage%',err);
 d=jsonb_set(d,'{rules,perPhone}','1');perform public.save_promotion146(p,d,1,'publish');
 tok=gen_random_uuid();perform public.request_promotion146(p,tok,'[{"id":"audit-paid147","qty":1}]','Phone QA','02099999972');
 err=null;begin perform public.request_promotion146(p,gen_random_uuid(),'[{"id":"audit-paid147","qty":1}]','Phone QA','8562099999972');exception when others then err=sqlerrm;end;
 insert into promotion_audit147 values('Local and international Laos phone formats share the same limit',err is not null,err);
 perform public.promotion_status146(tok,true);
 c=public.request_promotion146(p,gen_random_uuid(),'[{"id":"audit-paid147","qty":1}]','Phone QA','8562099999972');
 insert into promotion_audit147 values('Cancelling a reservation releases the phone limit',c->>'status'='approved',null);
end $$;
do $$ begin if exists(select 1 from promotion_audit147 where not coalesce(passed,false)) then raise exception 'Promotion audit failed: %',(select string_agg(test,'; ') from promotion_audit147 where not coalesce(passed,false));end if;end $$;
select * from promotion_audit147;
