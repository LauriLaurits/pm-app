-- P5 client feedback: a person can hold SEVERAL membership periods on one project ("arendaja
-- tuleb ja läheb" -- a developer leaves and comes back). project_members therefore allows
-- multiple rows per (project_id, user_id), one row per period, delimited by starts_on/ends_on.
--
-- Only the uniqueness goes away. The FKs, the "view team"/"manage team" RLS policies and the
-- grants are untouched. The dropped constraint's index also served the member_projects scope
-- lookup inside has_permission (join on project_id + user_id -- a hot path for every
-- member-scoped permission check), so a plain non-unique index takes its place.
alter table public.project_members
  drop constraint project_members_project_id_user_id_key;
create index project_members_project_user_idx
  on public.project_members (project_id, user_id);

-- add_project_person upserted via ON CONFLICT (project_id, user_id), which no longer has a
-- backing unique index and would raise "no unique or exclusion constraint matching the ON
-- CONFLICT specification" at runtime. Recreate it as a plain insert: every call now creates a
-- NEW membership period. The assignments consolidation (exactly one project-level allocation
-- row per person, see 20260720000007) is unchanged -- allocation/assignments plumbing stays
-- because the workload views read it; the Team tab UI just no longer writes it (allocation was
-- removed from that tab per client feedback, so the app inserts project_members directly and
-- this function remains for the workload-era callers/tests).
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

  -- A new period every call (multiple periods per person are the point now).
  insert into public.project_members (project_id, user_id, role_on_project, starts_on, ends_on)
    values (p_project, p_user_id, p_role, p_start, p_end);

  -- Consolidate to exactly one project-level assignment carrying the set allocation.
  delete from public.assignments where project_id = p_project and person_id = v_person;
  insert into public.assignments
    (project_id, project_part_id, person_id, role_on_project, allocation_pct, start_date, end_date)
    values (p_project, null, v_person, p_role, p_allocation, v_start, p_end);
end;
$$;
