# Database Authorization Audit — RLS, Policies, Functions, Views, Grants

Scope: `supabase/migrations/*.sql` (20260714000001 → 20260727000005) and `supabase/seed.sql`.
Reviewed line-by-line: all 33 `create table` statements, all RLS enable statements, all
`create policy` statements, all `security definer` functions, all views, and all
`grant`/`revoke` statements. Cross-referenced two findings against app code
(`src/app/actions/project-credentials.ts`, `src/app/(app)/workload/page.tsx`) to confirm
exploitability independent of the Next.js UI.

---

## Summary

| Severity | Count |
|---|---|
| CRITICAL | 0 |
| HIGH | 2 |
| MEDIUM | 2 |
| LOW | 3 |

No table is missing RLS. No view is missing `security_invoker`. No `security definer`
function is missing `set search_path`. No table or sensitive function is granted to `anon`.
The worst issues are both **authorization-boundary gaps that live inside otherwise
well-designed mechanisms**: a `security definer` RPC with no internal permission check, and
an UPDATE/INSERT policy that gates on the wrong thing while leaving an ownership column
unpinned.

---

## HIGH

### H1. `person_current_allocation` / `person_weekly_allocation` — SECURITY DEFINER RPCs with no permission check, callable for any person by any authenticated user

**Files:**
- `supabase/migrations/20260716000002_workload_views.sql:38-48`
- `supabase/migrations/20260716000003_timeline_fn.sql:16-40`

```sql
-- workload_views.sql:38-48
create or replace function public.person_current_allocation(p_person uuid)
returns table (allocation_pct numeric, project_count int)
language sql stable security definer set search_path = public as $$
  select coalesce(sum(a.allocation_pct), 0)::numeric,
         count(distinct a.project_id)::int
  from public.assignments a
  where a.person_id = p_person
    and current_date between a.start_date and coalesce(a.end_date, 'infinity');
$$;
revoke all on function public.person_current_allocation(uuid) from public, anon;
grant execute on function public.person_current_allocation(uuid) to authenticated;
```

```sql
-- timeline_fn.sql:16-40 — same shape, windowed per-week, granted to authenticated identically
create or replace function public.person_weekly_allocation(p_person uuid, p_from date, p_weeks int)
...
grant execute on function public.person_weekly_allocation(uuid, date, int) to authenticated;
```

Both functions are deliberately `security definer` so they can sum **all** of a person's
`assignments` rows globally, bypassing the `assignments` table's own RLS ("view assignments":
`view_team` on the specific project, or the caller's own row) — that's the documented,
intentional purpose (aggregate capacity is "not sensitive," per the design comment at
`workload_views.sql:14-27`). The gap: **neither function checks that the caller holds
`view_people` (or any permission at all) before running.** Every other `security definer` RPC
in this codebase self-checks a permission inline — `reveal_credential_secret` (checks
`reveal_credential`), `add_project_person`/`set_person_allocation`/`remove_project_person`
(check `manage_project_members`), `pm_options` (checks `create_project`), `set_user_role`
(checks `is_admin()`). These two do not follow that pattern.

**Exploit:** the seeded `viewer` role (`supabase/seed.sql:30`, e.g. `vera.view@pmcms.local`)
gets **zero** role-level permissions — no `view_people` — and is intended to see only what an
admin explicitly grants via `user_project_permissions` on specific projects
(`20260715000002_permission_model.sql:116`). That caller can still call, directly via
PostgREST/`supabase-js` `.rpc()` (no app UI needed):

```
POST /rest/v1/rpc/person_current_allocation  { "p_person": "<any people.id>" }
POST /rest/v1/rpc/person_weekly_allocation   { "p_person": "<any people.id>", "p_from": ..., "p_weeks": 12 }
```

and learn that person's **total** allocation % / active-project-count / week-by-week booking
across **every project in the company**, including projects the caller has no relationship
to at all — not just the one project they were granted into. In a PM tool where "which other
clients is this vendor's staff busy with" is exactly the kind of signal a client-facing viewer
account must not get, this is a real cross-tenant leak. `person_id` values are learnable from
any RLS-visible row the viewer can already reach (e.g. `project_parts.responsible_person_id`,
`assignments.person_id` on their one granted project), so the UUID isn't a meaningful barrier.
The app itself (`src/app/(app)/workload/page.tsx:33-52`) never triggers this path for such a
caller because it only calls the RPC for `person_workload_rows`-visible ids (which are already
RLS-filtered by `view_people` on `people`) — but that's an accident of how the *page* is
written, not a control the *function* enforces. Anyone calling the RPC directly skips it.

**Fix:** add the same self-check pattern used elsewhere in this file's own conventions:

```sql
create or replace function public.person_current_allocation(p_person uuid)
returns table (allocation_pct numeric, project_count int)
language sql stable security definer set search_path = public as $$
  select coalesce(sum(a.allocation_pct), 0)::numeric,
         count(distinct a.project_id)::int
  from public.assignments a
  where public.has_permission(auth.uid(), 'view_people')
    and a.person_id = p_person
    and current_date between a.start_date and coalesce(a.end_date, 'infinity');
$$;
```
(returns an empty/zero row for a caller without `view_people`, mirroring how the RLS-backed
columns already null out for unauthorized callers elsewhere in this codebase). Apply the same
guard to `person_weekly_allocation`.

---

### H2. `credentials.owner_id` is not pinned in INSERT/UPDATE `WITH CHECK` — lets a `manage_credentials` holder grant unconditional, unaudited, non-expiring read access to arbitrary users

**File:** `supabase/migrations/20260715000006_credentials_delegations.sql`

Read policy (`:197-201`):
```sql
create policy "view credential metadata" on public.credentials for select using (
  (public.has_permission(auth.uid(),'view_credentials', project_id)
   and (visibility <> 'admins_only' or public.is_admin()))
  or owner_id = auth.uid()
  or public.has_credential_access(id, auth.uid()));
```
Write policies (`:206-212`):
```sql
create policy "insert credentials" on public.credentials for insert
  with check (public.has_permission(auth.uid(),'manage_credentials', project_id) and (visibility <> 'admins_only' or public.is_admin()));
create policy "update credentials" on public.credentials for update
  using (public.has_permission(auth.uid(),'manage_credentials', project_id) and (visibility <> 'admins_only' or public.is_admin()))
  with check (public.has_permission(auth.uid(),'manage_credentials', project_id) and (visibility <> 'admins_only' or public.is_admin()));
```
Grant (`:240`): `grant select, insert, update, delete on public.credentials, ... to authenticated;` — table-wide, no column restriction.

The `owner_id = auth.uid()` branch in the SELECT policy is an **unconditional** bypass — no
`view_credentials`, no `visibility` check, nothing — by design, so an owner keeps seeing their
own credential ("owner still sees their own," per the comment at `:194-196`; this is correct
and intentional for the `admins_only` tier, and non-admins are correctly blocked from ever
writing an `admins_only` row at all since USING re-checks the *old* row's visibility).

The gap: for `project_members`/`pms_only` tier credentials, **neither the INSERT nor the
UPDATE policy constrains what `owner_id` may be set to.** Any caller who holds
`manage_credentials` on a project (a PM on their own project, or anyone with an admin-granted
per-project `manage_credentials` grant) can:

```sql
update public.credentials set owner_id = '<any active user_profiles.id>' where id = '<cred>';
-- or set it at insert time directly
```

The target user needs **no permission whatsoever** — not `view_credentials`, not project
membership, nothing — to then read that credential's metadata (`username`, `related_url`,
`notes`, `environment`, `type`, `expires_at`) forever, via a plain `select * from
public.credentials`, entirely bypassing the purpose-built, audited, expirable grant mechanism
(`credential_access` + "managers manage credential grants" policy at `:218`, which itself
correctly re-checks `manage_credentials` + the `admins_only` gate on every grant). This is not
merely a different path to a capability `manage_credentials` already implies (unlike
`credential_access`, which is scoped, revocable and expirable), it's a **standing backdoor with
no `granted_by`/`granted_at`/`expires_at` record at all** — confirmed live: the DB-level grant
is table-wide (no column scoping), so this is reachable even though the app's own action layer
(`src/app/actions/project-credentials.ts:99-114`, `credentialUpdateSchema`) never exposes
`owner_id` as an editable field — a direct PostgREST call bypasses the Next.js app entirely.

**Fix:** pin `owner_id` in both write policies, the same way `budget_items.created_by` is
pinned (`20260715000005_budgets.sql:104`) and the way `project_status_updates` was tightened
after an equivalent finding (`20260727000005_status_update_tighten.sql`):

```sql
create policy "insert credentials" on public.credentials for insert
  with check (
    public.has_permission(auth.uid(),'manage_credentials', project_id)
    and (visibility <> 'admins_only' or public.is_admin())
    and (owner_id is null or owner_id = auth.uid()));

create policy "update credentials" on public.credentials for update
  using (...)
  with check (
    public.has_permission(auth.uid(),'manage_credentials', project_id)
    and (visibility <> 'admins_only' or public.is_admin())
    and owner_id is not distinct from (select owner_id from public.credentials where id = credentials.id));
```
or simpler: drop `owner_id` from the table-wide grant and issue a narrow `grant update
(name, username, related_url, environment, notes, expires_at, visibility) on
public.credentials to authenticated`, exactly mirroring the `budget_items`/
`project_status_updates` column-scoped-grant pattern already used twice elsewhere in this
codebase.

---

## MEDIUM

### M1. `projects.client_id` / `projects.owner_id` are not protected from reassignment by `edit_project` holders

**File:** `supabase/migrations/20260715000003_projects.sql:211`
```sql
create policy "edit project" on public.projects for update using (public.has_permission(auth.uid(),'edit_project', id));
```
No `WITH CHECK` is given, so Postgres reuses the `USING` expression for both (standard,
documented RLS behavior — not itself a bug: since `id` is the row's own primary key, the
implicit check still re-evaluates `has_permission(edit_project, id)` correctly). The table
does have a purpose-built trigger protecting `pm_id` specifically —
`protect_project_pm` (`:138-148`) — because `has_permission`'s `own_projects` scope keys off
`pm_id`, so an uncontrolled `pm_id` change would let a PM silently self-escalate onto a
different project. **`client_id` and `owner_id` get no equivalent protection.** Today neither
column drives any RLS decision elsewhere (`owner_id` is unused by any policy;
grep confirms it's set once at creation and never read for authorization), so this is a
data-integrity/attribution gap rather than a proven privilege-escalation path — but it means
any `edit_project` holder (a PM, on their own project) can silently repoint a project at a
different client via a direct PostgREST PATCH, corrupting client attribution for
budgets/status updates/contacts that all key off `project_id`, not `client_id`.

**Fix:** add a trigger mirroring `protect_project_pm` that blocks non-admins from changing
`client_id` (and, if it's meant to stay stable, `owner_id`) — or explicitly document that
`client_id` reassignment is intended editor behavior and column-scope the grant to reflect it.

### M2. `project_links` INSERT / `credential_access` INSERT don't pin attribution columns (`owner_id`, `granted_by`)

**Files:**
- `supabase/migrations/20260715000003_projects.sql:237-239` ("insert links")
- `supabase/migrations/20260715000006_credentials_delegations.sql:218` ("managers manage credential grants")

Neither `with check` constrains `owner_id`/`granted_by` to `auth.uid()`, unlike
`budget_items` (`created_by = auth.uid()`, `:104`) or `delegations`/`project_status_updates`
(`from_user`/`author_id` pinned). Confirmed low-impact here specifically because (a)
`project_links`' own read policy (`:228-232`) never branches on `owner_id`, so spoofing it
doesn't change who can see a link, and (b) `credential_access.granted_by` is metadata only —
but both are still attribution fields an attacker can falsify (e.g. a `manage_links` holder
can insert a link attributed to someone else; a `manage_credentials` holder can record a
credential grant as issued "by" a different admin). Low security impact, real audit-trail
integrity impact.

**Fix:** `with check (... and (owner_id is null or owner_id = auth.uid()))` /
`(... and (granted_by is null or granted_by = auth.uid()))`.

---

## LOW

### L1. Catalog tables use `auth.uid() is not null` for SELECT — correct, but flagged per audit criteria for transparency
`roles`/`permissions`/`role_permissions` (`20260715000002_permission_model.sql:222-224`) and
`managed_options` (`20260721000001_managed_options.sql:19-20`) use
`for select using (auth.uid() is not null)`. This pattern is explicitly called out as
suspicious in the audit brief, but on inspection all four tables hold **non-sensitive UI
label/catalog data only** (permission keys/descriptions, role names, dropdown option lists)
with no client budgets, costs, PII, or secrets — every write path on all four is separately
gated by `is_admin()` (or `manage_people` for the `managed_options` insert-only policy added
in `20260727000003_managed_options_insert.sql:5-6`). No fix needed; noted for completeness.

### L2. `storage.objects` avatars bucket: broad authenticated INSERT, public read
**File:** `supabase/migrations/20260727000002_avatars_bucket.sql:9-16`
```sql
insert into storage.buckets (id, name, public, ...) values ('avatars', 'avatars', true, ...);
create policy "public read avatars" on storage.objects for select using (bucket_id = 'avatars');
create policy "authenticated upload avatars" on storage.objects for insert to authenticated with check (bucket_id = 'avatars');
```
Any authenticated user can upload any image (≤2MB, `image/*`) into the public `avatars`
bucket under any key, with no per-user path scoping and no `manage_people` check (the comment
at `:1-7` acknowledges this is intentional/YAGNI: "an orphaned upload by an authenticated
non-manager is harmless"). No UPDATE/DELETE policy exists, so existing objects can't be
overwritten or removed by non-owners. Public-by-design bucket; low risk, informational only.

### L3. `has_permission`'s `own_projects`/`member_projects` scopes and delegation checks are re-derived per call, not memoized
Not a vulnerability — every `has_permission` call independently re-joins `user_roles` /
`role_permissions` / `projects` / `project_members` / `delegations`, so there's no
TOCTOU window between check and use within a single statement. Noted only because it's worth
confirming for anyone reviewing this: `has_permission` is `stable`, not `volatile`, and its
result is safe to use inline in RLS `USING`/`WITH CHECK` clauses (as done everywhere) without
row-level inconsistency.

---

## Clean Bill — Verified Correct

**RLS coverage:** all 33 `public` tables created across every migration have a matching
`alter table ... enable row level security` (cross-checked by grep: 33 `create table`
statements, 33 `enable row level security` statements). No coverage gap found.

**Views — `security_invoker`:** all 5 views (`project_list_rows`, `person_workload_rows`
×2 revisions, `project_budget_rows`, `part_budget_rows`) declare `with (security_invoker =
true)`. Verified each one's financial/cost columns null out via `LEFT JOIN`/`LEFT JOIN
LATERAL` to genuinely RLS-protected tables (`part_billing`/`part_costs` behind `view_budget`/
`view_internal_cost`, `rates` behind `view_internal_cost`) rather than any app-side hiding —
confirmed by reading the join targets' own RLS policies, not just the view comments.

**SECURITY DEFINER functions:** every one of the ~25 `security definer` functions across all
migrations sets `search_path` (`public`, `public, vault`, or `''`) — no search-path-hijack
surface. All trigger-backed definer functions (`protect_profile_columns`,
`protect_project_pm`, `enforce_delegatable_permission`, `validate_delegation_project`,
`enforce_delegation_update`, `enforce_grantable_permission`,
`enforce_same_project_dependency`, `sync_project_dates_from_milestone`,
`prevent_delete_person_with_history`) only enforce constraints/derive server-controlled
values, never return extra data to the caller. RPC-style definer functions other than the
two flagged in H1 all self-check a permission before doing anything privileged:
`reveal_credential_secret` (gold-standard — double-gates on `reveal_credential` **and**
re-derives the credential's own `visibility` tier server-side, uses `set search_path = ''`
for the one query that touches `vault.decrypted_secrets`, and returns an identical error for
"doesn't exist" vs. "not permitted" to prevent enumeration), `set_user_role` (`is_admin()`),
`add_project_person`/`set_person_allocation`/`remove_project_person`
(`manage_project_members`), `pm_options` (`create_project`), `admin_revoke_user_sessions`
(`is_admin()`). `create_credential_secret` and `create_delegation` carry no privilege of
their own for `anon`/`authenticated` beyond what the RLS-invoking body already checks.

**`person_current_allocation`'s intentional bypass is correctly scoped in its stated purpose**
(sums globally, returns only two numbers, never project ids/names) — the finding in H1 is
specifically that the *caller* isn't gated, not that the *columns returned* are wrong.

**Vault/credentials:** the `vault` schema carries zero grants to `anon`/`authenticated`
(`20260715000006:242`) and is not in `api.schemas`, so it's unreachable except through the two
purpose-built `security definer` wrappers, both correctly locked down
(`create_credential_secret` → `service_role` only; `reveal_credential_secret` → `authenticated`
but self-gated on `reveal_credential` + the credential's own `visibility` tier, matching the
metadata SELECT policy's own gating exactly so reveal can never exceed what metadata-read
already allows). `credentials.secret_id` itself (a Vault reference, not the secret) is
readable by anyone who can read the metadata row, which is correct — the id alone is useless
without going through `reveal_credential_secret`.

**GRANTS:** zero grants to `anon` anywhere in the migration set (grep-verified across every
file). `authenticated` gets table-wide CRUD in most cases, which is necessary given
`auto_expose_new_tables` is off (documented at `20260714000001:151-159`) — every one of those
grants is backed by RLS that actually narrows rows, and the two places where a column needed
tighter scoping than the table grant (`notifications.read_at`,
`budget_items` non-`created_by`/`budget_id` columns, `project_status_updates` six content
columns after the `_tighten` migration) already use column-scoped `grant update (...)`. No
`GRANT` was found that RLS then has to claw back with zero matching policy (i.e., no
"grant now, hope a policy shows up later" pattern).

**Sensitive-column gating via table separation** (`part_billing`/`part_costs`,
`view_budget`/`view_internal_cost`) is correctly enforced at the RLS layer on the base tables,
and the finance-only `rates` table (`"finance reads rates"`, `20260715000004_people_workload
.sql:159`) correctly gates both `internal_cost` and `billing` rate types behind
`view_internal_cost` — no separate, weaker path to either.

**Self-corrected bug (worth noting as evidence of a working review process):**
`project_status_updates` briefly had a table-wide `UPDATE` grant
(`20260727000004_status_update_edit.sql:9`) that would have let an author PATCH `project_id`/
`created_at` directly via PostgREST (cross-project injection, history backdating) — this was
caught and fixed one migration later
(`20260727000005_status_update_tighten.sql`) with a column-scoped grant plus a `WITH CHECK`
that re-validates `edit_status` against the (now unchangeable) `project_id`. H2 above is the
same class of bug, on `credentials.owner_id`, still unfixed.

**Sick leave privacy:** `time_off` correctly restricts `type = 'sick'` rows to the owning
person, `manage_people` holders, and admins only — a plain `view_people` holder sees vacation
rows exclusively (`20260715000004_people_workload.sql:121-125`), confirmed also true of the
derived `on_vacation_now`/`vacation_ends_on` columns in `person_workload_rows`
(comment-verified and re-checked against the `time_off` RLS it joins through).

**Delegation immutability:** `delegations` rows, once `revoked_at` is set, are enforced
immutable by `enforce_delegation_update` (`20260715000006:99-118`) at the trigger level, not
just RLS — and the same trigger blocks changing `from_user`/`to_user`/`starts_at`/`ends_at`/
`handover_notes` even before revocation, so the `"revoke own delegation"` policy's lack of an
explicit `WITH CHECK` (reusing `USING`) is safe in practice.

**Per-project grant escalation is closed:** `enforce_grantable_permission`
(`20260720000005_enforce_grantable_permission.sql`) blocks `manage_access`, `manage_users`,
`view_audit`, `create_project`, `export_data`, and `reveal_credential` from ever being
handed out via `user_project_permissions` — and none of those six has a `role_permissions`
catalog row either (verified against the full INSERT list in
`20260715000002_permission_model.sql:79-115`), so `manage_access` (the permission that lets
someone grant further permissions) is reachable **only** through `is_admin()`. Self-escalation
via the ad-hoc grants table is not possible.

---

## Files reviewed
All files under `supabase/migrations/` (28 files, `20260714000001` → `20260727000005`) and
`supabase/seed.sql`. Spot-checked against `src/app/actions/project-credentials.ts` and
`src/app/(app)/workload/page.tsx` to confirm H1/H2 are exploitable independent of app-layer
gating.
