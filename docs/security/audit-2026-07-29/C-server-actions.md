# Server Actions Authorization Audit — `src/app/actions/*.ts`

Date: 2026-07-29
Scope: all 20 files in `src/app/actions/*.ts` (52 exported server actions). No inline
`"use server"` actions exist in `src/components/**` (verified via grep — zero matches).

Core primitives reviewed:
- `requirePermission(perm, projectId?)` — `src/lib/auth/require-permission.ts:7-17` — calls
  `requireActiveUser()` then `supabase.rpc("has_permission", ...)`, throws `"Not authorized"`
  unless the RPC returns exactly `true`.
- `requireActiveUser()` / `requireAdmin()` — `src/lib/auth/session.ts:30-44`.
- `has_permission` (DB, `is_admin()` bypass) and every RLS policy are the backstop layer;
  most actions in this codebase deliberately duplicate the RLS scoping in the app layer too
  ("defense in depth" — a documented convention throughout).

## Summary

This is an unusually well-hardened codebase. Every mutating action calls `requirePermission`
or `requireAdmin`/`requireActiveUser` as its first real statement, before any DB read/write.
Every action that takes a child-object id (`memberId`, `linkId`, `credentialId`, `partId`,
`budgetItemId`, `milestoneId`, `timeOffId`, `timeEntryId`, `grantId`, `updateId`) either scopes
the write with a second `.eq()` on the owning `project_id`/`person_id`, or relies on a
SECURITY DEFINER RPC that re-derives the scope server-side (`revoke_session`,
`reveal_credential_secret`, `current_person_id`, `create_delegation`). No action spreads raw
client input into a DB write without going through a `zod` schema first.

I found **no CRITICAL or HIGH severity IDOR/authorization holes**. Findings below are
MEDIUM/LOW consistency and defense-in-depth gaps, plus one design deviation worth a second
look.

## Action inventory

| Action | File:Line | Guard | Object-scoping verdict |
|---|---|---|---|
| grantProjectAccessAction | access.ts:26 | `requirePermission("manage_access", projectId)` | project_id taken from validated input; insert scoped to that project. OK |
| revokeProjectAccessAction | access.ts:87 | `requirePermission("manage_access", projectId)` | delete `.eq("id",grantId).eq("project_id",projectId)`. OK |
| approveUserAction | admin.ts:14 | `requireAdmin()` | global op, `.eq("id",userId).eq("status","pending")`. OK |
| changeUserRoleAction | admin.ts:88 | `requirePermission("manage_users")` | global op via SECURITY DEFINER RPC `set_user_role`. OK |
| setUserStatusAction | admin.ts:128 | `requireAdmin()` | global op, self-change blocked explicitly. OK |
| adminSignOutUserAction | admin.ts:183 | `requireAdmin()` | global op via RPC scoped by target_user param. OK |
| signInAction | auth.ts:13 | none (pre-auth) | N/A — login endpoint |
| signUpAction | auth.ts:37 | none (pre-auth) | N/A — signup endpoint |
| signInWithAzureAction | auth.ts:58 | none (pre-auth) | N/A — OAuth redirect |
| signOutAction | auth.ts:77 | none (self only) | operates on caller's own session. OK |
| uploadPersonAvatarAction | avatars.ts:15 | `requirePermission("manage_people")` | no target id (new file). OK |
| addBudgetItemAction | budget-items.ts:45 | `requirePermission("manage_budget", projectId)` + `requirePermission("view_internal_cost", projectId)` for cost items | writes to budget row created/found by `project_id`. OK |
| deleteBudgetItemAction | budget-items.ts:96 | `requirePermission("manage_budget", projectId)` | manually verifies `item.budget_id → budget.project_id === projectId` before delete (budget_items has no direct project_id column). OK |
| upsertClientAction | clients.ts:12 | `requirePermission("manage_clients")` (global) | clients aren't project-scoped; whitelisted `clientRow` object built field-by-field. OK |
| deleteClientAction | clients.ts:85 | `requirePermission("manage_clients")` | global; relies on FK RESTRICT for projects. OK |
| revealCredentialAction | credential-reveal.ts:38 | `requirePermission("reveal_credential", projectId)` + RPC re-check | RPC `reveal_credential_secret` re-derives project_id + visibility tier server-side; audited before secret returned. OK — see note below on the client-supplied `projectId` param |
| copyCredentialAction | credential-reveal.ts:98 | `requirePermission("reveal_credential", projectId)` | audit-only, no data returned. OK |
| createDelegationAction | delegations.ts:41 | `requirePermission("manage_delegations", firstProjectId)` | full project/permission set re-validated inside RPC `create_delegation` + DB triggers (`validate_delegation_project`, `enforce_delegatable_permission`). OK |
| revokeDelegationAction | delegations.ts:93 | `requireActiveUser()` only, then manual `from_user === caller \|\| role === admin` check | **See Finding M-1** — not `requirePermission`, deviates from stated convention |
| addManagedOptionAction | managed-options.ts:21 | `requirePermission("manage_people")` | global lookup table. OK |
| deleteManagedOptionAction | managed-options.ts:56 | `requireAdmin()` | global. OK |
| upsertPersonAction | people.ts:12 | `requirePermission("manage_people")` (global) | whitelisted `personSchema`, no dangerous columns (id/role/is_admin absent from schema). OK |
| setPersonStatusAction | people.ts:45 | `requirePermission("manage_people")` | `.eq("id", personId)`, single-field enum-checked. OK |
| deletePersonAction | people.ts:79 | `requirePermission("manage_people")` | history check via RPC + DB trigger backstop. OK |
| addPersonSkillAction | person-skills.ts:45 | `requirePermission("manage_people")` | upsert keyed by (person_id, skill_id). OK |
| setPersonSkillLevelAction | person-skills.ts:84 | `requirePermission("manage_people")` | `.eq("person_id",..).eq("skill_id",..)`. OK |
| removePersonSkillAction | person-skills.ts:122 | `requirePermission("manage_people")` | same composite key scoping. OK |
| upsertPartBillingAction | project-budget.ts:19 | `requirePermission("manage_budget", projectId)` | explicit part↔project cross-check (`project_parts.eq(id,partId).eq(project_id,projectId)`) before upsert — comment explains RLS alone wouldn't catch a mismatched pair. OK, good pattern |
| upsertPartCostsAction | project-budget.ts:72 | `requirePermission("view_internal_cost", projectId)` | same part↔project cross-check. OK |
| addCredentialAction | project-credentials.ts:15 | `requirePermission("manage_credentials", projectId)` | Vault write via admin RPC only after permission check; insert row carries validated `project_id`. OK |
| updateCredentialAction | project-credentials.ts:87 | `requirePermission("manage_credentials", projectId)` | `.eq("id",credentialId).eq("project_id",projectId)`. OK |
| deleteCredentialAction | project-credentials.ts:133 | `requirePermission("manage_credentials", projectId)` | `.eq("id",credentialId).eq("project_id",projectId)`. OK |
| upsertLinkAction | project-links.ts:12 | `requirePermission("manage_links", projectId)` | update path scoped `.eq("id",linkId).eq("project_id",projectId)`; owner_id fixed on create, never reassignable. OK |
| deleteLinkAction | project-links.ts:53 | `requirePermission("manage_links", projectId)` | `.eq("id",linkId).eq("project_id",projectId)`. OK |
| addMemberAction | project-members.ts:14 | `requirePermission("manage_project_members", projectId)` | insert rows carry validated `project_id`; **note** — no check that `user_id` is a real/active user (Finding L-1) |
| updateMemberAction | project-members.ts:57 | `requirePermission("manage_project_members", projectId)` | `.eq("id",memberId).eq("project_id",projectId)`. OK |
| updateMemberRoleAction | project-members.ts:101 | delegates to updateMemberAction | OK |
| removeMemberAction | project-members.ts:111 | `requirePermission("manage_project_members", projectId)` | `.eq("id",memberId).eq("project_id",projectId)`. OK |
| upsertPartAction | project-parts.ts:14 | `requirePermission("edit_project", projectId)`; billing sub-write re-checks `manage_budget` via RPC | update path `.eq("id",partId).eq("project_id",projectId)`; billing figures split into separate table gated by a *second* permission check inline. Good separation |
| updatePartFieldAction | project-parts.ts:94 | `requirePermission("edit_project", projectId)` | `.eq("id",partId).eq("project_id",projectId)`. OK |
| deletePartAction | project-parts.ts:132 | `requirePermission("edit_project", projectId)` | `.eq("id",partId).eq("project_id",projectId)`. OK |
| createProjectAction | projects.ts:47 | `requirePermission("create_project")` (global) | PM-reassignment path double-checked (role check + RPC `has_permission(pmId,...)`) before allowing `pm_id` != caller. OK |
| editProjectAction | projects.ts:136 | `requirePermission("edit_project", projectId)` | `.eq("id",projectId)`; client-contact cross-check validates contact belongs to selected client. OK |
| toggleMilestoneDoneAction | projects.ts:248 | `requirePermission("edit_project", projectId)` | `.eq("id",milestoneId).eq("project_id",projectId)`. OK |
| updateProjectFieldAction | projects.ts:290 | `requirePermission("edit_project", projectId)` | single-row `.eq("id",projectId)`. OK |
| archiveProjectAction | projects.ts:335 | `requirePermission("edit_project", projectId)` | `.eq("id",projectId)`. OK |
| deleteProjectAction | projects.ts:370 | `requirePermission("edit_project", projectId)` + explicit `role !== "admin"` reject | hard delete correctly gated beyond edit_project. OK |
| postStatusUpdateAction | projects.ts:395 | `requirePermission("edit_status", projectId)` | insert carries `project_id`+`author_id`. OK |
| updateStatusUpdateAction | projects.ts:433 | `requirePermission("edit_status", projectId)` | `.eq("id",updateId).eq("project_id",projectId)`; RLS enforces author-only, app surfaces 0-row result as error. OK |
| deleteStatusUpdateAction | projects.ts:472 | `requirePermission("edit_status", projectId)` | same pattern. OK |
| globalSearchAction | search.ts:31 | `requireActiveUser()` | read-only, relies entirely on RLS per-table filtering (no manual re-filtering, by design). OK |
| revokeSessionAction | sessions.ts:9 | `requireActiveUser()` | RPC `revoke_session` scoped `where id=session_id and user_id=auth.uid()` (verified in `20260714000001_phase1_auth.sql:206-219`). OK |
| logTimeAction | time-entries.ts:12 | `requirePermission("log_time")` (global) | `person_id` derived server-side via `current_person_id()` RPC, never client-supplied; project assignment enforced by RLS. OK |
| updateTimeEntryAction | time-entries.ts:75 | `requirePermission("log_time")` | `.eq("id",entryId).eq("person_id",personId)` where personId is server-derived. OK |
| deleteTimeEntryAction | time-entries.ts:123 | `requirePermission("log_time")` | same pattern. OK |
| upsertTimeOffAction | time-off.ts:15 | `requirePermission("manage_people")` | update path `.eq("id",timeOffId).eq("person_id",personId)`. OK |
| deleteTimeOffAction | time-off.ts:58 | `requirePermission("manage_people")` | `.eq("id",timeOffId).eq("person_id",personId)`. OK |

## Findings

### MEDIUM

**M-1 — `revokeDelegationAction` skips `requirePermission`, uses `requireActiveUser()` + manual role check**
`src/app/actions/delegations.ts:93-118`. Every other mutating action in the codebase follows
"`requirePermission` first, before any DB work" as a hard convention (stated explicitly in
comments across nearly every file). This action instead calls `requireActiveUser()` (any
active user, any role) and only *after* reading the delegation row decides authorization:
`delegation.from_user !== current.user.id && current.role !== "admin"` (line 110-112). This is
almost certainly intentional and documented (comment at lines 85-91 explains a demoted PM
should still be able to revoke their own past delegation), and RLS backstops it — but it is
the one action in the whole action surface that authorizes by comparing to a DB row read under
a permission gate weaker than the rest of the app, rather than a capability check. Recommend:
add a short code comment cross-referencing this audit, or better, keep the current logic but
still route the "not owner, not admin" branch through an explicit, named check rather than
inline `role !== "admin"` (role-based hardcoding is exactly the anti-pattern the rest of the
codebase avoids in favor of `has_permission`). Not exploitable as-is (RLS's `enforce_delegation_update`
trigger and "revoke own delegation" policy independently re-check the identical condition), so
rated MEDIUM (consistency/defense-in-depth gap) rather than HIGH.

**M-2 — `revealCredentialAction` / `copyCredentialAction` accept a client-supplied `projectId` used for the *first* permission check, before the RPC re-derives the real one**
`src/app/actions/credential-reveal.ts:38-51, 98-109`. `requirePermission("reveal_credential", projectId)`
runs against whatever `projectId` the client passes — a caller who holds `reveal_credential` on
Project A but not Project B could call `revealCredentialAction("A", credentialIdFromB)`. This
passes the app-layer check (line 47) since it's evaluated against `projectId="A"`, and only
fails at the RPC (`reveal_credential_secret`, `20260720000002_reveal_credential_rpc.sql:57-67`)
because that function re-derives the credential's *real* project_id and re-checks
`has_permission` against it — so the secret is never actually leaked. Functionally safe (the
DB call is the true backstop, and the code comments say as much — "UX-early-exit, not the only
gate"), but it means the app-layer `requirePermission` call in this one action is not doing
real IDOR-relevant work; it merely rate-limits the RPC round trip for callers with zero grants
anywhere. Low exploitability, flagged as MEDIUM only because credential reveal is the single
highest-sensitivity action in the app and worth calling out explicitly for anyone modifying
this file later without noticing the RPC does the real check.

### LOW

**L-1 — `addMemberAction` does not validate that `user_id` refers to an existing/active user before inserting membership rows**
`src/app/actions/project-members.ts:14-53`. `parsed.data.user_id` (a UUID from `addMemberSchema`)
is inserted directly into `project_members` with no existence check. Likely constrained by an
FK to `user_profiles`/`auth.users` at the DB level (not verified in this pass), so at worst this
is a confusing error message rather than a security issue. Recommend confirming the FK exists;
if not, add one.

**L-2 — Two authorization patterns co-exist for "is this really admin-equivalent" checks**
Several actions (`admin.ts:changeUserRoleAction`, `access.ts` doc comments, `projects.ts:deleteProjectAction`)
note that a given permission (`manage_access`, `manage_users`) currently has *no* `role_permissions`
rows, so `requirePermission` only ever succeeds via the `is_admin()` bypass — i.e. these are
"soft-admin-only" today, enforced through data (an empty permissions table) rather than code.
This is a correct and intentional design (the comments are explicit about it), but it means a
future migration that adds a `role_permissions` row for e.g. `manage_users` silently changes
who can approve users/change roles, with no corresponding code change or review trigger. Not a
current vulnerability; flagged as a maintainability/drift risk.

### INFORMATIONAL (no action needed — noted as evidence of good practice)

- Mass-assignment: every insert/update goes through a `zod` schema (`personSchema`,
  `clientSchema`, `credentialSchema`, `budgetItemSchema`, etc.) and none of the schemas expose
  privilege columns (`is_admin`, `role`, `owner_id`, `pm_id` is only settable via an explicit,
  separately-gated branch in `createProjectAction`/`editProjectAction`). No action spreads raw
  `input`/`formData` into a Supabase write.
- IDOR pattern is consistent: every action taking a child-object id pairs `.eq("id", x)` with
  `.eq("<owning_scope>", scopeId)` (project_id, person_id, or a cross-table lookup before the
  write for `budget_items`/`part_billing`/`part_costs`, whose target tables lack a direct
  project_id column).
- Credential reveal (`credential-reveal.ts`) is exemplary: generic error on every failure path
  (never distinguishes "not found" from "not permitted"), secret never logged, audit write is
  synchronous and blocking (`writeAuditStrict`) — a reveal that can't be audited is refused
  rather than silently un-audited.
- No inline `"use server"` actions found in `src/components/**` (grep returned zero matches) —
  all server actions live in the audited `src/app/actions/*.ts` files.

## Verdict

52 actions reviewed across 20 files. Zero CRITICAL/HIGH findings. Two MEDIUM findings, both
about defense-in-depth/consistency rather than an actual exploitable IDOR — in both cases a
DB-level RLS policy, trigger, or SECURITY DEFINER RPC independently re-derives and re-checks
the real scope, so no path was found where a valid id from a different project/tenant/user
would let a caller mutate or read data they shouldn't. Two LOW notes on FK hygiene and role-data
drift risk.
