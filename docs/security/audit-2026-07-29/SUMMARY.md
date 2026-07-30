# Security Audit — Executive Summary & Remediation Plan

Date: 2026-07-29
Scope: full system — DB/RLS, client-boundary serialization, server actions,
credentials/Vault/storage, auth/session, injection/input. Six parallel audit
streams; per-stream detail in the sibling files (`A-` … `F-`) plus the DB
deep-dive in the scratchpad.

## Bottom line

The system is **fundamentally well-built**, not fragile: all 33 tables have RLS
enabled, all views are invoker-rights (inherit caller permissions), the Vault is
genuinely sealed (secrets never in a plain column; reveal is triple-gated and
re-derives server-side), all 52 server actions are permission-gated and
IDOR-safe, zod validation is thorough, and there is no service-role key or
secret in the client bundle. The auth stack enforces active-user status at the
database layer, not just the app.

**No issue found lets an anonymous internet user read secrets or budgets.** The
real findings are (a) one output-encoding bug in the new CSV export, (b) a small
family of "authorized-but-shouldn't" over-exposures, and (c) hardening gaps that
matter more once contracts are uploaded and the app faces the public internet.
None are "we're all fucked" — but several are worth fixing before contracts land
and before a wider rollout.

## Findings, ranked (deduplicated across streams)

### CRITICAL — fix immediately

**C1. CSV export formula injection** (`reports/export-button.tsx`).
The export quotes commas/quotes/newlines but does not neutralize a leading
`= + - @`. A project/client name (free text, no character restriction) like
`=cmd|' /C calc'!A0` becomes a live formula when the exported budget/margin data
is opened in Excel — data-exfil via `=HYPERLINK`, or command execution via DDE.
**Status: fix in progress** (reports Task 2 fix round).

### HIGH — fix before contracts / before public rollout

**H1. `javascript:` links execute in a viewer's session** (`lib/validation/project.ts`
`linkSchema.url` is bare `z.url()`; rendered as raw `<a href>` in
`links-list.tsx`). A project manager can plant a `javascript:…` project link that
runs in an admin's browser when clicked → session-riding to whatever the admin
can do, including revealing credentials. Highest real-world risk on the list.
Fix: restrict scheme to `http(s)` (`z.url({ protocol: /^https?$/ })`); same
one-line fix for credential `related_url`.

**H2. Budget cost-row re-typing leaks internal cost** (`budget_items` UPDATE
policy). A PM has `manage_budget` but not `view_internal_cost`; the SELECT policy
hides cost rows, but the UPDATE policy checks only `manage_budget` and the column
grant includes `item_type`. The PM can `update … set item_type='invoice'` on a
hidden cost row and then read the amount. Real confidential-financial exposure.
Fix: add the `view_internal_cost` gate (and/or remove `item_type` from the
updatable column set) in the UPDATE policy's `USING`+`WITH CHECK`.

**H3. Credential reveal has no database-level audit** (`reveal_credential_secret`
RPC). The "every reveal is logged" guarantee lives only in the app action; a
direct authenticated REST call to the RPC returns plaintext with no trace. For a
credentials vault, undetectable secret access is a serious gap. Fix: write the
audit row inside the definer function (same for `set_user_role`).

**H4. `secret_id` (Vault ref) serialized to the browser on the project
Credentials tab** (`projects/[id]/credentials/credential-form-dialog.tsx` +
`credential-actions.tsx` receive the full row). Same leak class as the CRITICAL
we already fixed on the `/credentials` index — this sibling route was missed.
Not decrypt-exploitable (reveal re-derives server-side), but breaks the code's
own stated invariant. Fix: allowlist a `SafeCredentialRow` here too.

**H5. Anyone-authenticated can read the org's workload + authorization graph**
(`person_current_allocation`, `person_weekly_allocation`, `has_permission`,
`has_credential_access` — SECURITY DEFINER, granted to `authenticated`, no
internal permission/status check, arbitrary `uid`/`person_id` params). A
zero-permission viewer can call these directly via the API to read anyone's
allocation and enumerate who-can-do-what (incl. who can reveal which credential
— a target-selection map for an attacker). Fix: add an internal
`has_permission(auth.uid(), 'view_people')` / self-or-privileged check, or
revoke direct EXECUTE and route through gated callers.

**H6. Credentials writes don't pin `owner_id`** (`credentials` INSERT/UPDATE
policies). A `manage_credentials` holder can set `owner_id` to grant permanent,
unaudited metadata read access to an arbitrary account, bypassing the proper
`credential_access` grant flow. Fix: pin `owner_id = auth.uid()` (or forbid
changing it) in `WITH CHECK`.

**H7. Avatars bucket accepts SVG → stored XSS** (`allowed_mime_types
['image/*']` matches `image/svg+xml`; bucket public; URL directly navigable).
A crafted SVG with script, opened by its raw storage URL, runs in the storage
origin. Fix: restrict to raster mimes (`image/png,image/jpeg,image/webp,image/gif`),
mirror in the server-action check.

### MEDIUM — authorized over-exposure & hardening

- **M1. People list ships `internal_cost`/`billing_rate`** to finance-visibility
  viewers though the list never renders them (`people-table.tsx`). `SafePersonRow`
  allowlist. (Authorized viewers only — hence Medium, not the secret_id class.)
- **M2. Project Parts tab ships an internal `notes` with no RLS gate** + raw
  `part_billing` rates to every `view_budget` holder when only `client_price`
  renders. Allowlist + gate the notes.
- **M3. Password floor is 12 in-app but 6 in Supabase config** — direct auth-API
  calls bypass the app policy. Set `minimum_password_length = 12` (+ complexity)
  in `config.toml` and push.
- **M4. Auth cookies not `Secure`, no HSTS** — add `secure: true` to
  `cookieOptions` (prod) and an HSTS header.
- **M5. `is_admin`/`pm_options` and the definer helpers are callable by
  `anon`/any authenticated user** — admin-existence oracle + authz enumeration
  (overlaps H5). Revoke EXECUTE from `public`/`anon`.
- **M6. `manage_people` granted globally to PMs** silently exposed every
  employee's **sick leave** and allowed rewriting `people.user_id`. Re-scope or
  tighten the `time_off`/`people` policies.
- **M7. Open signup + `enable_confirmations=false`** — anyone can self-register
  and reach the (permission-gated) app shell. Set `enable_signup=false` once
  Entra ID is live; until then, confirm the approval gate covers every surface.

### LOW — noted, mostly accepted tradeoffs

Clients list ships unrendered `notes`; two `.or()` filters interpolate a
route-param id (UUID-forced upstream, but not explicitly whitelisted like the
Activity page); projects-list search doesn't `escapeIlike` `%`/`_` (no privilege
impact); `set_updated_at` lacks a pinned `search_path`; `set_user_role` can
delete the last admin; a few policies rely on Postgres reusing `USING` for
`WITH CHECK`.

## Test-suite gaps (defense against regression)

The pgTAP suite does **not** assert: RLS is enabled on every public table (a new
unprotected table would pass all tests); `security_invoker` on every view;
EXECUTE-grant restrictions on definer functions (would have caught H5/M5);
`authenticated` lacks `vault` schema usage; the credential-reveal audit row
(H3); the column-grant restrictions on `project_status_updates`/`budget_items`.
Add these as invariant tests so the hardening can't silently rot.

## Contract upload — security requirements (feature not yet built)

Detailed in `D-secrets-storage.md`. In brief, contracts must clear a far higher
bar than avatars:
- **Private bucket** (`public = false`) — never a public URL.
- Download only via **short-TTL signed URLs**, minted by a permission-checked
  server action and **audited**.
- `storage.objects` RLS keyed on `has_permission(auth.uid(), 'view_…', project_id)`
  with `project_id` parsed from the object path (`<project_id>/<uuid>.pdf`).
- Server-action-mediated upload, permission re-check, **strict `application/pdf`
  (+docx) allowlist with magic-byte verification**, size cap.
- No UPDATE policy (new version = new object); audit upload/download/delete.
- Consider content/AV scanning before the file is downloadable.

## Recommended remediation order

1. **Now:** C1 (in progress) + H1 (URL scheme) — both tiny, both real code-exec/exfil paths.
2. **Security fix wave (one migration + a few app edits):** H2, H3, H5, H6 (DB
   policy/function changes), H4 + M1 + M2 (client-boundary allowlists), H7 (mime).
   Plus the pgTAP invariant tests so it can't regress.
3. **Before public rollout / prod config push:** M3, M4, M5, M6, M7.
4. **Before contracts feature:** implement to the D-spec above from day one.

All of the above are **local-only** until you approve — nothing here is deployed.

---

## Remediation status (2026-07-30)

Security hardening wave, commits `d3ecdd0..64036f5`. Every FIXED item below was re-verified
end-to-end after the wave landed: suites green (`npm run test` 337, `npm run test:db` 256 incl. the
new phase-9 invariants + anon-EXECUTE tripwires, `npm run lint` 0 errors, `npm run build` clean),
plus live exploit-replay against a local Supabase stack and dev server using GoTrue REST logins and
hand-built session cookies across six personas. Full evidence:
`.superpowers/sdd/2026-07-29-security-hardening/task-5-report.md`.

| # | Finding | Status | Commit / reason |
|---|---|---|---|
| C1 | CSV export formula injection | **FIXED** | `src/lib/csv.ts` — `csvCell()` prefixes `'` on a leading `= + - @ \t \r`, then RFC-4180 quoting; `csvNumberCell()` deliberately exempt so negatives stay numeric. 14/14 `tests/reports-export.test.ts`. (Reports fix round, pre-wave.) |
| H1 | `javascript:` links execute in a viewer's session | **FIXED** | `6cd0e2f` — `linkSchema.url` + `credentialSchema.related_url` restricted to `z.url({protocol:/^https?$/})`; `links-list.tsx` `safeHref()` added as a render-layer backstop. Verified: a `javascript:` URL planted directly in the DB renders with `href="$undefined"`, 0 `href="javascript:` in the payload. |
| H2 | Budget cost-row re-typing leaks internal cost | **FIXED** | `8a2d03b` — `view_internal_cost` gate added to the `budget_items` UPDATE policy's `USING` **and** `WITH CHECK`, and `item_type` removed from the `authenticated` UPDATE column grant. Verified: direct PostgREST PATCH re-typing a cost row → `42501`, both directions; legitimate amount/name edits still succeed. |
| H3 | Credential reveal has no database-level audit | **FIXED** | `8a2d03b` — the audit row is written inside `reveal_credential_secret` itself. Verified: a direct REST RPC reveal (bypassing the app) produced `audit_logs` row with `metadata.source = "db_rpc"`. Follow-up **M-b** (in-transaction guarantee under PostgREST tx-end semantics) logged before prod. |
| H4 | `secret_id` serialized on the project Credentials tab | **FIXED** | `73bfceb` — `SafeCredentialRow` allowlist, built field-by-field (no row spread). Verified: 0 `secret_id` in raw HTML for admin and the project PM, credential rows still render. |
| H5 | Definer functions leak the workload + authorization graph | **FIXED** | `8a2d03b` (+ `bb44b3b` tripwire tests) — internal `auth.uid()`/`view_people` guards in `has_permission`, `has_credential_access`, `person_current_allocation`, `person_weekly_allocation`. Verified: a viewer calling `has_permission` with a foreign uid gets `false`, self-checks still `true`, allocation for a foreign person returns `0/0` while legit `view_people` holders get the real `95.00/2`. |
| H6 | Credentials writes don't pin `owner_id` | **FIXED** | `8a2d03b` — INSERT `WITH CHECK` pins `owner_id IS NULL OR = auth.uid()`; `owner_id` removed from the UPDATE column grant. Verified: foreign-owner INSERT → `42501`, `owner_id` PATCH → `42501`, normal edits unaffected. |
| H7 | Avatars bucket accepts SVG → stored XSS | **FIXED** | `8a2d03b` — bucket `allowed_mime_types` narrowed to `{image/png,image/jpeg,image/webp,image/gif}`, mirrored in the server action. Verified: PNG upload `200`, SVG upload `415 invalid_mime_type`. Follow-up **M-d** (purge any pre-existing SVG objects) logged before prod. |
| M1 | People list ships `internal_cost`/`billing_rate` | **FIXED** | `73bfceb` — `SafePersonRow` allowlist on `/people` **and** on `people/[id]` (a second instance of the same leak, found during the fix, that the audit had not listed). Verified: 0 occurrences for a real `view_internal_cost` holder; all 16 rows still render. |
| M2 | Parts tab ships internal `notes` + raw `part_billing` rates | **FIXED** | `73bfceb` — `SafePartRow`; edit-only keys (`notes`, `hourly_rate`, `fixed_amount`, …) are **omitted from the object**, not nulled, for callers without `edit_project`. Verified with a planted canary note: 0 for a `view_budget`-only finance viewer and a plain member; `edit_project` holders still receive real values. |
| M3 | Password floor 12 in-app but 6 in Supabase config | **FIXED** | `64036f5` — `minimum_password_length = 12` + `password_requirements = "lower_upper_letters_digits"` in `config.toml`. |
| M4 | Auth cookies not `Secure`, no HSTS | **FIXED** | `64036f5` — `cookieOptions.secure = NODE_ENV === "production"` in both the server and middleware clients; `Strict-Transport-Security: max-age=31536000; includeSubDomains` in `next.config.ts` (confirmed live on response headers). |
| M5 | `is_admin`/`pm_options`/definer helpers callable by `anon` | **FIXED** | `8a2d03b` + `bb44b3b` — EXECUTE revoked from `public`/`anon`, with pgTAP tripwire tests. Verified: `proacl` contains no `anon`/`PUBLIC` on any of the eight helpers; live anon RPC calls all return `42501 permission denied for function`. |
| M6 | `manage_people` granted globally to PMs (sick-leave exposure, `people.user_id` rewrite) | **DEFERRED** | Not a leak to unauthorized users — it is a **role-design** question (which permissions the PM role should carry) that changes who can do what across the app. Re-scoping `manage_people` needs a product decision on the PM/HR boundary plus a `time_off`/`people` policy split; out of scope for a fix-only hardening wave. Revisit with the role-model work, before wider rollout. |
| M7 | Open signup + `enable_confirmations = false` | **DEFERRED** | Intentional for local/dev: `enable_signup = false` is the *rollout* switch, to be flipped when Entra ID goes live (the approval gate already keeps self-registered accounts in `pending` with no data access). Tracked in remediation step 3 "before public rollout / prod config push". |
| Lows | unrendered client `notes`; two `.or()` route-param interpolations; unescaped `%`/`_` in projects search; `set_updated_at` unpinned `search_path`; `set_user_role` can delete the last admin; policies relying on `USING` reuse for `WITH CHECK` | **DEFERRED** | Accepted tradeoffs — no privilege impact, ids UUID-forced upstream. Left as documented backlog. |

Additional follow-ups opened during the wave and **not** fixed here (tracked in the SDD ledger):
**M-a** cost-tier INSERT gate (integrity, outside H2's scope), **M-b** reveal audit in-transaction,
**M-c** matview invariant test, **M-d** purge pre-existing SVG avatars before prod, **M-e**
`person_has_history`/`part_project` oracles (brief-accepted).

Regression posture after the wave: 17 routes × 6 personas = 102 requests, all `200`, no 5xx, no
broken RLS — a finance viewer still sees budgets with real figures, a member still sees exactly his
member projects, and a viewer still sees only her single granted project.

**Still local-only — nothing in this wave has been deployed.**
