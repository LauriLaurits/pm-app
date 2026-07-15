# Phase 3 — Projects UI — Implementation Plan (lean)

> **For agentic workers:** subagent-driven execution. Lighter review: data-access/mutation tasks get an adversarial review; pure-presentation tasks get a quick spec+build check. Steps use `- [ ]`.

**Goal:** Turn the Phase-2 database into visible screens — an app shell with left sidebar, the Projects list (table + card view, filters, permission-gated budget columns), and the Project detail with four tabs (Overview, Parts, People, Links), including the create/edit mutations wired through `requirePermission`.

**Architecture:** Server components read through the RLS'd server client (so a user only ever sees rows their permissions allow — no manual filtering in queries). Every mutation is a server action starting with `requirePermission(permission, projectId)`. shadcn base-nova UI (render props, never `asChild`). Recharts/TanStack Table deferred until a screen actually needs them — the list uses a plain server-rendered table first.

**Tech Stack:** Next.js 16 App Router, shadcn/ui (base-nova), Zod + RHF for forms, the existing `has_permission` RPC via `requirePermission`.

## Global Constraints

- Server components by default; components under ~150 lines; extract instead.
- Every mutation is a server action beginning with `requirePermission(...)` (the Phase-2 helper — this phase is its first real adoption). No inline permission logic.
- UI hiding is never the security boundary — RLS already enforces; UI gating is for UX only. Budget columns/tabs shown only when the row actually returned budget data (which RLS already gates).
- Zod schemas defined once, shared between form and action.
- Loading skeletons, empty states, error handling on every data view.
- Financial figures (budget totals) come from `part_billing`/`budgets` (view_budget) — never `part_costs`/`rates`. If a query for those returns nothing, show "—", not an error.
- base-nova conventions: `render` prop, `onClick` on menu items, `DropdownMenuLabel` inside `DropdownMenuGroup`.

## Decisions (note at phase end)

1. **Sidebar now, full nav links, but only Dashboard/Projects/People(stub)/User access/Settings resolve this phase** — Workload/Budgets/Credentials/Activity are visible-but-"coming soon" placeholders so the shell is complete without scope-creeping later phases.
2. **List starts as a server-rendered table** with server-side filtering via URL search params (shareable, no client state); TanStack Table + column visibility is a polish follow-up, not blocking.
3. **Budget columns are permission-gated by data presence**: the list query left-joins budget rollups; RLS returns them only to view_budget holders, so a null rollup renders "—". No separate permission check in the component.
4. **Card view** is a toggle on the same data (URL param `?view=cards`).
5. Data-shaping (budget rollups, used/remaining) is computed in a Postgres view `project_list_rows` so the list query stays one round-trip and the math isn't duplicated in TS.

## File structure (end state)

```
supabase/migrations/20260715000007_project_views.sql   # read-only helper views (list rollups)
src/lib/validation/project.ts                           # zod: createProject, editProject, statusUpdate, part, link, member
src/app/actions/projects.ts                             # createProject/editProject/postStatusUpdate
src/app/actions/project-parts.ts                        # upsertPart/deletePart
src/app/actions/project-links.ts                        # upsertLink/deleteLink
src/app/actions/project-members.ts                      # addMember/removeMember
src/app/(app)/
  app-sidebar.tsx  nav-config.ts  layout.tsx (rewritten: sidebar shell)
  dashboard/page.tsx (light refresh)
  projects/
    page.tsx                 # list (RSC, reads search params)
    projects-table.tsx  projects-cards.tsx  project-filters.tsx  view-toggle.tsx
    new/page.tsx + project-form.tsx
    [id]/
      layout.tsx             # breadcrumb + tab nav + header (name/status/health badges)
      page.tsx               # Overview tab
      overview-*.tsx  status-update-form.tsx  status-history.tsx
      parts/page.tsx + parts-table.tsx + part-form.tsx
      people/page.tsx + members-list.tsx + add-member-form.tsx
      links/page.tsx + links-list.tsx + link-form.tsx
```

---

### Task 1: App shell with left sidebar

**Files:** `src/app/(app)/nav-config.ts`, `src/app/(app)/app-sidebar.tsx`, rewrite `src/app/(app)/layout.tsx`; add shadcn `sidebar`, `tooltip`, `breadcrumb`, `sheet` if missing.

**Interfaces:** Produces the `(app)` shell every authenticated page renders in: collapsible left sidebar (Dashboard, Projects, People, Workload, Budgets, Credentials, Activity, User access [admin-only], Settings), top bar with page title slot + the existing UserMenu. Consumes `getCurrentUser()` for role-gating the admin link.

- [ ] Step 1: `npx shadcn@latest add sidebar tooltip breadcrumb sheet` (skip any already present). Build to confirm they generate.
- [ ] Step 2: `nav-config.ts` — exported array `NAV_ITEMS: { label, href, icon, adminOnly?, comingSoon? }[]` using lucide icons already available. Dashboard/Projects/People/User access/Settings live; Workload/Budgets/Credentials/Activity `comingSoon: true`.
- [ ] Step 3: `app-sidebar.tsx` (client) — renders the shadcn Sidebar with the nav items; `comingSoon` items render disabled with a "Soon" badge; `adminOnly` filtered by an `isAdmin` prop; active item by `usePathname()`.
- [ ] Step 4: rewrite `layout.tsx` — `SidebarProvider` wrapping `AppSidebar isAdmin={...}` + a `SidebarInset` containing a header (SidebarTrigger + a `<div id>` title area rendered by pages via a small `PageHeader` server component or just per-page h1) and `{children}`. Keep the `getCurrentUser` redirect guard.
- [ ] Step 5: verify — `npm run build`; `npm run dev`; sign in as `admin@example.com` (or demo `admin.demo@pmcms.local`/`Password123!`), confirm sidebar renders, admin sees "User access", collapse toggle works, "Soon" items disabled. Screenshot/console-clean check.
- [ ] Step 6: commit `feat: app shell with collapsible left sidebar navigation`.

**Review:** quick spec+build check (presentational; the only logic is admin-gating the link, which RLS/route-guard already enforce server-side).

---

### Task 2: Project list read-model + Projects list page

**Files:** `supabase/migrations/20260715000007_project_views.sql`, `src/app/(app)/projects/page.tsx`, `projects-table.tsx`, `projects-cards.tsx`, `project-filters.tsx`, `view-toggle.tsx`; regen types.

**Interfaces:** Consumes RLS'd server client. Produces the `/projects` screen. The view `public.project_list_rows` exposes per project: id, name, client_name, pm_name, status, health, priority, start_date, deadline, progress, updated_at, budget_type, member_count, and (nullable, RLS-gated) budget_total/budget_used/budget_remaining.

- [ ] Step 1: migration `20260715000007_project_views.sql` — create `project_list_rows` as a `security invoker` view (Postgres 15+ `with (security_invoker = true)` so the caller's RLS applies) joining projects → clients (name) → user_profiles (pm name) → aggregated member_count, and LEFT JOIN a budget rollup (sum part_billing.client_price as total, and used from budget_items invoices/payments — keep the rollup simple: total = sum(client_price), used = sum(budget_items where item_type='payment'), remaining = total-used). Because it's security_invoker, a non-view_budget user's join to part_billing returns nothing → those columns null. Grant select to authenticated. pgTAP: a member sees only their project rows; budget columns null for the member, present for finance. (`supabase/tests/phase3_project_views.test.sql`, ~5 assertions.)
- [ ] Step 2: `project-filters.tsx` (client) — status, health, PM, client, budget_type, search box; writes to URL search params (`useRouter().replace`). `view-toggle.tsx` toggles `?view=table|cards`.
- [ ] Step 3: `page.tsx` (RSC) — reads `searchParams`, queries `project_list_rows` with `.ilike`/`.eq` filters applied server-side, orders by updated_at desc; renders filters + toggle + either table or cards; loading.tsx skeleton; empty state ("No projects match" / "No projects yet").
- [ ] Step 4: `projects-table.tsx` — columns per spec (name→link, client, PM avatar+name, status badge, health badge, dates, member avatars, budget type, budget total/used/remaining showing "—" when null, progress bar, last updated). `projects-cards.tsx` — same data as cards.
- [ ] Step 5: verify — `db:reset`, `test:db` green; `npm run build`; dev: `/projects` as `anna.pm@pmcms.local` shows her portfolio with budgets; as `milo.dev@pmcms.local` shows only his member projects with budgets as "—"; filters + card toggle work.
- [ ] Step 6: commit `feat: projects list with filters, table/card views, permission-gated budgets`.

**Review:** adversarial (data-access + the security_invoker view is a security surface — confirm budget columns truly null for non-finance/non-PM, member sees only own rows).

---

### Task 3: Project detail shell + Overview tab (read)

**Files:** `src/app/(app)/projects/[id]/layout.tsx`, `[id]/page.tsx`, overview components, `status-history.tsx`; breadcrumb.

**Interfaces:** Consumes RLS'd reads (a non-permitted project id → `notFound()`). Produces the detail shell (header with name + status/health/priority badges + breadcrumb + tab nav: Overview/Parts/People/Links) and the Overview tab: description, PM/owner, dates, progress, risks/blockers/next steps, internal/client notes, tags, and the latest structured status update + collapsible history.

- [ ] Step 1: `[id]/layout.tsx` (RSC) — fetch project (id, name, status, health, priority) via server client; if null → `notFound()`; render header badges, breadcrumb (Projects / name), and a client `TabNav` linking to the four sub-routes (active by pathname).
- [ ] Step 2: `[id]/page.tsx` (Overview) — fetch full project row + `project_status_updates` (latest + history) ordered desc; render overview fields in cards; `status-history.tsx` shows past updates in an accordion (handover_info highlighted).
- [ ] Step 3: empty/loading states; verify build + dev (open a seeded project, see overview + the seeded status updates incl. FinServ's critical handover note).
- [ ] Step 4: commit `feat: project detail shell + overview tab with status history`.

**Review:** quick spec+build (read-only; RLS enforces access, `notFound()` on null).

---

### Task 4: Overview mutations — edit project + post status update

**Files:** `src/lib/validation/project.ts`, `src/app/actions/projects.ts`, `status-update-form.tsx`, `overview-edit` dialog/form.

**Interfaces:** Consumes `requirePermission`. Produces server actions `editProjectAction(projectId, input)` (requires `edit_project` on the project) and `postStatusUpdateAction(projectId, input)` (requires `edit_status`), plus the forms. Zod: `editProjectSchema`, `statusUpdateSchema` (completed/in_progress/blockers/decisions_needed/next_milestone/handover_info).

- [ ] Step 1: `project.ts` zod schemas. TDD: `tests/project-validation.test.ts`.
- [ ] Step 2: `projects.ts` actions — each starts `await requirePermission('edit_project'|'edit_status', projectId)`, validates, writes via server client, `writeAudit`, `revalidatePath`. Status update inserts (immutable — insert only).
- [ ] Step 3: forms (RHF+zod, base-nova render props) — status-update-form always available to edit_status holders; edit-project in a dialog for edit_project holders. Buttons hidden when the action would 403 (UX only) — gate by a passed `canEdit` boolean the RSC computes via a `has_permission` check.
- [ ] Step 4: verify — as `anna.pm@pmcms.local` post a status update on her project (appears in history, audit row written); as `milo.dev` (member, no edit_status on it) the form isn't shown and a direct action call throws. `npm run test` + build green.
- [ ] Step 5: commit `feat: edit project + post status update via requirePermission`.

**Review:** adversarial (first real requirePermission adoption — confirm every action gates before mutating, member cannot post status via direct call, audit written).

---

### Task 5: Parts tab (read + mutate)

**Files:** `[id]/parts/page.tsx`, `parts-table.tsx`, `part-form.tsx`, `src/app/actions/project-parts.ts`, part zod.

**Interfaces:** `upsertPartAction`/`deletePartAction` (require `edit_project` on the project). Parts table shows name, status, responsible person, billing model, estimated hours, progress, and — permission-gated — client price (from part_billing). Internal cost is NOT shown (finance-only; not in this UI).

- [ ] Step 1: zod `partSchema`; actions in `project-parts.ts` gated by `requirePermission('edit_project', projectId)`, audit + revalidate.
- [ ] Step 2: `parts/page.tsx` fetches parts + left-joined part_billing (RLS gates client_price to null for non-view_budget); table renders, "—" for null price; add/edit part dialog (`part-form.tsx`) shown to edit_project holders.
- [ ] Step 3: verify (PM manages parts on own project; member read-only; price hidden appropriately) + build; commit `feat: project parts tab with billing-gated pricing`.

**Review:** adversarial (mutation gating + billing visibility).

---

### Task 6: People tab + Links tab (read + mutate)

**Files:** `[id]/people/page.tsx` + members-list + add-member-form + `project-members.ts`; `[id]/links/page.tsx` + links-list + link-form + `project-links.ts`; zod.

**Interfaces:** `addMemberAction`/`removeMemberAction` (require `manage_project_members`); `upsertLinkAction`/`deleteLinkAction` (require `manage_links`). People tab: assigned members with role-on-project, allocation from assignments. Links tab: grouped by type/environment, respecting the pms_only/admins_only visibility RLS already enforces.

- [ ] Step 1: zod + both action files (each `requirePermission(...)` first, audit, revalidate).
- [ ] Step 2: people/page.tsx (members list + add-member form for managers) and links/page.tsx (links grouped, add/edit for manage_links holders). Empty/loading states.
- [ ] Step 3: verify — PM adds a member + a link on own project; member sees people/links read-only; pms_only link hidden from a plain member. Build + commit `feat: project people and links tabs with scoped mutations`.

**Review:** adversarial (two mutation surfaces + link visibility tiers).

---

### Task 7: Verification sweep + phase summary

- [ ] Step 1: full check — `npm run test`, `db:reset`, `test:db` (both orders), `build`.
- [ ] Step 2: end-to-end click-through as three roles (admin, PM anna, member milo) across list → detail → all four tabs; confirm budget/price gating and mutation gating hold in the real UI; note anything rough.
- [ ] Step 3: whole-branch review (data-access + mutation gating focus).
- [ ] Step 4: STOP — summarize what's visible now + decisions; wait for approval before Phase 4 (People & workload).

## Self-review notes
- Spec coverage: list (table+card, columns incl. permission-gated budgets, filters, sort by updated) ✓ (TanStack column-visibility deferred, noted); detail Overview/Parts/People/Links ✓ incl. structured status update + history + handover field ✓; mixed-project parts with per-part billing model ✓. Internal cost stays out of this UI (finance-only, Phase 5). Every mutation via requirePermission ✓.
- Lighter-process note: Tasks 1 and 3 are presentational → quick review; Tasks 2,4,5,6 touch data-access/mutations/a security_invoker view → adversarial review. This is the calibration the user asked for.
