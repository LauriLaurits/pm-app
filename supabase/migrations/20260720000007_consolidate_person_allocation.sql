-- Allocation is one number per person per project (their days/week on it). Seed data, however, can
-- carry several PART-LEVEL assignment rows per person; the People tab sums them for display. If
-- add/set only touched the single project-level row, the displayed total (the sum) and the value a
-- PM just typed would drift -- which reads as "editing doesn't work". So add_project_person and
-- set_person_allocation now CONSOLIDATE: replace all of the person's assignments on the project
-- with one project-level row carrying exactly the allocation the PM set. Part-level allocation
-- detail is intentionally dropped (a 25-person shop plans at the project level; per-part *time* is
-- still tracked separately via time_entries.project_part_id).

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

  insert into public.project_members (project_id, user_id, role_on_project, starts_on, ends_on)
    values (p_project, p_user_id, p_role, p_start, p_end)
    on conflict (project_id, user_id) do update
      set role_on_project = excluded.role_on_project,
          starts_on = excluded.starts_on,
          ends_on = excluded.ends_on;

  -- Consolidate to exactly one project-level assignment carrying the set allocation.
  delete from public.assignments where project_id = p_project and person_id = v_person;
  insert into public.assignments
    (project_id, project_part_id, person_id, role_on_project, allocation_pct, start_date, end_date)
    values (p_project, null, v_person, p_role, p_allocation, v_start, p_end);
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

  delete from public.assignments where project_id = p_project and person_id = v_person;
  insert into public.assignments (project_id, project_part_id, person_id, allocation_pct, start_date)
    values (p_project, null, v_person, p_allocation, current_date);
end;
$$;
