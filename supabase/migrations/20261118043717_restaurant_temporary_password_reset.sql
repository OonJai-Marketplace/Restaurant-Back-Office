-- No password or password hash is stored in Restaurant tables.
alter table public.restaurant_members121 add column if not exists password_reset_pending uuid;
alter table public.restaurant_members121 add column if not exists password_reset_started_at timestamptz;
alter table public.restaurant_members121 add column if not exists password_reset_at timestamptz;
alter table public.restaurant_members121 add column if not exists password_reset_by uuid;

-- Keep the first-login requirement throughout an administrator's Auth update.
-- A later password change by the staff member clears it, as before.
create or replace function public.restaurant_password_changed121() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if new.encrypted_password is distinct from old.encrypted_password then
  update public.restaurant_members121 set must_change_password=(password_reset_pending is not null)
  where user_id=new.id and must_change_password;
 end if;return new;
end$$;
revoke all on function public.restaurant_password_changed121() from public,anon,authenticated;

create or replace function restaurant_private.password_reset153(p_action text,p_target uuid,p_actor uuid,p_nonce uuid)
returns boolean language plpgsql security definer set search_path='' as $$
declare member public.restaurant_members121;
begin
 if auth.role() is distinct from 'service_role' then raise exception 'Server access required';end if;
 if p_nonce is null or p_actor=p_target or not exists(select 1 from public.profiles where id=p_actor and role='admin' and status='active') then raise exception 'Administrator access required';end if;
 if not exists(select 1 from public.profiles where id=p_target and role<>'admin') then raise exception 'Choose a restaurant staff account';end if;
 select * into member from public.restaurant_members121 where user_id=p_target for update;
 if member.user_id is null then raise exception 'Restaurant staff account not found';end if;
 if p_action='begin' then
  if member.password_reset_pending is not null and member.password_reset_started_at>now()-interval '2 minutes' then raise exception 'A password reset is already in progress. Wait two minutes and try again.';end if;
  update public.restaurant_members121 set password_reset_pending=p_nonce,password_reset_started_at=now(),must_change_password=true where user_id=p_target;
 elsif p_action in ('complete','failed') then
  if member.password_reset_pending is distinct from p_nonce then raise exception 'Password reset request changed. Review the user before retrying.';end if;
  update public.restaurant_members121 set password_reset_pending=null,must_change_password=true,
   password_reset_at=case when p_action='complete' then now() else password_reset_at end,
   password_reset_by=case when p_action='complete' then p_actor else password_reset_by end where user_id=p_target;
 else raise exception 'Unknown password reset action';end if;
 return true;
end$$;
revoke all on function restaurant_private.password_reset153(text,uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function restaurant_private.password_reset153(text,uuid,uuid,uuid) to service_role;
create or replace function public.restaurant_password_reset153(p_action text,p_target uuid,p_actor uuid,p_nonce uuid)
returns boolean language sql security invoker set search_path='' as $$select restaurant_private.password_reset153(p_action,p_target,p_actor,p_nonce)$$;
revoke all on function public.restaurant_password_reset153(text,uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.restaurant_password_reset153(text,uuid,uuid,uuid) to service_role;
