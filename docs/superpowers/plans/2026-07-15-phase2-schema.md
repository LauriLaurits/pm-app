# Phase 2 — Full Schema, RLS, requirePermission, Seed — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The complete normalized database for all later phases (projects, parts, people, workload, budgets, credentials, delegations), RLS on every table driven by one `has_permission()` function, the shared `requirePermission()` server helper, and a realistic seed — ending in a STOP to present the schema + RLS approach for review.

**Architecture:** Five migrations layered on Phase 1: (0002) normalized permission model that replaces the `user_profiles.role` enum column, (0003) clients/projects/parts, (0004) people/workload, (0005) budgets, (0006) credentials + delegations. All authorization concentrates in `public.has_permission(uid, perm, project)` — a `security definer` function combining: admin bypass → global role grants → PM own-project grants → member-project grants → explicit per-project grants (with expiry) → active delegations. Every policy calls it; the TS `requirePermission()` wraps the same function so server actions and RLS can never disagree. Financial data is column-gated by table separation: client-facing money (`part_billing`, `budgets`) needs `view_budget`; internal costs/margins (`part_costs`, `rates`) need `view_internal_cost` (finance only).

**Tech Stack:** Supabase Postgres migrations + pgTAP, Supabase Vault (credentials secrets), TypeScript helper + vitest, SQL seed (`supabase/seed.sql`).

## Global Constraints

(from the spec — apply to every task)

- RLS enabled on every table; UI hiding is never the security boundary.
- Financial fields (internal cost, rates, margins, budgets) must never be selected or returned without the finance permission — enforced in RLS/table separation, not just UI.
- Every mutation goes through a server action starting with shared `requirePermission` — this phase delivers the helper; no permission logic duplicated inline.
- Migration-first: all schema changes as `supabase/migrations/*.sql` files. Typed access via regenerated `src/lib/database.types.ts`.
- Local Supabase gotcha (learned in Phase 1): `auto_expose_new_tables` is off — EVERY new table needs explicit `grant` statements for `authenticated` (and `service_role` where the server writes), scoped no wider than its policies intend.
- pgTAP tests must be fixture-scoped (never assert global counts) and must pass both fresh and after `seed.sql`/`seed:admin`.
- Audit log stays append-only; audit writes via service role only.
- Roles stay exactly the five v1 roles: admin, project_manager, finance, member, viewer.
- Permissions are resource+action keys, grantable globally (role) or per-project, optionally with expiration (powers delegation).

## Decisions made (spec allows deciding + noting — present these at the phase gate)

1. **`user_profiles.role` is dropped.** `user_roles` becomes the single source of truth (v1 UI still assigns exactly one role per user). `is_admin()` is rewritten against `user_roles`; the approval action, seed script, admin UI, and Phase-1 pgTAP tests are updated in the same phase.
2. **Role grants carry a scope**: `global` (e.g. finance sees all budgets), `own_projects` (PM rights on projects where `pm_id = user`), `member_projects` (member rights on projects they're in `project_members`). This encodes the spec's role descriptions declaratively instead of hardcoding role names in policies.
3. **Delegations are evaluated live** inside `has_permission()` (active window + not revoked), not materialized into `user_project_permissions`. No sync jobs, automatic expiry, instant revoke. `user_project_permissions` is reserved for manual/temporary grants (admin UI, viewer access).
4. **Only `delegatable` permissions can be delegated** — a boolean on the `permissions` table enforced by trigger; `view_budget`, `view_internal_cost`, `manage_budget`, `manage_users`, `manage_access`, `view_audit` are non-delegatable per the spec.
5. **Financial column-gating via table separation** (Postgres RLS is row-level only): `part_billing` (fixed amount, hourly rate, client price) needs `view_budget`; `part_costs` (planned/actual internal cost) and `rates` (person cost + billing rates) need `view_internal_cost`. PMs see billing on their own projects, never internal costs (finance only), exactly per the spec.
6. **`people` ≠ `users`**: people is the resource directory (may have no login); optional `user_id` link. `project_members` (user-level, drives ACCESS via RLS) is separate from `assignments` (person-level, drives WORKLOAD math).
7. **Added one table not in the spec's list: `time_off`** — the spec requires people to have vacations (seed + workload + delegation trigger) but lists no table for it; smallest reasonable addition.
8. **Credentials secrets live in Vault from day one**: the `credentials` table stores only `secret_id uuid` (a `vault.secrets` reference — vault schema is never API-exposed, so no RLS read-path to raw values exists). Reveal/decrypt flows are Phase 6; seed creates real vault secrets.
9. **Status updates are immutable history** (no update policy; delete admin-only) — the spec demands full history.
10. **Seed strategy**: `supabase/seed.sql` (runs automatically on `db reset`) seeds everything including six demo auth users with password `Password123!` (bcrypt via pgcrypto). `scripts/seed-admin.mjs` stays for creating YOUR real admin from `.env.local`.
11. **`requirePermission(permission, projectId?)`** — the spec's `requirePermission(user, action, resource)` adapted to the codebase idiom: user comes from the session (`requireActiveUser()` composes in), resource is the project id; returns `{ user, profile }` like the Phase-1 helpers it extends.

## File structure (end state of Phase 2)

```
pm/
├── supabase/
│   ├── migrations/
│   │   ├── 20260714000001_phase1_auth.sql        (existing, untouched)
│   │   ├── 20260715000002_permission_model.sql   Task 1
│   │   ├── 20260715000003_projects.sql           Task 3
│   │   ├── 20260715000004_people_workload.sql    Task 4
│   │   ├── 20260715000005_budgets.sql            Task 5
│   │   └── 20260715000006_credentials_delegations.sql  Task 6
│   ├── tests/
│   │   ├── phase1_rls.test.sql                   (updated in Task 1: role column removal)
│   │   ├── phase2_permissions.test.sql           Task 1
│   │   ├── phase2_projects.test.sql              Task 3
│   │   ├── phase2_people.test.sql                Task 4
│   │   ├── phase2_budgets.test.sql               Task 5
│   │   └── phase2_credentials.test.sql           Task 6
│   └── seed.sql                                  Task 7
├── src/lib/
│   ├── auth/permissions.ts                       Task 2 (requirePermission + Permission type)
│   ├── auth/session.ts                           Task 2 (role via user_roles)
│   └── database.types.ts                         regenerated Tasks 1,3,4,5,6
├── src/app/actions/admin.ts                      Task 2 (approve writes user_roles)
├── src/app/(app)/admin/users/*.tsx               Task 2 (role display via join)
├── scripts/seed-admin.mjs                        Task 2 (user_roles insert)
└── docs/schema.md                                Task 8 (gate deliverable)
```

---

### Task 1: Permission model migration (roles, permissions, user_roles, user_project_permissions)

**Files:**
- Create: `supabase/migrations/20260715000002_permission_model.sql`
- Create: `supabase/tests/phase2_permissions.test.sql`
- Modify: `supabase/tests/phase1_rls.test.sql` (role column is gone)
- Regenerate: `src/lib/database.types.ts`

**Interfaces:**
- Produces (later tasks + app code rely on): tables `roles(key)`, `permissions(key, delegatable)`, `role_permissions(role_key, permission_key, scope)`, `user_roles(user_id, role_key)`, `user_project_permissions(user_id, project_id, permission_key, expires_at)`; function `public.has_permission(uid uuid, perm text, project uuid default null) returns boolean` (v1 — extended in Task 3); rewritten `public.is_admin(uid)` reading `user_roles`; view `public.user_primary_role(user_id, role_key)` is NOT created — callers join `user_roles` directly.
- BREAKS (fixed in this task + Task 2): `user_profiles.role` column no longer exists.

- [ ] **Step 1: Write the failing pgTAP test**

Create `supabase/tests/phase2_permissions.test.sql`:

```sql
begin;
create extension if not exists pgtap with schema extensions;
select plan(10);

-- fixtures: admin, pm, finance, member (auth trigger creates profiles)
insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, raw_app_meta_data, encrypted_password, created_at, updated_at) values
  ('a0000000-0000-4000-8000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','p2admin@test.local','{"full_name":"P2 Admin"}','{}','',now(),now()),
  ('a0000000-0000-4000-8000-000000000002','00000000-0000-0000-0000-000000000000','authenticated','authenticated','p2pm@test.local','{"full_name":"P2 PM"}','{}','',now(),now()),
  ('a0000000-0000-4000-8000-000000000003','00000000-0000-0000-0000-000000000000','authenticated','authenticated','p2fin@test.local','{"full_name":"P2 Fin"}','{}','',now(),now()),
  ('a0000000-0000-4000-8000-000000000004','00000000-0000-0000-0000-000000000000','authenticated','authenticated','p2mem@test.local','{"full_name":"P2 Member"}','{}','',now(),now());

update public.user_profiles set status = 'active'
  where id in ('a0000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000002','a0000000-0000-4000-8000-000000000003','a0000000-0000-4000-8000-000000000004');
insert into public.user_roles (user_id, role_key) values
  ('a0000000-0000-4000-8000-000000000001','admin'),
  ('a0000000-0000-4000-8000-000000000002','project_manager'),
  ('a0000000-0000-4000-8000-000000000003','finance'),
  ('a0000000-0000-4000-8000-000000000004','member');

select is(public.is_admin('a0000000-0000-4000-8000-000000000001'), true,  'is_admin true via user_roles');
select is(public.is_admin('a0000000-0000-4000-8000-000000000002'), false, 'PM is not admin');

select is(public.has_permission('a0000000-0000-4000-8000-000000000003','view_internal_cost'), true,  'finance has global view_internal_cost');
select is(public.has_permission('a0000000-0000-4000-8000-000000000002','view_internal_cost'), false, 'PM lacks view_internal_cost');
select is(public.has_permission('a0000000-0000-4000-8000-000000000001','anything_at_all'), true,     'admin bypasses everything');

-- explicit per-project grant with expiry (project uuid is synthetic here; FK to projects comes in Task 3, so this table starts without the FK — see migration note)
insert into public.user_project_permissions (user_id, project_id, permission_key, expires_at) values
  ('a0000000-0000-4000-8000-000000000004','b0000000-0000-4000-8000-000000000099','view_budget', now() + interval '1 day'),
  ('a0000000-0000-4000-8000-000000000004','b0000000-0000-4000-8000-000000000098','view_budget', now() - interval '1 day');

select is(public.has_permission('a0000000-0000-4000-8000-000000000004','view_budget','b0000000-0000-4000-8000-000000000099'), true,  'unexpired explicit grant works');
select is(public.has_permission('a0000000-0000-4000-8000-000000000004','view_budget','b0000000-0000-4000-8000-000000000098'), false, 'expired explicit grant denied');

-- RLS: non-admin cannot grant roles
set local role authenticated;
set local "request.jwt.claims" to '{"sub":"a0000000-0000-4000-8000-000000000004","role":"authenticated"}';
select throws_ok(
  $$ insert into public.user_roles (user_id, role_key) values ('a0000000-0000-4000-8000-000000000004','admin') $$,
  '42501', null, 'member cannot self-grant a role');
select is((select count(*)::int from public.user_roles where user_id = 'a0000000-0000-4000-8000-000000000004'), 1,
  'user can read own role');
select is((select count(*)::int from public.role_permissions where role_key = 'finance' and permission_key = 'view_internal_cost' and scope = 'global'), 1,
  'permission matrix readable by authenticated');

select * from finish();
rollback;
```

- [ ] **Step 2: Run to verify failure**

Run: `npm run test:db`
Expected: `phase2_permissions.test.sql` FAILS (tables don't exist); `phase1_rls.test.sql` still passes (untouched so far).

- [ ] **Step 3: Write the migration**

Create `supabase/migrations/20260715000002_permission_model.sql`:

```sql
-- Phase 2 (1/5): normalized permission model. Replaces user_profiles.role.

create table public.roles (
  key text primary key,
  name text not null,
  description text
);

create table public.permissions (
  key text primary key,
  description text,
  delegatable boolean not null default false
);

create type public.permission_scope as enum ('global', 'own_projects', 'member_projects');

create table public.role_permissions (
  role_key text not null references public.roles (key) on delete cascade,
  permission_key text not null references public.permissions (key) on delete cascade,
  scope public.permission_scope not null default 'global',
  primary key (role_key, permission_key, scope)
);

create table public.user_roles (
  user_id uuid not null references public.user_profiles (id) on delete cascade,
  role_key text not null references public.roles (key),
  granted_by uuid references public.user_profiles (id),
  granted_at timestamptz not null default now(),
  primary key (user_id, role_key)
);

-- Explicit manual/temporary per-project grants (admin UI, viewer access).
-- NOTE: no FK to projects yet (created in migration 0003, which adds it).
create table public.user_project_permissions (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.user_profiles (id) on delete cascade,
  project_id uuid not null,
  permission_key text not null references public.permissions (key),
  granted_by uuid references public.user_profiles (id),
  granted_at timestamptz not null default now(),
  expires_at timestamptz,
  unique (user_id, project_id, permission_key)
);
create index upp_user_perm_idx on public.user_project_permissions (user_id, permission_key);

-- ---------- catalog ----------

insert into public.roles (key, name) values
  ('admin','Admin'), ('project_manager','Project Manager'), ('finance','Finance'),
  ('member','Member'), ('viewer','Viewer');

insert into public.permissions (key, description, delegatable) values
  ('view_project','See a project and its parts', true),
  ('edit_project','Edit project fields and parts', true),
  ('create_project','Create new projects', false),
  ('edit_status','Post project status updates', true),
  ('view_team','See project members and assignments', true),
  ('manage_project_members','Add/remove project members', false),
  ('view_links','See project links', true),
  ('manage_links','Manage project links', true),
  ('view_budget','See client-facing budget figures', false),
  ('manage_budget','Edit budgets and billing', false),
  ('view_internal_cost','See internal costs, rates, margins', false),
  ('view_clients','See clients', false),
  ('manage_clients','Manage clients', false),
  ('view_people','See the people directory and workload', false),
  ('manage_people','Manage people, skills, time off', false),
  ('log_time','Log own time entries', false),
  ('view_time','See time entries across a project', false),
  ('view_credentials','See credential metadata', true),
  ('reveal_credential','Decrypt credential secrets', false),
  ('manage_credentials','Create/edit credentials', false),
  ('manage_delegations','Create delegations for own projects', false),
  ('manage_access','Grant per-project permissions', false),
  ('manage_users','Approve users, assign roles', false),
  ('view_audit','Read the audit log', false),
  ('export_data','Export data (v2)', false);

insert into public.role_permissions (role_key, permission_key, scope) values
  -- project_manager: portfolio visibility, full control of OWN projects, no internal costs
  ('project_manager','view_project','global'),
  ('project_manager','view_team','global'),
  ('project_manager','view_people','global'),
  ('project_manager','view_clients','global'),
  ('project_manager','manage_clients','global'),
  ('project_manager','create_project','global'),
  ('project_manager','log_time','global'),
  ('project_manager','edit_project','own_projects'),
  ('project_manager','edit_status','own_projects'),
  ('project_manager','manage_project_members','own_projects'),
  ('project_manager','view_links','global'),
  ('project_manager','manage_links','own_projects'),
  ('project_manager','view_budget','own_projects'),
  ('project_manager','manage_budget','own_projects'),
  ('project_manager','view_time','own_projects'),
  ('project_manager','view_credentials','own_projects'),
  ('project_manager','reveal_credential','own_projects'),
  ('project_manager','manage_credentials','own_projects'),
  ('project_manager','manage_delegations','own_projects'),
  -- finance: all financial data everywhere, read-oriented
  ('finance','view_project','global'),
  ('finance','view_team','global'),
  ('finance','view_people','global'),
  ('finance','view_clients','global'),
  ('finance','view_budget','global'),
  ('finance','manage_budget','global'),
  ('finance','view_internal_cost','global'),
  ('finance','view_time','global'),
  ('finance','view_links','global'),
  -- member: their projects only, own time
  ('member','view_project','member_projects'),
  ('member','view_team','member_projects'),
  ('member','view_links','member_projects'),
  ('member','view_people','global'),
  ('member','log_time','global');
  -- viewer: gets everything via user_project_permissions grants; no role grants
  -- admin: no rows needed — is_admin() bypass in has_permission()

-- ---------- migrate existing data off user_profiles.role ----------

insert into public.user_roles (user_id, role_key)
select id, role::text from public.user_profiles where role is not null
on conflict do nothing;

-- is_admin() now reads user_roles (same signature; all Phase-1 policies keep working)
create or replace function public.is_admin(uid uuid default auth.uid())
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1 from public.user_roles ur
    join public.user_profiles p on p.id = ur.user_id
    where ur.user_id = uid and ur.role_key = 'admin' and p.status = 'active'
  );
$$;

-- protect_profile_columns: drop role references (column is going away)
create or replace function public.protect_profile_columns()
returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  if auth.uid() is not null and not public.is_admin() then
    if new.status is distinct from old.status
       or new.approved_by is distinct from old.approved_by
       or new.approved_at is distinct from old.approved_at
       or new.email is distinct from old.email
       or new.created_at is distinct from old.created_at then
      raise exception 'not allowed to change protected profile fields';
    end if;
  end if;
  return new;
end;
$$;

alter table public.user_profiles drop column role;
drop type public.app_role;

-- ---------- has_permission v1 (extended with project-scope rules in migration 0003) ----------

create or replace function public.has_permission(uid uuid, perm text, project uuid default null)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select
    public.is_admin(uid)
    or exists (
      select 1 from public.user_roles ur
      join public.role_permissions rp on rp.role_key = ur.role_key
      where ur.user_id = uid and rp.permission_key = perm and rp.scope = 'global')
    or exists (
      select 1 from public.user_project_permissions upp
      where upp.user_id = uid and upp.permission_key = perm
        and (upp.expires_at is null or upp.expires_at > now())
        and (project is null or upp.project_id = project))
$$;

revoke all on function public.has_permission(uuid, text, uuid) from public, anon;
grant execute on function public.has_permission(uuid, text, uuid) to authenticated;

-- ---------- RLS + grants ----------

alter table public.roles enable row level security;
alter table public.permissions enable row level security;
alter table public.role_permissions enable row level security;
alter table public.user_roles enable row level security;
alter table public.user_project_permissions enable row level security;

-- catalog tables: readable by all authenticated (needed to render UI labels)
create policy "read roles" on public.roles for select using (auth.uid() is not null);
create policy "read permissions" on public.permissions for select using (auth.uid() is not null);
create policy "read role_permissions" on public.role_permissions for select using (auth.uid() is not null);
-- catalog writes: nobody client-side (migrations/service only) — no insert/update/delete policies

create policy "read own user_roles" on public.user_roles for select using (user_id = auth.uid());
create policy "admins read all user_roles" on public.user_roles for select using (public.is_admin());
create policy "admins manage user_roles" on public.user_roles for insert with check (public.is_admin());
create policy "admins update user_roles" on public.user_roles for update using (public.is_admin());
create policy "admins delete user_roles" on public.user_roles for delete using (public.is_admin());

create policy "read own project grants" on public.user_project_permissions for select using (user_id = auth.uid());
create policy "managers read project grants" on public.user_project_permissions for select using (public.has_permission(auth.uid(),'manage_access', project_id));
create policy "managers insert project grants" on public.user_project_permissions for insert with check (public.has_permission(auth.uid(),'manage_access', project_id));
create policy "managers delete project grants" on public.user_project_permissions for delete using (public.has_permission(auth.uid(),'manage_access', project_id));

-- explicit grants (auto_expose_new_tables is off locally)
grant select on public.roles, public.permissions, public.role_permissions to authenticated;
grant select, insert, update, delete on public.user_roles, public.user_project_permissions to authenticated;
grant select, insert, update, delete on public.roles, public.permissions, public.role_permissions, public.user_roles, public.user_project_permissions to service_role;
```

- [ ] **Step 4: Update `supabase/tests/phase1_rls.test.sql` for the dropped column**

Two surgical edits (do not touch anything else):
1. Replace `update public.user_profiles set role = 'admin', status = 'active' where id = '11111111-…';` with:
```sql
update public.user_profiles set status = 'active' where id = '11111111-1111-1111-1111-111111111111';
insert into public.user_roles (user_id, role_key) values ('11111111-1111-1111-1111-111111111111','admin');
```
2. The "non-admin cannot self-approve" `throws_ok` currently updates `status` — keep it. If any assertion sets or selects `role` on `user_profiles`, rewrite it against `user_roles` equivalently (e.g. self-approve-via-role becomes `insert into user_roles` which now fails with `42501` — if so change the expected errcode accordingly and note it).

- [ ] **Step 5: Apply + run until green**

```powershell
npm run db:reset
npm run test:db
```
Expected: migration applies cleanly; `phase1_rls.test.sql` green (with edits), `phase2_permissions.test.sql` 10/10 green.

- [ ] **Step 6: Regenerate types**

```powershell
npm run db:types
```
Expected: `Database` gains the five new tables; `user_profiles.Row` has no `role`. **The app will NOT compile until Task 2 — that is expected; do not run `npm run build` in this task.**

- [ ] **Step 7: Commit**

```powershell
git add supabase src/lib/database.types.ts
git commit -m "feat: normalized permission model (roles/permissions/user_roles) with has_permission()"
```

---

### Task 2: App refactor — requirePermission helper + normalized roles in code

**Files:**
- Create: `src/lib/auth/permissions.ts`
- Modify: `src/lib/auth/session.ts`, `src/app/actions/admin.ts`, `src/app/(app)/admin/users/page.tsx`, `src/app/(app)/admin/users/users-table.tsx`, `src/app/(app)/layout.tsx`, `scripts/seed-admin.mjs`
- Test: `tests/permissions.test.ts` (pure pieces)

**Interfaces:**
- Consumes: `has_permission` RPC, `user_roles` table (Task 1).
- Produces: `Permission` union type + `requirePermission(permission: Permission, projectId?: string): Promise<{ user, profile, role }>` from `@/lib/auth/permissions`; `getCurrentUser()` now returns `{ user, profile, role: string | null }` (role read from `user_roles`, single-role v1); `requireAdmin()` unchanged signature, now checks `role === "admin"` from the join.

- [ ] **Step 1: Write failing tests for the pure pieces**

Create `tests/permissions.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { PERMISSIONS, isPermission } from "@/lib/auth/permissions";

describe("permission catalog", () => {
  it("contains the spec's core keys", () => {
    for (const k of [
      "view_project","edit_project","view_budget","view_internal_cost",
      "view_credentials","reveal_credential","manage_access","view_audit",
      "export_data","manage_users",
    ]) {
      expect(PERMISSIONS).toContain(k);
    }
  });
  it("isPermission narrows correctly", () => {
    expect(isPermission("view_budget")).toBe(true);
    expect(isPermission("hack_the_planet")).toBe(false);
  });
});
```

Run `npm run test` → FAIL (module missing).

- [ ] **Step 2: Implement `src/lib/auth/permissions.ts`**

```ts
import "server-only" — NO: keep the catalog importable by client components for labels; split:
```

Actual file (the catalog is isomorphic; the helper is server-only via dynamic import of session):

```ts
export const PERMISSIONS = [
  "view_project","edit_project","create_project","edit_status",
  "view_team","manage_project_members","view_links","manage_links",
  "view_budget","manage_budget","view_internal_cost",
  "view_clients","manage_clients","view_people","manage_people",
  "log_time","view_time",
  "view_credentials","reveal_credential","manage_credentials",
  "manage_delegations","manage_access","manage_users","view_audit","export_data",
] as const;

export type Permission = (typeof PERMISSIONS)[number];

export function isPermission(value: string): value is Permission {
  return (PERMISSIONS as readonly string[]).includes(value);
}
```

Create `src/lib/auth/require-permission.ts` (server-only):

```ts
import "server-only";
import { createClient } from "@/lib/supabase/server";
import { requireActiveUser } from "@/lib/auth/session";
import type { Permission } from "@/lib/auth/permissions";

/** Shared pre-check for every Phase-2+ server action (spec: requirePermission(user, action, resource)). */
export async function requirePermission(permission: Permission, projectId?: string) {
  const current = await requireActiveUser();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("has_permission", {
    uid: current.user.id,
    perm: permission,
    ...(projectId ? { project: projectId } : {}),
  });
  if (error || data !== true) throw new Error("Not authorized");
  return current;
}
```

- [ ] **Step 3: Update `src/lib/auth/session.ts`** — `getCurrentUser()` fetches the role via join:

```ts
const { data: profile } = await supabase
  .from("user_profiles")
  .select("*, user_roles(role_key)")
  .eq("id", user.id)
  .single();
if (!profile) return null;
const { user_roles: roleRows, ...profileFields } = profile;
return { user, profile: profileFields, role: roleRows?.[0]?.role_key ?? null };
```

`requireActiveUser()` unchanged logic (status check); `requireAdmin()` now checks `current.role !== "admin"` → throw. Update the `Profile` type export accordingly.

- [ ] **Step 4: Update callers**

- `src/app/actions/admin.ts` `approveUserAction`: after the profile update succeeds, upsert the role: `await supabase.from("user_roles").upsert({ user_id: parsed.data.userId, role_key: parsed.data.role, granted_by: admin.user.id })` — and if THAT errors, return `{ error: "Role assignment failed." }` (profile stays active-but-roleless; state it in the error). Audit metadata unchanged.
- `src/app/(app)/admin/users/page.tsx`: select `id, email, full_name, status, created_at, user_roles(role_key)`; map `role: user_roles?.[0]?.role_key ?? null` into the existing `UserRow` shape so `users-table.tsx` needs only its type/property source updated.
- `src/app/(app)/layout.tsx`: `isAdmin` comes from `current.role === "admin"`.
- `scripts/seed-admin.mjs`: replace the profile `role` update with `status` update + `user_roles` upsert via the admin client.

- [ ] **Step 5: Verify everything**

```powershell
npm run test        # all green incl. new permissions tests
npm run build       # compiles against regenerated types
npm run db:reset; npm run seed:admin; npm run test:db   # seed still works; both suites green
```
Manual smoke: sign in as seeded admin → `/admin/users` shows roles; approving a pending user still works end-to-end (create one via /signup if needed).

- [ ] **Step 6: Commit**

```powershell
git add src scripts tests
git commit -m "feat: requirePermission helper; app reads roles from user_roles"
```

---

### Task 3: Projects cluster (clients, projects, members, parts, status updates, links)

**Files:**
- Create: `supabase/migrations/20260715000003_projects.sql`
- Create: `supabase/tests/phase2_projects.test.sql`
- Regenerate: `src/lib/database.types.ts`

**Interfaces:**
- Consumes: `has_permission`, `permissions` catalog (Task 1).
- Produces: tables `clients`, `projects`, `project_members`, `project_parts`, `part_dependencies`, `project_status_updates`, `project_links`; enums `project_status`, `project_health`, `project_priority`, `budget_type`, `part_status`, `billing_model`, `link_type`, `link_visibility`; **replaced** `has_permission()` (adds `own_projects`/`member_projects` scope rules + live delegation check placeholder deferred to Task 6); FK added to `user_project_permissions.project_id`.

- [ ] **Step 1: Write the failing pgTAP test**

Create `supabase/tests/phase2_projects.test.sql`:

```sql
begin;
create extension if not exists pgtap with schema extensions;
select plan(12);

-- fixtures: PM Anna (owns P1), PM Bella (owns P2), member Max (member of P1 only), finance Fia
insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, raw_app_meta_data, encrypted_password, created_at, updated_at) values
  ('c0000000-0000-4000-8000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','anna@test.local','{"full_name":"Anna"}','{}','',now(),now()),
  ('c0000000-0000-4000-8000-000000000002','00000000-0000-0000-0000-000000000000','authenticated','authenticated','bella@test.local','{"full_name":"Bella"}','{}','',now(),now()),
  ('c0000000-0000-4000-8000-000000000003','00000000-0000-0000-0000-000000000000','authenticated','authenticated','max@test.local','{"full_name":"Max"}','{}','',now(),now()),
  ('c0000000-0000-4000-8000-000000000004','00000000-0000-0000-0000-000000000000','authenticated','authenticated','fia@test.local','{"full_name":"Fia"}','{}','',now(),now());
update public.user_profiles set status='active' where id like 'c0000000-%';
insert into public.user_roles (user_id, role_key) values
  ('c0000000-0000-4000-8000-000000000001','project_manager'),
  ('c0000000-0000-4000-8000-000000000002','project_manager'),
  ('c0000000-0000-4000-8000-000000000003','member'),
  ('c0000000-0000-4000-8000-000000000004','finance');

insert into public.clients (id, name) values ('c1000000-0000-4000-8000-000000000001','ACME');
insert into public.projects (id, name, client_id, pm_id, status, health, budget_type) values
  ('c2000000-0000-4000-8000-000000000001','P1','c1000000-0000-4000-8000-000000000001','c0000000-0000-4000-8000-000000000001','active','healthy','fixed'),
  ('c2000000-0000-4000-8000-000000000002','P2','c1000000-0000-4000-8000-000000000001','c0000000-0000-4000-8000-000000000002','active','warning','hourly');
insert into public.project_members (project_id, user_id, role_on_project) values
  ('c2000000-0000-4000-8000-000000000001','c0000000-0000-4000-8000-000000000003','developer');
insert into public.project_links (project_id, name, url, type, visibility) values
  ('c2000000-0000-4000-8000-000000000001','Repo','https://github.com/acme/p1','repo','project'),
  ('c2000000-0000-4000-8000-000000000001','Prod DB','https://db.acme','db_dashboard','pm_only');

-- member Max: sees only P1; cannot edit it; sees project-visibility links but not pm_only
set local role authenticated;
set local "request.jwt.claims" to '{"sub":"c0000000-0000-4000-8000-000000000003","role":"authenticated"}';
select is((select count(*)::int from public.projects where id like 'c2000000-%'), 1, 'member sees only assigned project');
select is((select count(*)::int from public.project_links where project_id = 'c2000000-0000-4000-8000-000000000001'), 1, 'member sees project links but not pm_only');
select is((select count(*)::int from public.projects where id like 'c2000000-%' and public.has_permission(auth.uid(),'edit_project', id)), 0, 'member cannot edit');
select throws_ok(
  $$ insert into public.projects (name, budget_type) values ('Rogue','fixed') $$,
  '42501', null, 'member cannot create projects');

-- PM Anna: sees both projects (global view), edits only her own, sees pm_only links on P1
set local "request.jwt.claims" to '{"sub":"c0000000-0000-4000-8000-000000000001","role":"authenticated"}';
select is((select count(*)::int from public.projects where id like 'c2000000-%'), 2, 'PM sees the whole portfolio');
select is(public.has_permission(auth.uid(),'edit_project','c2000000-0000-4000-8000-000000000001'), true,  'PM edits own project');
select is(public.has_permission(auth.uid(),'edit_project','c2000000-0000-4000-8000-000000000002'), false, 'PM cannot edit another PM''s project');
select is((select count(*)::int from public.project_links where project_id = 'c2000000-0000-4000-8000-000000000001'), 2, 'PM sees pm_only links on own project');
select lives_ok(
  $$ insert into public.project_status_updates (project_id, author_id, completed, in_progress) values ('c2000000-0000-4000-8000-000000000001', auth.uid(), 'API done','UI ongoing') $$,
  'PM posts status update on own project');
select throws_ok(
  $$ update public.project_status_updates set completed = 'rewritten history' where project_id = 'c2000000-0000-4000-8000-000000000001' $$,
  '42501', null, 'status updates are immutable');

-- finance Fia: portfolio visibility without membership
set local "request.jwt.claims" to '{"sub":"c0000000-0000-4000-8000-000000000004","role":"authenticated"}';
select is((select count(*)::int from public.projects where id like 'c2000000-%'), 2, 'finance sees all projects');
select is((select count(*)::int from public.clients where id like 'c1000000-%'), 1, 'finance sees clients');

select * from finish();
rollback;
```

- [ ] **Step 2: Run to verify failure** — `npm run test:db` → new file FAILS, others green.

- [ ] **Step 3: Write the migration**

Create `supabase/migrations/20260715000003_projects.sql`:

```sql
-- Phase 2 (2/5): clients, projects, members, parts, status updates, links.

create type public.project_status  as enum ('planning','active','on_hold','completed','archived');
create type public.project_health  as enum ('healthy','warning','critical');
create type public.project_priority as enum ('low','medium','high');
create type public.budget_type     as enum ('fixed','hourly','mixed');
create type public.part_status     as enum ('not_started','in_progress','blocked','done');
create type public.billing_model   as enum ('fixed','hourly');
create type public.link_type       as enum ('repo','issue_tracker','design','docs','env_prod','env_prelive','env_staging','env_dev','api_docs','monitoring','hosting','db_dashboard','custom');
create type public.link_visibility as enum ('project','pm_only','admins_only');

create table public.clients (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  contact_name text,
  contact_email text,
  phone text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  client_id uuid references public.clients (id),
  description text,
  pm_id uuid references public.user_profiles (id),
  owner_id uuid references public.user_profiles (id),
  status public.project_status not null default 'planning',
  health public.project_health not null default 'healthy',
  priority public.project_priority not null default 'medium',
  start_date date,
  deadline date,
  progress int not null default 0 check (progress between 0 and 100),
  budget_type public.budget_type not null,
  risks text,
  blockers text,
  next_steps text,
  internal_notes text,
  client_notes text,
  tags text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index projects_pm_idx on public.projects (pm_id);
create index projects_status_idx on public.projects (status);

create table public.project_members (
  id bigint generated always as identity primary key,
  project_id uuid not null references public.projects (id) on delete cascade,
  user_id uuid not null references public.user_profiles (id) on delete cascade,
  role_on_project text,
  starts_on date,
  ends_on date,
  unique (project_id, user_id)
);
create index project_members_user_idx on public.project_members (user_id);

create table public.project_parts (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  name text not null,
  description text,
  status public.part_status not null default 'not_started',
  responsible_person_id uuid,           -- FK to people added in migration 0004
  billing_model public.billing_model not null,
  estimated_hours numeric(8,2),
  progress int not null default 0 check (progress between 0 and 100),
  start_date date,
  end_date date,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index project_parts_project_idx on public.project_parts (project_id);

create table public.part_dependencies (
  part_id uuid not null references public.project_parts (id) on delete cascade,
  depends_on_part_id uuid not null references public.project_parts (id) on delete cascade,
  primary key (part_id, depends_on_part_id),
  check (part_id <> depends_on_part_id)
);

create table public.project_status_updates (
  id bigint generated always as identity primary key,
  project_id uuid not null references public.projects (id) on delete cascade,
  author_id uuid not null references public.user_profiles (id),
  completed text,
  in_progress text,
  blockers text,
  decisions_needed text,
  next_milestone text,
  handover_info text,
  created_at timestamptz not null default now()
);
create index psu_project_idx on public.project_status_updates (project_id, created_at desc);

create table public.project_links (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  name text not null,
  url text not null,
  type public.link_type not null default 'custom',
  environment text,
  description text,
  owner_id uuid references public.user_profiles (id),
  visibility public.link_visibility not null default 'project',
  last_verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index project_links_project_idx on public.project_links (project_id);

-- updated_at triggers (reuses Phase-1 set_updated_at)
create trigger clients_updated_at before update on public.clients for each row execute function public.set_updated_at();
create trigger projects_updated_at before update on public.projects for each row execute function public.set_updated_at();
create trigger project_parts_updated_at before update on public.project_parts for each row execute function public.set_updated_at();
create trigger project_links_updated_at before update on public.project_links for each row execute function public.set_updated_at();

-- user_project_permissions now gets its FK
alter table public.user_project_permissions
  add constraint upp_project_fk foreign key (project_id) references public.projects (id) on delete cascade;

-- ---------- has_permission v2: adds own_projects / member_projects scopes ----------
-- NOTE (review finding): every non-admin branch is gated on the profile being ACTIVE —
-- a disabled user's still-valid JWT must not pass RLS through role/explicit grants.

create or replace function public.has_permission(uid uuid, perm text, project uuid default null)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select
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
          select 1 from public.user_project_permissions upp
          where upp.user_id = uid and upp.permission_key = perm
            and (upp.expires_at is null or upp.expires_at > now())
            and (project is null or upp.project_id = project))
      )
    )
$$;

-- ---------- RLS ----------

alter table public.clients enable row level security;
alter table public.projects enable row level security;
alter table public.project_members enable row level security;
alter table public.project_parts enable row level security;
alter table public.part_dependencies enable row level security;
alter table public.project_status_updates enable row level security;
alter table public.project_links enable row level security;

create policy "view clients" on public.clients for select using (public.has_permission(auth.uid(),'view_clients'));
create policy "manage clients" on public.clients for all using (public.has_permission(auth.uid(),'manage_clients')) with check (public.has_permission(auth.uid(),'manage_clients'));

create policy "view project" on public.projects for select using (public.has_permission(auth.uid(),'view_project', id));
create policy "create project" on public.projects for insert with check (public.has_permission(auth.uid(),'create_project'));
create policy "edit project" on public.projects for update using (public.has_permission(auth.uid(),'edit_project', id));
create policy "admin delete project" on public.projects for delete using (public.is_admin());

create policy "view team" on public.project_members for select using (public.has_permission(auth.uid(),'view_team', project_id));
create policy "manage team" on public.project_members for all using (public.has_permission(auth.uid(),'manage_project_members', project_id)) with check (public.has_permission(auth.uid(),'manage_project_members', project_id));

create policy "view parts" on public.project_parts for select using (public.has_permission(auth.uid(),'view_project', project_id));
create policy "edit parts" on public.project_parts for all using (public.has_permission(auth.uid(),'edit_project', project_id)) with check (public.has_permission(auth.uid(),'edit_project', project_id));

create policy "view part deps" on public.part_dependencies for select using (exists (select 1 from public.project_parts pp where pp.id = part_id and public.has_permission(auth.uid(),'view_project', pp.project_id)));
create policy "edit part deps" on public.part_dependencies for all using (exists (select 1 from public.project_parts pp where pp.id = part_id and public.has_permission(auth.uid(),'edit_project', pp.project_id))) with check (exists (select 1 from public.project_parts pp where pp.id = part_id and public.has_permission(auth.uid(),'edit_project', pp.project_id)));

-- status updates: readable with the project, insertable with edit_status, IMMUTABLE (no update policy), admin-only delete
create policy "view status updates" on public.project_status_updates for select using (public.has_permission(auth.uid(),'view_project', project_id));
create policy "post status update" on public.project_status_updates for insert with check (public.has_permission(auth.uid(),'edit_status', project_id) and author_id = auth.uid());
create policy "admin delete status update" on public.project_status_updates for delete using (public.is_admin());

create policy "view links" on public.project_links for select using (
  public.has_permission(auth.uid(),'view_links', project_id)
  and (visibility = 'project'
       or (visibility = 'pm_only' and public.has_permission(auth.uid(),'edit_project', project_id))
       or public.is_admin()));
create policy "manage links" on public.project_links for all using (public.has_permission(auth.uid(),'manage_links', project_id)) with check (public.has_permission(auth.uid(),'manage_links', project_id));

-- ---------- grants ----------
grant select, insert, update, delete on public.clients, public.projects, public.project_members, public.project_parts, public.part_dependencies, public.project_links to authenticated;
grant select, insert, delete on public.project_status_updates to authenticated;  -- no UPDATE: immutability at privilege level too
grant select, insert, update, delete on public.clients, public.projects, public.project_members, public.project_parts, public.part_dependencies, public.project_status_updates, public.project_links to service_role;
```

- [ ] **Step 4: Apply + run until green** — `npm run db:reset && npm run test:db` → all suites green (phase1, permissions, projects 12/12).

- [ ] **Step 5: Regenerate types + build**

```powershell
npm run db:types
npm run test
npm run build
```
Expected: all green (app compiles — nothing referenced the new tables yet).

- [ ] **Step 6: Commit**

```powershell
git add supabase src/lib/database.types.ts
git commit -m "feat: projects cluster - clients/projects/members/parts/status/links with permission-driven RLS"
```

---

### Task 4: People & workload cluster (people, skills, time_off, assignments, time_entries, rates)

**Files:**
- Create: `supabase/migrations/20260715000004_people_workload.sql`
- Create: `supabase/tests/phase2_people.test.sql`
- Regenerate: `src/lib/database.types.ts`

**Interfaces:**
- Consumes: `has_permission` v2, `projects`/`project_parts` (Task 3).
- Produces: tables `people`, `skills`, `person_skills`, `time_off`, `assignments`, `time_entries`, `rates`; enums `employment_type`, `person_status`, `time_off_type`, `rate_type`; FK `project_parts.responsible_person_id → people(id)`.

- [ ] **Step 1: Write the failing pgTAP test**

Create `supabase/tests/phase2_people.test.sql`:

```sql
begin;
create extension if not exists pgtap with schema extensions;
select plan(9);

-- fixtures: PM Paula (owns PX), member Milo (person + user, member of PX), finance Frank
insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, raw_app_meta_data, encrypted_password, created_at, updated_at) values
  ('d0000000-0000-4000-8000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','paula@test.local','{"full_name":"Paula"}','{}','',now(),now()),
  ('d0000000-0000-4000-8000-000000000002','00000000-0000-0000-0000-000000000000','authenticated','authenticated','milo@test.local','{"full_name":"Milo"}','{}','',now(),now()),
  ('d0000000-0000-4000-8000-000000000003','00000000-0000-0000-0000-000000000000','authenticated','authenticated','frank@test.local','{"full_name":"Frank"}','{}','',now(),now());
update public.user_profiles set status='active' where id like 'd0000000-%';
insert into public.user_roles (user_id, role_key) values
  ('d0000000-0000-4000-8000-000000000001','project_manager'),
  ('d0000000-0000-4000-8000-000000000002','member'),
  ('d0000000-0000-4000-8000-000000000003','finance');

insert into public.projects (id, name, pm_id, budget_type) values
  ('d2000000-0000-4000-8000-000000000001','PX','d0000000-0000-4000-8000-000000000001','hourly');
insert into public.project_members (project_id, user_id) values
  ('d2000000-0000-4000-8000-000000000001','d0000000-0000-4000-8000-000000000002');
insert into public.project_parts (id, project_id, name, billing_model) values
  ('d3000000-0000-4000-8000-000000000001','d2000000-0000-4000-8000-000000000001','Backend','hourly');
insert into public.people (id, user_id, full_name, weekly_capacity_hours) values
  ('d4000000-0000-4000-8000-000000000001','d0000000-0000-4000-8000-000000000002','Milo Dev', 40);
insert into public.rates (person_id, rate_type, amount, valid_from) values
  ('d4000000-0000-4000-8000-000000000001','internal_cost', 45, current_date),
  ('d4000000-0000-4000-8000-000000000001','billing', 95, current_date);
insert into public.assignments (project_id, project_part_id, person_id, allocation_pct, start_date, end_date) values
  ('d2000000-0000-4000-8000-000000000001','d3000000-0000-4000-8000-000000000001','d4000000-0000-4000-8000-000000000001', 60, current_date - 10, current_date + 30);

-- finance sees rates
set local role authenticated;
set local "request.jwt.claims" to '{"sub":"d0000000-0000-4000-8000-000000000003","role":"authenticated"}';
select is((select count(*)::int from public.rates where person_id = 'd4000000-0000-4000-8000-000000000001'), 2, 'finance sees rates');

-- PM does NOT see rates (internal cost is finance-only per spec)
set local "request.jwt.claims" to '{"sub":"d0000000-0000-4000-8000-000000000001","role":"authenticated"}';
select is((select count(*)::int from public.rates where person_id = 'd4000000-0000-4000-8000-000000000001'), 0, 'PM cannot see rates');
select is((select count(*)::int from public.people where id = 'd4000000-0000-4000-8000-000000000001'), 1, 'PM sees people directory');
select is((select count(*)::int from public.assignments where project_id = 'd2000000-0000-4000-8000-000000000001'), 1, 'PM sees assignments (workload)');

-- member Milo: sees own person row, logs time on own assignment, cannot log for others
set local "request.jwt.claims" to '{"sub":"d0000000-0000-4000-8000-000000000002","role":"authenticated"}';
select is((select count(*)::int from public.people where id = 'd4000000-0000-4000-8000-000000000001'), 1, 'member sees directory');
select is((select count(*)::int from public.rates), 0, 'member sees no rates');
select lives_ok(
  $$ insert into public.time_entries (person_id, project_id, project_part_id, entry_date, hours, billable)
     values ('d4000000-0000-4000-8000-000000000001','d2000000-0000-4000-8000-000000000001','d3000000-0000-4000-8000-000000000001', current_date, 6, true) $$,
  'member logs own time');
select throws_ok(
  $$ insert into public.time_entries (person_id, project_id, project_part_id, entry_date, hours, billable)
     values (gen_random_uuid(),'d2000000-0000-4000-8000-000000000001','d3000000-0000-4000-8000-000000000001', current_date, 6, true) $$,
  '42501', null, 'member cannot log time as someone else');
select is((select count(*)::int from public.time_entries where project_id = 'd2000000-0000-4000-8000-000000000001'), 1, 'member reads own entries');

select * from finish();
rollback;
```

- [ ] **Step 2: Run to verify failure** — `npm run test:db` → new file FAILS, others green.

- [ ] **Step 3: Write the migration**

Create `supabase/migrations/20260715000004_people_workload.sql`:

```sql
-- Phase 2 (3/5): people directory, skills, time off, assignments, time entries, rates.

create type public.employment_type as enum ('employee','contractor','freelance');
create type public.person_status   as enum ('active','inactive');
create type public.time_off_type   as enum ('vacation','sick','other');
create type public.rate_type       as enum ('internal_cost','billing');

create table public.people (
  id uuid primary key default gen_random_uuid(),
  user_id uuid unique references public.user_profiles (id) on delete set null,
  full_name text not null,
  email text,
  avatar_url text,
  role_title text,
  department text,
  employment_type public.employment_type not null default 'employee',
  weekly_capacity_hours numeric(5,2) not null default 40,
  status public.person_status not null default 'active',
  contacts jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.skills (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  category text
);

create table public.person_skills (
  person_id uuid not null references public.people (id) on delete cascade,
  skill_id uuid not null references public.skills (id) on delete cascade,
  level int not null default 3 check (level between 1 and 5),
  primary key (person_id, skill_id)
);

create table public.time_off (
  id bigint generated always as identity primary key,
  person_id uuid not null references public.people (id) on delete cascade,
  starts_on date not null,
  ends_on date not null,
  type public.time_off_type not null default 'vacation',
  note text,
  check (ends_on >= starts_on)
);
create index time_off_person_idx on public.time_off (person_id, starts_on);

create table public.assignments (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  project_part_id uuid references public.project_parts (id) on delete set null,
  person_id uuid not null references public.people (id) on delete cascade,
  role_on_project text,
  allocation_pct numeric(5,2) not null check (allocation_pct > 0 and allocation_pct <= 200),
  start_date date not null,
  end_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index assignments_person_idx on public.assignments (person_id, start_date);
create index assignments_project_idx on public.assignments (project_id);

create table public.time_entries (
  id bigint generated always as identity primary key,
  person_id uuid not null references public.people (id) on delete cascade,
  project_id uuid not null references public.projects (id) on delete cascade,
  project_part_id uuid references public.project_parts (id) on delete set null,
  entry_date date not null,
  hours numeric(5,2) not null check (hours > 0 and hours <= 24),
  billable boolean not null default true,
  description text,
  created_at timestamptz not null default now()
);
create index time_entries_person_idx on public.time_entries (person_id, entry_date);
create index time_entries_project_idx on public.time_entries (project_id, entry_date);

create table public.rates (
  id bigint generated always as identity primary key,
  person_id uuid not null references public.people (id) on delete cascade,
  rate_type public.rate_type not null,
  amount numeric(10,2) not null check (amount >= 0),
  currency char(3) not null default 'EUR',
  valid_from date not null,
  valid_to date,
  check (valid_to is null or valid_to >= valid_from)
);
create index rates_person_idx on public.rates (person_id, rate_type, valid_from desc);

alter table public.project_parts
  add constraint parts_responsible_fk foreign key (responsible_person_id) references public.people (id) on delete set null;

create trigger people_updated_at before update on public.people for each row execute function public.set_updated_at();
create trigger assignments_updated_at before update on public.assignments for each row execute function public.set_updated_at();

-- helper: the person row belonging to the current user (for own-time policies)
create or replace function public.current_person_id()
returns uuid language sql stable security definer set search_path = public as $$
  select id from public.people where user_id = auth.uid()
$$;
revoke all on function public.current_person_id() from public, anon;
grant execute on function public.current_person_id() to authenticated;

-- ---------- RLS ----------

alter table public.people enable row level security;
alter table public.skills enable row level security;
alter table public.person_skills enable row level security;
alter table public.time_off enable row level security;
alter table public.assignments enable row level security;
alter table public.time_entries enable row level security;
alter table public.rates enable row level security;

create policy "view people" on public.people for select using (public.has_permission(auth.uid(),'view_people'));
create policy "manage people" on public.people for all using (public.has_permission(auth.uid(),'manage_people')) with check (public.has_permission(auth.uid(),'manage_people'));

create policy "view skills" on public.skills for select using (public.has_permission(auth.uid(),'view_people'));
create policy "manage skills" on public.skills for all using (public.has_permission(auth.uid(),'manage_people')) with check (public.has_permission(auth.uid(),'manage_people'));
create policy "view person_skills" on public.person_skills for select using (public.has_permission(auth.uid(),'view_people'));
create policy "manage person_skills" on public.person_skills for all using (public.has_permission(auth.uid(),'manage_people')) with check (public.has_permission(auth.uid(),'manage_people'));

create policy "view time_off" on public.time_off for select using (public.has_permission(auth.uid(),'view_people'));
create policy "manage time_off" on public.time_off for all using (public.has_permission(auth.uid(),'manage_people')) with check (public.has_permission(auth.uid(),'manage_people'));

create policy "view assignments" on public.assignments for select using (
  public.has_permission(auth.uid(),'view_team', project_id) or person_id = public.current_person_id());
create policy "manage assignments" on public.assignments for all using (public.has_permission(auth.uid(),'manage_project_members', project_id)) with check (public.has_permission(auth.uid(),'manage_project_members', project_id));

-- time entries: own rows always; project-wide with view_time; insert only as yourself with log_time
create policy "read own time" on public.time_entries for select using (person_id = public.current_person_id());
create policy "read project time" on public.time_entries for select using (public.has_permission(auth.uid(),'view_time', project_id));
create policy "log own time" on public.time_entries for insert with check (
  public.has_permission(auth.uid(),'log_time') and person_id = public.current_person_id());
create policy "edit own time" on public.time_entries for update using (person_id = public.current_person_id()) with check (person_id = public.current_person_id());
create policy "delete own time" on public.time_entries for delete using (person_id = public.current_person_id());

-- rates: FINANCE ONLY (spec: internal cost + billing rate need finance permission)
create policy "finance reads rates" on public.rates for select using (public.has_permission(auth.uid(),'view_internal_cost'));
create policy "finance manages rates" on public.rates for all using (public.has_permission(auth.uid(),'view_internal_cost') and public.has_permission(auth.uid(),'manage_budget')) with check (public.has_permission(auth.uid(),'view_internal_cost') and public.has_permission(auth.uid(),'manage_budget'));

-- ---------- grants ----------
grant select, insert, update, delete on public.people, public.skills, public.person_skills, public.time_off, public.assignments, public.time_entries, public.rates to authenticated;
grant select, insert, update, delete on public.people, public.skills, public.person_skills, public.time_off, public.assignments, public.time_entries, public.rates to service_role;
```

- [ ] **Step 4: Apply + run until green** — `npm run db:reset && npm run test:db` → all suites green (people 9/9).

- [ ] **Step 5: Types + full check** — `npm run db:types && npm run test && npm run build` → green.

- [ ] **Step 6: Commit**

```powershell
git add supabase src/lib/database.types.ts
git commit -m "feat: people & workload cluster - directory/skills/time-off/assignments/time-entries/finance-gated rates"
```

---

### Task 5: Budgets cluster (part_billing, part_costs, budgets, budget_items)

**Files:**
- Create: `supabase/migrations/20260715000005_budgets.sql`
- Create: `supabase/tests/phase2_budgets.test.sql`
- Regenerate: `src/lib/database.types.ts`

**Interfaces:**
- Consumes: `projects`/`project_parts` (Task 3), `has_permission` v2.
- Produces: tables `part_billing` (view_budget-gated), `part_costs` (view_internal_cost-gated), `budgets`, `budget_items`; enum `budget_item_type`.

- [ ] **Step 1: Write the failing pgTAP test**

Create `supabase/tests/phase2_budgets.test.sql`:

```sql
begin;
create extension if not exists pgtap with schema extensions;
select plan(8);

-- fixtures: PM Petra (owns B1, not B2), finance Fred, member Mia (member of B1)
insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, raw_app_meta_data, encrypted_password, created_at, updated_at) values
  ('e0000000-0000-4000-8000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','petra@test.local','{"full_name":"Petra"}','{}','',now(),now()),
  ('e0000000-0000-4000-8000-000000000002','00000000-0000-0000-0000-000000000000','authenticated','authenticated','fred@test.local','{"full_name":"Fred"}','{}','',now(),now()),
  ('e0000000-0000-4000-8000-000000000003','00000000-0000-0000-0000-000000000000','authenticated','authenticated','mia@test.local','{"full_name":"Mia"}','{}','',now(),now());
update public.user_profiles set status='active' where id like 'e0000000-%';
insert into public.user_roles (user_id, role_key) values
  ('e0000000-0000-4000-8000-000000000001','project_manager'),
  ('e0000000-0000-4000-8000-000000000002','finance'),
  ('e0000000-0000-4000-8000-000000000003','member');

insert into public.projects (id, name, pm_id, budget_type) values
  ('e2000000-0000-4000-8000-000000000001','B1','e0000000-0000-4000-8000-000000000001','mixed'),
  ('e2000000-0000-4000-8000-000000000002','B2', null, 'fixed');
insert into public.project_members (project_id, user_id) values
  ('e2000000-0000-4000-8000-000000000001','e0000000-0000-4000-8000-000000000003');
insert into public.project_parts (id, project_id, name, billing_model) values
  ('e3000000-0000-4000-8000-000000000001','e2000000-0000-4000-8000-000000000001','Discovery','fixed'),
  ('e3000000-0000-4000-8000-000000000002','e2000000-0000-4000-8000-000000000002','Build','fixed');
insert into public.part_billing (part_id, fixed_amount, client_price) values
  ('e3000000-0000-4000-8000-000000000001', 12000, 12000),
  ('e3000000-0000-4000-8000-000000000002', 30000, 30000);
insert into public.part_costs (part_id, planned_internal_cost, actual_internal_cost) values
  ('e3000000-0000-4000-8000-000000000001', 7000, 4100);
insert into public.budgets (id, project_id, currency) values
  ('e5000000-0000-4000-8000-000000000001','e2000000-0000-4000-8000-000000000001','EUR');
insert into public.budget_items (budget_id, item_type, name, amount, occurred_on) values
  ('e5000000-0000-4000-8000-000000000001','invoice','Milestone 1', 6000, current_date - 20),
  ('e5000000-0000-4000-8000-000000000001','payment','Milestone 1 paid', 6000, current_date - 5);

-- PM: billing on OWN project only; internal costs NEVER
set local role authenticated;
set local "request.jwt.claims" to '{"sub":"e0000000-0000-4000-8000-000000000001","role":"authenticated"}';
select is((select count(*)::int from public.part_billing where part_id like 'e3000000-%'), 1, 'PM sees billing on own project only');
select is((select count(*)::int from public.part_costs), 0, 'PM never sees internal costs');
select is((select count(*)::int from public.budget_items), 2, 'PM sees own-project budget items');
select lives_ok(
  $$ update public.part_billing set client_price = 12500 where part_id = 'e3000000-0000-4000-8000-000000000001' $$,
  'PM manages billing on own project');

-- finance: everything financial, everywhere
set local "request.jwt.claims" to '{"sub":"e0000000-0000-4000-8000-000000000002","role":"authenticated"}';
select is((select count(*)::int from public.part_billing where part_id like 'e3000000-%'), 2, 'finance sees all billing');
select is((select count(*)::int from public.part_costs), 1, 'finance sees internal costs');

-- member: nothing financial
set local "request.jwt.claims" to '{"sub":"e0000000-0000-4000-8000-000000000003","role":"authenticated"}';
select is((select count(*)::int from public.part_billing), 0, 'member sees no billing');
select is((select count(*)::int from public.budget_items), 0, 'member sees no budget items');

select * from finish();
rollback;
```

- [ ] **Step 2: Run to verify failure** — `npm run test:db` → new file FAILS, others green.

- [ ] **Step 3: Write the migration**

Create `supabase/migrations/20260715000005_budgets.sql`:

```sql
-- Phase 2 (4/5): budgets. Financial column-gating via table separation:
--   part_billing  = client-facing money  -> view_budget
--   part_costs    = internal money       -> view_internal_cost (finance only)

create type public.budget_item_type as enum ('planned_cost','actual_cost','invoice','payment','change');

create table public.part_billing (
  part_id uuid primary key references public.project_parts (id) on delete cascade,
  fixed_amount numeric(12,2),
  hourly_rate numeric(10,2),
  client_price numeric(12,2),
  currency char(3) not null default 'EUR',
  updated_at timestamptz not null default now()
);

create table public.part_costs (
  part_id uuid primary key references public.project_parts (id) on delete cascade,
  planned_internal_cost numeric(12,2),
  actual_internal_cost numeric(12,2),
  currency char(3) not null default 'EUR',
  updated_at timestamptz not null default now()
);

create table public.budgets (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  part_id uuid references public.project_parts (id) on delete cascade,
  currency char(3) not null default 'EUR',
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id, part_id)
);

create table public.budget_items (
  id bigint generated always as identity primary key,
  budget_id uuid not null references public.budgets (id) on delete cascade,
  item_type public.budget_item_type not null,
  name text not null,
  amount numeric(12,2) not null,
  occurred_on date not null default current_date,
  note text,
  created_by uuid references public.user_profiles (id),
  created_at timestamptz not null default now()
);
create index budget_items_budget_idx on public.budget_items (budget_id, occurred_on);

create trigger part_billing_updated_at before update on public.part_billing for each row execute function public.set_updated_at();
create trigger part_costs_updated_at before update on public.part_costs for each row execute function public.set_updated_at();
create trigger budgets_updated_at before update on public.budgets for each row execute function public.set_updated_at();

-- helper: project of a part (for policies on part-scoped financial tables)
create or replace function public.part_project(p_part uuid)
returns uuid language sql stable security definer set search_path = public as $$
  select project_id from public.project_parts where id = p_part
$$;
revoke all on function public.part_project(uuid) from public, anon;
grant execute on function public.part_project(uuid) to authenticated;

-- ---------- RLS ----------

alter table public.part_billing enable row level security;
alter table public.part_costs enable row level security;
alter table public.budgets enable row level security;
alter table public.budget_items enable row level security;

create policy "view part billing" on public.part_billing for select using (public.has_permission(auth.uid(),'view_budget', public.part_project(part_id)));
create policy "manage part billing" on public.part_billing for all using (public.has_permission(auth.uid(),'manage_budget', public.part_project(part_id))) with check (public.has_permission(auth.uid(),'manage_budget', public.part_project(part_id)));

create policy "finance views part costs" on public.part_costs for select using (public.has_permission(auth.uid(),'view_internal_cost'));
create policy "finance manages part costs" on public.part_costs for all using (public.has_permission(auth.uid(),'view_internal_cost') and public.has_permission(auth.uid(),'manage_budget', public.part_project(part_id))) with check (public.has_permission(auth.uid(),'view_internal_cost') and public.has_permission(auth.uid(),'manage_budget', public.part_project(part_id)));

create policy "view budgets" on public.budgets for select using (public.has_permission(auth.uid(),'view_budget', project_id));
create policy "manage budgets" on public.budgets for all using (public.has_permission(auth.uid(),'manage_budget', project_id)) with check (public.has_permission(auth.uid(),'manage_budget', project_id));

create policy "view budget items" on public.budget_items for select using (exists (select 1 from public.budgets b where b.id = budget_id and public.has_permission(auth.uid(),'view_budget', b.project_id)));
create policy "manage budget items" on public.budget_items for all using (exists (select 1 from public.budgets b where b.id = budget_id and public.has_permission(auth.uid(),'manage_budget', b.project_id))) with check (exists (select 1 from public.budgets b where b.id = budget_id and public.has_permission(auth.uid(),'manage_budget', b.project_id)));

-- ---------- grants ----------
grant select, insert, update, delete on public.part_billing, public.part_costs, public.budgets, public.budget_items to authenticated;
grant select, insert, update, delete on public.part_billing, public.part_costs, public.budgets, public.budget_items to service_role;
```

- [ ] **Step 4: Apply + green** — `npm run db:reset && npm run test:db` (budgets 8/8, all others green).

- [ ] **Step 5: Types + full check** — `npm run db:types && npm run test && npm run build`.

- [ ] **Step 6: Commit**

```powershell
git add supabase src/lib/database.types.ts
git commit -m "feat: budgets cluster - part billing/costs separation, budgets, budget item history"
```

---

### Task 6: Credentials (Vault) + delegations

**Files:**
- Create: `supabase/migrations/20260715000006_credentials_delegations.sql`
- Create: `supabase/tests/phase2_credentials.test.sql`
- Regenerate: `src/lib/database.types.ts`

**Interfaces:**
- Consumes: `has_permission` v2, `projects`, `permissions.delegatable` (Task 1).
- Produces: tables `credentials` (metadata only; `secret_id` → Vault), `credential_access`, `delegations`, `delegation_permissions`; enums `credential_type`, `credential_environment`, `credential_visibility`; **has_permission v3** (adds live delegation check); trigger `enforce_delegatable_permission`; function `validate_delegation()` (only own projects, to_user active).

- [ ] **Step 1: Write the failing pgTAP test**

Create `supabase/tests/phase2_credentials.test.sql`:

```sql
begin;
create extension if not exists pgtap with schema extensions;
select plan(11);

-- fixtures: PM Vera (owns V1), stand-in Sam (member role), outsider Otto (member role, no relation)
insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, raw_app_meta_data, encrypted_password, created_at, updated_at) values
  ('f0000000-0000-4000-8000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','vera@test.local','{"full_name":"Vera"}','{}','',now(),now()),
  ('f0000000-0000-4000-8000-000000000002','00000000-0000-0000-0000-000000000000','authenticated','authenticated','sam@test.local','{"full_name":"Sam"}','{}','',now(),now()),
  ('f0000000-0000-4000-8000-000000000003','00000000-0000-0000-0000-000000000000','authenticated','authenticated','otto@test.local','{"full_name":"Otto"}','{}','',now(),now());
update public.user_profiles set status='active' where id like 'f0000000-%';
insert into public.user_roles (user_id, role_key) values
  ('f0000000-0000-4000-8000-000000000001','project_manager'),
  ('f0000000-0000-4000-8000-000000000002','member'),
  ('f0000000-0000-4000-8000-000000000003','member');

insert into public.projects (id, name, pm_id, budget_type) values
  ('f2000000-0000-4000-8000-000000000001','V1','f0000000-0000-4000-8000-000000000001','fixed');

-- credential secret goes into Vault; table stores only the reference
select vault.create_secret('super-secret-password', 'v1-db-password', 'test secret') as secret_created \gset
insert into public.credentials (id, project_id, name, type, username, secret_id, environment, visibility)
values ('f3000000-0000-4000-8000-000000000001','f2000000-0000-4000-8000-000000000001','V1 DB','db_login','app_user',
        (select id from vault.secrets where name = 'v1-db-password'), 'prod', 'project_members');

-- delegation: Vera -> Sam on V1, active window, delegatable perms only
insert into public.delegations (id, from_user, to_user, starts_at, ends_at, handover_notes) values
  ('f4000000-0000-4000-8000-000000000001','f0000000-0000-4000-8000-000000000001','f0000000-0000-4000-8000-000000000002',
   now() - interval '1 day', now() + interval '13 days', 'Deploys on Friday; client call Tuesdays');
insert into public.delegation_permissions (delegation_id, project_id, permission_key) values
  ('f4000000-0000-4000-8000-000000000001','f2000000-0000-4000-8000-000000000001','view_project'),
  ('f4000000-0000-4000-8000-000000000001','f2000000-0000-4000-8000-000000000001','edit_status'),
  ('f4000000-0000-4000-8000-000000000001','f2000000-0000-4000-8000-000000000001','view_links'),
  ('f4000000-0000-4000-8000-000000000001','f2000000-0000-4000-8000-000000000001','view_credentials');

-- non-delegatable permission is rejected by trigger
select throws_ok(
  $$ insert into public.delegation_permissions (delegation_id, project_id, permission_key)
     values ('f4000000-0000-4000-8000-000000000001','f2000000-0000-4000-8000-000000000001','view_budget') $$,
  'P0001', 'permission is not delegatable', 'budgets cannot be delegated');

-- Sam (stand-in): sees V1 + its credentials metadata during the window
select is(public.has_permission('f0000000-0000-4000-8000-000000000002','view_project','f2000000-0000-4000-8000-000000000001'), true, 'delegation grants view_project');
select is(public.has_permission('f0000000-0000-4000-8000-000000000002','edit_status','f2000000-0000-4000-8000-000000000001'), true, 'delegation grants edit_status');
select is(public.has_permission('f0000000-0000-4000-8000-000000000002','view_budget','f2000000-0000-4000-8000-000000000001'), false, 'delegation never grants budgets');

set local role authenticated;
set local "request.jwt.claims" to '{"sub":"f0000000-0000-4000-8000-000000000002","role":"authenticated"}';
select is((select count(*)::int from public.credentials where project_id = 'f2000000-0000-4000-8000-000000000001'), 1, 'stand-in sees credential metadata');
select is((select count(*)::int from information_schema.columns where table_schema='public' and table_name='credentials' and column_name in ('secret','secret_value','password')), 0, 'no raw secret column exists');

-- Otto (unrelated): nothing
set local "request.jwt.claims" to '{"sub":"f0000000-0000-4000-8000-000000000003","role":"authenticated"}';
select is((select count(*)::int from public.credentials), 0, 'outsider sees no credentials');
select is((select count(*)::int from public.delegations), 0, 'outsider sees no delegations');

-- revoke ends access immediately
reset role;
update public.delegations set revoked_at = now(), revoked_by = 'f0000000-0000-4000-8000-000000000001'
  where id = 'f4000000-0000-4000-8000-000000000001';
select is(public.has_permission('f0000000-0000-4000-8000-000000000002','view_project','f2000000-0000-4000-8000-000000000001'), false, 'revoked delegation grants nothing');

-- expired window grants nothing (fresh delegation entirely in the past)
insert into public.delegations (id, from_user, to_user, starts_at, ends_at) values
  ('f4000000-0000-4000-8000-000000000002','f0000000-0000-4000-8000-000000000001','f0000000-0000-4000-8000-000000000002', now() - interval '30 days', now() - interval '16 days');
insert into public.delegation_permissions (delegation_id, project_id, permission_key) values
  ('f4000000-0000-4000-8000-000000000002','f2000000-0000-4000-8000-000000000001','view_project');
select is(public.has_permission('f0000000-0000-4000-8000-000000000002','view_project','f2000000-0000-4000-8000-000000000001'), false, 'expired delegation grants nothing');

select * from finish();
rollback;
```

Note: if `\gset` is unsupported by the pgTAP runner, replace that line with a plain `select vault.create_secret('super-secret-password','v1-db-password','test secret');` — the value is re-queried by name on the next line anyway.

- [ ] **Step 2: Run to verify failure** — `npm run test:db` → new file FAILS, others green.

- [ ] **Step 3: Write the migration**

Create `supabase/migrations/20260715000006_credentials_delegations.sql`:

```sql
-- Phase 2 (5/5): credentials (Vault-backed) + delegations.

create extension if not exists supabase_vault;

create type public.credential_type as enum ('server_login','db_login','api_key','hosting','admin_panel','third_party','ssh','client_provided');
create type public.credential_environment as enum ('prod','prelive','staging','dev','other');
create type public.credential_visibility as enum ('project_members','pms_only','admins_only');

-- Secrets NEVER live in this table: secret_id references vault.secrets, and the
-- vault schema is not exposed through the API, so no RLS read-path to raw values exists.
create table public.credentials (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  name text not null,
  type public.credential_type not null,
  username text,
  secret_id uuid not null,
  related_url text,
  environment public.credential_environment not null default 'other',
  notes text,
  owner_id uuid references public.user_profiles (id),
  expires_at timestamptz,
  last_rotated_at timestamptz,
  visibility public.credential_visibility not null default 'project_members',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index credentials_project_idx on public.credentials (project_id);

create table public.credential_access (
  id bigint generated always as identity primary key,
  credential_id uuid not null references public.credentials (id) on delete cascade,
  user_id uuid not null references public.user_profiles (id) on delete cascade,
  granted_by uuid references public.user_profiles (id),
  granted_at timestamptz not null default now(),
  expires_at timestamptz,
  unique (credential_id, user_id)
);

create table public.delegations (
  id uuid primary key default gen_random_uuid(),
  from_user uuid not null references public.user_profiles (id),
  to_user uuid not null references public.user_profiles (id),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  handover_notes text,
  created_at timestamptz not null default now(),
  revoked_at timestamptz,
  revoked_by uuid references public.user_profiles (id),
  check (ends_at > starts_at),
  check (from_user <> to_user)
);
create index delegations_to_user_idx on public.delegations (to_user, starts_at, ends_at);

create table public.delegation_permissions (
  id bigint generated always as identity primary key,
  delegation_id uuid not null references public.delegations (id) on delete cascade,
  project_id uuid not null references public.projects (id) on delete cascade,
  permission_key text not null references public.permissions (key),
  unique (delegation_id, project_id, permission_key)
);

create trigger credentials_updated_at before update on public.credentials for each row execute function public.set_updated_at();

-- only delegatable permissions can be delegated (spec: NOT budgets, costs, user management)
create or replace function public.enforce_delegatable_permission()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.permissions where key = new.permission_key and delegatable) then
    raise exception 'permission is not delegatable';
  end if;
  return new;
end;
$$;
create trigger delegation_permissions_delegatable
  before insert or update on public.delegation_permissions
  for each row execute function public.enforce_delegatable_permission();

-- delegations may only cover the delegator's own projects (or admin acting)
create or replace function public.validate_delegation_project()
returns trigger language plpgsql security definer set search_path = public as $$
declare owner uuid;
begin
  select d.from_user into owner from public.delegations d where d.id = new.delegation_id;
  if not public.is_admin() and not exists (
    select 1 from public.projects p where p.id = new.project_id and p.pm_id = owner) then
    raise exception 'can only delegate own projects';
  end if;
  return new;
end;
$$;
create trigger delegation_permissions_own_project
  before insert or update on public.delegation_permissions
  for each row execute function public.validate_delegation_project();

-- ---------- has_permission v3: + live delegation check ----------
-- Same ACTIVE-profile gate as v2 wraps every non-admin branch, including delegations.

create or replace function public.has_permission(uid uuid, perm text, project uuid default null)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select
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
          select 1 from public.user_project_permissions upp
          where upp.user_id = uid and upp.permission_key = perm
            and (upp.expires_at is null or upp.expires_at > now())
            and (project is null or upp.project_id = project))
        or (project is not null and exists (
          select 1 from public.delegations d
          join public.delegation_permissions dp on dp.delegation_id = d.id
          where d.to_user = uid and dp.permission_key = perm and dp.project_id = project
            and d.revoked_at is null and now() >= d.starts_at and now() < d.ends_at))
      )
    )
$$;

-- ---------- RLS ----------

alter table public.credentials enable row level security;
alter table public.credential_access enable row level security;
alter table public.delegations enable row level security;
alter table public.delegation_permissions enable row level security;

create policy "view credential metadata" on public.credentials for select using (
  (public.has_permission(auth.uid(),'view_credentials', project_id)
   and (visibility = 'project_members'
        or (visibility = 'pms_only' and public.has_permission(auth.uid(),'edit_project', project_id))
        or public.is_admin()))
  or owner_id = auth.uid()
  or exists (select 1 from public.credential_access ca
             where ca.credential_id = id and ca.user_id = auth.uid()
               and (ca.expires_at is null or ca.expires_at > now())));
create policy "manage credentials" on public.credentials for all using (public.has_permission(auth.uid(),'manage_credentials', project_id)) with check (public.has_permission(auth.uid(),'manage_credentials', project_id));

create policy "view own credential grants" on public.credential_access for select using (user_id = auth.uid());
create policy "managers view credential grants" on public.credential_access for select using (exists (select 1 from public.credentials c where c.id = credential_id and public.has_permission(auth.uid(),'manage_credentials', c.project_id)));
create policy "managers manage credential grants" on public.credential_access for all using (exists (select 1 from public.credentials c where c.id = credential_id and public.has_permission(auth.uid(),'manage_credentials', c.project_id))) with check (exists (select 1 from public.credentials c where c.id = credential_id and public.has_permission(auth.uid(),'manage_credentials', c.project_id)));

create policy "view own delegations" on public.delegations for select using (from_user = auth.uid() or to_user = auth.uid() or public.is_admin());
create policy "create own delegation" on public.delegations for insert with check (from_user = auth.uid() and public.has_permission(auth.uid(),'manage_delegations'));
create policy "revoke own delegation" on public.delegations for update using (from_user = auth.uid() or public.is_admin());
create policy "admin delete delegation" on public.delegations for delete using (public.is_admin());

create policy "view delegation perms" on public.delegation_permissions for select using (exists (select 1 from public.delegations d where d.id = delegation_id and (d.from_user = auth.uid() or d.to_user = auth.uid() or public.is_admin())));
create policy "edit own delegation perms" on public.delegation_permissions for all using (exists (select 1 from public.delegations d where d.id = delegation_id and d.from_user = auth.uid())) with check (exists (select 1 from public.delegations d where d.id = delegation_id and d.from_user = auth.uid()));

-- ---------- grants ----------
grant select, insert, update, delete on public.credentials, public.credential_access, public.delegations, public.delegation_permissions to authenticated;
grant select, insert, update, delete on public.credentials, public.credential_access, public.delegations, public.delegation_permissions to service_role;
-- vault schema: NO grants to authenticated/anon — server-side (service role) only, Phase 6
```

- [ ] **Step 4: Apply + green** — `npm run db:reset && npm run test:db` (credentials 11/11, all suites green).

- [ ] **Step 5: Types + full check** — `npm run db:types && npm run test && npm run build`.

- [ ] **Step 6: Commit**

```powershell
git add supabase src/lib/database.types.ts
git commit -m "feat: vault-backed credentials, delegations with delegatable-only live grants"
```

---

### Task 7: Realistic seed (`supabase/seed.sql`)

**Files:**
- Create: `supabase/seed.sql`

**Interfaces:**
- Consumes: every table from Tasks 1–6.
- Produces: a demo dataset satisfying the spec — 9 projects (fixed/hourly/mixed; healthy/warning/critical), 16 people with skills/rates/capacities/vacations, assignments yielding available/partial/full/overallocated utilization, one ACTIVE delegation, links, Vault credentials, status updates — plus 6 demo login users (password `Password123!`).

**Fixed demo users** (document in README table): `admin.demo@pmcms.local` (admin), `anna.pm@pmcms.local` + `bella.pm@pmcms.local` (project_manager), `frank.fin@pmcms.local` (finance), `milo.dev@pmcms.local` (member), `vera.view@pmcms.local` (viewer).

- [ ] **Step 1: Write the seed**

Create `supabase/seed.sql`. Structure it in the following numbered sections — the deterministic UUID scheme is `1000000N-…` users, `2000000N-…` clients, `3000000N-…` projects, `4000000N-…` parts, `5000000N-…` people. Complete content:

```sql
-- Phase 2 seed. Runs on `supabase db reset` AFTER migrations. Idempotent by reset-only usage.
-- Demo password for every demo user: Password123!
create extension if not exists pgcrypto with schema extensions;

-- ===== 1. demo auth users (trigger creates pending profiles) =====
insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token)
select u.id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', u.email,
  extensions.crypt('Password123!', extensions.gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  jsonb_build_object('full_name', u.full_name), now(), now(), '', '', '', ''
from (values
  ('10000001-0000-4000-8000-000000000001'::uuid,'admin.demo@pmcms.local','Deemo Admin'),
  ('10000002-0000-4000-8000-000000000002'::uuid,'anna.pm@pmcms.local','Anna Tamm'),
  ('10000003-0000-4000-8000-000000000003'::uuid,'bella.pm@pmcms.local','Bella Kask'),
  ('10000004-0000-4000-8000-000000000004'::uuid,'frank.fin@pmcms.local','Frank Raha'),
  ('10000005-0000-4000-8000-000000000005'::uuid,'milo.dev@pmcms.local','Milo Sepp'),
  ('10000006-0000-4000-8000-000000000006'::uuid,'vera.view@pmcms.local','Vera Klient')
) as u(id, email, full_name);

update public.user_profiles set status = 'active', approved_at = now()
  where id::text like '1000000%';
insert into public.user_roles (user_id, role_key) values
  ('10000001-0000-4000-8000-000000000001','admin'),
  ('10000002-0000-4000-8000-000000000002','project_manager'),
  ('10000003-0000-4000-8000-000000000003','project_manager'),
  ('10000004-0000-4000-8000-000000000004','finance'),
  ('10000005-0000-4000-8000-000000000005','member'),
  ('10000006-0000-4000-8000-000000000006','viewer');

-- ===== 2. clients =====
insert into public.clients (id, name, contact_name, contact_email) values
  ('20000001-0000-4000-8000-000000000001','Baltic Retail Group','Kadri Mets','kadri@balticretail.ee'),
  ('20000002-0000-4000-8000-000000000002','Nordic Logistics OÜ','Lars Nielsen','lars@nordlog.dk'),
  ('20000003-0000-4000-8000-000000000003','FinServ AS','Piret Kivi','piret@finserv.ee');

-- ===== 3. people (16) — first two rows are the PMs, #3 is Milo (member user) =====
insert into public.people (id, user_id, full_name, email, role_title, department, employment_type, weekly_capacity_hours) values
  ('50000001-0000-4000-8000-000000000001','10000002-0000-4000-8000-000000000002','Anna Tamm','anna.pm@pmcms.local','Project Manager','PMO','employee',40),
  ('50000002-0000-4000-8000-000000000002','10000003-0000-4000-8000-000000000003','Bella Kask','bella.pm@pmcms.local','Project Manager','PMO','employee',40),
  ('50000003-0000-4000-8000-000000000003','10000005-0000-4000-8000-000000000005','Milo Sepp','milo.dev@pmcms.local','Senior Backend Developer','Engineering','employee',40),
  ('50000004-0000-4000-8000-000000000004',null,'Katrin Oja','katrin@pmcms.local','Frontend Developer','Engineering','employee',40),
  ('50000005-0000-4000-8000-000000000005',null,'Jaan Kuusk','jaan@pmcms.local','Backend Developer','Engineering','employee',40),
  ('50000006-0000-4000-8000-000000000006',null,'Liis Lepp','liis@pmcms.local','UX Designer','Design','employee',40),
  ('50000007-0000-4000-8000-000000000007',null,'Marko Saar','marko@pmcms.local','DevOps Engineer','Engineering','employee',40),
  ('50000008-0000-4000-8000-000000000008',null,'Eva Kann','eva@pmcms.local','QA Engineer','Engineering','employee',40),
  ('50000009-0000-4000-8000-000000000009',null,'Tomas Vilk','tomas@pmcms.local','Fullstack Developer','Engineering','contractor',40),
  ('50000010-0000-4000-8000-000000000010',null,'Sofia Berg','sofia@pmcms.local','Data Engineer','Engineering','employee',40),
  ('50000011-0000-4000-8000-000000000011',null,'Rein Talts','rein@pmcms.local','Backend Developer','Engineering','employee',32),
  ('50000012-0000-4000-8000-000000000012',null,'Helena Puu','helena@pmcms.local','Frontend Developer','Engineering','freelance',20),
  ('50000013-0000-4000-8000-000000000013',null,'Oskar Lind','oskar@pmcms.local','Mobile Developer','Engineering','employee',40),
  ('50000014-0000-4000-8000-000000000014',null,'Mia Kass','mia@pmcms.local','QA Engineer','Engineering','employee',40),
  ('50000015-0000-4000-8000-000000000015',null,'Peter Nurm','peter@pmcms.local','Solution Architect','Engineering','employee',40),
  ('50000016-0000-4000-8000-000000000016',null,'Laura Meri','laura@pmcms.local','UX Designer','Design','employee',40);

-- ===== 4. skills + person_skills =====
insert into public.skills (id, name, category) values
  ('60000001-0000-4000-8000-000000000001','React','frontend'),
  ('60000002-0000-4000-8000-000000000002','Next.js','frontend'),
  ('60000003-0000-4000-8000-000000000003','Node.js','backend'),
  ('60000004-0000-4000-8000-000000000004','PostgreSQL','backend'),
  ('60000005-0000-4000-8000-000000000005','Python','backend'),
  ('60000006-0000-4000-8000-000000000006','AWS','devops'),
  ('60000007-0000-4000-8000-000000000007','Docker','devops'),
  ('60000008-0000-4000-8000-000000000008','Figma','design'),
  ('60000009-0000-4000-8000-000000000009','Cypress','qa'),
  ('60000010-0000-4000-8000-000000000010','React Native','mobile');
-- spread 2-3 skills per person, levels 2-5 (explicit list; ~35 rows). Example pattern:
insert into public.person_skills (person_id, skill_id, level) values
  ('50000003-0000-4000-8000-000000000003','60000003-0000-4000-8000-000000000003',5),
  ('50000003-0000-4000-8000-000000000003','60000004-0000-4000-8000-000000000004',4),
  ('50000004-0000-4000-8000-000000000004','60000001-0000-4000-8000-000000000001',4),
  ('50000004-0000-4000-8000-000000000004','60000002-0000-4000-8000-000000000002',4),
  ('50000005-0000-4000-8000-000000000005','60000003-0000-4000-8000-000000000003',3),
  ('50000005-0000-4000-8000-000000000005','60000004-0000-4000-8000-000000000004',4),
  ('50000006-0000-4000-8000-000000000006','60000008-0000-4000-8000-000000000008',5),
  ('50000007-0000-4000-8000-000000000007','60000006-0000-4000-8000-000000000006',5),
  ('50000007-0000-4000-8000-000000000007','60000007-0000-4000-8000-000000000007',5),
  ('50000008-0000-4000-8000-000000000008','60000009-0000-4000-8000-000000000009',4),
  ('50000009-0000-4000-8000-000000000009','60000001-0000-4000-8000-000000000001',4),
  ('50000009-0000-4000-8000-000000000009','60000003-0000-4000-8000-000000000003',4),
  ('50000010-0000-4000-8000-000000000010','60000005-0000-4000-8000-000000000005',5),
  ('50000010-0000-4000-8000-000000000010','60000004-0000-4000-8000-000000000004',4),
  ('50000011-0000-4000-8000-000000000011','60000003-0000-4000-8000-000000000003',3),
  ('50000012-0000-4000-8000-000000000012','60000001-0000-4000-8000-000000000001',4),
  ('50000013-0000-4000-8000-000000000013','60000010-0000-4000-8000-000000000010',5),
  ('50000014-0000-4000-8000-000000000014','60000009-0000-4000-8000-000000000009',3),
  ('50000015-0000-4000-8000-000000000015','60000006-0000-4000-8000-000000000006',4),
  ('50000015-0000-4000-8000-000000000015','60000004-0000-4000-8000-000000000004',5),
  ('50000016-0000-4000-8000-000000000016','60000008-0000-4000-8000-000000000008',4);

-- ===== 5. rates (internal cost + billing per person) =====
insert into public.rates (person_id, rate_type, amount, valid_from)
select id, 'internal_cost',
  case department when 'PMO' then 55 when 'Design' then 45 else 50 end
  + case employment_type when 'contractor' then 15 when 'freelance' then 20 else 0 end,
  date '2026-01-01'
from public.people;
insert into public.rates (person_id, rate_type, amount, valid_from)
select id, 'billing',
  case department when 'PMO' then 110 when 'Design' then 95 else 105 end
  + case employment_type when 'contractor' then 10 when 'freelance' then 15 else 0 end,
  date '2026-01-01'
from public.people;

-- ===== 6. time off (incl. Bella on vacation NOW -> powers the active delegation) =====
insert into public.time_off (person_id, starts_on, ends_on, type, note) values
  ('50000002-0000-4000-8000-000000000002', current_date - 3, current_date + 11, 'vacation', 'Summer vacation — delegated to Milo'),
  ('50000005-0000-4000-8000-000000000005', current_date + 20, current_date + 34, 'vacation', null),
  ('50000008-0000-4000-8000-000000000008', current_date - 1, current_date + 2, 'sick', null),
  ('50000012-0000-4000-8000-000000000012', current_date + 45, current_date + 59, 'vacation', null);

-- ===== 7. projects (9: 4 fixed, 3 hourly, 2 mixed; health mix; Anna 5, Bella 4) =====
insert into public.projects (id, name, client_id, pm_id, status, health, priority, start_date, deadline, progress, budget_type, description, tags) values
  ('30000001-0000-4000-8000-000000000001','Retail e-shop replatform','20000001-0000-4000-8000-000000000001','10000002-0000-4000-8000-000000000002','active','healthy','high', current_date-90, current_date+90, 55,'mixed','Migrate legacy shop to Next.js + headless commerce.','{ecommerce,nextjs}'),
  ('30000002-0000-4000-8000-000000000002','Warehouse scanner app','20000002-0000-4000-8000-000000000002','10000002-0000-4000-8000-000000000002','active','warning','high', current_date-60, current_date+30, 70,'fixed','Android scanner app for warehouse intake.','{mobile}'),
  ('30000003-0000-4000-8000-000000000003','FinServ onboarding portal','20000003-0000-4000-8000-000000000003','10000003-0000-4000-8000-000000000003','active','critical','high', current_date-120, current_date+15, 80,'fixed','KYC onboarding portal; regulator deadline fixed.','{fintech,compliance}'),
  ('30000004-0000-4000-8000-000000000004','Data warehouse & BI','20000001-0000-4000-8000-000000000001','10000003-0000-4000-8000-000000000003','active','healthy','medium', current_date-45, current_date+120, 30,'hourly','Snowplow + dbt + dashboards.','{data}'),
  ('30000005-0000-4000-8000-000000000005','Fleet tracking API','20000002-0000-4000-8000-000000000002','10000002-0000-4000-8000-000000000002','active','warning','medium', current_date-30, current_date+75, 25,'hourly','Realtime GPS ingestion + partner API.','{api}'),
  ('30000006-0000-4000-8000-000000000006','Intranet redesign','20000003-0000-4000-8000-000000000003','10000003-0000-4000-8000-000000000003','planning','healthy','low', current_date+14, current_date+150, 0,'mixed','Design-led intranet refresh.','{design}'),
  ('30000007-0000-4000-8000-000000000007','Loyalty program MVP','20000001-0000-4000-8000-000000000001','10000002-0000-4000-8000-000000000002','on_hold','warning','low', current_date-75, null, 40,'fixed','Paused pending client budget approval.','{ecommerce}'),
  ('30000008-0000-4000-8000-000000000008','Legacy CRM maintenance','20000002-0000-4000-8000-000000000002','10000003-0000-4000-8000-000000000003','active','healthy','low', current_date-300, null, 0,'hourly','Ongoing support retainer.','{support}'),
  ('30000009-0000-4000-8000-000000000009','Payment gateway integration','20000003-0000-4000-8000-000000000003','10000002-0000-4000-8000-000000000002','completed','healthy','medium', current_date-200, current_date-20, 100,'fixed','Done and invoiced.','{fintech}');

-- ===== 8. project members (access) — the two PM users + Milo on Bella's critical project =====
insert into public.project_members (project_id, user_id, role_on_project) values
  ('30000001-0000-4000-8000-000000000001','10000005-0000-4000-8000-000000000005','backend lead'),
  ('30000003-0000-4000-8000-000000000003','10000005-0000-4000-8000-000000000005','backend'),
  ('30000004-0000-4000-8000-000000000004','10000005-0000-4000-8000-000000000005','support');

-- viewer Vera: explicit read grant on one project (temporary, 30 days)
insert into public.user_project_permissions (user_id, project_id, permission_key, granted_by, expires_at) values
  ('10000006-0000-4000-8000-000000000006','30000001-0000-4000-8000-000000000001','view_project','10000001-0000-4000-8000-000000000001', now() + interval '30 days'),
  ('10000006-0000-4000-8000-000000000006','30000001-0000-4000-8000-000000000001','view_links','10000001-0000-4000-8000-000000000001', now() + interval '30 days');

-- ===== 9. parts (mixed projects have BOTH billing models) + billing + costs =====
insert into public.project_parts (id, project_id, name, status, responsible_person_id, billing_model, estimated_hours, progress, start_date, end_date) values
  ('40000001-0000-4000-8000-000000000001','30000001-0000-4000-8000-000000000001','Discovery','done','50000001-0000-4000-8000-000000000001','fixed', 80,100, current_date-90, current_date-60),
  ('40000002-0000-4000-8000-000000000002','30000001-0000-4000-8000-000000000001','Backend','in_progress','50000003-0000-4000-8000-000000000003','hourly', 400, 60, current_date-60, current_date+45),
  ('40000003-0000-4000-8000-000000000003','30000001-0000-4000-8000-000000000001','Frontend','in_progress','50000004-0000-4000-8000-000000000004','hourly', 350, 45, current_date-45, current_date+60),
  ('40000004-0000-4000-8000-000000000004','30000001-0000-4000-8000-000000000001','Testing','not_started','50000008-0000-4000-8000-000000000008','fixed', 120, 0, current_date+30, current_date+85),
  ('40000005-0000-4000-8000-000000000005','30000002-0000-4000-8000-000000000002','App build','in_progress','50000013-0000-4000-8000-000000000013','fixed', 300, 75, current_date-60, current_date+20),
  ('40000006-0000-4000-8000-000000000006','30000003-0000-4000-8000-000000000003','KYC flows','in_progress','50000003-0000-4000-8000-000000000003','fixed', 500, 85, current_date-120, current_date+10),
  ('40000007-0000-4000-8000-000000000007','30000003-0000-4000-8000-000000000003','Compliance audit','blocked','50000015-0000-4000-8000-000000000015','fixed', 80, 20, current_date-30, current_date+15),
  ('40000008-0000-4000-8000-000000000008','30000004-0000-4000-8000-000000000004','Pipeline','in_progress','50000010-0000-4000-8000-000000000010','hourly', 240, 40, current_date-45, current_date+60),
  ('40000009-0000-4000-8000-000000000009','30000005-0000-4000-8000-000000000005','Ingestion API','in_progress','50000005-0000-4000-8000-000000000005','hourly', 320, 30, current_date-30, current_date+75),
  ('40000010-0000-4000-8000-000000000010','30000006-0000-4000-8000-000000000006','Design sprint','not_started','50000006-0000-4000-8000-000000000006','fixed', 60, 0, current_date+14, current_date+35),
  ('40000011-0000-4000-8000-000000000011','30000006-0000-4000-8000-000000000006','Implementation','not_started','50000012-0000-4000-8000-000000000012','hourly', 280, 0, current_date+35, current_date+150),
  ('40000012-0000-4000-8000-000000000012','30000008-0000-4000-8000-000000000008','Support retainer','in_progress','50000011-0000-4000-8000-000000000011','hourly', null, 0, current_date-300, null);
insert into public.part_dependencies (part_id, depends_on_part_id) values
  ('40000002-0000-4000-8000-000000000002','40000001-0000-4000-8000-000000000001'),
  ('40000003-0000-4000-8000-000000000003','40000001-0000-4000-8000-000000000001'),
  ('40000004-0000-4000-8000-000000000004','40000002-0000-4000-8000-000000000002'),
  ('40000011-0000-4000-8000-000000000011','40000010-0000-4000-8000-000000000010');
insert into public.part_billing (part_id, fixed_amount, hourly_rate, client_price) values
  ('40000001-0000-4000-8000-000000000001', 8000, null, 8000),
  ('40000002-0000-4000-8000-000000000002', null, 105, 42000),
  ('40000003-0000-4000-8000-000000000003', null, 95, 33250),
  ('40000004-0000-4000-8000-000000000004', 9000, null, 9000),
  ('40000005-0000-4000-8000-000000000005', 36000, null, 36000),
  ('40000006-0000-4000-8000-000000000006', 60000, null, 60000),
  ('40000007-0000-4000-8000-000000000007', 12000, null, 12000),
  ('40000008-0000-4000-8000-000000000008', null, 110, 26400),
  ('40000009-0000-4000-8000-000000000009', null, 100, 32000),
  ('40000010-0000-4000-8000-000000000010', 7000, null, 7000),
  ('40000011-0000-4000-8000-000000000011', null, 95, 26600),
  ('40000012-0000-4000-8000-000000000012', null, 90, null);
insert into public.part_costs (part_id, planned_internal_cost, actual_internal_cost) values
  ('40000001-0000-4000-8000-000000000001', 4800, 4650),
  ('40000002-0000-4000-8000-000000000002', 20000, 13200),
  ('40000003-0000-4000-8000-000000000003', 17500, 8900),
  ('40000004-0000-4000-8000-000000000004', 6000, 0),
  ('40000005-0000-4000-8000-000000000005', 21000, 17800),
  ('40000006-0000-4000-8000-000000000006', 38000, 36500),
  ('40000007-0000-4000-8000-000000000007', 7000, 2100),
  ('40000008-0000-4000-8000-000000000008', 12000, 5300),
  ('40000009-0000-4000-8000-000000000009', 16000, 5100),
  ('40000010-0000-4000-8000-000000000010', 4200, 0),
  ('40000011-0000-4000-8000-000000000011', 14000, 0),
  ('40000012-0000-4000-8000-000000000012', null, 41200);

-- ===== 10. assignments — tuned utilization classes =====
-- Katrin: 30% (available) | Jaan: 60% (partial) | Milo: 50+45=95% (full)
-- Marko: 70+60=130% (overallocated) | Eva: 40% | Sofia: 80% | Oskar: 100% (full)
insert into public.assignments (project_id, project_part_id, person_id, allocation_pct, start_date, end_date, role_on_project) values
  ('30000001-0000-4000-8000-000000000001','40000003-0000-4000-8000-000000000003','50000004-0000-4000-8000-000000000004', 30, current_date-45, current_date+60,'frontend'),
  ('30000005-0000-4000-8000-000000000005','40000009-0000-4000-8000-000000000009','50000005-0000-4000-8000-000000000005', 60, current_date-30, current_date+75,'backend'),
  ('30000001-0000-4000-8000-000000000001','40000002-0000-4000-8000-000000000002','50000003-0000-4000-8000-000000000003', 50, current_date-60, current_date+45,'backend lead'),
  ('30000003-0000-4000-8000-000000000003','40000006-0000-4000-8000-000000000006','50000003-0000-4000-8000-000000000003', 45, current_date-120, current_date+10,'backend'),
  ('30000001-0000-4000-8000-000000000001','40000002-0000-4000-8000-000000000002','50000007-0000-4000-8000-000000000007', 70, current_date-60, current_date+45,'devops'),
  ('30000003-0000-4000-8000-000000000003','40000006-0000-4000-8000-000000000006','50000007-0000-4000-8000-000000000007', 60, current_date-30, current_date+15,'devops'),
  ('30000002-0000-4000-8000-000000000002','40000005-0000-4000-8000-000000000005','50000008-0000-4000-8000-000000000008', 40, current_date-60, current_date+20,'qa'),
  ('30000004-0000-4000-8000-000000000004','40000008-0000-4000-8000-000000000008','50000010-0000-4000-8000-000000000010', 80, current_date-45, current_date+60,'data'),
  ('30000002-0000-4000-8000-000000000002','40000005-0000-4000-8000-000000000005','50000013-0000-4000-8000-000000000013',100, current_date-60, current_date+20,'mobile'),
  ('30000008-0000-4000-8000-000000000008','40000012-0000-4000-8000-000000000012','50000011-0000-4000-8000-000000000011', 25, current_date-300, null,'support'),
  ('30000003-0000-4000-8000-000000000003','40000007-0000-4000-8000-000000000007','50000015-0000-4000-8000-000000000015', 35, current_date-30, current_date+15,'architect'),
  ('30000001-0000-4000-8000-000000000001','40000003-0000-4000-8000-000000000003','50000012-0000-4000-8000-000000000012', 50, current_date-45, current_date+60,'frontend');

-- ===== 11. time entries (last 15 workdays for the 5 busiest people) =====
insert into public.time_entries (person_id, project_id, project_part_id, entry_date, hours, billable, description)
select p.person_id, p.project_id, p.part_id, d::date,
  round((4 + random() * 4)::numeric, 1), true, 'seeded work'
from (values
  ('50000003-0000-4000-8000-000000000003'::uuid,'30000001-0000-4000-8000-000000000001'::uuid,'40000002-0000-4000-8000-000000000002'::uuid),
  ('50000004-0000-4000-8000-000000000004','30000001-0000-4000-8000-000000000001','40000003-0000-4000-8000-000000000003'),
  ('50000007-0000-4000-8000-000000000007','30000003-0000-4000-8000-000000000003','40000006-0000-4000-8000-000000000006'),
  ('50000010-0000-4000-8000-000000000010','30000004-0000-4000-8000-000000000004','40000008-0000-4000-8000-000000000008'),
  ('50000013-0000-4000-8000-000000000013','30000002-0000-4000-8000-000000000002','40000005-0000-4000-8000-000000000005')
) as p(person_id, project_id, part_id)
cross join generate_series(current_date - 21, current_date - 1, interval '1 day') as d
where extract(isodow from d) < 6;

-- ===== 12. budgets + item history for the three biggest projects =====
insert into public.budgets (id, project_id) values
  ('70000001-0000-4000-8000-000000000001','30000001-0000-4000-8000-000000000001'),
  ('70000002-0000-4000-8000-000000000002','30000002-0000-4000-8000-000000000002'),
  ('70000003-0000-4000-8000-000000000003','30000003-0000-4000-8000-000000000003');
insert into public.budget_items (budget_id, item_type, name, amount, occurred_on) values
  ('70000001-0000-4000-8000-000000000001','planned_cost','Initial plan', 48300, current_date-90),
  ('70000001-0000-4000-8000-000000000001','invoice','Discovery invoice', 8000, current_date-55),
  ('70000001-0000-4000-8000-000000000001','payment','Discovery paid', 8000, current_date-40),
  ('70000001-0000-4000-8000-000000000001','change','Scope: added loyalty hooks', 4500, current_date-20),
  ('70000002-0000-4000-8000-000000000002','planned_cost','Initial plan', 21000, current_date-60),
  ('70000002-0000-4000-8000-000000000002','invoice','Milestone 1', 18000, current_date-25),
  ('70000003-0000-4000-8000-000000000003','planned_cost','Initial plan', 45000, current_date-120),
  ('70000003-0000-4000-8000-000000000003','invoice','Phase 1', 30000, current_date-60),
  ('70000003-0000-4000-8000-000000000003','payment','Phase 1 paid', 30000, current_date-45),
  ('70000003-0000-4000-8000-000000000003','change','Regulator scope change', 9000, current_date-15);

-- ===== 13. status updates (history: 2 per active project, newest includes handover info) =====
insert into public.project_status_updates (project_id, author_id, completed, in_progress, blockers, decisions_needed, next_milestone, handover_info, created_at) values
  ('30000001-0000-4000-8000-000000000001','10000002-0000-4000-8000-000000000002','Discovery, checkout API','Catalog sync','—','CDN vendor choice','Beta on staging', null, now() - interval '21 days'),
  ('30000001-0000-4000-8000-000000000001','10000002-0000-4000-8000-000000000002','Catalog sync','Frontend theming','Payment sandbox flaky','—','Content freeze','Deploys via GH Actions; client contact Kadri; Friday demos.', now() - interval '3 days'),
  ('30000002-0000-4000-8000-000000000002','10000002-0000-4000-8000-000000000002','Intake flows','Barcode edge cases','Device fleet delayed at customs','Scanner hardware model','UAT with warehouse team', null, now() - interval '10 days'),
  ('30000003-0000-4000-8000-000000000003','10000003-0000-4000-8000-000000000003','KYC happy path','Sanctions-list integration','Compliance audit blocked on client docs','Fallback provider go/no-go','Regulator demo', 'CRITICAL: regulator deadline. Audit contact: Piret. Escalate blockers to admin.', now() - interval '2 days'),
  ('30000004-0000-4000-8000-000000000004','10000003-0000-4000-8000-000000000003','Event schema','dbt models','—','—','First dashboard', null, now() - interval '7 days'),
  ('30000005-0000-4000-8000-000000000005','10000002-0000-4000-8000-000000000002','Ingestion prototype','Partner API contract','—','Rate-limit tiers','Load test', null, now() - interval '5 days');

-- ===== 14. links =====
insert into public.project_links (project_id, name, url, type, environment, visibility) values
  ('30000001-0000-4000-8000-000000000001','GitHub','https://github.com/acme/retail-shop','repo', null,'project'),
  ('30000001-0000-4000-8000-000000000001','Jira','https://acme.atlassian.net/browse/SHOP','issue_tracker', null,'project'),
  ('30000001-0000-4000-8000-000000000001','Figma','https://figma.com/file/shop-redesign','design', null,'project'),
  ('30000001-0000-4000-8000-000000000001','Staging','https://staging.shop.balticretail.ee','env_staging','staging','project'),
  ('30000001-0000-4000-8000-000000000001','Prod monitoring','https://grafana.acme.dev/shop','monitoring','prod','pm_only'),
  ('30000002-0000-4000-8000-000000000002','GitLab','https://gitlab.com/acme/scanner','repo', null,'project'),
  ('30000003-0000-4000-8000-000000000003','Azure DevOps','https://dev.azure.com/finserv/onboarding','issue_tracker', null,'project'),
  ('30000003-0000-4000-8000-000000000003','Prod','https://onboard.finserv.ee','env_prod','prod','project'),
  ('30000003-0000-4000-8000-000000000003','DB dashboard','https://portal.azure.com/#finserv-db','db_dashboard','prod','pm_only'),
  ('30000004-0000-4000-8000-000000000004','dbt docs','https://dbt.acme.dev','api_docs', null,'project');

-- ===== 15. credentials (secrets in Vault) =====
insert into public.credentials (project_id, name, type, username, secret_id, related_url, environment, visibility, expires_at, owner_id)
select v.project_id, v.name, v.type::public.credential_type, v.username,
       vault.create_secret(v.secret, v.vault_name, 'seeded'),
       v.url, v.env::public.credential_environment, v.vis::public.credential_visibility, v.expires, v.owner
from (values
  ('30000001-0000-4000-8000-000000000001'::uuid,'Shop staging DB','db_login','shop_app','St4g1ng-Pw!','shop-staging-db','https://staging.shop.balticretail.ee','staging','project_members', null::timestamptz,'10000002-0000-4000-8000-000000000002'::uuid),
  ('30000001-0000-4000-8000-000000000001','Payment API key','api_key','—','pk_test_9f8a7b6c','shop-payment-key','https://dashboard.stripe.com','prod','pms_only', now() + interval '60 days','10000002-0000-4000-8000-000000000002'),
  ('30000003-0000-4000-8000-000000000003','Onboarding prod DB','db_login','onboard_app','Pr0d-S3cret!','finserv-prod-db','https://portal.azure.com','prod','pms_only', now() + interval '20 days','10000003-0000-4000-8000-000000000003'),
  ('30000003-0000-4000-8000-000000000003','Sanctions API','api_key','—','sk_sanc_11223344','finserv-sanctions-key', null,'prod','pms_only', now() + interval '10 days','10000003-0000-4000-8000-000000000003'),
  ('30000002-0000-4000-8000-000000000002','Play Store account','third_party','release@acme.dev','Rel3ase-Pw!','scanner-playstore','https://play.google.com/console','other','admins_only', null,'10000002-0000-4000-8000-000000000002')
) as v(project_id, name, type, username, secret, vault_name, url, env, vis, expires, owner);

-- ===== 16. THE active delegation: Bella (on vacation) -> Milo, her two active projects =====
insert into public.delegations (id, from_user, to_user, starts_at, ends_at, handover_notes) values
  ('80000001-0000-4000-8000-000000000001','10000003-0000-4000-8000-000000000003','10000005-0000-4000-8000-000000000005',
   now() - interval '3 days', now() + interval '11 days',
   'FinServ: regulator demo prep — status update every Tue/Thu. DW: pipeline reviews only. Do NOT touch budgets. Escalate compliance blockers to admin.');
insert into public.delegation_permissions (delegation_id, project_id, permission_key)
select '80000001-0000-4000-8000-000000000001', p.project_id, perm
from (values ('30000003-0000-4000-8000-000000000003'::uuid), ('30000004-0000-4000-8000-000000000004'::uuid)) as p(project_id)
cross join unnest(array['view_project','edit_status','view_team','view_links','view_credentials']) as perm;
```

- [ ] **Step 2: Apply + sanity-verify**

```powershell
npm run db:reset
```
Expected: reset applies migrations then seed with no errors. Then verify via psql (`docker exec supabase_db_pm psql -U postgres -d postgres -c "..."`):
1. `select count(*) from projects` → 9; `select count(*) from people` → 16; `select budget_type, count(*) from projects group by 1` → fixed 4 / hourly 3 / mixed 2.
2. Utilization classes all present: `select person_id, sum(allocation_pct) from assignments where start_date <= current_date and (end_date is null or end_date >= current_date) group by 1 order by 2` → includes <50, 50–89, 90–100, >100 rows.
3. `select count(*) from delegations where revoked_at is null and now() between starts_at and ends_at` → 1.
4. `select count(*) from vault.secrets` → ≥ 5; `select public.has_permission('10000005-0000-4000-8000-000000000005','edit_status','30000003-0000-4000-8000-000000000003')` → t (Milo via delegation).
5. `npm run test:db` → ALL suites green WITH the seed present (fixture-scoping proof).
6. `npm run seed:admin` → still works on the seeded DB.

- [ ] **Step 3: Login smoke** — `npm run dev`, sign in as `anna.pm@pmcms.local` / `Password123!` → lands on dashboard (UI for projects comes in Phase 3; login itself proves the seeded auth users are valid). Kill server.

- [ ] **Step 4: Commit**

```powershell
git add supabase/seed.sql
git commit -m "feat: realistic demo seed - 9 projects, 16 people, workload classes, active delegation, vault credentials"
```

---

### Task 8: Verification sweep + schema documentation + STOP for review

**Files:**
- Create: `docs/schema.md`
- Modify: `README.md` (demo users table, seed notes)

**Interfaces:** none — verification + the phase-gate deliverable.

- [ ] **Step 1: Full clean-slate check**

```powershell
npm run test
npm run db:reset
npm run test:db
npm run seed:admin
npm run test:db
npm run build
```
Expected: everything green in both orders; build clean.

- [ ] **Step 2: Write `docs/schema.md`** — the document the human reviews at the gate. Must contain:
1. **Table inventory** grouped by cluster (auth/permission, projects, people/workload, budgets, credentials/delegations, system) — one line per table: purpose + key columns + owning migration.
2. **The permission model**: the 25 permission keys, the role→permission matrix with scopes (render the `role_permissions` seed as a table), how `has_permission()` resolves (admin → global → own_projects → member_projects → explicit grants → active delegations), and the `delegatable` rule.
3. **RLS approach**: one policy pattern per cluster with the actual SQL snippet; the financial table-separation rationale (`part_billing` vs `part_costs` vs `rates`); credentials = metadata-only + Vault; status-update immutability; explicit-grants requirement (auto_expose off).
4. **Mermaid ER diagram** of the core relationships (clients→projects→parts→billing/costs; people→assignments/time_entries/rates; delegations→delegation_permissions).
5. **Open questions for the reviewer** (list at minimum: PM portfolio visibility is global-view — OK?; rates finance-only means PMs price hourly parts via `part_billing.hourly_rate`, not person rates — OK?; single-role-per-user in v1 UI).

- [ ] **Step 3: Update `README.md`** — add the demo-users table (6 logins + `Password123!`), note that `db reset` seeds the demo dataset, and that `seed:admin` adds your personal admin on top.

- [ ] **Step 4: Commit**

```powershell
git add docs/schema.md README.md
git commit -m "docs: schema + RLS approach documentation for phase-2 review"
```

- [ ] **Step 5: STOP — Phase gate**

Per the build spec: present the schema + RLS approach (docs/schema.md), the decisions list from this plan's header, and any deviations discovered during implementation. **Wait for approval before Phase 3 (Projects UI).**

---

## Self-review notes

- **Spec coverage:** all 26 spec-listed tables exist (users = `auth.users`; `user_profiles`, `notifications`, `audit_logs` from Phase 1; `time_off` added — noted as Decision 7; `budgets`/`budget_items`/`rates` per spec; `part_billing`/`part_costs` implement the part-level financial fields from Phase 3/5 specs with the finance gate). Migrations+RLS for every table ✓; `requirePermission` helper ✓ (Task 2); audit-log write helper exists from Phase 1 ✓; seed meets every quantitative requirement (8+ projects → 9 incl. all three billing types and all three health states; 15+ people → 16 with skills/rates/capacities/vacations; utilization classes explicit; 1 active delegation; links, credentials, status updates) ✓; stop-for-review ✓.
- **Cross-task consistency:** `has_permission` signature `(uid, perm, project)` is identical across its three versions (0002 v1 → 0003 v2 → 0006 v3, each `create or replace`); `current_person_id()`/`part_project()` helpers used only after their defining migrations; `user_project_permissions.project_id` FK deliberately deferred from 0002 to 0003 (projects doesn't exist yet) and the Task 1 pgTAP test uses synthetic project uuids accordingly — the FK addition in 0003 is safe because 0002's table is empty at migration time.
- **Known risks flagged for implementers:** pgTAP `\gset` may not run under `supabase test db` (fallback given in Task 6); `vault.create_secret` requires the `supabase_vault` extension (created in 0006; seed runs after migrations so it's available); seed uses `random()` for hours — acceptable because nothing asserts exact totals; Task 1 leaves the app uncompilable until Task 2 (called out in both tasks — they must be executed back-to-back).
- **Placeholder scan:** every task carries full SQL/TS; the only prose-spec steps are documentation content lists (Task 8) — intentional, the content is enumerated.

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-07-15-phase2-schema.md`. Execute with superpowers:subagent-driven-development (fresh implementer per task, task-scoped reviews, final whole-branch review), same as Phase 1. Tasks 1+2 must land back-to-back (app doesn't compile between them).
