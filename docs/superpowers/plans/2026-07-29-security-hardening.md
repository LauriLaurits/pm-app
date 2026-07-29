# Security Hardening Wave Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) tracking. Source: `docs/security/audit-2026-07-29/SUMMARY.md` + the per-stream reports.

**Goal:** Fix the Critical + all 7 High + the client-boundary Medium findings from the 2026-07-29 audit, with pgTAP invariant tests so the hardening can't silently regress. Config-level items (M3/M4/M7) land as code/config now but take effect on deploy.

**Architecture:** One DB migration (policies + definer-function hardening + storage mime), app-validation fixes, client-boundary allowlists, config hardening, and a batch of pgTAP invariant assertions. No feature behavior changes for legitimate users — these close over-exposure and add defense-in-depth.

## Global Constraints
- master; `git status` first — foreign uncommitted changes ⇒ BLOCKED. **DO NOT DEPLOY** (local + GitHub only).
- Every DB change is REVERSIBLE-minded and TESTED: `npx supabase db reset` must stay green and `npm run test:db` must pass with the new assertions. Never break an existing RLS policy that legitimate roles depend on.
- CRITICAL: `has_permission()` is called BY nearly every RLS policy as the querying role — you must NOT revoke `authenticated`'s EXECUTE on it or every policy breaks. Hardening it means adding an INTERNAL guard (uid = auth.uid() OR is_admin), never removing the grant. Read each function body before touching it.
- `npm run test && npm run lint && npm run build` + `npm run test:db` green per commit. Live-verify via auth-HTTP across admin.demo / bella.pm / milo.dev and a viewer (vera) where relevant.

---

### Task 1: Database migration — policy + definer-function hardening + storage mime

**Files:** Create `supabase/migrations/20260729000001_security_hardening.sql`; Create `supabase/tests/phase9_security_invariants.test.sql`; modify affected existing test files only if an assertion moved. Regenerate `src/lib/database.types.ts` only if a column/grant change requires it (policy/function changes don't).

READ FIRST (get exact current bodies before editing): `20260715000005_budgets.sql` (budget_items policies + grants), `20260720000002_reveal_credential_rpc.sql` (reveal function), the `set_user_role` migration, `20260716000002_workload_views.sql` + `20260727000001_vacation_ends_on.sql` (person_current_allocation), `20260716000003*` (person_weekly_allocation), `20260715000002_permission_model.sql` (has_permission, is_admin, has_credential_access), `20260715000003_projects.sql` (credentials policies), `20260727000002_avatars_bucket.sql`.

Fixes (each its own clearly-commented block in the migration):
- **H2 budget_items UPDATE re-typing:** drop+recreate the UPDATE policy so BOTH `using` and `with check` require `has_permission(auth.uid(),'view_internal_cost')` in ADDITION to `manage_budget` when the row is (or becomes) a cost type; simplest robust fix — REMOVE `item_type` from the updatable column grant so type can never be changed via update (a mis-typed row is deleted+reinserted by a finance holder instead). Verify the app's budget-item edit UI doesn't rely on updating item_type (grep the actions).
- **H3 reveal/role audit at DB level:** inside `reveal_credential_secret` (and `set_user_role`), after the permission re-check and before returning, `insert into public.audit_logs(...)` a row (`action='credential.revealed'`/`'user.role_changed'`, actor = auth.uid(), resource ids, metadata WITHOUT the secret). The function is SECURITY DEFINER so it can insert. Keep the app-layer writeAudit too (belt + suspenders) — dedupe is not required.
- **H5 definer enumeration:** in `has_permission(uid,...)` add at the top `if uid is distinct from auth.uid() and not public.is_admin() then return false; end if;` (preserves every RLS call, which always passes auth.uid(); blocks foreign-uid probing). In `person_current_allocation(p_person)` / `person_weekly_allocation(...)` add a guard: return empty unless `has_permission(auth.uid(),'view_people')` OR `p_person = public.current_person_id()`. In `has_credential_access(cred,uid)` same uid-self-or-admin guard. Confirm the workload VIEW still returns correct data for a legitimate view_people holder after the guard (it calls the fn per row; view_people holders pass).
- **H6 credentials owner_id:** drop+recreate credentials INSERT/UPDATE policies (or the FOR ALL split) so `with check` pins `owner_id = auth.uid()` on insert and forbids changing owner_id on update (`owner_id = auth.uid()` is too strict for update if others legitimately own; instead: `with check (owner_id = (select owner_id from credentials where id = credentials.id))` won't work in policy — simplest: revoke `owner_id` from the UPDATE column grant so it's immutable post-create, and on INSERT `with check (owner_id = auth.uid())`). Verify the credential create action sets owner_id = current user.
- **H7 avatars mime:** `update storage.buckets set allowed_mime_types = array['image/png','image/jpeg','image/webp','image/gif'] where id='avatars';` and mirror the check in `src/app/actions/avatars.ts` (replace `startsWith("image/")` with an explicit raster allowlist).
- **M5 execute grants:** `revoke execute on function public.is_admin(uuid) from public, anon;` and same for `pm_options()` and any definer helper currently exposed to public/anon (list them — the audit named person_current_allocation, person_weekly_allocation, person_has_history, part_project as already-authenticated-only; is_admin(uuid)/pm_options are the public ones). Keep EXECUTE for `authenticated` where RLS/app needs it. DO NOT touch has_permission's grant.
- **M6 (manage_people over-grant): DO NOT fix here** — re-scoping affects PM people-management features; leave a `-- SECURITY NOTE (M6): ...` comment and it stays a product decision. Flag in the report.

pgTAP invariants (`phase9_security_invariants.test.sql`): assert (1) `relrowsecurity` true for every `public` table; (2) `security_invoker` set on every view in `reloptions`; (3) `authenticated`/`anon` lack EXECUTE on `create_credential_secret`/`reveal_credential_secret` bypass paths and on `is_admin(uuid)`; (4) a reveal writes an audit row; (5) budget_items item_type is not updatable by a manage_budget-only role (re-typing blocked); (6) credential owner_id immutable on update; (7) person_current_allocation returns empty for a foreign p_person to a no-view_people caller; (8) has_permission(other_uid,...) returns false to a non-admin. Write tests FIRST where practical, watch fail, then migrate.

Process: `npx supabase db reset && npm run test:db` all green; app suites green. Live-verify no legitimate flow broke: admin reveal still works + now audits (check audit_logs), finance still edits budgets, PM still manages own-project members, avatar upload of a PNG still works, SVG upload now rejected.
Commit: `fix(security): DB policy + definer-function hardening, storage mime, invariant tests`

### Task 2: App validation — URL scheme XSS (H1)

**Files:** `src/lib/validation/project.ts` (linkSchema.url + credential related_url if in same/related schema), test `tests/project-validation.test.ts` (+ credential validation test).
- Change bare `z.url()` to reject non-http(s): `z.url()` then `.refine(v => /^https?:\/\//i.test(v), "Must be an http(s) URL")` OR the zod v4 `z.url({ protocol: /^https?$/ })` form — VERIFY which the installed zod v4 supports (read node_modules/zod docs/types) and use the working one. Apply to project link url AND credential related_url.
- Tests (fail first): `javascript:alert(1)`, `data:text/html,...`, `vbscript:...` rejected; `https://x.com` / `http://x.com` accepted.
Process: suites green; live-check that saving a project link with a javascript: url now errors.
Commit: `fix(security): restrict link/credential URLs to http(s) (blocks javascript: XSS)`

### Task 3: Client-boundary allowlists (H4, M1, M2)

**Files:** `src/app/(app)/projects/[id]/credentials/*` (SafeCredentialRow for the project tab — mirror the index-page fix in `credentials/types.ts`/`page.tsx`), `src/app/(app)/people/{page.tsx,types.ts}` (SafePersonRow — drop internal_cost/billing_rate before the client boundary; keep them ONLY where the detail financials-card server-fetches them), `src/app/(app)/projects/[id]/parts/*` (gate/allowlist the internal notes + raw part_billing rates out of the client table).
- Pattern (from the credentials index fix): build an explicit allowlist row shape server-side, field-by-field (NEVER spread the raw row), typed via `Pick<>` so a future field addition is a conscious choice.
- For each: grep the client component to confirm which fields it actually renders; the Safe shape includes exactly those.
- Re-verify via auth-HTTP grep: as a finance viewer, `/people` HTML has zero `internal_cost`/`billing_rate`; as a manage_credentials-non-reveal holder, the project credentials tab HTML has zero `secret_id`; the parts tab has zero `notes`/`hourly_rate` for a view_project-only viewer.
Commit: `fix(security): allowlist client-boundary rows (people rates, project-credential secret_id, part notes/rates)`

### Task 4: Config hardening (M3, M4)

**Files:** `supabase/config.toml` (password), `src/lib/supabase/{server,middleware}.ts` (cookies), possibly `next.config.ts` (HSTS header).
- M3: set `[auth] minimum_password_length = 12` (+ `password_requirements` if supported by the local CLI version — verify, don't 402/error the config). Note in the report that this needs `supabase config push` at deploy.
- M4: add `secure: true` to `cookieOptions` (guard so local http dev still works — Next/@supabase/ssr: `secure` in production only, e.g. `process.env.NODE_ENV === "production"`); add an HSTS header via next.config headers() for production.
- These are config; verify build stays green and local login still works (secure cookies only in prod).
Commit: `fix(security): 12-char password floor, Secure cookies + HSTS (prod)`

### Task 5: Sweep + whole-wave review (NO deploy)

- `npm run test && npm run test:db && npm run lint && npm run build`.
- Re-run the audit's spot-checks: the 8 pgTAP invariants pass; the three client-boundary leak greps return zero; a javascript: link is rejected; a direct `has_permission(other_uid)` call returns false; reveal writes an audit row.
- Regression: admin/bella/milo across credentials, budgets, people, projects, dashboard, reports — no legitimate flow broken.
- Whole-wave review (controller dispatches, strong model, security lens). Update `docs/security/audit-2026-07-29/SUMMARY.md` marking each finding fixed/deferred.
- Deferred (product decisions, documented not fixed): M6 (manage_people scope), M7 (open signup — pre-deploy checklist), the Low items. NO deploy — the DB migration ships to prod only when the user approves (`supabase db push`).
