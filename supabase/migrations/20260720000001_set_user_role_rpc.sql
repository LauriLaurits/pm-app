-- Atomic single-role swap for the admin "change role" flow. Doing delete-then-insert as two
-- separate PostgREST round-trips is not atomic: a failure between them leaves the target user
-- with zero roles. A SECURITY DEFINER function runs in one transaction, so either the swap fully
-- applies or nothing changes. Re-checks is_admin() itself (defense in depth beyond the caller's
-- requirePermission), and the roles(key) FK on the insert rejects a bogus role_key (rolling back).
create or replace function public.set_user_role(target_user uuid, new_role text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'admin permission required';
  end if;
  delete from public.user_roles where user_id = target_user;
  insert into public.user_roles (user_id, role_key, granted_by)
    values (target_user, new_role, auth.uid());
end;
$$;

revoke all on function public.set_user_role(uuid, text) from public, anon;
grant execute on function public.set_user_role(uuid, text) to authenticated;
