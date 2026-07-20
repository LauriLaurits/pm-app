# Phase 6 — Credential Reveal, Delegation, Access Management, Activity Log — Plan (lean)

> Subagent-driven. Security-sensitive tasks (reveal, delegation, access) get adversarial review; the audit-log view gets a focused review. Restraint/YAGNI: build what a ~25-person shop needs, clear and understandable, no gold-plating. Steps use `- [ ]`.

**Goal:** The last spec cluster — reveal stored credential secrets safely (audited, auto-remask), the vacation delegation/handover UI, a simple access-management admin screen, and the activity/audit-log viewer. The DATA models + RLS for all of these already exist from Phase 2; this is mostly UI + the one genuinely new sensitive backend (credential decrypt).

**Architecture:** Reveal goes through a SECURITY DEFINER RPC that checks `reveal_credential` and reads `vault.decrypted_secrets` (vault never exposed to the client); the server action audits every reveal and returns the plaintext to the client with a short visibility timeout (client re-masks). Delegation/access reuse the `MultiSelectToggle` pattern. Activity log reads `audit_logs` (RLS: admins/`view_audit` only). All mutations start with `requirePermission`.

**Tech Stack:** existing — Supabase Vault, `has_permission`/`requirePermission`, base-nova, the `MultiSelectToggle`/`InlineEditSelect` components built during the usability round.

## Global Constraints
- Secrets NEVER in logs/analytics/error messages/list responses — reveal returns the plaintext only to the authorized caller, audited, and the client re-masks after a timeout. The `credentials` list/table never includes secret material.
- Every mutation `requirePermission(...)` first; RLS'd client for reads/writes (admin/service-role only for the vault decrypt RPC, which self-checks the permission).
- Restraint: skip optional re-auth-before-reveal (YAGNI for an internal 25-person tool) unless asked; keep audit + timeout + masking. No features beyond the spec's four items.
- base-nova; components <150 lines; light+dark; loading/empty/error states. Reuse existing patterns (toggle multiselect, confirm dialog, inline edit) — do NOT reinvent.
- Delegations: only `delegatable=true` permissions, only the delegator's own projects (triggers already enforce); live-evaluated (instant revoke, auto-expire) — already works.

## Tasks

### Task 1: Credential reveal (audited, auto-remask)
**Files:** migration `..._reveal_rpc.sql` (SECURITY DEFINER `reveal_credential_secret`), `src/app/actions/credential-reveal.ts`, reveal UI on the credentials list, audit action `credential.revealed`/`credential.copied`.
- SECURITY DEFINER `reveal_credential_secret(cred_id uuid) returns text`: check `has_permission(auth.uid(),'reveal_credential', <cred's project>)` (raise if not); read plaintext from `vault.decrypted_secrets` by the credential's `secret_id`; return it. Revoke exec from anon; grant authenticated.
- `revealCredentialAction(projectId, credentialId)`: `requirePermission('reveal_credential', projectId)` first → call the RPC → `writeAudit('credential.revealed', resource=credential)` → return `{ secret }`. Never log the secret.
- UI: each credential row's masked `••••` gets a "Reveal" button (only for `reveal_credential` holders — canReveal server-side). On click → calls the action → shows the plaintext + a copy button, and **auto-remasks after ~30s** (client timer) or on blur. Copy writes `credential.copied` audit (best-effort). Show `expires_at`/`last_rotated_at` with a subtle "expires soon" badge when near.
- pgTAP: a `reveal_credential` holder gets the secret; a viewer WITHOUT reveal_credential calling the RPC raises; anon can't exec.
- **Adversarial review** (secret never leaks to non-authorized; RPC lockdown; audit on every reveal; no secret in list/logs).

### Task 2: Delegation UI (vacation handover)
**Files:** `src/app/(app)/delegations/` (list + create), `src/app/actions/delegations.ts` (create/revoke), reuse `MultiSelectToggle`.
- Create-delegation flow (for `manage_delegations` holders): pick replacement person (single searchable picker), toggle which of MY OWN projects, toggle which delegatable permissions (bounded to `delegatable=true`), start/end dates, handover notes. Actions: `createDelegationAction` (requirePermission('manage_delegations') + the RLS/triggers enforce own-projects + delegatable-only), `revokeDelegationAction` (from_user or admin, sets revoked_at).
- List views: Active / Upcoming / Expired delegations — who granted, who received, projects, permissions, period, handover notes; "Revoke" on active ones.
- Reuse the delegation engine (has_permission already evaluates live). Add a Delegations nav item (or under a sensible home). 
- **Adversarial review** (can't delegate others' projects or non-delegatable perms; revoke is instant; gating).

### Task 3: Access management (admin)
**Files:** `src/app/(app)/admin/access/` (or extend `/admin/users`), `src/app/actions/access.ts`.
- Admin screen to grant/revoke per-project permissions (`user_project_permissions`: user + project + permission + optional expiry) via `MultiSelectToggle`, view each user's role (reuse the inline role edit from the usability round), and surface pending approvals (link the existing approval flow). Keep it simple — a table of users with their role + a "grant project access" affordance.
- Actions: `grantProjectPermissionAction`/`revokeProjectPermissionAction` (`requirePermission('manage_access', projectId)`), RLS backstop (the `user_project_permissions` policies already gate on manage_access).
- **Adversarial review** (privileged grants; manage_access gating; can't self-escalate).

### Task 4: Activity log UI
**Files:** `src/app/(app)/activity/page.tsx` + filters.
- `/activity` (gated: `view_audit` / admin — audit_logs RLS already restricts to admins). Filterable by user, action, resource type, project, date range (URL params). Show: actor, action, resource, project (where derivable), timestamp, IP, device (user_agent), and before/after metadata where present. Read-only, paginated. Flip the Activity nav item from "Soon".
- **Focused review** (respects view_audit gating; no secret/sensitive metadata leaked; audit_logs never writable here).

### Task 5: Verification + phase summary
- Full sweep (test, db:reset, test:db both orders, build); e2e per role; confirm secrets never leak, delegation/access gating holds, activity log admin-only. STOP — summarize; this completes the spec.

## Self-review notes
- Spec coverage: credential reveal (audited, timeout, masked, grouped, expiration) ✓; delegation (person/projects/permissions/period/handover, active/upcoming/expired, early revoke) ✓; access management (roles, per-project grants, temporary grants w/ expiry, pending approvals) ✓; activity log (filterable, all fields) ✓.
- Restraint applied: optional re-auth-before-reveal skipped (internal tool); no features beyond spec; reuse existing components everywhere.
- After Phase 6: dedicated usability/cleanup pass (health/priority/progress decisions, clarity, provenance, reduce edit-friction) per the owner.
