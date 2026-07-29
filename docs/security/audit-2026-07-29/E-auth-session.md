# E — Auth, Session, Middleware, Route Protection Audit

Date: 2026-07-29
Scope: `src/lib/auth/*`, `src/lib/supabase/{server,client,middleware,admin}.ts`,
`src/middleware.ts`, `src/app/(app)/layout.tsx`, `src/app/(auth)/*`,
`src/app/auth/callback/route.ts`, server actions, RLS/migrations relevant to
session and permission enforcement.

Overall: this is an unusually well-hardened auth/authorization stack. Every
sensitive mutation is gated in triplicate (server action `require*` call →
RLS policy re-check via `has_permission` → in some cases a DB trigger
denylist), and `has_permission`/`is_admin` both hard-require
`user_profiles.status = 'active'` at the database layer, so RLS itself — not
just the app layer — blocks pending/disabled accounts. No open redirect, no
service-role leakage to the client, no route handlers outside the
auth-checked surface. Findings below are narrower defense-in-depth gaps and
one real pre-production config bypass.

---

## Findings by severity

### MEDIUM

**M1. Password policy (12-char minimum) is enforced only in the Next.js zod
schema, not by Supabase Auth itself — bypassable via a direct API call.**

- `src/lib/validation/auth.ts:20` — `signupSchema.password` requires
  `min(12)`.
- `supabase/config.toml:182` — `minimum_password_length = 6` is the only
  server-side (GoTrue) enforcement, and `password_requirements = ""`
  (`supabase/config.toml:185`) means no complexity requirement either.
- **Exploit**: `NEXT_PUBLIC_SUPABASE_ANON_KEY` and `NEXT_PUBLIC_SUPABASE_URL`
  are public by design (shipped to the browser bundle). Anyone can call
  Supabase Auth's `POST /auth/v1/signup` directly with the anon key and a
  6-character password, completely bypassing `signUpAction` and its zod
  schema. The resulting account is weaker than the app's UI ever allows and
  is indistinguishable from a normal signup once created (lands in
  `pending`, same as any other).
- **Fix**: set `[auth] minimum_password_length = 12` (and a
  `password_requirements` tier, e.g. `lower_upper_letters_digits`) in the
  hosted Supabase project's Auth settings so the policy is enforced
  server-side regardless of client. This applies to whatever `config.toml`
  (or the dashboard equivalent) governs the *production* project — confirm
  it's included in the README's "Production checklist"
  (`README.md:142-172`), which currently does not mention password policy at
  all.

**M2. Auth cookies are never marked `Secure`.**

- `src/lib/supabase/server.ts:26` and `src/lib/supabase/middleware.ts:27` —
  both pass `cookieOptions: { httpOnly: true }` only.
- `@supabase/ssr`'s `DEFAULT_COOKIE_OPTIONS`
  (`node_modules/@supabase/ssr/src/utils/constants.ts:3-10`) is
  `{ path: "/", sameSite: "lax", httpOnly: false, maxAge: 400d }` — it has
  **no `secure` key at all**, and the app's partial `cookieOptions` object is
  shallow-merged on top of it (`{...DEFAULT_COOKIE_OPTIONS, ...cookieOptions}`,
  seen in `node_modules/@supabase/ssr/src/cookies.ts:277-280` and `:531-538`).
  So `httpOnly` is correctly forced to `true` (good — matches the memory
  note), but `secure` is simply absent from every `Set-Cookie` the app emits
  for `sb-*` auth cookies, at both the server-client (`server.ts`) and
  middleware (`middleware.ts`) call sites.
- **Impact**: if the app is ever reachable over plain HTTP (misconfigured
  load balancer, a proxy that terminates TLS but forwards HTTP internally
  and the internal hop is untrusted, a user typing `http://` manually before
  HSTS is preloaded), the session cookie is sent in cleartext and can be
  captured by a network attacker. There's also no HSTS header configured
  anywhere (`next.config.ts` has no `headers()`), so there's nothing forcing
  the upgrade to HTTPS on first visit.
- **Fix**: `cookieOptions: { httpOnly: true, secure: process.env.NODE_ENV === "production" }`
  (or unconditionally `true` once local dev is confirmed to also run over
  HTTPS/is unaffected) in both `server.ts` and `middleware.ts`. Also add an
  HSTS header (`Strict-Transport-Security`) via `next.config.ts` `headers()`
  for defense in depth.

### LOW

**L1. `(app)` layout does not independently verify `status === "active"` —
relies entirely on middleware for the pending/disabled gate.**

- `src/app/(app)/layout.tsx:20-21` — `const current = await getCurrentUser(); if (!current) redirect("/login");`
  only checks that a profile exists, never `current.profile.status`.
- `src/lib/auth/session.ts:7-27` (`getCurrentUser`) itself has no status
  check either — only `requireActiveUser` (`session.ts:30-36`) does.
- Contrast with essentially every `page.tsx` under `(app)/`, which each call
  `requireActiveUser`/`requireAdmin`/`requirePermission` themselves (verified
  across `admin/users/page.tsx:7`, `admin/access/page.tsx:19`,
  `settings/page.tsx:13`, projects/clients/people/etc.) — genuine
  defense-in-depth at the page level. Two exceptions:
  `src/app/(app)/dashboard/page.tsx:49` uses the non-throwing
  `getCurrentUser()` (deliberate — the dashboard renders a degraded
  logged-out-shaped view rather than 500ing, and every actual data read
  underneath is RLS/`has_permission`-gated so a pending/disabled viewer just
  sees empty cards), and `src/app/(app)/settings/sessions/page.tsx:5-10`
  calls `createClient()` directly with **no** `require*` call at all — it
  relies solely on the `list_my_sessions`/`revoke_session` RPCs being
  self-scoped (`where s.user_id = auth.uid()`,
  `supabase/migrations/20260714000001_phase1_auth.sql:195-219`) and on
  middleware having already redirected non-active users away.
- **Impact today**: low. Middleware (`decideRedirect` in
  `src/lib/auth/gate.ts:24-29`) redirects every non-`/pending`,
  non-`/login` path for `pending`/`disabled` users, and RLS/`has_permission`
  independently blocks real data access regardless. The only exposure if
  middleware were ever bypassed (matcher misconfiguration, an edge-runtime
  failure, a future refactor that adds a route middleware doesn't cover) is
  the sidebar/topbar chrome (nav links, the viewer's own name/avatar) and,
  on `/settings/sessions` specifically, the viewer's own session list — not
  another user's data.
- **Fix**: add `const current = await requireActiveUser()` (or catch and
  redirect to `/pending`) in `(app)/layout.tsx` itself, so the layout is not
  purely trusting middleware to have already filtered the request. Cheap
  insurance for a check that's one line and already exists elsewhere in the
  codebase.

**L2. Avatar storage bucket is public and world-writable-by-any-authenticated-user.**

- `supabase/migrations/20260727000002_avatars_bucket.sql:9-16` — the
  `avatars` bucket is `public = true`, and `insert` is allowed to *any*
  authenticated user (`with check (bucket_id = 'avatars')`, no
  `manage_people` gate at the storage layer — that's UX/action-layer only
  per the migration's own comment). No `update`/`delete` policy exists.
- **Impact**: minor. Any authenticated user (including a brand-new
  `pending`-status signup, since storage RLS here doesn't check
  `user_profiles.status`) can upload arbitrary public-read image blobs to
  the bucket, and the resulting URL is guessable only if the caller already
  knows the generated UUID object name — not enumerable in practice, and
  the content is capped at 2 MB / `image/*` by the bucket's own limits. Still,
  this is publicly-hosted storage reachable pre-approval, which is worth a
  conscious sign-off rather than an implicit one, especially since this app
  is described as confidential — anonymous internet users (no auth needed at
  all, since the bucket is `public = true` for `select`) can view any avatar
  URL if leaked/guessed, and a pending, not-yet-approved account can already
  write to shared storage.
- **Fix**: this is very likely an accepted tradeoff (photos aren't sensitive
  data) — no change required unless the org's confidentiality bar wants
  storage-level `manage_people`/active-status gating on insert too.

---

## Verified secure

- **`getUser()` vs `getSession()`**: every authorization decision in the
  codebase uses `supabase.auth.getUser()` (network-validated against the
  Supabase Auth server), never `getSession()` for authz. Confirmed in
  `src/lib/supabase/middleware.ts:31-34` (explicit comment: *"getUser()
  validates the JWT against Supabase — never trust getSession() here"*) and
  `src/lib/auth/session.ts:9-11`. The one `getSession()` call in the codebase
  (`src/app/(app)/settings/sessions/page.tsx:9`) is not an authorization
  decision — it decodes the *current* session's own JWT (via
  `decodeJwtSessionId`, `src/lib/auth/jwt.ts`, explicitly documented as
  "Pure; no verification") purely to highlight "this device" in a list the
  user already has RLS-scoped access to. No trust is placed in it.
- **Cookies are `httpOnly`**: confirmed at both cookie-issuing sites
  (`server.ts:26`, `middleware.ts:27`) — matches the memory note. (See M2 for
  the missing `secure` flag on the same config.)
- **`sameSite`**: defaults to `"lax"` (`@supabase/ssr`'s
  `DEFAULT_COOKIE_OPTIONS`), a reasonable CSRF baseline; not overridden.
- **Approval/status gate is enforced at the database layer, not just the
  app layer**: `has_permission()` and `is_admin()`
  (`supabase/migrations/20260715000002_permission_model.sql:126-136,158-192`)
  both hard-require `user_profiles.status = 'active'` for every non-admin
  branch, with an explicit review-note comment confirming this was a
  deliberate fix ("a disabled user's still-valid JWT must not pass RLS
  through role/explicit grants"). This means even if the Next.js layer (app
  layout, a page) were bypassed entirely, RLS itself blocks pending/disabled
  users from every table read/write gated by `has_permission`.
- **Role self-escalation is blocked at every layer**: `user_roles` table
  grants (insert/update/delete) are RLS-gated to `is_admin()` only
  (`20260715000002_permission_model.sql:229-231`, no "update own" policy
  exists); `set_user_role` RPC re-checks `is_admin()` itself
  (`20260720000001_set_user_role_rpc.sql:13-15`); `changeUserRoleAction` and
  `setUserStatusAction` both explicitly reject `userId === admin.user.id`
  (`src/app/actions/admin.ts:97-98,134-135`); and per-project ad-hoc grants
  can never include `manage_access`/`manage_users`/`view_audit`/
  `create_project`/`export_data`/`reveal_credential` — enforced twice, once
  in the action (`src/app/actions/access.ts:44-47`) and unconditionally by
  a DB trigger for *every* caller including a forced RLS insert
  (`enforce_grantable_permission`,
  `20260720000005_enforce_grantable_permission.sql`).
- **Service-role/admin client is server-only and narrowly used**:
  `src/lib/supabase/admin.ts` is `import "server-only"`, reads
  `SUPABASE_SERVICE_ROLE_KEY` (never `NEXT_PUBLIC_*` — confirmed via
  repo-wide grep, only appears in `admin.ts`, `.env.example`, `README.md`,
  and the local-only `scripts/seed-admin.mjs`). All three real usages are
  narrowly scoped and always follow an explicit permission check:
  `src/lib/audit.ts:83` (append-only audit log insert, no user input
  reaches a query — the insert shape is fixed), `src/app/actions/admin.ts:48`
  (notification insert, gated by `requireAdmin()` at line 17 before the
  admin client is even constructed), and
  `src/app/actions/project-credentials.ts:38` (Vault secret creation via a
  `SECURITY DEFINER` RPC, gated by `requirePermission("manage_credentials", projectId)`
  at line 25, *before* the admin client call — the comment there correctly
  notes this `requirePermission` call is "the only gate standing between an
  arbitrary caller and creating secrets" since Vault has no RLS of its own).
  Credential reveal deliberately goes through the RLS'd client + a
  `SECURITY DEFINER` RPC that re-checks permission server-side
  (`reveal_credential_secret`,
  `20260720000002_reveal_credential_rpc.sql`), never the admin client.
- **No open redirect**: the OAuth callback
  (`src/app/auth/callback/route.ts:6-27`) takes only `code` from the query
  string; the redirect target is always a hardcoded `${origin}/dashboard` or
  `${origin}/login?error=oauth_failed` — never derived from a client-supplied
  parameter. `signInWithAzureAction`'s `redirectTo` is likewise hardcoded to
  `${NEXT_PUBLIC_SITE_URL}/auth/callback` (`src/app/actions/auth.ts:64`), not
  attacker-controlled. No password-reset flow exists in the app at all (no
  `resetPasswordForEmail`/`updateUser` recovery UI found), so there's no
  reset-token redirect surface to audit.
- **No route handlers outside the guarded surface**: the only `route.ts` in
  the entire app is the OAuth callback
  (`src/app/auth/callback/route.ts`) — confirmed via a full-repo
  `find ... route.ts`. Every other server entry point is either a Server
  Component page (all of which call `require*` or rely on RLS, see L1 for
  the two exceptions) or a `"use server"` action, and every action file
  except `src/app/actions/auth.ts` (which is deliberately pre-auth:
  login/signup/OAuth/signout) calls a `require*` gate before doing any work
  — confirmed by grep across `src/app/actions/*.ts`.
- **Middleware runs on effectively every request**: `src/middleware.ts`'s
  matcher excludes only static assets (`_next/static`, `_next/image`,
  `favicon.ico`, common image extensions) — pages, server actions (which
  POST to the same pathname), and the callback route are all covered.
  `updateSession` fails closed on a profile-lookup error (redirects to
  `/login` rather than granting access,
  `src/lib/supabase/middleware.ts:44-51`) and treats a missing profile row
  as `pending` rather than `active` (`:53-57`).
- **Idle/session revocation**: disabling a user
  (`setUserStatusAction`, `src/app/actions/admin.ts:128-181`) calls
  `admin_revoke_user_sessions` to delete all of that user's `auth.sessions`
  rows server-side (all devices), in addition to middleware's local
  `signOut({scope:"local"})` fallback for the disabled-user's *current*
  browser (`src/lib/supabase/middleware.ts:62-64`). Global sign-out
  (`signOutAction`, `src/app/actions/auth.ts:91`) uses
  `scope: "global"`.

---

## Worst finding

**M1 — password policy bypass**: the app's 12-character minimum
(`src/lib/validation/auth.ts:20`) is UI/action-layer only. Supabase Auth's
own `minimum_password_length` is 6 with no complexity requirement
(`supabase/config.toml:182,185`), and since `NEXT_PUBLIC_SUPABASE_ANON_KEY`
is necessarily public, anyone can call the Auth API directly and create an
account with a 6-character password, bypassing the app's policy entirely.
Combined with M2 (cookies never marked `Secure`), these are the two items
worth fixing before/at production deploy — everything else is solid
defense-in-depth already in place.
