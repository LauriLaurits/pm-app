# D — Secrets Handling & File Storage Security Audit

Scope: Supabase Vault-backed credential store + reveal flow, delegation model, avatars Storage
bucket, audit log, and forward-looking security requirements for the planned contract-upload
feature.

Date: 2026-07-29

---

## Findings (ranked)

### HIGH — `secret_id` (Vault reference) leaks to the browser for non-reveal holders on the project-scoped credentials tab

**Files:**
- `src/app/(app)/projects/[id]/credentials/page.tsx:39-57` — selects `*` on `credentials`
  (includes `secret_id`), builds `DisplayCredentialRow[]` = `CredentialRow & { owner_name }`
  with no field allowlist, passes the full rows to `<CredentialsList credentials={rows} ... />`.
- `src/app/(app)/projects/[id]/credentials/types.ts:6-8` — `DisplayCredentialRow` is literally
  `CredentialRow` (all columns, including `secret_id`) plus `owner_name`; the comment even says
  *"secret_id is present on CredentialRow ... but must never be read for display anywhere in this
  tab"* — a convention, not an enforced boundary.
- `src/app/(app)/projects/[id]/credentials/credentials-list.tsx:82-83` — for `canManage` users,
  renders `<CredentialFormDialog projectId={projectId} credential={credential} />` and
  `<CredentialDeleteButton projectId={projectId} credential={credential} />`, passing the
  **full** row (including `secret_id`, `owner_id`, `created_at`, `updated_at`) as a prop.
- `src/app/(app)/projects/[id]/credentials/credential-form-dialog.tsx:1,16-21` — `"use client"`,
  typed `credential?: DisplayCredentialRow`.
- `src/app/(app)/projects/[id]/credentials/credential-actions.tsx:1,9-15` — `"use client"`,
  typed `credential: DisplayCredentialRow`.
- `src/app/(app)/projects/[id]/credentials/credential-edit-form.tsx:1,34-42` — `"use client"`,
  also receives the full row.

**Issue:** Because `CredentialFormDialog`, `CredentialEditForm`, and `CredentialDeleteButton` are
Client Components receiving a Server Component prop, Next.js serializes the *entire*
`DisplayCredentialRow` — including `secret_id`, the Vault reference — into the RSC flight payload
sent to the browser, readable in the raw network response by any caller who can load the page
with `manage_credentials` on the project.

This is precisely the class of leak the global `/credentials` index page was hardened against:
`src/app/(app)/credentials/types.ts:11-22` builds an explicit `SafeCredentialRow` allowlist
(`Pick<DisplayCredentialRow, "id"|"project_id"|"name"|"type"|"environment"|"visibility"|
"username"|"expires_at"|"owner_name">`) specifically to keep `secret_id` (and `owner_id`, `notes`,
timestamps) off the wire, per the comment at `src/app/(app)/credentials/page.tsx:61-63`. **That
fix was applied to one surface (the cross-project index) and not the other (the project-scoped
tab)** — the two pages read the same table but diverge on what crosses the client boundary.

`manage_credentials` and `reveal_credential` are distinct permissions (`view_credentials`,
`reveal_credential`, `manage_credentials` are three separate catalog entries,
`supabase/migrations/20260715000002_permission_model.sql:70-72`). For the seeded roles they're
granted together to `project_manager` (`own_projects` scope,
`20260715000006...` role_permissions block), but `manage_credentials` is **not** delegatable
(`delegatable = false`) and can still be granted standalone via `user_project_permissions`
(`manage_access`-gated per-project grants). Any such caller — someone who can create/edit/delete
credentials for a project but was deliberately not given `reveal_credential` — gets every
credential's `secret_id` in their browser today.

**Impact ceiling:** `secret_id` alone does not directly yield the plaintext secret — the `vault`
schema is not in `api.schemas` (`supabase/config.toml:13`, only `public`/`graphql_public`
exposed), and the only read path, `reveal_credential_secret(cred_id uuid)`
(`supabase/migrations/20260720000002_reveal_credential_rpc.sql:28`), takes the credential id and
re-derives `secret_id` server-side after its own permission+visibility check — it does not accept
a caller-supplied `secret_id`. So this is not (today) a direct secret-disclosure primitive. It is
still a real violation of the stated invariant ("secret_id never crosses the client boundary for
non-reveal holders") and a latent risk if any future code path (a debug RPC, a bulk-rotate
feature, a different vault helper) ever keys off `secret_id` from client input.

**Fix:** Apply the same `SafeCredentialRow`-style allowlist used by the global index page to the
project-scoped tab — build a `Pick<...>` type without `secret_id`/`owner_id`/`created_at`/
`updated_at` for anything that crosses into `CredentialFormDialog`/`CredentialEditForm`/
`CredentialDeleteButton`, or keep those components server-rendered where possible and pass only
primitives (`id`, `name`) down to client islands.

---

### MEDIUM — avatars bucket accepts `image/svg+xml` into a public bucket

**Files:**
- `supabase/migrations/20260727000002_avatars_bucket.sql:9-11` — `allowed_mime_types =
  array['image/*']`, `public = true`.
- `src/app/actions/avatars.ts:23` — app-side check is `file.type.startsWith("image/")`, which
  also accepts `image/svg+xml`.
- `src/app/actions/avatars.ts:40` — returns `getPublicUrl(path).data.publicUrl`, a stable,
  unauthenticated, directly-navigable URL.

**Issue:** SVG is XML and can carry `<script>`/event-handler payloads. It's inert when used as an
`<img src>` (as `PersonAvatar`/`AvatarImage` does, `src/components/person-avatar.tsx:45`), but the
uploaded object is also reachable at a bare public URL. If that URL is ever opened directly
(new tab, shared link, `<iframe>`/`<object>` embed, or a future "view full image" affordance),
the SVG executes in the origin's context — stored XSS, uploadable by any `manage_people` holder
(and, per the policy, structurally by any authenticated caller who could reach Storage directly —
see LOW finding below) with no review step.

**Fix:** Narrow `allowed_mime_types` to a concrete raster allowlist (`image/png`, `image/jpeg`,
`image/webp`) at the bucket level, and mirror it in `uploadPersonAvatarAction`'s check rather than
the `image/*` prefix match. If SVG avatars are wanted, sanitize server-side before upload.

---

### LOW — avatars Storage INSERT policy is not permission-scoped; relies entirely on the httpOnly-cookie architecture to prevent direct client uploads

**File:** `supabase/migrations/20260727000002_avatars_bucket.sql:15-16` —
`create policy "authenticated upload avatars" on storage.objects for insert to authenticated
with check (bucket_id = 'avatars');` — any `authenticated` Postgres role may insert, full stop; no
`manage_people` check at the RLS layer.

This is a deliberate, documented tradeoff (migration comment, lines 1-7 and
`src/app/actions/avatars.ts:8-14`): the browser Supabase client is anon-only because session
cookies are `httpOnly`, so today there is no way for client-side JS to present an authenticated
session directly to Storage — `uploadPersonAvatarAction`'s `requirePermission("manage_people")`
re-check is effectively the only gate. That holds *today*, but the RLS policy itself provides no
defense in depth: if a future change ever exposes a usable access token to the browser (a
different auth pattern, a debug endpoint, a non-httpOnly cookie for some other flow), any
authenticated user — not just `manage_people` holders — could upload arbitrary (size/mime-capped)
files to this bucket directly, bypassing the server action entirely.

**Fix:** Low priority given the current architecture, but consider scoping the insert policy to
require the uploader's own uid in the path (e.g. `storage.foldername(name)` check) or accept the
documented risk explicitly rather than implicitly.

---

### LOW — no audit trail for avatar upload

**File:** `src/app/actions/avatars.ts` — `uploadPersonAvatarAction` never calls `writeAudit`.
Consistent with "avatars are not sensitive," but means Storage writes for this bucket are
untracked. Not a security hole; noted for completeness since every other mutating action in the
codebase audits.

---

## Verified controls (no finding — working as intended)

- **Vault-backed storage, never plaintext-in-column.** `public.credentials.secret_id` is a
  `uuid` FK into `vault.secrets`; no plaintext secret column exists
  (`supabase/migrations/20260715000006_credentials_delegations.sql:9-27`). The `vault` schema is
  excluded from `api.schemas` (`supabase/config.toml:13`), so it's unreachable via PostgREST
  regardless of role/grants — the only two touchpoints are `SECURITY DEFINER` RPC wrappers:
  `create_credential_secret` (write, service_role only,
  `supabase/migrations/20260716000001_credential_secret_rpc.sql:30-31`) and
  `reveal_credential_secret` (read, `supabase/migrations/20260720000002_reveal_credential_rpc.sql`).
- **Reveal path is server-side permission-gated, twice.** `revealCredentialAction`
  (`src/app/actions/credential-reveal.ts:46-47`) calls `requirePermission("reveal_credential",
  projectId)` as a UX-early-exit, then the RPC itself independently re-checks
  `has_permission(auth.uid(), 'reveal_credential', v_project_id)` **and** the `admins_only`
  visibility tier server-side (`20260720000002_reveal_credential_rpc.sql:57-67`) using the
  credential's *real*, DB-derived `project_id` — a caller cannot pass a different project to
  launder the check. Unknown-id and not-permitted return the identical error
  (`reveal_credential_rpc.sql:45-49`), avoiding an existence oracle.
- **Reveal is audited, and fails closed.** `writeAuditStrict` is awaited and its result checked
  *before* the secret is returned (`credential-reveal.ts:69-80`); if the audit insert fails, the
  action returns the generic error instead of the secret. Audit metadata carries only
  `project_id`, never the secret (`credential-reveal.ts:75`).
- **Copy action is equally gated and audited.** `copyCredentialAction`
  (`credential-reveal.ts:98-113`) also calls `requirePermission("reveal_credential", projectId)`
  first; only failures in the (best-effort) audit write are swallowed, not the permission check.
- **Auto-remask/timeout.** `CredentialRevealControl`
  (`src/app/(app)/projects/[id]/credentials/credential-reveal-control.tsx`) re-masks after 30s
  (`REVEAL_SECONDS`, line 8, countdown at 55-65) and on unmount via `useEffect(() =>
  clearCountdown, [])` (line 42) — covers navigating away. Secret state lives only in local
  component state, never lifted or cached.
- **`secret_id` non-exposure holds on the global cross-project index** (but not the project tab —
  see HIGH finding above): `SafeCredentialRow` allowlist,
  `src/app/(app)/credentials/types.ts:11-22`, `src/app/(app)/credentials/page.tsx:61-75`.
- **Visibility tiers (`project_members`/`pms_only`/`admins_only`) are enforced in RLS, not just
  app code.** SELECT policy `"view credential metadata"`
  (`20260715000006_credentials_delegations.sql:197-201`) ANDs `has_permission(...,
  'view_credentials', project_id)` with `visibility <> 'admins_only' OR is_admin()`, OR'd with
  owner/explicit-grant escape hatches. INSERT/UPDATE/DELETE policies (lines 206-212) apply the
  identical visibility gate — a project-scoped `manage_credentials` holder cannot write an
  `admins_only` row they can't see. `reveal_credential_secret` mirrors this exact gate again at
  the RPC layer (defense in depth across three layers: RLS select, RLS write, RPC reveal).
- **Delegation model is sound.** `manage_credentials` and `reveal_credential` are both
  non-delegatable (`delegatable = false`,
  `supabase/migrations/20260715000002_permission_model.sql:71-72`); only `view_credentials` is.
  Delegated `reveal_credential`/`manage_credentials` therefore cannot happen via the delegation
  path at all — matches the "not budgets/costs/user-management" delegation-scope intent. The
  `has_permission` delegation branch additionally requires `revoked_at is null and now() between
  starts_at/ends_at` (`20260715000006...sql:155-159`), and delegations are structurally
  one-way-revocable / immutable-once-revoked via `enforce_delegation_update`
  (`credentials_delegations.sql:99-118`).
- **Avatar upload goes through a server action, and re-checks permission.**
  `uploadPersonAvatarAction` (`src/app/actions/avatars.ts:15-41`) calls
  `requirePermission("manage_people")` first (line 20), enforces a `2 MB` cap and an `image/`
  MIME prefix (lines 23-28), and generates a random `crypto.randomUUID()` filename rather than
  trusting client input for the path (line 32) — no path traversal into another record's object,
  no user-controlled overwrite target.
- **Audit log is append-only.** `revoke insert, update, delete on public.audit_logs from
  authenticated, anon` (`supabase/migrations/20260714000001_phase1_auth.sql:185`); only
  `service_role` gets `insert` (no `update`/`delete` even for service_role — line 169: `grant
  select, insert on public.audit_logs to service_role`). All writes go through
  `writeAudit`/`writeAuditStrict` using the admin client (`src/lib/audit.ts:83`).
- **`writeAuditStrict` never logs sensitive payloads itself** — it only ever writes the caller-
  supplied `metadata` object; every credential-related call site (`credential-reveal.ts:69-76,
  102-109`; `project-credentials.ts:62-75, 119-127, 156-163`) explicitly constructs a metadata
  object containing only `project_id`/`type`/`environment`/`visibility`, with inline comments
  ("Never log the secret itself") confirming this is deliberate, not incidental. There is no
  separate `summarizeMetadata` redaction helper in this codebase — the discipline is enforced at
  each call site instead; this works today (verified no call site passes `secret`, `data.secret`,
  or a raw row) but has no structural backstop if a future call site spreads a full row into
  `metadata`.
- **Audit log read access is permission-gated, additively.** Base policy `"admins read audit
  logs"` (`is_admin()`, `20260714000001_phase1_auth.sql:183-184`) plus `"view_audit holders read
  audit logs"` (`20260720000004_audit_view_audit_policy.sql:15-16`), OR'd per Postgres multi-
  policy semantics. `view_audit` currently has zero `role_permissions` rows
  (`20260715000002_permission_model.sql`, confirmed no `view_audit` grants in the role catalog),
  so in practice only admins (plus any future `view_audit` grant or `user_project_permissions`
  entry) can read it today — matches intent, not a gap.

---

## CONTRACT UPLOAD — SECURITY REQUIREMENTS (design)

The contracts feature does not exist yet. This section is forward-looking guidance, written
against the actual patterns already proven out in this codebase (credential reveal, avatars
upload) so the team can reuse the same primitives rather than invent new ones.

### Delta vs. the avatars bucket — read this first

The avatars bucket is a reasonable model for a **public, low-sensitivity** asset and should
**not** be copied wholesale for contracts:

| | avatars (today) | contracts (required) |
|---|---|---|
| Bucket visibility | `public = true` | `public = false` — **private bucket, no exceptions** |
| Download | Public URL (`getPublicUrl`), no expiry, no auth | **Signed URL only** (`createSignedUrl`), short TTL, minted server-side per request |
| Storage RLS on read | `bucket_id = 'avatars'` only — anyone with the URL | Scoped to project-permission holders via `storage.objects` RLS keyed off the encoded `project_id` in the path |
| Storage RLS on write | `bucket_id = 'avatars'`, any `authenticated` role | Scoped to a `manage_contracts`-equivalent permission, checked in RLS *and* re-checked in the server action |
| MIME allowlist | `image/*` (too broad — see MEDIUM finding above) | Exact allowlist: `application/pdf`,
`application/vnd.openxmlformats-officedocument.wordprocessingml.document` (docx) only |
| Path scheme | random uuid, flat, no project binding | `contracts/{project_id}/{uuid}.{ext}` — project id **in the path**, so RLS can scope on it |
| Audit | none | upload/download/delete all audited, mirroring `credential.revealed`/`credential.copied` |

### Concrete requirements

1. **Private bucket.** `insert into storage.buckets (id, name, public, file_size_limit,
   allowed_mime_types) values ('contracts', 'contracts', false, <cap>, array['application/pdf',
   'application/vnd.openxmlformats-officedocument.wordprocessingml.document'])`. `public = false`
   is non-negotiable — a contract leaking via a guessable/public URL is a client-confidentiality
   incident, not a bug ticket.

2. **Path scheme encodes `project_id`.** e.g. `{project_id}/{uuid}.{ext}`, mirroring how
   `credentials.project_id` drives every RLS check in the credential system. This lets
   `storage.objects` RLS policies use `storage.foldername(name)[1]::uuid` (or equivalent) to join
   back to `has_permission(auth.uid(), 'view_contracts', (storage.foldername(name))[1]::uuid)` —
   the same `has_permission(uid, perm, project)` function already used everywhere else, no new
   permission-check primitive needed. Do **not** rely on object metadata alone for scoping — path
   or a companion `public.contracts` metadata table (see below) must carry `project_id` so RLS can
   reach it without trusting client input.

3. **A `public.contracts` metadata table, same shape as `public.credentials`.** Don't let
   `storage.objects` be the only record — mirror the credentials pattern: a `public.contracts` row
   per upload (`id`, `project_id`, `storage_path`, `original_filename`, `mime_type`, `size_bytes`,
   `uploaded_by`, `created_at`, plus optionally a `visibility` tier reusing
   `credential_visibility`-style tiers if contracts need `pms_only`/`admins_only` granularity too).
   RLS on this table gates *listing/metadata*, exactly like `"view credential metadata"` does
   today; RLS on `storage.objects` independently gates the *bytes*. Two layers, like credentials.

4. **Downloads are signed URLs with a short TTL, minted server-side, after a permission
   re-check.** A server action (`"use server"`, e.g. `getContractDownloadUrlAction(projectId,
   contractId)`) must: (a) call `requirePermission("view_contracts", projectId)` first, exactly
   like `requirePermission("reveal_credential", projectId)` in `credential-reveal.ts:47`; (b) look
   up the contract's real `storage_path`/`project_id` server-side from `public.contracts` (never
   trust a client-supplied path — same reasoning as `reveal_credential_secret` deriving
   `project_id` from the row, not the caller); (c) call
   `supabase.storage.from('contracts').createSignedUrl(path, <short TTL, e.g. 60s>)`; (d) audit
   the download (see below) *before* returning the URL, fail-closed if the audit write fails —
   same pattern as `writeAuditStrict`-gated reveal in `credential-reveal.ts:69-80`. Never return a
   `getPublicUrl`-style permanent URL for this bucket.

5. **Uploads are server-action-mediated, with permission re-check + allowlist, same shape as
   `uploadPersonAvatarAction`.** `requirePermission("manage_contracts", projectId)` first; validate
   `file.type` against the exact PDF/docx allowlist (not a prefix match — learn from the avatars
   `image/*` finding above); enforce a size cap; generate the storage path server-side
   (`${projectId}/${crypto.randomUUID()}.${extFromAllowlist}`) rather than trusting client
   filename/extension. Because this bucket is private, the upload must go through the
   authenticated server client (`createClient()`), same as avatars — the httpOnly-cookie
   architecture means the browser cannot reach Storage directly regardless, but the RLS insert
   policy should still be scoped to `manage_contracts` (unlike the avatars policy's bare
   `bucket_id = 'contracts'`) so that isn't the only thing standing between an arbitrary
   authenticated user and an upload, addressing the avatars LOW finding above by not repeating it.

6. **Content-type sniffing / don't trust the extension or the declared MIME type.** Browsers and
   client code can lie about `file.type`. At minimum, verify the file's magic bytes server-side
   before accepting it as PDF (`%PDF-`) or docx (a ZIP local-file-header, `PK\x03\x04`, containing
   `[Content_Types].xml`) rather than trusting `formData.get("file").type` alone — the avatars
   action trusts `file.type` for a low-stakes public image bucket; contracts should not repeat
   that shortcut.

7. **Virus/malware scanning.** PDFs and docx are common malware carriers (embedded JS in PDF,
   macros in docx — though a strict `.docx` OOXML MIME check without macro-enabled `.docm`
   already excludes the most common macro vector). Given this is a small internal tool without an
   existing scanning pipeline, the pragmatic sequence is: (a) enforce the strict MIME +
   magic-byte allowlist from #6 as the first gate; (b) integrate a scan step (e.g. ClamAV
   sidecar, or a hosted scanning API called from the upload server action before the object is
   committed/exposed) before the file becomes downloadable — don't serve straight from the
   client's upload without an intermediate quarantine state if scanning is added later. Flag this
   explicitly as a gap to close before go-live, not a "nice to have."

8. **Audit every upload, download, and delete**, reusing `writeAudit`/`writeAuditStrict` and
   extending the `AuditAction` union in `src/lib/audit.ts:5-57` with `contract.uploaded`,
   `contract.downloaded`, `contract.deleted` (parallel to the existing `credential.*` actions).
   Downloads in particular should be `writeAuditStrict`-gated and fail-closed (withhold the signed
   URL if the audit insert fails) exactly like `credential.revealed` — a contract download that
   can't be recorded must not happen, same invariant as a credential reveal that can't be
   recorded.

9. **Visibility tiers**, if contracts need the same project-member/PM-only/admin-only split
   credentials have, should reuse the existing `credential_visibility` enum semantics and the
   RLS-AND-pattern from `"view credential metadata"` — don't invent a fourth authorization model.

10. **Delete is permission-gated and audited, and should actually remove the object** (unlike
    `deleteCredentialAction`, which deliberately leaves the orphaned Vault secret in place because
    there's no rotate/reveal-cleanup RPC yet — contracts have no equivalent excuse; call
    `supabase.storage.from('contracts').remove([path])` from the server action after the
    `requirePermission` check and the metadata-row delete, in the same transaction/sequence, and
    audit it).

**Readiness:** none of this exists yet — no `contracts` bucket, table, actions, or permission keys
are present anywhere in `supabase/migrations` or `src/app/actions`. Treat the above as the spec
for that build, not a description of current state.
