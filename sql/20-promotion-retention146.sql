begin;
create extension if not exists pg_cron with schema pg_catalog;
select cron.schedule('restaurant-promotion-proof-retention146','15 * * * *',$job$
 update public.promotion_claims146 set proof=null where proof is not null and (expires_at<now() or created_at<now()-interval '24 hours');
 delete from cron.job_run_details where jobid=(select jobid from cron.job where jobname='restaurant-promotion-proof-retention146') and end_time<now()-interval '7 days';
$job$);
commit;
