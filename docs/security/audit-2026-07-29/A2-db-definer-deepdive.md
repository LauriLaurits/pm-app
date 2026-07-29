# DATABASE Security Audit — pm (RLS / views / definer functions / grants)

Read-only audit. Scope: all 31 files in `supabase/migrations/`, `supabase/config.toml`,
all 23 files in `supabase/tests/`. Nothing was modified.

Overall: this is an unusually careful schema. Every one of the 33 tables has RLS enabled
(33 `create table` / 33 `enable row level security`), grants are deliberately narrowed to
match policies, FOR ALL policies are split into SELECT/INSERT/UPDATE/DELETE precisely where
a tier gate would otherwise leak through the SELECT arm (`project_links`, `credentials`),
all 4 views are `security_invoker = true`, and nearly every SECURITY DEFINER function pins
`search_path` and is revoked from `public, anon`. The findings below are the residue.

---

## H1 — Credential reveal is auditable only in app code; the RPC is directly callable

`public.reveal_credential_secret(uuid)` has `GRANT EXECUTE ... TO authenticated`
(`supabase/migrations/20260720000002_reveal_credential_rpc.sql:83`). The function itself
performs the permission + visibility check correctly and returns plaintext — but it writes
**no audit row**. The audit trail lives entirely in the server action
(`src/app/actions/credential-reveal.ts:69`, `writeAuditStrict`).

The browser holds the user's JWT and the publishable key. `POST /rest/v1/rpc/reveal_credential_secret`
with `{"cred_id": "..."}` from the browser console returns the plaintext, bypassing
`revealCredentialAction` and therefore the audit log entirely. The action's "fail closed if the
audit write fails" guarantee is real for the app path and vacuous for the direct path.

For a system whose stated top-tier asset is Vault credentials, "every reveal is audited" is
currently an app-layer convention, not a DB invariant.

**Fix:** insert the audit row *inside* the definer function (it runs as the owner, which is
exactly the role that may write `audit_logs`) — capture `auth.uid()`, the credential id, and
the server-derived `project_id`, in the same transaction that returns the secret. Keep the
app-side write too if you want the actor email; make the DB one authoritative.
The same applies to `set_user_role` (`20260720000001_set_user_role_rpc.sql`) — role changes
are audited only by `src/app/actions/admin.ts`.

## H2 — `budget_items` UPDATE policy has no internal-cost gate → finance tier bypass

Read gate (`20260715000005_budgets.sql:91`):
```
create policy "view budget items" ... for select using (
  exists (... view_budget ...)
  and (item_type not in ('planned_cost','actual_cost') or has_permission(auth.uid(),'view_internal_cost')));
```
Write gate (`:105`) checks **only** `manage_budget`, with no `view_internal_cost` term, and the
column grant (`:117`) includes `item_type`:
```
grant update (item_type, name, amount, occurred_on, note) on public.budget_items to authenticated;
```

A `project_manager` holds `manage_budget` (own_projects) and does **not** hold
`view_internal_cost`. On their own project they can:

```sql
update budget_items set item_type = 'invoice'
 where budget_id = <own project budget> and id = <a row they cannot select>;
-- then SELECT it: item_type is now 'invoice', so the read policy's internal-cost term passes
```

Blind-but-effective: they can iterate `id` values (bigint identity, enumerable) filtered by
their own `budget_id`, and every flip that succeeds reveals a `planned_cost` / `actual_cost`
amount. That is the finance-only internal cost tier that `part_costs`, `rates`, and the
`margin` columns of `project_budget_rows` / `part_budget_rows` all work hard to protect.
The same policy also lets them silently *rewrite* or DELETE cost rows they cannot see.

`supabase/tests/phase2_budgets.test.sql:57` asserts the PM cannot SELECT cost items; nothing
tests the UPDATE path.

**Fix:** add the internal-cost term to the UPDATE/DELETE policies' USING **and** WITH CHECK
(so a row can neither be re-typed *into* nor *out of* the cost tier by a caller lacking
`view_internal_cost`), e.g. append
`and (item_type not in ('planned_cost','actual_cost') or has_permission(auth.uid(),'view_internal_cost'))`
to all three of `update budget items` / `delete budget items` and the new-row check.

## H3 — SVG upload into a public bucket = stored XSS on the storage origin

`20260727000002_avatars_bucket.sql`:
```
values ('avatars','avatars', true, 2097152, array['image/*']);
create policy "public read avatars" on storage.objects for select using (bucket_id = 'avatars');
create policy "authenticated upload avatars" on storage.objects for insert to authenticated with check (bucket_id = 'avatars');
```

Three compounding issues:

1. `image/*` matches `image/svg+xml`. Supabase Storage validates the *declared* content-type,
   not the bytes. An SVG containing `<script>` uploaded with `Content-Type: image/svg+xml`
   is stored and served inline from the storage origin — stored XSS, reachable by anyone
   (bucket is `public = true`, and the SELECT policy has no `to` clause, so it covers `anon`).
2. The INSERT policy is `to authenticated` with no other predicate. `authenticated` includes
   users whose `user_profiles.status` is still `'pending'` (signup is open and email
   confirmation is off — see M4). An unapproved signup can write to the bucket.
3. No path scoping: any authenticated user may write any object name anywhere in the bucket.

**Fix:** replace `image/*` with an explicit `array['image/png','image/jpeg','image/webp']`;
add a status/permission predicate to the insert policy; scope names to a per-user prefix
(`(storage.foldername(name))[1] = auth.uid()::text`).

## H4 — What a future `contracts` bucket must do differently

Do not model it on `avatars`. Concretely:

- **`public = false`.** Contracts must never be reachable by object URL. Serve them via
  short-lived signed URLs minted server-side *after* a `has_permission(..., 'view_budget'/
  'manage_clients', project_id)` check, with the shortest TTL the UI tolerates.
- **No `anon` in any policy.** Every policy needs an explicit `to authenticated`, and every
  predicate must resolve permission, not merely authentication.
- **Path encodes the authorization subject.** Store as `<project_id>/<uuid>.<ext>` and write
  policies against it, e.g.
  `using (bucket_id = 'contracts' and public.has_permission(auth.uid(),'view_project', ((storage.foldername(name))[1])::uuid))`.
  `avatars` has no such binding, which is why "any authenticated user may upload" was
  acceptable there and would be catastrophic here.
- **Separate read and write permissions.** Reading a contract should key on a client/budget
  permission; uploading should key on `manage_clients` / `manage_budget`; deletion should be
  admin-only or forbidden (contracts are records).
- **Explicit MIME allowlist** (`application/pdf` and nothing else) plus a size cap; never a
  wildcard, for the reason in H3.
- **Immutability.** No UPDATE policy — a new version is a new object. Otherwise a contract can
  be silently rewritten with no trace.
- **Audit every read.** Same conclusion as H1: put the audit write on the server path that
  mints the signed URL, and make that the *only* path (private bucket guarantees it, which is
  precisely why `public = false` matters more than any policy).

---

## M1 — `is_admin()` and `pm_options()` are executable by `anon` (and `PUBLIC`)

Postgres grants `EXECUTE` to `PUBLIC` by default. Every other function in this schema
explicitly reverses that (`revoke all on function ... from public, anon`). Two do not:

- `public.is_admin(uuid)` — `20260714000001_phase1_auth.sql:48` and redefined at
  `20260715000002_permission_model.sql:126`. No revoke anywhere. It is SECURITY DEFINER, in
  the exposed `public` schema, and takes an arbitrary `uid`. An **unauthenticated** caller can
  `POST /rest/v1/rpc/is_admin {"uid":"<uuid>"}` and learn whether that account is an admin —
  a target-selection oracle for phishing/credential-stuffing.
- `public.pm_options()` — `20260721000003_project_client_contact.sql:32`. Only `grant execute`,
  no revoke. Benign in practice (its `where` clause includes
  `has_permission(auth.uid(),'create_project')`, which is false for `auth.uid() = null`, so
  anon gets zero rows) but it breaks the codebase's own invariant and is one careless edit away
  from leaking the PM roster.

**Fix:** `revoke all on function public.is_admin(uuid) from public, anon;` +
`grant execute ... to authenticated;` and the same for `pm_options()`. Then add a pgTAP
assertion (see T3) so this can't regress.

## M2 — Definer helpers with no permission check are callable by pending/disabled users

`has_permission()` gates every non-admin branch on `user_profiles.status = 'active'`, which is
excellent. But several SECURITY DEFINER helpers are granted to `authenticated` and perform
**no** status or permission check of their own. `authenticated` includes accounts that signed
up seconds ago and are still `pending`, and accounts an admin has set to `disabled` whose JWT
has not yet expired (`jwt_expiry = 3600`):

| function | migration | exposure |
|---|---|---|
| `person_current_allocation(uuid)` | `20260716000002:38` | any person's total allocation % + active project count |
| `person_weekly_allocation(uuid,date,int)` | `20260716000003:16` | same, week by week, arbitrary range |
| `person_has_history(uuid)` | `20260716000004:40` | whether a person has any assignments/time |
| `has_permission(uuid,text,uuid)` | `20260715000002:186` | **any** user's permission on **any** project — a full authorization-map oracle |
| `has_credential_access(uuid,uuid)` | `20260715000006:172` | whether **any** user holds access to a given credential |
| `part_project(uuid)` | `20260715000005:56` | part → project mapping |

The workload aggregates are a documented, deliberate trade-off ("aggregate capacity is not
sensitive") and I agree with the reasoning — but the reasoning assumes the caller is a
`view_people` holder, and nothing enforces that. The `uid`-parameterised ones
(`has_permission`, `has_credential_access`) are the more interesting pair: they let any
session enumerate the org's entire authorization graph, including who can reveal which
credential — reconnaissance for choosing whose account to attack.

**Fix (cheap):** add `if not public.has_permission(auth.uid(),'view_people') then raise
exception ...` to the two allocation functions and `person_has_history`. For `has_permission`
/ `has_credential_access`, either add `and uid = auth.uid()` for non-admin callers, or accept
the oracle knowingly and write it down.

`person_weekly_allocation` also has an unbounded `p_weeks` feeding `generate_series` — worth
a `least(p_weeks, 260)` clamp.

## M3 — Granting `manage_people` globally to PMs widened two privacy tiers

`20260716000004_manage_people_grant.sql:5` adds `('project_manager','manage_people','global')`.
Two consequences that aren't called out in that migration's comment:

- `time_off`'s SELECT policy (`20260715000004:121`) exposes non-vacation rows to
  `manage_people` holders. Every PM can now read every employee's **sick leave** globally.
  `phase2_people.test.sql:64` encodes this as expected behaviour; it may not be what HR expects
  in an EU context.
- The `manage people` FOR ALL policy lets a PM rewrite `people.user_id`. Since
  `current_person_id()` maps `auth.uid() → people.id`, a PM can null out their own row's
  `user_id`, point another person's row at their own uid, and then read that person's
  `time_entries` under the "read own time" policy (which is otherwise `view_time`-gated to
  own_projects for a PM). No *permission* escalation (`has_permission` keys off `auth.uid()`
  and `user_roles`, never `people`), but it is an identity-remapping data path.

**Fix:** if sick leave should stay private, split it — require `view_internal_cost`-style HR
permission or self-ownership for `type <> 'vacation'`. Add a trigger forbidding changes to
`people.user_id` for non-admins, mirroring `protect_project_pm`.

## M4 — Open signup + no email confirmation is what makes M2/H3 reachable

`supabase/config.toml`:
```
[auth] enable_signup = true, minimum_password_length = 6, password_requirements = ""
[auth.email] enable_signup = true, enable_confirmations = false
[auth.mfa.totp] enroll_enabled = false, verify_enabled = false
```
Anyone on the internet can obtain a valid `authenticated` JWT for an arbitrary, unverified
email address. RLS correctly yields nothing to them (`status = 'pending'`), but that JWT is
the key that unlocks every item in M2, the avatars upload policy in H3, and the
`auth.uid() is not null` catalog policies in L1.

For a system holding Vault credentials and salary data: set `enable_confirmations = true`,
raise `minimum_password_length` to ≥ 12 with `password_requirements`, and enable TOTP
(at minimum enforce it for admins). Once Entra ID is live (`[auth.external.azure]` is
scaffolded but `enabled = false`), turn `enable_signup = false` and let SSO be the only door.

Also in config: `[db.ssl_enforcement]` is commented out and `[db.network_restrictions]`
allows `0.0.0.0/0` — both matter on the hosted project, not locally.

---

## L1 — Catalog policies gate on authentication, not authorization

`roles`, `permissions`, `role_permissions` (`20260715000002:222-224`) and `managed_options`
(`20260721000001:20`) all use `using (auth.uid() is not null)` — effectively `using (true)`
for anyone holding any JWT, including pending users. This is the only place `true`-equivalent
predicates appear. The contents (permission catalog, role→permission map, role titles, team
names) are org-structure metadata, not secrets, so the impact is low — but the permission map
is a useful blueprint for an attacker and there is no reason a `pending` account should see it.
Tighten to `exists (select 1 from user_profiles where id = auth.uid() and status = 'active')`.

## L2 — `set_updated_at()` is the one function without a pinned `search_path`

`20260714000001_phase1_auth.sql:59`. It is SECURITY INVOKER and returns `trigger`, so it is
neither RPC-reachable nor privilege-bearing — the risk is theoretical (shadowing `now()`
requires CREATE on a schema in the caller's `search_path`, which `authenticated` does not have
on `public` in modern Supabase). Pin it anyway for uniformity.

## L3 — `set_user_role` can delete the last admin

`20260720000001_set_user_role_rpc.sql:16` does `delete from user_roles where user_id = target_user`
then inserts one role. An admin can demote the only other admin, or themselves, locking the
org out of every `is_admin()`-gated path (audit logs, `admins_only` credentials, role
management). Add a guard: refuse if the target currently holds `admin` and no other active
admin would remain.

## L4 — Minor policy shape notes (no exploit found, listed for completeness)

- `admins update any profile` (`20260714000001:178`), `edit project` (`20260715000003:211`),
  `admins update user_roles`, `revoke own delegation` (`20260715000006:233`) omit `WITH CHECK`.
  Postgres reuses `USING` as the check expression, so all four are safe as written — but it
  is implicit, and the surrounding code is explicit everywhere else.
- `enforce_delegation_update` (`20260715000006:99`) blocks every column except
  `revoked_at`/`revoked_by`, and does not constrain `revoked_by` to `auth.uid()` — a delegator
  can attribute their own revocation to someone else. Cosmetic.
- `manage clients`, `manage people`, `manage skills`, `manage time_off`, `manage assignments`,
  `edit parts`, `edit milestones`, `manage budgets` are FOR ALL policies whose permissive
  SELECT arm ORs into the read path. In each case the manage permission is a strict superset
  of the corresponding view permission for every seeded role, so no tier is crossed — unlike
  `project_links` / `credentials`, where the split was correctly required. Worth keeping in
  mind when adding a role that holds `manage_X` without `view_X`.
- `user_project_permissions` correctly has no UPDATE policy *and* no UPDATE grant. Good.
- `enforce_grantable_permission` (`20260720000005`) blocks the self-escalating keys per-project,
  but does not block `manage_project_members` — which, via `add_project_person`, lets its holder
  add arbitrary users to that project. Intended, presumably; note that it is not on the
  blocklist.

---

## Views (item 3): clean

All four are `security_invoker = true` — `project_list_rows` (`20260715000007:35`),
`person_workload_rows` (`20260716000002:51`, recreated identically at `20260727000001:14`),
`project_budget_rows` (`20260716000005:40`), `part_budget_rows` (`20260716000006:50`).
There are no other views and no materialized views. No view touching a sensitive table lacks
the option.

Column-level tier analysis:
- `person_workload_rows.internal_cost` / `.billing_rate` resolve through `rates`, whose RLS
  requires `view_internal_cost` → NULL for everyone but finance/admin. Correct.
- `current_allocation_pct` / `active_project_count` / `vacation_ends_on` deliberately bypass
  RLS via `person_current_allocation` (see M2 — the bypass is intentional and sound in
  reasoning, but unbounded in audience).
- `project_budget_rows` / `part_budget_rows` correctly collapse `margin` / `margin_pct` to NULL
  unless *both* `view_budget` and `view_internal_cost` resolve, and never coalesce a
  permission-gap to `0` (which would read as a real zero). This is the right instinct and it is
  applied consistently.
- `project_list_rows` joins `people` rather than `user_profiles` for the PM display name — a
  correct choice, and it means the view leaks nothing `view_people` doesn't already grant.

One caveat inherited from `security_invoker`: these views are also reachable through
`graphql_public` (config exposes it). RLS still applies, so this is an additional query
surface rather than an additional data surface.

## Vault (item 6): correctly sealed

- Secrets never touch `public.credentials` — only `secret_id uuid` referencing `vault.secrets`
  (`20260715000006:11`, asserted by `phase2_credentials.test.sql:49`).
- `config.toml` exposes only `["public","graphql_public"]`; `vault` is not in `api.schemas`,
  so PostgREST refuses it for *every* role, including `service_role`.
- No grants on the `vault` schema to `anon`/`authenticated` anywhere in the migrations
  (`20260715000006:242` states this explicitly).
- Exactly two paths cross into `vault`, both SECURITY DEFINER wrappers in `public`:
  - `create_credential_secret` — revoked from `public, anon, authenticated`; `service_role` only.
  - `reveal_credential_secret` — `authenticated`, with a correct two-condition gate
    (`has_permission('reveal_credential', project)` **AND** the same `admins_only` visibility
    tier the metadata SELECT policy enforces), `search_path = ''`, and identical error text for
    "not found" and "not permitted" so existence isn't leaked.
- `vault.decrypted_secrets` is read in exactly one place (`20260720000002:74`).

I found **no** non-definer path to decrypted secrets. The only gap on this axis is H1 (the
reveal isn't audited at the DB level).

---

## pgTAP coverage gaps (item 7)

Well covered: `has_permission` scopes/expiry/disabled-user gate, project & link visibility
tiers, credential visibility tiers, delegation grant/revoke/expiry, the reveal RPC's four
refusal paths, budget two-tier gating on SELECT, per-role NULL-ing in all four views,
`rates` finance-only, sick-leave hiding, the grantable-permission trigger, delegation
atomicity, `add/set/remove_project_person` authz, audit-log read gating + append-only,
status-update edit gating, milestone RLS + date sync, `created_by` immutability,
`notifications` read_at column grant, `protect_project_pm`.

**No test exists for:**

- **T1 — the RLS-enabled invariant itself.** Nothing asserts `relrowsecurity` is true for every
  table in `public`. A new table added without `enable row level security` would pass the whole
  suite. One `results_eq` over `pg_class` closes this permanently.
- **T2 — `security_invoker` on the four views.** All four are tested *behaviourally*, which is
  better than nothing, but `20260727000001` already demonstrates the risk: the view is dropped
  and recreated, and the option must be restated by hand. Assert
  `reloptions @> '{security_invoker=true}'` for each — a one-line guard against a future
  `create or replace view` that forgets it.
- **T3 — EXECUTE grants.** Only `create_delegation` and `reveal_credential_secret` have
  `has_function_privilege('anon', ...)` assertions. Missing for every other function — and
  the two that would have *caught real findings* are `is_admin` and `pm_options` (M1).
  Also missing, and arguably the highest-value single assertion in the suite:
  `has_function_privilege('authenticated','public.create_credential_secret(text,text,text)','EXECUTE') = false`.
- **T4 — vault unreachability.** No assertion that `authenticated` lacks USAGE on schema
  `vault` or SELECT on `vault.decrypted_secrets`. This is the load-bearing property of the
  whole credentials design and it is verified nowhere.
- **T5 — the `budget_items` re-typing bypass (H2).** No test attempts
  `update budget_items set item_type = 'invoice'` as a `manage_budget`-without-`view_internal_cost`
  caller. Add it as the regression test for the fix.
- **T6 — column-level grants beyond `created_by`.** Nothing asserts `authenticated` lacks
  UPDATE on `project_status_updates.project_id` / `.created_at` — which is the *entire point*
  of `20260727000005_status_update_tighten.sql`. That migration's tightening is currently
  untested; `phase8_status_update_edit.test.sql` only exercises the policies.
  Same for `budget_items.budget_id`.
- **T7 — storage policies.** `phase8_avatars_bucket.test.sql` asserts three bucket *columns*
  and nothing about `storage.objects` policies: not that anon cannot upload, not that the
  public-read policy is scoped to `bucket_id = 'avatars'`, not that other buckets are
  unaffected. This becomes critical the moment a `contracts` bucket exists (H4).
- **T8 — the pending/disabled-user surface.** `phase2_permissions.test.sql:27` proves a
  disabled user loses *role-based* permissions. Nothing proves a pending user gets nothing
  from the definer helpers in M2, from the `auth.uid() is not null` catalog policies in L1,
  or from storage.
- **T9 — that a reveal is recorded.** No test asserts an `audit_logs` row exists after a
  successful reveal (it currently wouldn't — see H1).
