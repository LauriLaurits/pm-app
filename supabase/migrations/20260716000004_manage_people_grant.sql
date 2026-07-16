-- Phase 4b: PMs can manage the shared people directory (was admin-only -- only the
-- is_admin() bypass in has_permission() reached "manage people"/"manage skills"/etc,
-- since manage_people had no role_permissions grant at all). Grant it to project_manager,
-- same shape as the other project_manager global grants added in 20260715000002.
insert into public.role_permissions (role_key, permission_key, scope) values
  ('project_manager','manage_people','global');

-- Defense-in-depth for hard-deleting a person: every FK from assignments/time_entries/
-- rates/person_skills to people is ON DELETE CASCADE, so deleting a people row silently
-- wipes that history. The app (deletePersonAction, src/app/actions/people.ts) counts
-- assignments/time_entries first and refuses with a friendly error if either exist,
-- steering callers to status='inactive' instead -- but that's a check-then-act in app
-- code, not a guarantee. This trigger is the actual backstop enforced by Postgres itself,
-- regardless of caller (including service_role / future code paths that skip the app check).
create or replace function public.prevent_delete_person_with_history()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (select 1 from public.assignments where person_id = old.id)
     or exists (select 1 from public.time_entries where person_id = old.id) then
    raise exception 'cannot delete a person with assignments or logged time -- set them inactive instead'
      using errcode = '23503';
  end if;
  return old;
end;
$$;

create trigger people_prevent_delete_with_history
  before delete on public.people
  for each row execute function public.prevent_delete_person_with_history();
