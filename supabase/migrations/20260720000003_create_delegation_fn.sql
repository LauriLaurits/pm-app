-- Phase 6, Task 2 fix: atomic delegation create. createDelegationAction used to insert the
-- `delegations` header, then bulk-insert `delegation_permissions` rows, and on a trigger
-- rejection (enforce_delegatable_permission / validate_delegation_project -- e.g. a foreign
-- project or a non-delegatable permission slipped past the UI) it tried to delete the now-orphan
-- header itself. That cleanup silently no-ops: there is no "delete own delegation" RLS policy
-- (only `"admin delete delegation"`, admin-only), so the delete affects 0 rows and a permanent,
-- permission-less phantom delegation is left behind -- forever, since nothing else ever deletes
-- delegations.
--
-- Fix: do the header insert + all permission-row inserts inside ONE plpgsql function, so from the
-- caller's (PostgREST/supabase-js) perspective it is a single statement/transaction. If any
-- permission-row insert is rejected by either trigger, the exception aborts the whole function
-- call and Postgres rolls back everything it did, including the header insert -- there is no
-- window in which the header can commit without its permissions.
--
-- SECURITY INVOKER (the default -- no `security definer` here) is deliberate: every insert inside
-- still runs as the calling PM, so both the "create own delegation" RLS policy on `delegations`
-- (from_user = auth.uid() AND holds manage_delegations on an owned project) and the "edit own
-- delegation perms" RLS policy on `delegation_permissions` (from_user = auth.uid()) apply exactly
-- as they would to a direct client insert, and the two BEFORE triggers
-- (enforce_delegatable_permission, validate_delegation_project) fire per row same as before. This
-- function adds atomicity, not new authority.
-- p_handover_notes defaults to null (rather than a bare `text` with no default) purely so that
-- `supabase gen types typescript` emits it as an OPTIONAL arg (`p_handover_notes?: string`)
-- instead of a required `string` -- the column is nullable and createDelegationSchema's
-- `nullableNote` produces `string | null`, so the action passes `handover_notes ?? undefined`
-- (an omitted key falls through to this default, same effect as passing SQL null explicitly).
create or replace function public.create_delegation(
  p_to_user uuid,
  p_project_ids uuid[],
  p_permission_keys text[],
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_handover_notes text default null
) returns uuid
language plpgsql
set search_path = public
as $$
declare
  v_id uuid;
  v_project uuid;
  v_perm text;
begin
  insert into public.delegations (from_user, to_user, starts_at, ends_at, handover_notes)
    values (auth.uid(), p_to_user, p_starts_at, p_ends_at, p_handover_notes)
    returning id into v_id;

  -- one delegation_permissions row per (project, permission) pair, matching
  -- createDelegationAction's `project_ids.flatMap((project_id) => permission_keys.map(...))`.
  foreach v_project in array p_project_ids loop
    foreach v_perm in array p_permission_keys loop
      insert into public.delegation_permissions (delegation_id, project_id, permission_key)
        values (v_id, v_project, v_perm);
    end loop;
  end loop;

  return v_id;
end;
$$;

revoke all on function public.create_delegation(uuid, uuid[], text[], timestamptz, timestamptz, text) from public, anon;
grant execute on function public.create_delegation(uuid, uuid[], text[], timestamptz, timestamptz, text) to authenticated;
