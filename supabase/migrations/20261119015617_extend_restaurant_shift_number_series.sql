-- The calendar year identifies the opening date. The lifetime shift number
-- advances from A001 through A999, B001, …, Z999, AA001.
lock table public.pos_shifts118 in access exclusive mode;
create or replace function restaurant_private.shift_code159(y integer,n bigint)
returns text language plpgsql immutable strict set search_path='' as $$
declare block_number bigint; letters text:=''; serial integer;
begin
 if n<1 then raise exception 'Shift numbers start at 1'; end if;
 block_number:=(n-1)/999+1;
 serial:=((n-1)%999+1)::integer;
 while block_number>0 loop
  letters:=chr(65+((block_number-1)%26)::integer)||letters;
  block_number:=(block_number-1)/26;
 end loop;
 return 'OJM'||right(y::text,2)||'-S'||letters||lpad(serial::text,3,'0');
end$$;

create table restaurant_private.shift_series159 (
 singleton boolean primary key default true check(singleton),
 last_number bigint not null check(last_number>=0)
);
revoke all on restaurant_private.shift_series159 from public,anon,authenticated;
alter table restaurant_private.shift_series159 enable row level security;
insert into restaurant_private.shift_series159(last_number) select count(*) from public.pos_shifts118;

drop trigger number_shift159 on public.pos_shifts118;
with numbered as (
 select id,extract(year from opened_at at time zone 'Asia/Vientiane')::integer y,
 row_number() over(order by opened_at,id) n from public.pos_shifts118
)
update public.pos_shifts118 s set shift_code=restaurant_private.shift_code159(t.y,t.n)
 from numbered t where t.id=s.id;

create or replace function restaurant_private.number_shift159() returns trigger
language plpgsql security invoker set search_path='' as $$
declare y integer; n bigint;
begin
 if tg_op='UPDATE' then
  if new.shift_code is distinct from old.shift_code then raise exception 'A shift number cannot be changed';end if;
  return new;
 end if;
 update restaurant_private.shift_series159 set last_number=last_number+1 where singleton returning last_number into strict n;
 y:=extract(year from new.opened_at at time zone 'Asia/Vientiane')::integer;
 new.shift_code:=restaurant_private.shift_code159(y,n);
 return new;
end$$;
create trigger number_shift159 before insert or update of shift_code on public.pos_shifts118
 for each row execute function restaurant_private.number_shift159();
-- Only derived annual counters from the preceding migration are retired.
drop table restaurant_private.shift_counters159;
