-- Shift numbers are assigned once on opening. Sales and drawer movements still
-- reference the original shift UUID. No historical closing report is rewritten.
alter table public.pos_shifts118 add column shift_code text;
create table restaurant_private.shift_counters159 (
 shift_year integer primary key,
 last_number integer not null check(last_number>0)
);
revoke all on restaurant_private.shift_counters159 from public,anon,authenticated;
alter table restaurant_private.shift_counters159 enable row level security;

create function restaurant_private.shift_code159(y integer,n bigint)
returns text language sql immutable strict set search_path='' as $$
 select 'OJM'||right(y::text,2)||'-S'||lpad(n::text,greatest(3,length(n::text)),'0')
$$;
revoke all on function restaurant_private.shift_code159(integer,bigint) from public,anon,authenticated;
with shifts as (
 select id,opened_at,extract(year from opened_at at time zone 'Asia/Vientiane')::integer y from public.pos_shifts118
), numbered as (
 select id,y,row_number() over(partition by y order by opened_at,id) as n from shifts
)
update public.pos_shifts118 s set shift_code=restaurant_private.shift_code159(t.y,t.n)
 from numbered t where t.id=s.id;
insert into restaurant_private.shift_counters159
 select extract(year from opened_at at time zone 'Asia/Vientiane')::integer,count(*)::integer
 from public.pos_shifts118 group by 1;
alter table public.pos_shifts118 alter column shift_code set not null,
 add constraint pos_shifts118_code_unique unique(shift_code);

create function restaurant_private.number_shift159() returns trigger
language plpgsql security invoker set search_path='' as $$
declare y integer; n integer;
begin
 if tg_op='UPDATE' then
  if new.shift_code is distinct from old.shift_code then raise exception 'A shift number cannot be changed'; end if;
  return new;
 end if;
 y:=extract(year from new.opened_at at time zone 'Asia/Vientiane')::integer;
 insert into restaurant_private.shift_counters159 as c(shift_year,last_number) values(y,1)
  on conflict(shift_year) do update set last_number=c.last_number+1 returning last_number into n;
 new.shift_code:=restaurant_private.shift_code159(y,n);
 return new;
end$$;
revoke all on function restaurant_private.number_shift159() from public,anon,authenticated;
create trigger number_shift159 before insert or update of shift_code on public.pos_shifts118
 for each row execute function restaurant_private.number_shift159();

-- Include the display number through the existing cashier-scoped report API.
do $report$
declare report text:=pg_get_functiondef('restaurant_private.pos_shift_report152(uuid)'::regprocedure);
 history text:=pg_get_functiondef('restaurant_private.pos_shift_history152()'::regprocedure);
begin
 if strpos(report,'then return s.closing_report;end if;')=0 or strpos(report,'''shiftId'',s.id,')=0
 or strpos(history,'''id'',s.id,')=0 then raise exception 'Expected shift report definition missing';end if;
 execute replace(replace(report,'then return s.closing_report;end if;',
  'then return s.closing_report||jsonb_build_object(''shiftCode'',s.shift_code);end if;'),
  '''shiftId'',s.id,','''shiftId'',s.id,''shiftCode'',s.shift_code,');
 execute replace(history,'''id'',s.id,','''id'',s.id,''shift_code'',s.shift_code,');
end$report$;
notify pgrst,'reload schema';
