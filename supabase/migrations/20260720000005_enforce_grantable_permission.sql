-- Ad-hoc per-project grants (user_project_permissions) must never hand out self-escalation or
-- global-only permissions. Without this, an admin granting a non-admin project-scoped
-- 'manage_access' turns them into an admin-equivalent on that project (they can then grant
-- anything, including manage_access again, recursively). Enforced for ALL callers (incl. an
-- admin using the access screen and any forced RLS insert), not just the app action.
create or replace function public.enforce_grantable_permission()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.permission_key in
     ('manage_access','manage_users','view_audit','create_project','export_data','reveal_credential') then
    raise exception 'permission % is not grantable per-project', new.permission_key;
  end if;
  return new;
end;
$$;
create trigger user_project_permissions_grantable
  before insert or update on public.user_project_permissions
  for each row execute function public.enforce_grantable_permission();
