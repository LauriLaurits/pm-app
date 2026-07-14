# Phase 1 — Auth, Sessions, User Approval — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Working login (email/password + Microsoft Entra ID), pending-approval gate for new users, admin approval screen, 24h time-boxed sessions with per-session view/revoke, global logout, and audit logging of all auth events.

**Architecture:** Next.js App Router (server components by default) + local Supabase stack (Docker). Cookie-based auth via `@supabase/ssr`; every route request passes through middleware that refreshes the session and enforces a pure, unit-tested route gate (unauthenticated → `/login`, pending → `/pending`, disabled → signed out). All mutations are server actions. Session listing/revocation is done with `security definer` Postgres functions over `auth.sessions`. Audit writes go through a service-role client (RLS keeps the table locked for everyone else).

**Tech Stack:** Next.js 15 (App Router, TypeScript), Tailwind CSS + shadcn/ui, Supabase (Postgres, Auth, RLS), `@supabase/ssr`, React Hook Form + Zod, Vitest, pgTAP (`supabase test db`).

## Global Constraints

(from the spec — apply to every task)

- Server components by default; small single-responsibility components, **no component over ~150 lines**.
- **Every mutation is a server action.** No permission logic duplicated inline — Phase 1 uses shared `requireActiveUser()` / `requireAdmin()` helpers (the full `requirePermission(user, action, resource)` helper is a Phase 2 deliverable per the spec).
- **RLS enabled on every table.** UI hiding is never the security boundary.
- Zod schemas defined once, shared between forms and server actions.
- Migration-first: all schema changes as files under `supabase/migrations/`. Provide `.env.example`.
- Typed DB access via generated Supabase types (`src/lib/database.types.ts`).
- Loading skeletons, empty states, and error handling on every data view.
- Sessions: max lifetime 24h (`[auth.sessions] timebox = "24h"`), refresh-token rotation on. Logout uses `signOut({ scope: 'global' })`.
- Log login, logout, failed login, session revocation to `audit_logs`. Rate-limit auth attempts (Supabase `[auth.rate_limit]`). Secure HTTP-only cookies (default with `@supabase/ssr`), CSRF protection (Next.js server actions enforce same-origin `Origin` header; cookies are `SameSite=Lax`).

## Decisions made (spec allows deciding + noting)

1. **Role storage in Phase 1** is a single `role` enum column on `user_profiles` (the five spec roles). Phase 2 replaces this with the full normalized `roles`/`permissions`/`user_roles` model; the approval UI won't change.
2. **Entra ID locally**: the Azure provider block ships in `config.toml` but `enabled = false` until real Azure app-registration credentials are placed in env (setup documented in README). Email/password is fully testable locally. The "Sign in with Microsoft" button shows a friendly error if the provider is disabled.
3. **Email confirmations are OFF for local dev** (`enable_confirmations = false`) so signup → pending flow is testable without an inbox. Production checklist in README says to enable them.
4. **Session revocation** deletes rows from `auth.sessions` via `security definer` functions. Deleting a session kills its refresh tokens; the already-issued access JWT stays valid up to `jwt_expiry` (set to 1h) — noted as an accepted, standard limitation.
5. **No "reject user" flow** in v1 — admin can set a user to `disabled` instead (middleware signs disabled users out).
6. **Per-project access grants at approval time** are deferred to Phase 2 (the `user_project_permissions` table doesn't exist yet); approval assigns role only. Noted for the Phase 2 review.
7. **Failed-login audit rows** are written with the service-role client (an unauthenticated request can't insert under RLS).

## File structure (end state of Phase 1)

```
pm/
├── .env.example
├── package.json                       # scripts: dev/test/test:db/db:*/seed:admin
├── vitest.config.ts
├── src/middleware.ts                  # middleware → updateSession()
├── docs/superpowers/plans/…           # this plan
├── scripts/seed-admin.mjs             # creates first active admin
├── supabase/
│   ├── config.toml                    # sessions timebox 24h, rate limits, azure block
│   ├── migrations/20260714000001_phase1_auth.sql
│   └── tests/phase1_rls.test.sql      # pgTAP RLS tests
├── tests/
│   ├── gate.test.ts                   # route-gate unit tests
│   ├── jwt.test.ts                    # session-id decode tests
│   └── validation.test.ts             # zod schema tests
└── src/
    ├── lib/
    │   ├── database.types.ts          # generated
    │   ├── audit.ts                   # writeAudit() via service role
    │   ├── auth/
    │   │   ├── gate.ts                # decideRedirect() — pure
    │   │   ├── jwt.ts                 # decodeJwtSessionId() — pure
    │   │   └── session.ts             # getCurrentUser/requireActiveUser/requireAdmin
    │   ├── supabase/
    │   │   ├── client.ts              # browser client
    │   │   ├── server.ts              # RSC/server-action client
    │   │   ├── admin.ts               # service-role client (server-only)
    │   │   └── middleware.ts          # updateSession()
    │   └── validation/auth.ts         # zod: login/signup/approve schemas
    └── app/
        ├── actions/
        │   ├── auth.ts                # signIn/signUp/signInWithAzure/signOut
        │   ├── admin.ts               # approveUser/setUserStatus/adminSignOutUser
        │   └── sessions.ts            # revokeSession
        ├── auth/callback/route.ts     # OAuth code exchange
        ├── (auth)/
        │   ├── layout.tsx             # centered card layout
        │   ├── login/page.tsx + login-form.tsx + azure-button.tsx
        │   ├── signup/page.tsx + signup-form.tsx
        │   └── pending/page.tsx
        └── (app)/
            ├── layout.tsx             # minimal top bar: app name, user menu (no sidebar yet)
            ├── user-menu.tsx
            ├── dashboard/page.tsx     # placeholder
            ├── admin/users/page.tsx + users-table.tsx + approve-dialog.tsx + user-actions.tsx
            └── settings/sessions/page.tsx + sessions-list.tsx
```

---

### Task 1: Repo scaffold + tooling

**Files:**
- Create: entire Next.js scaffold (via `create-next-app`), `vitest.config.ts`, `.env.example`, `README.md`, `.gitignore` additions

**Interfaces:**
- Produces: `@/*` path alias to `src/*`; npm scripts `test`, `dev`; shadcn/ui components under `src/components/ui/`.

- [ ] **Step 1: Init git and scaffold Next.js in place**

Run (PowerShell, from `C:\Users\LauriLaurits\Desktop\OpusProjects\pm`):

```powershell
git init
npx --yes create-next-app@latest . --typescript --tailwind --eslint --app --src-dir --import-alias "@/*" --use-npm --no-turbopack --yes
```

Expected: scaffold completes; `src/app/page.tsx` exists. (If `create-next-app` complains the directory is not empty because of `docs/`, temporarily move `docs/` out, scaffold, move it back.)

- [ ] **Step 2: Install dependencies**

```powershell
npm i @supabase/supabase-js @supabase/ssr react-hook-form @hookform/resolvers zod server-only
npm i -D vitest supabase
npx --yes shadcn@latest init -d
npx --yes shadcn@latest add button card input label form table badge avatar dropdown-menu dialog select skeleton alert sonner separator
```

Expected: all install without error; `src/components/ui/button.tsx` exists.

- [ ] **Step 3: Add vitest config + npm scripts**

Create `vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, "src") },
  },
});
```

In `package.json`, merge into `"scripts"`:

```json
{
  "test": "vitest run",
  "test:db": "supabase test db",
  "db:start": "supabase start",
  "db:stop": "supabase stop",
  "db:reset": "supabase db reset",
  "db:types": "supabase gen types typescript --local > src/lib/database.types.ts",
  "seed:admin": "node --env-file=.env.local scripts/seed-admin.mjs"
}
```

- [ ] **Step 4: Create `.env.example`**

```bash
# Supabase (values from `npx supabase status` after `npm run db:start`)
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=replace-with-anon-key
SUPABASE_SERVICE_ROLE_KEY=replace-with-service-role-key

# Microsoft Entra ID (Azure app registration) — leave empty to keep provider disabled locally
SUPABASE_AUTH_AZURE_CLIENT_ID=
SUPABASE_AUTH_AZURE_SECRET=
SUPABASE_AUTH_AZURE_TENANT_URL=https://login.microsoftonline.com/YOUR-TENANT-ID/v2.0

# First-admin seed (scripts/seed-admin.mjs)
SEED_ADMIN_EMAIL=admin@example.com
SEED_ADMIN_PASSWORD=change-me-locally
```

- [ ] **Step 5: Verify test runner and dev build**

```powershell
npm run test
```
Expected: vitest exits 0 with "no test files found" (passWithNoTests not set — if it exits 1, add `passWithNoTests: true` to `vitest.config.ts` test block).

```powershell
npm run build
```
Expected: `next build` succeeds.

- [ ] **Step 6: Commit**

```powershell
git add -A
git commit -m "chore: scaffold Next.js + shadcn/ui + vitest tooling"
```

---

### Task 2: Local Supabase stack + auth configuration

**Files:**
- Create: `supabase/config.toml` (via `supabase init`, then edit)
- Create: `.env.local` (not committed)

**Interfaces:**
- Produces: running local stack at `http://127.0.0.1:54321`; auth configured with 24h timebox, rotation, rate limits; env vars consumed by all later tasks.

- [ ] **Step 1: Init Supabase project**

```powershell
npx supabase init
```
Expected: `supabase/config.toml` created.

- [ ] **Step 2: Edit `supabase/config.toml` auth sections**

Find and set (keep the rest of the generated file as-is):

```toml
[auth]
enabled = true
site_url = "http://localhost:3000"
additional_redirect_urls = ["http://localhost:3000/auth/callback"]
jwt_expiry = 3600
enable_refresh_token_rotation = true
refresh_token_reuse_interval = 10
enable_signup = true

[auth.sessions]
timebox = "24h"

[auth.rate_limit]
# auth attempts per 5 min per IP
sign_in_sign_ups = 15
token_refresh = 150

[auth.email]
enable_signup = true
enable_confirmations = false

# Microsoft Entra ID — flip enabled=true once real creds are in env (see README)
[auth.external.azure]
enabled = false
client_id = "env(SUPABASE_AUTH_AZURE_CLIENT_ID)"
secret = "env(SUPABASE_AUTH_AZURE_SECRET)"
url = "env(SUPABASE_AUTH_AZURE_TENANT_URL)"
```

- [ ] **Step 3: Start the stack (Docker must be running)**

```powershell
npm run db:start
npx supabase status
```
Expected: status prints API URL `http://127.0.0.1:54321`, anon key, service_role key.

- [ ] **Step 4: Create `.env.local`** from `.env.example`, pasting the anon + service_role keys from `supabase status`. Verify `.gitignore` covers `.env.local` (Next.js scaffold does: `.env*`)— but ensure `.env.example` is NOT ignored; if `.env*` is present, add `!.env.example` line.

- [ ] **Step 5: Commit**

```powershell
git add supabase/config.toml .gitignore .env.example
git commit -m "chore: local Supabase stack with 24h time-boxed sessions and auth rate limits"
```

---

### Task 3: Phase-1 migration, RLS, pgTAP tests, generated types, admin seed

**Files:**
- Create: `supabase/migrations/20260714000001_phase1_auth.sql`
- Create: `supabase/tests/phase1_rls.test.sql`
- Create: `scripts/seed-admin.mjs`
- Create: `src/lib/database.types.ts` (generated)

**Interfaces:**
- Produces (used by all later tasks):
  - Tables `public.user_profiles` (`id uuid`, `email text`, `full_name text|null`, `avatar_url text|null`, `status 'pending'|'active'|'disabled'`, `role 'admin'|'project_manager'|'finance'|'member'|'viewer'|null`, `approved_by`, `approved_at`, timestamps), `public.audit_logs`, `public.notifications`.
  - SQL functions: `public.is_admin(uid uuid default auth.uid()) returns boolean`, `public.list_my_sessions()` → `(id uuid, created_at timestamptz, updated_at timestamptz, user_agent text, ip text)`, `public.revoke_session(session_id uuid)`, `public.admin_revoke_user_sessions(target_user uuid)`.
  - Trigger: new `auth.users` row → pending `user_profiles` row → in-app notification to all active admins.
  - Generated type `Database` exported from `src/lib/database.types.ts`.

- [ ] **Step 1: Write the pgTAP test (failing first)**

Create `supabase/tests/phase1_rls.test.sql`:

```sql
begin;
create extension if not exists pgtap with schema extensions;
select plan(7);

-- Admin user first, promoted BEFORE the pending user signs up,
-- so the pending-user notification trigger sees an active admin.
insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, raw_app_meta_data, encrypted_password, created_at, updated_at)
values
  ('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'admin@test.local', '{"full_name":"Admin"}', '{}', '', now(), now());

update public.user_profiles
  set role = 'admin', status = 'active'
  where id = '11111111-1111-1111-1111-111111111111';

insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, raw_app_meta_data, encrypted_password, created_at, updated_at)
values
  ('22222222-2222-2222-2222-222222222222', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'pending@test.local', '{"full_name":"Pending"}', '{}', '', now(), now());

select is(
  (select count(*)::int from public.user_profiles),
  2,
  'trigger creates a profile per auth user'
);

-- ===== as the pending user =====
set local role authenticated;
set local "request.jwt.claims" to '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';

select is(
  (select count(*)::int from public.user_profiles),
  1,
  'non-admin sees only own profile'
);

select throws_ok(
  $$ update public.user_profiles set status = 'active'
     where id = '22222222-2222-2222-2222-222222222222' $$,
  'P0001',
  'not allowed to change protected profile fields',
  'non-admin cannot self-approve'
);

select is(
  (select count(*)::int from public.audit_logs),
  0,
  'non-admin cannot read audit logs'
);

select throws_ok(
  $$ delete from public.audit_logs $$,
  '42501',
  null,
  'audit_logs delete privilege revoked (append-only)'
);

-- ===== as the admin =====
set local "request.jwt.claims" to '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

select is(
  (select count(*)::int from public.user_profiles),
  2,
  'admin sees all profiles'
);

select is(
  (select count(*)::int from public.notifications where user_id = '11111111-1111-1111-1111-111111111111' and type = 'user_pending'),
  1,
  'admin got an in-app notification for the pending signup'
);

select * from finish();
rollback;
```

- [ ] **Step 2: Run to verify it fails**

```powershell
npm run test:db
```
Expected: FAIL (tables don't exist yet).

- [ ] **Step 3: Write the migration**

Create `supabase/migrations/20260714000001_phase1_auth.sql`:

```sql
-- Phase 1: profiles + approval state, audit log, notifications, session management

create type public.user_status as enum ('pending', 'active', 'disabled');
create type public.app_role as enum ('admin', 'project_manager', 'finance', 'member', 'viewer');

create table public.user_profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  full_name text,
  avatar_url text,
  status public.user_status not null default 'pending',
  role public.app_role,
  approved_by uuid references auth.users (id),
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.audit_logs (
  id bigint generated always as identity primary key,
  actor_id uuid,
  actor_email text,
  action text not null,
  resource_type text,
  resource_id text,
  ip text,
  user_agent text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index audit_logs_actor_idx on public.audit_logs (actor_id, created_at desc);
create index audit_logs_action_idx on public.audit_logs (action, created_at desc);

create table public.notifications (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.user_profiles (id) on delete cascade,
  type text not null,
  title text not null,
  body text,
  read_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index notifications_user_idx on public.notifications (user_id, created_at desc);

-- ---------- helpers ----------

create or replace function public.is_admin(uid uuid default auth.uid())
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1 from public.user_profiles
    where id = uid and role = 'admin' and status = 'active'
  );
$$;

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger user_profiles_updated_at
  before update on public.user_profiles
  for each row execute function public.set_updated_at();

-- ---------- new-user trigger: auth.users -> pending profile ----------

create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  insert into public.user_profiles (id, email, full_name, avatar_url)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name'),
    new.raw_user_meta_data ->> 'avatar_url'
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------- notify active admins about a new pending user ----------

create or replace function public.notify_admins_pending_user()
returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  if new.status = 'pending' then
    insert into public.notifications (user_id, type, title, body, metadata)
    select p.id, 'user_pending', 'New user awaiting approval',
           coalesce(new.full_name, new.email) || ' signed up and needs approval.',
           jsonb_build_object('pending_user_id', new.id)
    from public.user_profiles p
    where p.role = 'admin' and p.status = 'active';
  end if;
  return new;
end;
$$;

create trigger on_profile_created_notify_admins
  after insert on public.user_profiles
  for each row execute function public.notify_admins_pending_user();

-- ---------- protect approval columns from non-admins ----------

create or replace function public.protect_profile_columns()
returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  -- service role has auth.uid() = null and bypasses this guard
  if auth.uid() is not null and not public.is_admin() then
    if new.status is distinct from old.status
       or new.role is distinct from old.role
       or new.approved_by is distinct from old.approved_by
       or new.approved_at is distinct from old.approved_at then
      raise exception 'not allowed to change protected profile fields';
    end if;
  end if;
  return new;
end;
$$;

create trigger protect_profile_columns
  before update on public.user_profiles
  for each row execute function public.protect_profile_columns();

-- ---------- RLS ----------

alter table public.user_profiles enable row level security;
alter table public.audit_logs enable row level security;
alter table public.notifications enable row level security;

create policy "read own profile" on public.user_profiles
  for select using (id = auth.uid());
create policy "admins read all profiles" on public.user_profiles
  for select using (public.is_admin());
create policy "update own profile" on public.user_profiles
  for update using (id = auth.uid()) with check (id = auth.uid());
create policy "admins update any profile" on public.user_profiles
  for update using (public.is_admin());

-- audit_logs: admins may read; nobody (client-side) may write/update/delete.
-- Writes happen only via the service role, which bypasses RLS.
create policy "admins read audit logs" on public.audit_logs
  for select using (public.is_admin());
revoke insert, update, delete on public.audit_logs from authenticated, anon;

create policy "read own notifications" on public.notifications
  for select using (user_id = auth.uid());
create policy "mark own notifications read" on public.notifications
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());
revoke insert, delete on public.notifications from authenticated, anon;

-- ---------- session management over auth.sessions ----------

create or replace function public.list_my_sessions()
returns table (id uuid, created_at timestamptz, updated_at timestamptz, user_agent text, ip text)
language sql security definer
set search_path = ''
as $$
  select s.id, s.created_at, s.updated_at, s.user_agent, host(s.ip) as ip
  from auth.sessions s
  where s.user_id = auth.uid()
  order by s.updated_at desc;
$$;

create or replace function public.revoke_session(session_id uuid)
returns void
language plpgsql security definer
set search_path = ''
as $$
begin
  delete from auth.sessions
  where id = session_id and user_id = auth.uid();
end;
$$;

create or replace function public.admin_revoke_user_sessions(target_user uuid)
returns void
language plpgsql security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'admin permission required';
  end if;
  delete from auth.sessions where user_id = target_user;
end;
$$;

revoke all on function public.list_my_sessions() from public, anon;
revoke all on function public.revoke_session(uuid) from public, anon;
revoke all on function public.admin_revoke_user_sessions(uuid) from public, anon;
grant execute on function public.list_my_sessions() to authenticated;
grant execute on function public.revoke_session(uuid) to authenticated;
grant execute on function public.admin_revoke_user_sessions(uuid) to authenticated;
```

- [ ] **Step 4: Apply migration and run DB tests until green**

```powershell
npm run db:reset
npm run test:db
```
Expected: `db reset` applies the migration cleanly; pgTAP prints `ok 1..7`, all pass.

- [ ] **Step 5: Generate types**

```powershell
npm run db:types
```
Expected: `src/lib/database.types.ts` exists and exports `Database` with `user_profiles`, `audit_logs`, `notifications`, and the three functions.

- [ ] **Step 6: Write the admin seed script**

Create `scripts/seed-admin.mjs`:

```js
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const email = process.env.SEED_ADMIN_EMAIL;
const password = process.env.SEED_ADMIN_PASSWORD;

if (!url || !serviceKey || !email || !password) {
  console.error("Missing env. Run via: npm run seed:admin (reads .env.local)");
  process.exit(1);
}

const admin = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const { data, error } = await admin.auth.admin.createUser({
  email,
  password,
  email_confirm: true,
  user_metadata: { full_name: "Seed Admin" },
});
if (error) {
  console.error("createUser failed:", error.message);
  process.exit(1);
}

const { error: profileError } = await admin
  .from("user_profiles")
  .update({
    status: "active",
    role: "admin",
    approved_at: new Date().toISOString(),
  })
  .eq("id", data.user.id);
if (profileError) {
  console.error("profile activation failed:", profileError.message);
  process.exit(1);
}

console.log(`Seeded active admin: ${email} (${data.user.id})`);
```

- [ ] **Step 7: Run the seed and verify**

```powershell
npm run seed:admin
```
Expected: `Seeded active admin: admin@example.com (<uuid>)`.

- [ ] **Step 8: Commit**

```powershell
git add supabase scripts src/lib/database.types.ts
git commit -m "feat: phase-1 schema - profiles/approval, append-only audit log, notifications, session RPCs, RLS + pgTAP tests"
```

---

### Task 4: Route gate (pure) + Supabase clients + middleware

**Files:**
- Create: `src/lib/auth/gate.ts`, `tests/gate.test.ts`
- Create: `src/lib/supabase/client.ts`, `src/lib/supabase/server.ts`, `src/lib/supabase/admin.ts`, `src/lib/supabase/middleware.ts`
- Create: `src/middleware.ts`

**Interfaces:**
- Consumes: `Database` type from Task 3.
- Produces:
  - `decideRedirect(input: { pathname: string; isAuthenticated: boolean; status: "pending" | "active" | "disabled" | null }): string | null`
  - `createClient()` (browser, from `@/lib/supabase/client`), `createClient()` (async, server, from `@/lib/supabase/server`), `createAdminClient()` (from `@/lib/supabase/admin`), `updateSession(request: NextRequest): Promise<NextResponse>`.

- [ ] **Step 1: Write failing gate tests**

Create `tests/gate.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { decideRedirect } from "@/lib/auth/gate";

const anon = { isAuthenticated: false, status: null } as const;
const pending = { isAuthenticated: true, status: "pending" } as const;
const active = { isAuthenticated: true, status: "active" } as const;
const disabled = { isAuthenticated: true, status: "disabled" } as const;

describe("decideRedirect", () => {
  it("lets unauthenticated users reach public auth pages", () => {
    expect(decideRedirect({ pathname: "/login", ...anon })).toBeNull();
    expect(decideRedirect({ pathname: "/signup", ...anon })).toBeNull();
    expect(decideRedirect({ pathname: "/auth/callback", ...anon })).toBeNull();
  });

  it("sends unauthenticated users to /login from protected routes", () => {
    expect(decideRedirect({ pathname: "/dashboard", ...anon })).toBe("/login");
    expect(decideRedirect({ pathname: "/", ...anon })).toBe("/login");
    expect(decideRedirect({ pathname: "/pending", ...anon })).toBe("/login");
  });

  it("locks pending users to /pending", () => {
    expect(decideRedirect({ pathname: "/pending", ...pending })).toBeNull();
    expect(decideRedirect({ pathname: "/dashboard", ...pending })).toBe("/pending");
    expect(decideRedirect({ pathname: "/admin/users", ...pending })).toBe("/pending");
  });

  it("keeps active users out of auth pages and off /pending", () => {
    expect(decideRedirect({ pathname: "/login", ...active })).toBe("/dashboard");
    expect(decideRedirect({ pathname: "/pending", ...active })).toBe("/dashboard");
    expect(decideRedirect({ pathname: "/", ...active })).toBe("/dashboard");
    expect(decideRedirect({ pathname: "/dashboard", ...active })).toBeNull();
    expect(decideRedirect({ pathname: "/settings/sessions", ...active })).toBeNull();
  });

  it("sends disabled users to /login with an error flag", () => {
    expect(decideRedirect({ pathname: "/dashboard", ...disabled })).toBe(
      "/login?error=account_disabled"
    );
    expect(decideRedirect({ pathname: "/login", ...disabled })).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify failure**

```powershell
npm run test
```
Expected: FAIL — cannot resolve `@/lib/auth/gate`.

- [ ] **Step 3: Implement the gate**

Create `src/lib/auth/gate.ts`:

```ts
export type UserStatus = "pending" | "active" | "disabled";

export type GateInput = {
  pathname: string;
  isAuthenticated: boolean;
  status: UserStatus | null;
};

const PUBLIC_PREFIXES = ["/login", "/signup", "/auth"];

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`)
  );
}

/** Pure routing decision used by middleware. Returns a redirect target or null. */
export function decideRedirect(input: GateInput): string | null {
  const { pathname, isAuthenticated, status } = input;

  if (!isAuthenticated) {
    return isPublicPath(pathname) ? null : "/login";
  }
  if (status === "disabled") {
    return pathname === "/login" ? null : "/login?error=account_disabled";
  }
  if (status === "pending") {
    return pathname === "/pending" ? null : "/pending";
  }
  // active (or profile row missing — treat as active; RLS still protects data)
  if (isPublicPath(pathname) && !pathname.startsWith("/auth/")) return "/dashboard";
  if (pathname === "/pending" || pathname === "/") return "/dashboard";
  return null;
}
```

- [ ] **Step 4: Run tests to verify pass**

```powershell
npm run test
```
Expected: all gate tests PASS.

- [ ] **Step 5: Implement Supabase clients**

Create `src/lib/supabase/client.ts`:

```ts
import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "@/lib/database.types";

export function createClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
```

Create `src/lib/supabase/server.ts`:

```ts
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { Database } from "@/lib/database.types";

export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // called from a Server Component — middleware refreshes sessions
          }
        },
      },
    }
  );
}
```

Create `src/lib/supabase/admin.ts`:

```ts
import "server-only";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";

/** Service-role client. Bypasses RLS — use only for audit writes and admin ops. */
export function createAdminClient() {
  return createSupabaseClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}
```

- [ ] **Step 6: Implement `updateSession` + root middleware**

Create `src/lib/supabase/middleware.ts`:

```ts
import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { decideRedirect, type UserStatus } from "@/lib/auth/gate";
import type { Database } from "@/lib/database.types";

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // IMPORTANT: getUser() validates the JWT against Supabase — never trust getSession() here
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let status: UserStatus | null = null;
  if (user) {
    const { data: profile } = await supabase
      .from("user_profiles")
      .select("status")
      .eq("id", user.id)
      .single();
    status = (profile?.status as UserStatus | undefined) ?? null;

    if (status === "disabled") {
      await supabase.auth.signOut({ scope: "local" });
    }
  }

  const target = decideRedirect({
    pathname: request.nextUrl.pathname,
    isAuthenticated: !!user,
    status,
  });

  if (target) {
    const url = request.nextUrl.clone();
    const [pathname, query] = target.split("?");
    url.pathname = pathname;
    url.search = query ? `?${query}` : "";
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}
```

Create `src/middleware.ts` (must live inside `src/` because the project uses `--src-dir`):

```ts
import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function middleware(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
```

- [ ] **Step 7: Verify build + manual smoke**

```powershell
npm run build
```
Expected: builds clean. Then `npm run dev`, open `http://localhost:3000/` → redirected to `/login` (404 page for now is fine — the redirect is what's being verified).

- [ ] **Step 8: Commit**

```powershell
git add src tests
git commit -m "feat: session middleware with tested route gate; supabase server/browser/admin clients"
```

---

### Task 5: Zod schemas, audit helper, session helpers, JWT decode

**Files:**
- Create: `src/lib/validation/auth.ts`, `tests/validation.test.ts`
- Create: `src/lib/audit.ts`
- Create: `src/lib/auth/session.ts`
- Create: `src/lib/auth/jwt.ts`, `tests/jwt.test.ts`

**Interfaces:**
- Consumes: `createClient` (server), `createAdminClient` from Task 4.
- Produces:
  - `loginSchema` (`{ email: string; password: string }`), `signupSchema` (`{ fullName: string; email: string; password: string }`), `approveUserSchema` (`{ userId: string; role: "admin"|"project_manager"|"finance"|"member"|"viewer" }`), types `LoginInput`, `SignupInput`, `ApproveUserInput`, constant `APP_ROLES`.
  - `writeAudit(entry: { action: AuditAction; actorId?: string | null; actorEmail?: string | null; resourceType?: string; resourceId?: string; metadata?: Record<string, unknown> }): Promise<void>` — never throws.
  - `getCurrentUser(): Promise<{ user: User; profile: Profile } | null>`, `requireActiveUser(): Promise<{ user; profile }>` (throws on fail), `requireAdmin(): Promise<{ user; profile }>`.
  - `decodeJwtSessionId(accessToken: string): string | null`.

- [ ] **Step 1: Write failing tests**

Create `tests/validation.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  loginSchema,
  signupSchema,
  approveUserSchema,
  APP_ROLES,
} from "@/lib/validation/auth";

describe("loginSchema", () => {
  it("accepts a valid login", () => {
    expect(
      loginSchema.safeParse({ email: "a@b.co", password: "longenough" }).success
    ).toBe(true);
  });
  it("rejects bad email and empty password", () => {
    expect(loginSchema.safeParse({ email: "nope", password: "x" }).success).toBe(false);
    expect(loginSchema.safeParse({ email: "a@b.co", password: "" }).success).toBe(false);
  });
});

describe("signupSchema", () => {
  it("requires name and a 12+ char password", () => {
    expect(
      signupSchema.safeParse({
        fullName: "Mari Mets",
        email: "mari@example.com",
        password: "a-long-password",
      }).success
    ).toBe(true);
    expect(
      signupSchema.safeParse({
        fullName: "M",
        email: "mari@example.com",
        password: "short",
      }).success
    ).toBe(false);
  });
});

describe("approveUserSchema", () => {
  it("requires uuid + known role", () => {
    expect(
      approveUserSchema.safeParse({
        userId: "11111111-1111-1111-1111-111111111111",
        role: "project_manager",
      }).success
    ).toBe(true);
    expect(
      approveUserSchema.safeParse({ userId: "not-a-uuid", role: "admin" }).success
    ).toBe(false);
    expect(
      approveUserSchema.safeParse({
        userId: "11111111-1111-1111-1111-111111111111",
        role: "superuser",
      }).success
    ).toBe(false);
  });
  it("exposes the five v1 roles", () => {
    expect(APP_ROLES).toEqual([
      "admin",
      "project_manager",
      "finance",
      "member",
      "viewer",
    ]);
  });
});
```

Create `tests/jwt.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { decodeJwtSessionId } from "@/lib/auth/jwt";

function fakeJwt(payload: object): string {
  const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString("base64url");
  return `${b64({ alg: "HS256" })}.${b64(payload)}.sig`;
}

describe("decodeJwtSessionId", () => {
  it("extracts session_id from a JWT payload", () => {
    expect(decodeJwtSessionId(fakeJwt({ session_id: "abc-123" }))).toBe("abc-123");
  });
  it("returns null for malformed tokens", () => {
    expect(decodeJwtSessionId("garbage")).toBeNull();
    expect(decodeJwtSessionId("a.!!!.c")).toBeNull();
    expect(decodeJwtSessionId(fakeJwt({}))).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify failure**

```powershell
npm run test
```
Expected: FAIL — modules don't exist.

- [ ] **Step 3: Implement schemas, jwt decode**

Create `src/lib/validation/auth.ts`:

```ts
import { z } from "zod";

export const APP_ROLES = [
  "admin",
  "project_manager",
  "finance",
  "member",
  "viewer",
] as const;

export const loginSchema = z.object({
  email: z.string().email("Enter a valid email"),
  password: z.string().min(8, "Password must be at least 8 characters"),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const signupSchema = z.object({
  fullName: z.string().min(2, "Enter your full name").max(120),
  email: z.string().email("Enter a valid email"),
  password: z.string().min(12, "Password must be at least 12 characters").max(128),
});
export type SignupInput = z.infer<typeof signupSchema>;

export const approveUserSchema = z.object({
  userId: z.string().uuid(),
  role: z.enum(APP_ROLES),
});
export type ApproveUserInput = z.infer<typeof approveUserSchema>;
```

Create `src/lib/auth/jwt.ts`:

```ts
/** Extract the session_id claim from a Supabase access token. Pure; no verification. */
export function decodeJwtSessionId(accessToken: string): string | null {
  const parts = accessToken.split(".");
  if (parts.length !== 3) return null;
  try {
    const payload = JSON.parse(
      Buffer.from(parts[1], "base64url").toString("utf8")
    );
    return typeof payload.session_id === "string" ? payload.session_id : null;
  } catch {
    return null;
  }
}
```

- [ ] **Step 4: Run tests to verify pass**

```powershell
npm run test
```
Expected: validation + jwt + gate tests all PASS.

- [ ] **Step 5: Implement audit + session helpers**

Create `src/lib/audit.ts`:

```ts
import "server-only";
import { headers } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";

export type AuditAction =
  | "auth.login"
  | "auth.login_failed"
  | "auth.logout"
  | "auth.signup"
  | "auth.session_revoked"
  | "auth.sessions_revoked_all"
  | "user.approved"
  | "user.status_changed";

export type AuditEntry = {
  action: AuditAction;
  actorId?: string | null;
  actorEmail?: string | null;
  resourceType?: string;
  resourceId?: string;
  metadata?: Record<string, unknown>;
};

/** Append to audit_logs via service role. Never throws — auditing must not break the flow. */
export async function writeAudit(entry: AuditEntry): Promise<void> {
  try {
    const h = await headers();
    const admin = createAdminClient();
    const { error } = await admin.from("audit_logs").insert({
      action: entry.action,
      actor_id: entry.actorId ?? null,
      actor_email: entry.actorEmail ?? null,
      resource_type: entry.resourceType ?? null,
      resource_id: entry.resourceId ?? null,
      ip: h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
      user_agent: h.get("user-agent") ?? null,
      metadata: (entry.metadata ?? {}) as never,
    });
    if (error) console.error("audit write failed:", error.message);
  } catch (e) {
    console.error("audit write failed:", e);
  }
}
```

Create `src/lib/auth/session.ts`:

```ts
import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/database.types";

export type Profile = Database["public"]["Tables"]["user_profiles"]["Row"];

export async function getCurrentUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from("user_profiles")
    .select("*")
    .eq("id", user.id)
    .single();
  if (!profile) return null;

  return { user, profile };
}

/** Shared pre-check for every server action. Throws unless logged in + approved. */
export async function requireActiveUser() {
  const current = await getCurrentUser();
  if (!current || current.profile.status !== "active") {
    throw new Error("Not authorized");
  }
  return current;
}

export async function requireAdmin() {
  const current = await requireActiveUser();
  if (current.profile.role !== "admin") {
    throw new Error("Admin permission required");
  }
  return current;
}
```

- [ ] **Step 6: Verify build + full test run**

```powershell
npm run test
npm run build
```
Expected: PASS / clean build.

- [ ] **Step 7: Commit**

```powershell
git add src tests
git commit -m "feat: shared zod auth schemas, audit writer, session/permission helpers"
```

---

### Task 6: Auth server actions + login/signup/pending pages + OAuth callback

**Files:**
- Create: `src/app/actions/auth.ts`
- Create: `src/app/auth/callback/route.ts`
- Create: `src/app/(auth)/layout.tsx`, `src/app/(auth)/login/page.tsx`, `src/app/(auth)/login/login-form.tsx`, `src/app/(auth)/login/azure-button.tsx`, `src/app/(auth)/signup/page.tsx`, `src/app/(auth)/signup/signup-form.tsx`, `src/app/(auth)/pending/page.tsx`
- Delete: `src/app/page.tsx` default content (replace with redirect)

**Interfaces:**
- Consumes: `loginSchema`/`signupSchema` (Task 5), `writeAudit` (Task 5), `createClient` server (Task 4).
- Produces server actions:
  - `signInAction(input: LoginInput): Promise<{ error: string } | never>` (redirects on success)
  - `signUpAction(input: SignupInput): Promise<{ error: string } | never>` (redirects to `/pending`)
  - `signInWithAzureAction(): Promise<{ error: string } | never>` (redirects to Microsoft)
  - `signOutAction(): Promise<never>` (global sign-out, redirects to `/login`)

- [ ] **Step 1: Implement server actions**

Create `src/app/actions/auth.ts`:

```ts
"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { writeAudit } from "@/lib/audit";
import {
  loginSchema,
  signupSchema,
  type LoginInput,
  type SignupInput,
} from "@/lib/validation/auth";

export async function signInAction(input: LoginInput) {
  const parsed = loginSchema.safeParse(input);
  if (!parsed.success) return { error: "Invalid email or password." };

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword(parsed.data);

  if (error) {
    await writeAudit({
      action: "auth.login_failed",
      actorEmail: parsed.data.email,
      metadata: { reason: error.message },
    });
    return { error: "Invalid email or password." };
  }

  await writeAudit({
    action: "auth.login",
    actorId: data.user.id,
    actorEmail: data.user.email,
  });
  redirect("/dashboard"); // middleware reroutes pending/disabled users
}

export async function signUpAction(input: SignupInput) {
  const parsed = signupSchema.safeParse(input);
  if (!parsed.success) return { error: "Please fix the highlighted fields." };

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: { data: { full_name: parsed.data.fullName } },
  });

  if (error) return { error: error.message };

  await writeAudit({
    action: "auth.signup",
    actorId: data.user?.id,
    actorEmail: parsed.data.email,
  });
  redirect("/pending");
}

export async function signInWithAzureAction() {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "azure",
    options: {
      scopes: "openid profile email",
      redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"}/auth/callback`,
    },
  });

  if (error || !data?.url) {
    return {
      error:
        "Microsoft sign-in is not configured yet. Ask an administrator, or use email and password.",
    };
  }
  redirect(data.url);
}

export async function signOutAction() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    await writeAudit({
      action: "auth.logout",
      actorId: user.id,
      actorEmail: user.email,
      metadata: { scope: "global" },
    });
  }
  await supabase.auth.signOut({ scope: "global" });
  redirect("/login");
}
```

Add `NEXT_PUBLIC_SITE_URL=http://localhost:3000` to `.env.example` and `.env.local`.

- [ ] **Step 2: OAuth callback route**

Create `src/app/auth/callback/route.ts`:

```ts
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { writeAudit } from "@/lib/audit";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");

  if (code) {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error && data.user) {
      await writeAudit({
        action: "auth.login",
        actorId: data.user.id,
        actorEmail: data.user.email,
        metadata: { provider: "azure" },
      });
      return NextResponse.redirect(`${origin}/dashboard`);
    }
    await writeAudit({
      action: "auth.login_failed",
      metadata: { provider: "azure", reason: error?.message ?? "no user" },
    });
  }
  return NextResponse.redirect(`${origin}/login?error=oauth_failed`);
}
```

- [ ] **Step 3: Auth layout + pages**

Create `src/app/(auth)/layout.tsx`:

```tsx
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-svh items-center justify-center bg-muted/40 p-4">
      <div className="w-full max-w-sm">{children}</div>
    </div>
  );
}
```

Create `src/app/(auth)/login/page.tsx`:

```tsx
import Link from "next/link";
import {
  Card, CardContent, CardDescription, CardHeader, CardTitle,
} from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { LoginForm } from "./login-form";
import { AzureButton } from "./azure-button";
import { Separator } from "@/components/ui/separator";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  return (
    <Card>
      <CardHeader>
        <CardTitle>PM CMS</CardTitle>
        <CardDescription>Sign in to your account</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {error === "account_disabled" && (
          <Alert variant="destructive">
            <AlertDescription>
              Your account has been disabled. Contact an administrator.
            </AlertDescription>
          </Alert>
        )}
        {error === "oauth_failed" && (
          <Alert variant="destructive">
            <AlertDescription>Microsoft sign-in failed. Try again.</AlertDescription>
          </Alert>
        )}
        <AzureButton />
        <div className="flex items-center gap-2">
          <Separator className="flex-1" />
          <span className="text-xs text-muted-foreground">or</span>
          <Separator className="flex-1" />
        </div>
        <LoginForm />
        <p className="text-center text-sm text-muted-foreground">
          No account?{" "}
          <Link href="/signup" className="underline underline-offset-4">
            Sign up
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
```

Create `src/app/(auth)/login/login-form.tsx`:

```tsx
"use client";

import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { loginSchema, type LoginInput } from "@/lib/validation/auth";
import { signInAction } from "@/app/actions/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Form, FormControl, FormField, FormItem, FormLabel, FormMessage,
} from "@/components/ui/form";
import { Alert, AlertDescription } from "@/components/ui/alert";

export function LoginForm() {
  const [serverError, setServerError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const form = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  });

  function onSubmit(values: LoginInput) {
    setServerError(null);
    startTransition(async () => {
      const result = await signInAction(values);
      if (result?.error) setServerError(result.error);
    });
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        {serverError && (
          <Alert variant="destructive">
            <AlertDescription>{serverError}</AlertDescription>
          </Alert>
        )}
        <FormField
          control={form.control}
          name="email"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Email</FormLabel>
              <FormControl>
                <Input type="email" autoComplete="email" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="password"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Password</FormLabel>
              <FormControl>
                <Input type="password" autoComplete="current-password" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button type="submit" className="w-full" disabled={isPending}>
          {isPending ? "Signing in…" : "Sign in"}
        </Button>
      </form>
    </Form>
  );
}
```

Create `src/app/(auth)/login/azure-button.tsx`:

```tsx
"use client";

import { useState, useTransition } from "react";
import { signInWithAzureAction } from "@/app/actions/auth";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";

export function AzureButton() {
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function onClick() {
    setError(null);
    startTransition(async () => {
      const result = await signInWithAzureAction();
      if (result?.error) setError(result.error);
    });
  }

  return (
    <div className="space-y-2">
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      <Button
        type="button"
        variant="outline"
        className="w-full"
        onClick={onClick}
        disabled={isPending}
      >
        {isPending ? "Redirecting…" : "Sign in with Microsoft"}
      </Button>
    </div>
  );
}
```

Create `src/app/(auth)/signup/page.tsx`:

```tsx
import Link from "next/link";
import {
  Card, CardContent, CardDescription, CardHeader, CardTitle,
} from "@/components/ui/card";
import { SignupForm } from "./signup-form";

export default function SignupPage() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Create account</CardTitle>
        <CardDescription>
          An administrator must approve your account before you get access.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <SignupForm />
        <p className="text-center text-sm text-muted-foreground">
          Already have an account?{" "}
          <Link href="/login" className="underline underline-offset-4">
            Sign in
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
```

Create `src/app/(auth)/signup/signup-form.tsx` (same shape as `login-form.tsx` — full name + email + password fields, `signupSchema`, calls `signUpAction`; submit label "Create account"):

```tsx
"use client";

import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { signupSchema, type SignupInput } from "@/lib/validation/auth";
import { signUpAction } from "@/app/actions/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Form, FormControl, FormField, FormItem, FormLabel, FormMessage,
} from "@/components/ui/form";
import { Alert, AlertDescription } from "@/components/ui/alert";

export function SignupForm() {
  const [serverError, setServerError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const form = useForm<SignupInput>({
    resolver: zodResolver(signupSchema),
    defaultValues: { fullName: "", email: "", password: "" },
  });

  function onSubmit(values: SignupInput) {
    setServerError(null);
    startTransition(async () => {
      const result = await signUpAction(values);
      if (result?.error) setServerError(result.error);
    });
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        {serverError && (
          <Alert variant="destructive">
            <AlertDescription>{serverError}</AlertDescription>
          </Alert>
        )}
        <FormField
          control={form.control}
          name="fullName"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Full name</FormLabel>
              <FormControl>
                <Input autoComplete="name" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="email"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Email</FormLabel>
              <FormControl>
                <Input type="email" autoComplete="email" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="password"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Password</FormLabel>
              <FormControl>
                <Input type="password" autoComplete="new-password" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button type="submit" className="w-full" disabled={isPending}>
          {isPending ? "Creating…" : "Create account"}
        </Button>
      </form>
    </Form>
  );
}
```

Create `src/app/(auth)/pending/page.tsx`:

```tsx
import {
  Card, CardContent, CardDescription, CardHeader, CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { signOutAction } from "@/app/actions/auth";

export default function PendingPage() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Waiting for approval</CardTitle>
        <CardDescription>
          Your account was created and is waiting for an administrator to
          approve it. You&apos;ll get access once a role has been assigned.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form action={signOutAction}>
          <Button variant="outline" type="submit" className="w-full">
            Sign out
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
```

Replace `src/app/page.tsx` with:

```tsx
import { redirect } from "next/navigation";

export default function RootPage() {
  redirect("/dashboard"); // middleware sends unauthenticated users to /login
}
```

- [ ] **Step 4: Verify flows manually**

```powershell
npm run dev
```
1. `http://localhost:3000/login` renders; wrong password → inline error; check `audit_logs` has an `auth.login_failed` row (`npx supabase status` → Studio URL → table editor, or `psql`).
2. Sign in as the seeded admin → lands on `/dashboard` (404 for now — Task 7 adds it; the redirect is the verification).
3. `/signup` → create `test-user@example.com` (12+ char password) → lands on `/pending`.
4. Sign out from `/pending` → back to `/login`.

Expected: all four hold; `audit_logs` contains `auth.login_failed`, `auth.login`, `auth.signup`, `auth.logout` rows.

- [ ] **Step 5: Run tests + build, commit**

```powershell
npm run test
npm run build
git add src .env.example
git commit -m "feat: login/signup/pending flows with audited auth server actions and OAuth callback"
```

---

### Task 7: Minimal app shell + dashboard placeholder

**Files:**
- Create: `src/app/(app)/layout.tsx`, `src/app/(app)/user-menu.tsx`, `src/app/(app)/dashboard/page.tsx`

**Interfaces:**
- Consumes: `getCurrentUser` (Task 5), `signOutAction` (Task 6).
- Produces: `(app)` route group layout that all Phase-1 authenticated pages render inside. Deliberately minimal — the full sidebar shell is a later-phase spec item; do not scaffold it now.

- [ ] **Step 1: Implement layout**

Create `src/app/(app)/layout.tsx`:

```tsx
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { UserMenu } from "./user-menu";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const current = await getCurrentUser();
  if (!current) redirect("/login");

  const isAdmin = current.profile.role === "admin";

  return (
    <div className="min-h-svh">
      <header className="flex h-14 items-center justify-between border-b px-4">
        <nav className="flex items-center gap-4 text-sm">
          <Link href="/dashboard" className="font-semibold">
            PM CMS
          </Link>
          {isAdmin && (
            <Link
              href="/admin/users"
              className="text-muted-foreground hover:text-foreground"
            >
              User access
            </Link>
          )}
        </nav>
        <UserMenu
          name={current.profile.full_name ?? current.profile.email}
          email={current.profile.email}
        />
      </header>
      <main className="p-6">{children}</main>
    </div>
  );
}
```

Create `src/app/(app)/user-menu.tsx`:

```tsx
"use client";

import Link from "next/link";
import { signOutAction } from "@/app/actions/auth";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function UserMenu({ name, email }: { name: string; email: string }) {
  const initials = name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="rounded-full outline-none focus-visible:ring-2">
        <Avatar className="h-8 w-8">
          <AvatarFallback>{initials}</AvatarFallback>
        </Avatar>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>
          <div className="text-sm font-medium">{name}</div>
          <div className="text-xs text-muted-foreground">{email}</div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/settings/sessions">Sessions</Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => signOutAction()}>
          Sign out everywhere
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
```

Create `src/app/(app)/dashboard/page.tsx`:

```tsx
export default function DashboardPage() {
  return (
    <div className="space-y-2">
      <h1 className="text-2xl font-semibold">Dashboard</h1>
      <p className="text-muted-foreground">
        Coming in Phase 5. Use the menu to manage user access and sessions.
      </p>
    </div>
  );
}
```

- [ ] **Step 2: Verify manually**

`npm run dev` → sign in as admin → `/dashboard` renders with header, "User access" link visible; "Sign out everywhere" returns to `/login` and invalidates the session in a second browser/incognito window too (global scope).

- [ ] **Step 3: Build + commit**

```powershell
npm run build
git add src
git commit -m "feat: minimal authenticated app shell with global sign-out"
```

---

### Task 8: Admin approval screen + user status management

**Files:**
- Create: `src/app/actions/admin.ts`
- Create: `src/app/(app)/admin/users/page.tsx`, `src/app/(app)/admin/users/users-table.tsx`, `src/app/(app)/admin/users/approve-dialog.tsx`, `src/app/(app)/admin/users/user-actions.tsx`

**Interfaces:**
- Consumes: `requireAdmin` (Task 5), `approveUserSchema` (Task 5), `writeAudit` (Task 5), `admin_revoke_user_sessions` RPC (Task 3).
- Produces server actions:
  - `approveUserAction(input: ApproveUserInput): Promise<{ error: string } | { success: true }>`
  - `setUserStatusAction(input: { userId: string; status: "active" | "disabled" }): Promise<{ error: string } | { success: true }>`
  - `adminSignOutUserAction(userId: string): Promise<{ error: string } | { success: true }>`

- [ ] **Step 1: Implement admin actions**

Create `src/app/actions/admin.ts`:

```ts
"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { writeAudit } from "@/lib/audit";
import { approveUserSchema, type ApproveUserInput } from "@/lib/validation/auth";

export async function approveUserAction(input: ApproveUserInput) {
  const admin = await requireAdmin();
  const parsed = approveUserSchema.safeParse(input);
  if (!parsed.success) return { error: "Invalid approval request." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("user_profiles")
    .update({
      status: "active",
      role: parsed.data.role,
      approved_by: admin.user.id,
      approved_at: new Date().toISOString(),
    })
    .eq("id", parsed.data.userId)
    .eq("status", "pending");

  if (error) return { error: "Approval failed. Try again." };

  const service = createAdminClient();
  await service.from("notifications").insert({
    user_id: parsed.data.userId,
    type: "user_approved",
    title: "Account approved",
    body: `You now have access as ${parsed.data.role.replace("_", " ")}.`,
  });

  await writeAudit({
    action: "user.approved",
    actorId: admin.user.id,
    actorEmail: admin.profile.email,
    resourceType: "user",
    resourceId: parsed.data.userId,
    metadata: { role: parsed.data.role },
  });

  revalidatePath("/admin/users");
  return { success: true as const };
}

const statusSchema = z.object({
  userId: z.string().uuid(),
  status: z.enum(["active", "disabled"]),
});

export async function setUserStatusAction(input: z.infer<typeof statusSchema>) {
  const admin = await requireAdmin();
  const parsed = statusSchema.safeParse(input);
  if (!parsed.success) return { error: "Invalid request." };
  if (parsed.data.userId === admin.user.id)
    return { error: "You cannot change your own status." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("user_profiles")
    .update({ status: parsed.data.status })
    .eq("id", parsed.data.userId);
  if (error) return { error: "Update failed." };

  if (parsed.data.status === "disabled") {
    await supabase.rpc("admin_revoke_user_sessions", {
      target_user: parsed.data.userId,
    });
  }

  await writeAudit({
    action: "user.status_changed",
    actorId: admin.user.id,
    actorEmail: admin.profile.email,
    resourceType: "user",
    resourceId: parsed.data.userId,
    metadata: { status: parsed.data.status },
  });

  revalidatePath("/admin/users");
  return { success: true as const };
}

export async function adminSignOutUserAction(userId: string) {
  const admin = await requireAdmin();
  if (!z.string().uuid().safeParse(userId).success)
    return { error: "Invalid user id." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_revoke_user_sessions", {
    target_user: userId,
  });
  if (error) return { error: "Could not revoke sessions." };

  await writeAudit({
    action: "auth.sessions_revoked_all",
    actorId: admin.user.id,
    actorEmail: admin.profile.email,
    resourceType: "user",
    resourceId: userId,
  });

  revalidatePath("/admin/users");
  return { success: true as const };
}
```

- [ ] **Step 2: Implement the page (RSC) + table**

Create `src/app/(app)/admin/users/page.tsx`:

```tsx
import { requireAdmin } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { UsersTable } from "./users-table";

export default async function AdminUsersPage() {
  await requireAdmin();
  const supabase = await createClient();
  const { data: users, error } = await supabase
    .from("user_profiles")
    .select("id, email, full_name, status, role, created_at")
    .order("created_at", { ascending: false });

  if (error) {
    return (
      <p className="text-destructive">Failed to load users: {error.message}</p>
    );
  }

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">User access</h1>
      <UsersTable users={users ?? []} />
    </div>
  );
}
```

Create `src/app/(app)/admin/users/users-table.tsx`:

```tsx
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { ApproveDialog } from "./approve-dialog";
import { UserActions } from "./user-actions";

type UserRow = {
  id: string;
  email: string;
  full_name: string | null;
  status: "pending" | "active" | "disabled";
  role: string | null;
  created_at: string;
};

const statusVariant = {
  pending: "secondary",
  active: "default",
  disabled: "destructive",
} as const;

export function UsersTable({ users }: { users: UserRow[] }) {
  if (users.length === 0) {
    return <p className="text-muted-foreground">No users yet.</p>;
  }
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>User</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Role</TableHead>
          <TableHead>Joined</TableHead>
          <TableHead className="text-right">Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {users.map((user) => (
          <TableRow key={user.id}>
            <TableCell>
              <div className="font-medium">{user.full_name ?? "—"}</div>
              <div className="text-sm text-muted-foreground">{user.email}</div>
            </TableCell>
            <TableCell>
              <Badge variant={statusVariant[user.status]}>{user.status}</Badge>
            </TableCell>
            <TableCell>{user.role?.replace("_", " ") ?? "—"}</TableCell>
            <TableCell>
              {new Date(user.created_at).toLocaleDateString()}
            </TableCell>
            <TableCell className="text-right">
              {user.status === "pending" ? (
                <ApproveDialog userId={user.id} userLabel={user.full_name ?? user.email} />
              ) : (
                <UserActions userId={user.id} status={user.status} />
              )}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
```

Create `src/app/(app)/admin/users/approve-dialog.tsx`:

```tsx
"use client";

import { useState, useTransition } from "react";
import { approveUserAction } from "@/app/actions/admin";
import { APP_ROLES } from "@/lib/validation/auth";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader,
  DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

export function ApproveDialog({
  userId,
  userLabel,
}: {
  userId: string;
  userLabel: string;
}) {
  const [open, setOpen] = useState(false);
  const [role, setRole] = useState<string>("member");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function onApprove() {
    setError(null);
    startTransition(async () => {
      const result = await approveUserAction({
        userId,
        role: role as (typeof APP_ROLES)[number],
      });
      if ("error" in result) setError(result.error);
      else setOpen(false);
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">Approve</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Approve {userLabel}</DialogTitle>
          <DialogDescription>
            Assign a role. The user gets access immediately after approval.
          </DialogDescription>
        </DialogHeader>
        <Select value={role} onValueChange={setRole}>
          <SelectTrigger>
            <SelectValue placeholder="Select role" />
          </SelectTrigger>
          <SelectContent>
            {APP_ROLES.map((r) => (
              <SelectItem key={r} value={r}>
                {r.replace("_", " ")}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <DialogFooter>
          <Button onClick={onApprove} disabled={isPending}>
            {isPending ? "Approving…" : "Approve"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

Create `src/app/(app)/admin/users/user-actions.tsx`:

```tsx
"use client";

import { useTransition } from "react";
import { adminSignOutUserAction, setUserStatusAction } from "@/app/actions/admin";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function UserActions({
  userId,
  status,
}: {
  userId: string;
  status: "active" | "disabled";
}) {
  const [isPending, startTransition] = useTransition();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size="sm" variant="outline" disabled={isPending}>
          {isPending ? "Working…" : "Manage"}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem
          onSelect={() =>
            startTransition(async () => {
              await adminSignOutUserAction(userId);
            })
          }
        >
          Log out from all devices
        </DropdownMenuItem>
        <DropdownMenuItem
          onSelect={() =>
            startTransition(async () => {
              await setUserStatusAction({
                userId,
                status: status === "active" ? "disabled" : "active",
              });
            })
          }
        >
          {status === "active" ? "Disable account" : "Re-enable account"}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
```

- [ ] **Step 3: Verify manually**

1. As admin, open `/admin/users` — pending `test-user@example.com` visible with Approve button.
2. Approve as `member` → badge flips to `active`; in another browser, that user can now reach `/dashboard`.
3. Disable the user → their other browser is bounced to `/login?error=account_disabled` on next navigation.
4. Check `audit_logs` for `user.approved`, `user.status_changed`; check `notifications` has a `user_approved` row for the user and `user_pending` rows for the admin.
5. As the member user, opening `/admin/users` shows nothing sensitive (RLS returns only own profile; `requireAdmin` throws → Next error boundary). 

Expected: all hold.

- [ ] **Step 4: Build + commit**

```powershell
npm run build
git add src
git commit -m "feat: admin user approval, disable/enable, force logout with audit trail"
```

---

### Task 9: Session management UI (view + revoke own sessions)

**Files:**
- Create: `src/app/actions/sessions.ts`
- Create: `src/app/(app)/settings/sessions/page.tsx`, `src/app/(app)/settings/sessions/sessions-list.tsx`
- Create: `src/app/(app)/settings/sessions/loading.tsx`

**Interfaces:**
- Consumes: `list_my_sessions`/`revoke_session` RPCs (Task 3), `decodeJwtSessionId` (Task 5), `requireActiveUser` (Task 5).
- Produces: `revokeSessionAction(sessionId: string): Promise<{ error: string } | { success: true }>`.

- [ ] **Step 1: Implement the action**

Create `src/app/actions/sessions.ts`:

```ts
"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireActiveUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { writeAudit } from "@/lib/audit";

export async function revokeSessionAction(sessionId: string) {
  const current = await requireActiveUser();
  if (!z.string().uuid().safeParse(sessionId).success)
    return { error: "Invalid session id." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("revoke_session", {
    session_id: sessionId,
  });
  if (error) return { error: "Could not revoke session." };

  await writeAudit({
    action: "auth.session_revoked",
    actorId: current.user.id,
    actorEmail: current.profile.email,
    resourceType: "session",
    resourceId: sessionId,
  });

  revalidatePath("/settings/sessions");
  return { success: true as const };
}
```

- [ ] **Step 2: Implement the page**

Create `src/app/(app)/settings/sessions/page.tsx`:

```tsx
import { createClient } from "@/lib/supabase/server";
import { decodeJwtSessionId } from "@/lib/auth/jwt";
import { SessionsList } from "./sessions-list";

export default async function SessionsPage() {
  const supabase = await createClient();
  const [{ data: sessions, error }, { data: sessionData }] = await Promise.all([
    supabase.rpc("list_my_sessions"),
    supabase.auth.getSession(),
  ]);

  if (error) {
    return (
      <p className="text-destructive">
        Failed to load sessions: {error.message}
      </p>
    );
  }

  const currentSessionId = sessionData.session
    ? decodeJwtSessionId(sessionData.session.access_token)
    : null;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Sessions</h1>
        <p className="text-sm text-muted-foreground">
          Devices signed in to your account. Sessions expire automatically
          after 24 hours.
        </p>
      </div>
      <SessionsList
        sessions={sessions ?? []}
        currentSessionId={currentSessionId}
      />
    </div>
  );
}
```

Create `src/app/(app)/settings/sessions/sessions-list.tsx`:

```tsx
"use client";

import { useState, useTransition } from "react";
import { revokeSessionAction } from "@/app/actions/sessions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

type SessionRow = {
  id: string;
  created_at: string;
  updated_at: string;
  user_agent: string | null;
  ip: string | null;
};

export function SessionsList({
  sessions,
  currentSessionId,
}: {
  sessions: SessionRow[];
  currentSessionId: string | null;
}) {
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  if (sessions.length === 0) {
    return <p className="text-muted-foreground">No active sessions.</p>;
  }

  function onRevoke(id: string) {
    setError(null);
    startTransition(async () => {
      const result = await revokeSessionAction(id);
      if ("error" in result) setError(result.error);
    });
  }

  return (
    <div className="space-y-3">
      {error && <p className="text-sm text-destructive">{error}</p>}
      {sessions.map((session) => {
        const isCurrent = session.id === currentSessionId;
        return (
          <Card key={session.id}>
            <CardContent className="flex items-center justify-between gap-4 p-4">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="truncate text-sm font-medium">
                    {session.user_agent ?? "Unknown device"}
                  </span>
                  {isCurrent && <Badge>This device</Badge>}
                </div>
                <p className="text-xs text-muted-foreground">
                  IP {session.ip ?? "unknown"} · started{" "}
                  {new Date(session.created_at).toLocaleString()} · last active{" "}
                  {new Date(session.updated_at).toLocaleString()}
                </p>
              </div>
              {!isCurrent && (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={isPending}
                  onClick={() => onRevoke(session.id)}
                >
                  Revoke
                </Button>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
```

Create `src/app/(app)/settings/sessions/loading.tsx`:

```tsx
import { Skeleton } from "@/components/ui/skeleton";

export default function SessionsLoading() {
  return (
    <div className="space-y-3">
      <Skeleton className="h-8 w-40" />
      <Skeleton className="h-20 w-full" />
      <Skeleton className="h-20 w-full" />
    </div>
  );
}
```

- [ ] **Step 3: Verify manually**

1. Sign in as admin in two browsers (normal + incognito). `/settings/sessions` lists two sessions; one badged "This device".
2. Revoke the other session → it disappears; the incognito browser loses access after its access token expires or on next full refresh cycle (revoked refresh token). For an immediate check: `select count(*) from auth.sessions where user_id = '<admin-id>'` in Studio → 1.
3. `audit_logs` has `auth.session_revoked`.

Expected: all hold.

- [ ] **Step 4: Build + tests + commit**

```powershell
npm run test
npm run build
git add src
git commit -m "feat: per-session view and revoke with audit logging"
```

---

### Task 10: Final verification sweep + README + Phase 1 summary

**Files:**
- Create/Modify: `README.md`

**Interfaces:** none — verification and docs.

- [ ] **Step 1: Full automated check**

```powershell
npm run test
npm run test:db
npm run build
npx supabase db reset
npm run seed:admin
```
Expected: all green; reset re-applies migration cleanly and seed works on a fresh DB.

- [ ] **Step 2: End-to-end manual pass (browser)**

Walk the whole Phase-1 story in order and confirm each audit row lands:

1. Anonymous → `/dashboard` redirects to `/login`.
2. Failed login → error + `auth.login_failed` audit row.
3. Signup → `/pending`; admin gets `user_pending` notification row.
4. Pending user cannot reach `/dashboard` (bounced to `/pending`).
5. Admin approves with role `member` → user reaches `/dashboard`; `user.approved` audit row; `user_approved` notification.
6. Sessions page shows sessions; revoking works (`auth.session_revoked`).
7. Admin "Log out from all devices" on the member (`auth.sessions_revoked_all`) → member's `auth.sessions` rows are gone.
8. Disable member → bounced to `/login?error=account_disabled`.
9. "Sign out everywhere" (global) logs out both browsers (`auth.logout`).
10. Member (non-admin) gets an error page on `/admin/users` and sees zero rows in `audit_logs` via API (RLS).

- [ ] **Step 3: Write README**

`README.md` must cover: prerequisites (Node 22, Docker), setup (`npm i`, `npm run db:start`, copy `.env.example` → `.env.local` with keys from `npx supabase status`, `npm run db:reset`, `npm run seed:admin`, `npm run dev`), test commands (`npm run test`, `npm run test:db`), Entra ID setup (Azure app registration → redirect URI `http://127.0.0.1:54321/auth/v1/callback` → put client id/secret/tenant URL in env → set `[auth.external.azure] enabled = true` → `supabase stop && supabase start`), and a production checklist (enable email confirmations, set real `site_url`, configure hosted-project auth settings to match `config.toml`: 24h timebox, rotation, rate limits).

- [ ] **Step 4: Commit**

```powershell
git add README.md
git commit -m "docs: setup, Entra ID configuration, production checklist"
```

- [ ] **Step 5: STOP — Phase gate**

Per the build spec: summarize what was built and the decisions made (use the "Decisions made" list above plus anything discovered during implementation), and **wait for approval before starting Phase 2**.

---

## Self-review notes

- **Spec coverage:** login page with both providers (Task 6), pending state + waiting page + in-app admin notification (Tasks 3/6), admin approval with role assignment (Task 8), 24h time-boxed sessions + rotation (Task 2), global logout (Tasks 6/7), admin force-logout (Task 8), user session view/revoke (Task 9), audit for login/logout/failed login/session revocation (Tasks 5–9), rate limiting via Supabase config (Task 2), HTTP-only cookies + CSRF via Next.js server-action origin checks (framework defaults, noted in constraints). Per-project access at approval time is explicitly deferred (Decision 6).
- **Known caveat:** revoking a session kills refresh; the outstanding access JWT can live up to 1h (Decision 4).
- **Type consistency check:** `decideRedirect`/`GateInput` (Task 4) matches middleware usage; `APP_ROLES`/`ApproveUserInput` (Task 5) match approve dialog + action (Task 8); RPC names `list_my_sessions`, `revoke_session`, `admin_revoke_user_sessions` (Task 3) match callers (Tasks 8/9).
