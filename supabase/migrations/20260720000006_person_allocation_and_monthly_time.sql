-- People & allocation become editable, and time can be logged as monthly totals.
--
-- Background: `assignments` (person + allocation_pct + role + dates) already drives the Workload
-- view and already has RLS ("manage assignments" = manage_project_members), but there was NO UI to
-- write it -- allocation was seed-only ("hardcoded"). `project_members` (user + role + dates) is the
-- ACCESS record (member_projects in has_permission). A PM experienced these as two disconnected
-- things. These functions unify them behind one action: adding a person to a project creates BOTH
-- their access (project_members) and their allocation (a single project-level assignment) in one
-- transaction, so they never drift. The Workload aggregate RPCs are deliberately left untouched --
-- they already read `assignments` correctly; we're just finally feeding them real data.

-- 1. Monthly time totals -----------------------------------------------------------------------
-- A single time_entries row can now stand for a whole month's hours for a person on a project, so
-- the 24h/entry cap is lifted. Kept a sane ceiling (a month has at most 744 hours) so a typo can't
-- store a wild value; still strictly positive.
alter table public.time_entries drop constraint if exists time_entries_hours_check;
alter table public.time_entries
  add constraint time_entries_hours_check check (hours > 0 and hours <= 744);

-- 2. Atomic "person on a project" management ---------------------------------------------------
-- All three self-check manage_project_members (defense in depth beyond the caller's
-- requirePermission) and run in a single transaction. allocation_pct mirrors the assignments
-- table's own bound (0 < pct <= 200). A person is resolved from their user_id via people.user_id;
-- only people with a linked user account can be added (they need project_members access anyway).

create or replace function public.add_project_person(
  p_project uuid,
  p_user_id uuid,
  p_role text,
  p_allocation numeric,
  p_start date,
  p_end date
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_person uuid;
  v_start date := coalesce(p_start, current_date);
begin
  if not public.has_permission(auth.uid(), 'manage_project_members', p_project) then
    raise exception 'not authorized';
  end if;
  if p_allocation is null or p_allocation <= 0 or p_allocation > 200 then
    raise exception 'allocation must be between 0 and 200';
  end if;

  select id into v_person from public.people where user_id = p_user_id;
  if v_person is null then
    raise exception 'no person is linked to that user';
  end if;

  -- Access record (idempotent: re-adding just refreshes role/dates).
  insert into public.project_members (project_id, user_id, role_on_project, starts_on, ends_on)
    values (p_project, p_user_id, p_role, p_start, p_end)
    on conflict (project_id, user_id) do update
      set role_on_project = excluded.role_on_project,
          starts_on = excluded.starts_on,
          ends_on = excluded.ends_on;

  -- Allocation record: exactly one project-level assignment (project_part_id is null) per person.
  if exists (
    select 1 from public.assignments
    where project_id = p_project and person_id = v_person and project_part_id is null
  ) then
    update public.assignments
      set allocation_pct = p_allocation, role_on_project = p_role, start_date = v_start, end_date = p_end
      where project_id = p_project and person_id = v_person and project_part_id is null;
  else
    insert into public.assignments
      (project_id, project_part_id, person_id, role_on_project, allocation_pct, start_date, end_date)
      values (p_project, null, v_person, p_role, p_allocation, v_start, p_end);
  end if;
end;
$$;

create or replace function public.set_person_allocation(
  p_project uuid,
  p_user_id uuid,
  p_allocation numeric
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_person uuid;
begin
  if not public.has_permission(auth.uid(), 'manage_project_members', p_project) then
    raise exception 'not authorized';
  end if;
  if p_allocation is null or p_allocation <= 0 or p_allocation > 200 then
    raise exception 'allocation must be between 0 and 200';
  end if;

  select id into v_person from public.people where user_id = p_user_id;
  if v_person is null then
    raise exception 'no person is linked to that user';
  end if;

  if exists (
    select 1 from public.assignments
    where project_id = p_project and person_id = v_person and project_part_id is null
  ) then
    update public.assignments
      set allocation_pct = p_allocation
      where project_id = p_project and person_id = v_person and project_part_id is null;
  else
    insert into public.assignments (project_id, project_part_id, person_id, allocation_pct, start_date)
      values (p_project, null, v_person, p_allocation, current_date);
  end if;
end;
$$;

create or replace function public.remove_project_person(
  p_project uuid,
  p_user_id uuid
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_person uuid;
begin
  if not public.has_permission(auth.uid(), 'manage_project_members', p_project) then
    raise exception 'not authorized';
  end if;

  select id into v_person from public.people where user_id = p_user_id;

  delete from public.project_members where project_id = p_project and user_id = p_user_id;
  if v_person is not null then
    delete from public.assignments where project_id = p_project and person_id = v_person;
  end if;
end;
$$;

revoke all on function public.add_project_person(uuid, uuid, text, numeric, date, date) from public, anon;
revoke all on function public.set_person_allocation(uuid, uuid, numeric) from public, anon;
revoke all on function public.remove_project_person(uuid, uuid) from public, anon;
grant execute on function public.add_project_person(uuid, uuid, text, numeric, date, date) to authenticated;
grant execute on function public.set_person_allocation(uuid, uuid, numeric) to authenticated;
grant execute on function public.remove_project_person(uuid, uuid) to authenticated;
