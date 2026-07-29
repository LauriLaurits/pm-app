-- Security hardening (audit 2026-07-29 -- docs/security/audit-2026-07-29/). One migration,
-- one clearly-commented block per finding: H2, H3, H5, H6, H7, M5. M6 is deliberately NOT
-- fixed here (product decision -- see the SECURITY NOTE at the bottom).
-- Invariants encoded in supabase/tests/phase9_security_invariants.test.sql.

-- =================================================================================================
-- H5: SECURITY DEFINER enumeration -- foreign-uid probes refused, allocation RPCs gated
-- =================================================================================================
-- has_permission / has_credential_access take an arbitrary `uid` and were callable by any
-- authenticated session, letting a zero-permission account enumerate the org's entire
-- authorization graph (including who can reveal which credential). person_current_allocation /
-- person_weekly_allocation summed ANY person's global allocation for any authenticated caller.
--
-- Guard shape (all four functions): the original body is preserved verbatim and only reached
-- through a gate at the top.
--   * `auth.uid() is null` is a TRUSTED context: anon has no EXECUTE on any of these, so a null
--     uid can only be postgres/service_role/definer-owner (migrations, seeds, pgTAP fixtures) --
--     never a PostgREST caller (authenticated JWTs always carry `sub`).
--   * Admins keep foreign-uid evaluation (admin access UI asks about other users).
--   * ONE legitimate non-admin foreign-uid call exists (grep-verified across migrations + src):
--     the "create project" WITH CHECK (20260721000003) and createProjectAction both probe
--     has_permission(pm_id, 'create_project') so a PM can assign another PM at create time.
--     That exact probe is carved out -- and only for callers who hold create_project themselves,
--     the same audience pm_options() already serves the PM/admin roster to. The recursion in the
--     carve-out is depth-1: the inner call passes uid = auth.uid(), which skips the guard.

create or replace function public.has_permission(uid uuid, perm text, project uuid default null)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select case
    when auth.uid() is not null
         and uid is distinct from auth.uid()
         and not public.is_admin()
         and not (perm = 'create_project'
                  and public.has_permission(auth.uid(), 'create_project'))
      then false
    else (
      public.is_admin(uid)
      or (
        exists (select 1 from public.user_profiles up where up.id = uid and up.status = 'active')
        and (
          exists (
            select 1 from public.user_roles ur
            join public.role_permissions rp on rp.role_key = ur.role_key
            where ur.user_id = uid and rp.permission_key = perm and rp.scope = 'global')
          or (project is not null and exists (
            select 1 from public.user_roles ur
            join public.role_permissions rp on rp.role_key = ur.role_key
            join public.projects p on p.id = project
            where ur.user_id = uid and rp.permission_key = perm
              and rp.scope = 'own_projects' and p.pm_id = uid))
          or (project is not null and exists (
            select 1 from public.user_roles ur
            join public.role_permissions rp on rp.role_key = ur.role_key
            join public.project_members pm on pm.project_id = project and pm.user_id = uid
            where ur.user_id = uid and rp.permission_key = perm
              and rp.scope = 'member_projects'))
          or exists (
            -- a per-project grant only satisfies a project-scoped check (never an unscoped/global one)
            select 1 from public.user_project_permissions upp
            where upp.user_id = uid and upp.permission_key = perm
              and (upp.expires_at is null or upp.expires_at > now())
              and project is not null and upp.project_id = project)
          or (project is not null and exists (
            select 1 from public.delegations d
            join public.delegation_permissions dp on dp.delegation_id = d.id
            where d.to_user = uid and dp.permission_key = perm and dp.project_id = project
              and d.revoked_at is null and now() >= d.starts_at and now() < d.ends_at))
        )
      )
    )
  end
$$;
-- NOTE: EXECUTE for `authenticated` on has_permission is load-bearing (every RLS policy calls
-- it as the querying role) and is deliberately NOT touched here.

-- has_credential_access: same self-or-admin guard; every RLS/RPC caller passes auth.uid().
create or replace function public.has_credential_access(cred_id uuid, uid uuid default auth.uid())
returns boolean
language sql stable security definer
set search_path = public
as $$
  select case
    when auth.uid() is not null
         and uid is distinct from auth.uid()
         and not public.is_admin()
      then false
    else exists (
      select 1 from public.credential_access ca
      where ca.credential_id = cred_id and ca.user_id = uid
        and (ca.expires_at is null or ca.expires_at > now())
    )
  end
$$;

-- person_current_allocation: the definer-sum stays (see 20260716000002 for why the aggregate
-- must bypass assignments RLS), but the AUDIENCE is now enforced: view_people holders, the
-- person themself, or a trusted (null-uid) context. Anyone else gets the empty aggregate
-- (0, 0) -- they cannot see the person's row anyway. person_workload_rows (security_invoker)
-- calls this per row; every caller who can see `people` rows holds view_people, so the view's
-- numbers are unchanged for legitimate viewers.
create or replace function public.person_current_allocation(p_person uuid)
returns table (allocation_pct numeric, project_count int)
language sql stable security definer set search_path = public as $$
  select coalesce(sum(a.allocation_pct), 0)::numeric,
         count(distinct a.project_id)::int
  from public.assignments a
  where (auth.uid() is null
         or public.has_permission(auth.uid(), 'view_people')
         or p_person = public.current_person_id())
    and a.person_id = p_person
    and current_date between a.start_date and coalesce(a.end_date, 'infinity');
$$;

-- person_weekly_allocation: same gate; unauthorized callers get the week grid with 0s.
create or replace function public.person_weekly_allocation(p_person uuid, p_from date, p_weeks int)
returns table (week_start date, allocation_pct numeric)
language sql
stable
security definer
set search_path = public
as $$
  select
    ws::date as week_start,
    coalesce((
      select sum(a.allocation_pct)
      from public.assignments a
      where (auth.uid() is null
             or public.has_permission(auth.uid(), 'view_people')
             or p_person = public.current_person_id())
        and a.person_id = p_person
        and a.start_date <= (ws::date + 6)
        and coalesce(a.end_date, 'infinity'::date) >= ws::date
    ), 0)::numeric as allocation_pct
  from generate_series(
    date_trunc('week', p_from)::date,
    date_trunc('week', p_from)::date + (greatest(coalesce(p_weeks, 1), 1) - 1) * 7,
    interval '7 days'
  ) as ws;
$$;

-- =================================================================================================
-- H2: budget_items cost-tier re-typing -- item_type is no longer updatable; cost rows need
--     view_internal_cost to UPDATE/DELETE
-- =================================================================================================
-- A manage_budget holder without view_internal_cost (a PM on their own project) could
-- `update budget_items set item_type='invoice'` on a cost row the SELECT policy hides, then
-- read the internal amount -- and could blindly rewrite/delete cost rows. Two closures:
--   1. item_type is removed from the UPDATE column grant entirely: a row's type is write-once
--      (a mis-typed row is deleted + reinserted by a view_internal_cost holder). The app never
--      updates budget_items at all (insert/delete only -- src/app/actions/budget-items.ts).
--   2. UPDATE/DELETE policies additionally require view_internal_cost when the row is (or
--      would become) a cost type, mirroring the SELECT policy's tier gate exactly.

drop policy "update budget items" on public.budget_items;
create policy "update budget items" on public.budget_items for update
  using (
    exists (select 1 from public.budgets b where b.id = budget_id and public.has_permission(auth.uid(),'manage_budget', b.project_id))
    and (item_type not in ('planned_cost','actual_cost')
         or public.has_permission(auth.uid(),'view_internal_cost')))
  with check (
    exists (select 1 from public.budgets b where b.id = budget_id and public.has_permission(auth.uid(),'manage_budget', b.project_id))
    and (item_type not in ('planned_cost','actual_cost')
         or public.has_permission(auth.uid(),'view_internal_cost')));
drop policy "delete budget items" on public.budget_items;
create policy "delete budget items" on public.budget_items for delete
  using (
    exists (select 1 from public.budgets b where b.id = budget_id and public.has_permission(auth.uid(),'manage_budget', b.project_id))
    and (item_type not in ('planned_cost','actual_cost')
         or public.has_permission(auth.uid(),'view_internal_cost')));

-- was: grant update (item_type, name, amount, occurred_on, note) -- item_type dropped.
-- (created_by/budget_id were already withheld -- see 20260715000005.)
revoke update on public.budget_items from authenticated;
grant update (name, amount, occurred_on, note) on public.budget_items to authenticated;

-- =================================================================================================
-- H3: DB-level audit for credential reveal + role change
-- =================================================================================================
-- "Every reveal is logged" lived only in the app action (writeAuditStrict); a direct
-- authenticated REST call to the RPC returned plaintext with no trace. The definer functions
-- now write the audit row themselves (they run as the table owner, which may insert into the
-- append-only audit_logs) in the same transaction. The app-layer write stays (belt +
-- suspenders; it carries actor_email/ip/user_agent) -- rows are distinguishable via
-- metadata.source = 'db_rpc'. Metadata NEVER contains the secret.

-- Full recreate of 20260720000002_reveal_credential_rpc.sql preserving every clause; the ONLY
-- change is the audit insert between the permission gate and the vault read. See the original
-- migration for the reasoning comments on the gate/search_path/error-shape choices.
create or replace function public.reveal_credential_secret(cred_id uuid)
returns table (secret text, project_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_project_id uuid;
  v_secret_id uuid;
  v_visibility public.credential_visibility;
  v_owner_id uuid;
begin
  select c.project_id, c.secret_id, c.visibility, c.owner_id
    into v_project_id, v_secret_id, v_visibility, v_owner_id
  from public.credentials c
  where c.id = cred_id;

  -- Unknown credential id and "not permitted" get the identical error message/path below --
  -- never let a caller distinguish "doesn't exist" from "exists but you can't reveal it".
  if v_project_id is null then
    raise exception 'not permitted';
  end if;

  -- v_owner_id = auth.uid() is written null-safe (v_owner_id is not null and ...) because
  -- owner_id is nullable: with a bare `=`, a null owner poisons the OR chain to NULL and the
  -- `if not (...)` would silently skip the exception -- backwards from fail-closed.
  if not (
    public.has_permission(auth.uid(), 'reveal_credential', v_project_id)
    and (
      v_visibility <> 'admins_only'
      or public.is_admin()
      or (v_owner_id is not null and v_owner_id = auth.uid())
      or public.has_credential_access(cred_id, auth.uid())
    )
  ) then
    raise exception 'not permitted';
  end if;

  -- H3: the reveal is recorded HERE, inside the definer function, in the same transaction that
  -- returns the plaintext -- a direct REST call to this RPC can no longer read a secret without
  -- leaving a trace. Runs as the function owner (audit_logs is owner/service-role insert-only).
  -- Metadata carries only ids -- NEVER the secret.
  insert into public.audit_logs (actor_id, action, resource_type, resource_id, metadata)
  values (auth.uid(), 'credential.revealed', 'credential', cred_id::text,
          jsonb_build_object('project_id', v_project_id, 'source', 'db_rpc'));

  -- The only read of vault.decrypted_secrets in the whole app. Returns exactly the plaintext
  -- string (plus the server-derived project_id for auditing) and nothing else.
  return query
    select vds.decrypted_secret, v_project_id
    from vault.decrypted_secrets vds
    where vds.id = v_secret_id;
end;
$$;
-- grants unchanged: anon revoked / authenticated granted in 20260720000002; create or replace
-- preserves existing ACLs.

-- Full recreate of 20260720000001_set_user_role_rpc.sql; the ONLY change is the audit insert.
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
  -- H3: role changes are audited at the DB level too (same transaction as the swap), so a
  -- direct RPC call cannot silently re-role an account.
  insert into public.audit_logs (actor_id, action, resource_type, resource_id, metadata)
  values (auth.uid(), 'user.role_changed', 'user', target_user::text,
          jsonb_build_object('new_role', new_role, 'source', 'db_rpc'));
end;
$$;

-- =================================================================================================
-- H6: credentials.owner_id pinned on INSERT, immutable on UPDATE
-- =================================================================================================
-- owner_id = auth.uid() is an unconditional SELECT-policy bypass (by design: an owner always
-- sees their own credential). But neither write policy constrained what owner_id could be SET
-- to, so any manage_credentials holder could hand a permanent, unaudited, non-expiring
-- metadata-read backdoor to an arbitrary account -- bypassing the audited, expirable
-- credential_access grant flow. Closures:
--   1. INSERT pins owner_id to the creator (or null). The app already does exactly this
--      (addCredentialAction inserts owner_id = current.user.id).
--   2. UPDATE loses the owner_id column privilege entirely (immutable post-create) -- the same
--      column-scoped-grant pattern as budget_items.created_by / project_status_updates. The
--      column list matches everything the app's update path touches (credentialUpdateSchema:
--      name/username/related_url/environment/visibility/notes/expires_at); project_id and
--      secret_id become immutable too (a movable project_id would re-tier a credential; a
--      movable secret_id would let reveal-on-A decrypt B's vault entry).

drop policy "insert credentials" on public.credentials;
create policy "insert credentials" on public.credentials for insert
  with check (
    public.has_permission(auth.uid(),'manage_credentials', project_id)
    and (visibility <> 'admins_only' or public.is_admin())
    and (owner_id is null or owner_id = auth.uid()));

revoke update on public.credentials from authenticated;
grant update (name, username, related_url, environment, notes, expires_at, visibility)
  on public.credentials to authenticated;

-- =================================================================================================
-- H7: avatars bucket -- explicit raster mime allowlist (image/* matched image/svg+xml)
-- =================================================================================================
-- Storage validates the declared content type against allowed_mime_types; `image/*` admitted
-- SVG, and a script-bearing SVG served from the public bucket's raw URL is stored XSS on the
-- storage origin. Mirrored app-side in src/app/actions/avatars.ts (explicit allowlist instead
-- of startsWith("image/")).
update storage.buckets
set allowed_mime_types = array['image/png','image/jpeg','image/webp','image/gif']
where id = 'avatars';

-- =================================================================================================
-- M5: EXECUTE lockdown -- is_admin(uuid) and pm_options() were PUBLIC-executable
-- =================================================================================================
-- Postgres grants EXECUTE to PUBLIC by default; every other function here reverses that, these
-- two never did. is_admin(uuid) was an unauthenticated admin-existence oracle. Explicit grants
-- restated because revoking PUBLIC removes the only path authenticated had.
revoke all on function public.is_admin(uuid) from public, anon;
grant execute on function public.is_admin(uuid) to authenticated, service_role;
revoke all on function public.pm_options() from public, anon;
-- pm_options: authenticated + service_role grants already exist (20260721000003).

-- =================================================================================================
-- SECURITY NOTE (M6) -- deliberately NOT changed here
-- =================================================================================================
-- `manage_people` is granted GLOBALLY to project_manager (20260716000004). Two documented
-- consequences: (a) every PM can read every employee's sick leave (time_off SELECT policy
-- exposes non-vacation rows to manage_people holders); (b) the "manage people" FOR ALL policy
-- lets a PM rewrite people.user_id (an identity-remapping data path -- no permission
-- escalation, since has_permission keys off auth.uid()/user_roles, never people). Re-scoping
-- manage_people or splitting sick-leave visibility affects live PM people-management features
-- and is a PRODUCT DECISION, tracked in docs/security/audit-2026-07-29/SUMMARY.md (M6). Do not
-- "fix" casually in a later migration without deciding the intended PM feature set.
