-- P3 client feedback: a project can point at ONE contact person of its client, and the create
-- form grows a real PM select (any PM in the system, defaulting to the creator).

-- ---------- 1. projects.client_contact_id ----------
-- Nullable on purpose: most projects only name a client. "on delete set null" so removing a
-- contact from a client never blocks (or cascades into) project deletion. No RLS change needed:
-- the column rides on the existing projects policies; contact details themselves stay behind
-- client_contacts' own view_clients policy.
alter table public.projects
  add column client_contact_id uuid references public.client_contacts (id) on delete set null;
create index projects_client_contact_idx on public.projects (client_contact_id);

-- ---------- 2. pm_options(): who can be a project's PM ----------
-- The create form lists every ACTIVE user whose role is project_manager or admin. Roles live in
-- user_roles/user_profiles, both readable only by their owner or an admin -- so a plain query
-- can't feed this list for a non-admin PM. Security definer with an explicit create_project
-- gate: only people who can even see the create form get the list, and it exposes nothing
-- beyond id + display name (names are already broadly visible via `people`/view_people).
create or replace function public.pm_options()
returns table (user_id uuid, full_name text)
language sql stable security definer
set search_path = public
as $$
  select distinct up.id, coalesce(up.full_name, up.email)
  from public.user_profiles up
  join public.user_roles ur on ur.user_id = up.id
  where ur.role_key in ('project_manager','admin')
    and up.status = 'active'
    and public.has_permission(auth.uid(),'create_project')
  order by 2;
$$;
grant execute on function public.pm_options() to authenticated;
grant execute on function public.pm_options() to service_role;

-- ---------- 3. "create project" now allows assigning another PM ----------
-- Was: pm_id = auth.uid() or is_admin(). Feedback wants the create form's PM select usable by
-- PMs too (not just admins), so a create_project holder may now also assign any OTHER user who
-- holds create_project themselves (i.e. an active PM or admin -- the same set pm_options()
-- returns). protect_project_pm still guards UPDATEs: reassigning later stays admin-only.
drop policy "create project" on public.projects;
create policy "create project" on public.projects for insert with check (
  public.has_permission(auth.uid(),'create_project')
  and (
    pm_id = auth.uid()
    or public.is_admin()
    or (pm_id is not null and public.has_permission(pm_id,'create_project'))
  ));
