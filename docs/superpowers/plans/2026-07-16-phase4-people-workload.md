# Phase 4 — People & Workload — Implementation Plan (lean)

> Subagent-driven. Calibrated review: read-model/mutation tasks (workload view, time logging) get adversarial review; presentational tasks get a quick spec+build+browser check. Steps use `- [ ]`.

**Goal:** Surface the people/workload data from Phase 2 — a People directory, a Person detail page, a Workload timeline that answers "who's free / who frees up when / where are the gaps," and a simple time-entry logging flow. Internal cost/rate stays finance-only throughout.

**Architecture:** Server components read via the RLS'd server client. Financial columns (internal cost, billing rate) come from the finance-only `rates` table, exposed through a `security_invoker` read-model view so RLS nulls them for non-finance callers — same proven pattern as `project_list_rows`. Utilization is computed in the view (sum of active assignment allocation_pct → class). Time logging is a server action gated by `requirePermission('log_time')` + self-only (the Phase-2 RLS already enforces person = current_person_id and assignment-on-project).

**Tech Stack:** Next.js 16 App Router, shadcn base-nova, the existing `has_permission`/`requirePermission`, a new read-model migration. No new heavy deps — the workload timeline is CSS/flexbox bars, not a charting lib.

## Global Constraints
- Server components default; components <150 lines; base-nova (`render` not `asChild`, `onClick` not `onSelect`, Select needs a children render-fn).
- Financial fields (internal cost, billing rate, utilization-as-revenue) NEVER without finance permission — enforced by the `security_invoker` view + RLS, rendered "—" when null. NEVER read `rates` directly in a component; go through the view.
- Every mutation via a server action starting with `requirePermission`. Zod shared form/action. Audit + revalidate.
- Utilization classes (spec): 0–49% available, 50–89% partial, 90–100% full, >100% overallocated. Consistent color mapping reused everywhere (align with the Phase-3 status-badge palette: available=muted/green-ish, partial=blue, full=amber, overallocated=red).
- Loading skeletons, empty states, error handling on every data view.

## Decisions (note at phase end)
1. **`person_workload_rows` security_invoker view** carries the per-person rollup (capacity, current allocation %, utilization class, active project count, on-vacation-now flag, and finance-gated internal_cost/billing_rate). One round-trip, RLS-correct, math not duplicated in TS.
2. **"Current allocation %"** = sum of `assignments.allocation_pct` where today ∈ [start_date, end_date] (end null = ongoing). "Available/partial/full/overallocated" derived from that.
3. **Workload timeline** = a horizontal per-person row of allocation bars across a rolling window (default next 12 weeks), colored by utilization; gaps (no allocation) are visually empty so "who's free when" is scannable. Built with CSS grid/flex, not a Gantt lib (keeps it fast + themeable). Week granularity.
4. **Time logging** lives on the Person detail page (and is reachable from a project Part later if wanted) — a simple form (project, part, date, hours, billable). Uses existing RLS: a user logs only their own time on projects they're assigned to.
5. **People directory** is `view_people` (all internal roles have it); cost/rate columns finance-only. Manage (add/edit person, skills, time off) is `manage_people` — currently admin-only by role grant, so for v1 the directory is read + time-logging; full person CRUD is a light add if the gate is available, else deferred with a note.

## File structure
```
supabase/migrations/20260716000002_workload_views.sql   # person_workload_rows (+ maybe person_project_alloc) security_invoker views
src/lib/validation/time-entry.ts                         # zod timeEntrySchema
src/app/actions/time-entries.ts                          # logTimeAction / deleteTimeEntryAction
src/app/(app)/people/
  page.tsx  people-table.tsx  people-filters.tsx          # directory (Task 1)
  [id]/page.tsx + person-* components + log-time-form.tsx # detail (Task 2)
src/app/(app)/workload/
  page.tsx  workload-timeline.tsx  workload-legend.tsx    # timeline (Task 3)
src/lib/workload.ts                                       # utilization class + color mapping (shared, pure, unit-tested)
```

---

### Task 1: Workload read-model + People directory
**Files:** `supabase/migrations/20260716000002_workload_views.sql`, `src/lib/workload.ts` (+ `tests/workload.test.ts`), `src/app/(app)/people/{page,people-table,people-filters}.tsx`; regen types.

**Interfaces:** Produces `public.person_workload_rows` (security_invoker) with: person id, full_name, avatar_url, role_title, department, employment_type, weekly_capacity_hours, status, current_allocation_pct, active_project_count, on_vacation_now (bool), skills (text[]), and nullable finance-gated internal_cost, billing_rate. Pure `utilizationClass(pct)` + `utilizationColor` in `src/lib/workload.ts`.

- [ ] Step 1: migration — `person_workload_rows` as `create view ... with (security_invoker = true)` joining people → aggregated active assignments (current_allocation_pct, active_project_count) → time_off (on_vacation_now) → person_skills/skills (array) → LEFT JOIN rates (latest internal_cost + billing per person; RLS nulls for non-finance). Grant select to authenticated. pgTAP `supabase/tests/phase4_workload.test.sql` (~6): a member sees rows but NULL cost/rate; finance sees cost/rate; current_allocation_pct math correct for a known fixture (Marko=130 overallocated, someone <50); on_vacation_now true for Bella.
- [ ] Step 2: `src/lib/workload.ts` — `utilizationClass(pct: number): 'available'|'partial'|'full'|'overallocated'` (0-49/50-89/90-100/>100) + `utilizationColor`/label. TDD `tests/workload.test.ts` (boundaries 49/50/89/90/100/101).
- [ ] Step 3: `/people/page.tsx` (RSC reads person_workload_rows) + filters (search, department, availability, skill) via URL params + `people-table.tsx`: avatar+name, role, department, skills (chips), employment type, weekly capacity, current allocation % with a utilization badge/bar, availability, active project count; cost + billing rate columns showing "—" when null (finance-gated). Card or table. Loading + empty states.
- [ ] Step 4: verify — db:reset, test:db green (existing 112 + new); build; dev as `frank.fin@pmcms.local` (sees cost/rate) vs `anna.pm@pmcms.local`/`milo.dev` (cost/rate "—"); utilization badges show the four classes; Marko overallocated (red), Bella on-vacation. Playwright/cached Chromium.
- [ ] Step 5: commit `feat: workload read-model + people directory (finance-gated cost/rate)`. **Adversarial review** (security_invoker view + finance gating).

---

### Task 2: Person detail page
**Files:** `src/app/(app)/people/[id]/page.tsx` + person components + `log-time-form.tsx`; may add a `person_project_alloc` view or just query assignments/time_entries directly.

**Interfaces:** Consumes RLS'd reads + person_workload_rows. Produces `/people/[id]`: header (name, role, dept, capacity, current utilization badge, on-vacation), current projects with allocation % each + period, upcoming assignments, logged hours (recent), remaining capacity, skills, time off, project history; finance-gated cost/rate/utilization-value section (null → hidden or "finance only"). A `notFound()` if the person row isn't visible.

- [ ] Step 1: `[id]/page.tsx` reads the person (person_workload_rows for the rollup + assignments joined to projects for allocation detail + time_entries recent + time_off + person_skills). notFound if absent.
- [ ] Step 2: components — current-projects list (project name link, allocation %, period), skills chips, time-off list, recent time entries, capacity summary (capacity vs allocated). Finance section (cost/rate) only rendered when the view returned non-null. <150 lines each.
- [ ] Step 3: verify — build; dev: open Milo → his projects/allocations/skills; as finance his rates show, as PM they don't; a person not visible → 404. Commit `feat: person detail with allocations, hours, skills (finance-gated financials)`. **Quick review** (read-only; finance gating already proven in Task 1's view — just confirm no direct rates read).

---

### Task 3: Workload timeline view
**Files:** `src/app/(app)/workload/{page,workload-timeline,workload-legend}.tsx`; reuse `src/lib/workload.ts`.

**Interfaces:** `/workload` — a rolling-window (default 12 weeks from today) timeline: one row per visible person, week columns, each cell colored by that week's summed allocation (utilization class), empty where free. Header shows the utilization legend. Answers "who's free / who frees up when / gaps." Reads assignments (RLS'd) within the window + people.

- [ ] Step 1: `page.tsx` (RSC) — fetch people (person_workload_rows for names/current) + assignments overlapping the window; compute per-person, per-week allocation server-side (a small pure helper, reuse utilizationClass). Window is `?from=` param, default today, 12 weeks.
- [ ] Step 2: `workload-timeline.tsx` — CSS grid: sticky person column + week columns; each cell a utilization-colored block (tooltip: projects + %). Overallocated weeks visually loud (red). `workload-legend.tsx`. Empty state if no people/assignments.
- [ ] Step 3: verify — build; dev as `anna.pm@pmcms.local`: timeline renders, Marko shows overallocated (red) in current weeks, free people show empty cells, Bella's vacation window visible; scannable at a glance. Screenshot. Commit `feat: workload timeline (who's free / overallocated across a rolling window)`. **Quick review** (presentational read; confirm allocation math + RLS via the assignments query).

---

### Task 4: Time-entry logging
**Files:** `src/lib/validation/time-entry.ts`, `src/app/actions/time-entries.ts`, `log-time-form.tsx` (wired into Person detail and/or a `/people/[id]` section), a recent-entries list.

**Interfaces:** `logTimeAction(input)` — `requirePermission('log_time')` first, then insert a `time_entries` row (person = current_person_id server-side, project/part/date/hours/billable). RLS already enforces self-only + assignment-on-project. `deleteTimeEntryAction` for own entries. Zod `timeEntrySchema`.

- [ ] Step 1: zod (person derived server-side, NOT from client; project_id, project_part_id optional, entry_date, hours 0<h≤24, billable bool, description optional). TDD.
- [ ] Step 2: `time-entries.ts` — logTime: requirePermission('log_time') → resolve current person via `current_person_id()` (or the people row for auth.uid()) → insert (RLS enforces the assignment guard; surface a friendly error if the user isn't assigned to that project) → audit `time.logged` → revalidate. deleteTimeEntry: own row only.
- [ ] Step 3: log-time form on Person detail (only for the viewing user's OWN person page, or a general "log my time" — keep it to the current user logging their own time). Recent entries list with delete.
- [ ] Step 4: verify — as `milo.dev@pmcms.local` (has a person row + assignments) log time on a project he's assigned to (persists, `time.logged` audit) and confirm logging on a project he's NOT assigned to is rejected with a clear message; build + tests. Commit `feat: manual time logging (self, assignment-gated)`. **Adversarial review** (mutation + self-only + assignment gate).

---

### Task 5: Verification + phase summary
- [ ] Step 1: full sweep — `npm run test`, db:reset, test:db (both orders), build.
- [ ] Step 2: e2e browser click-through: People directory (finance vs non-finance cost visibility), a Person detail, the Workload timeline (utilization classes visible), log a time entry as milo. Record per-role.
- [ ] Step 3: STOP — summarize what's visible; wait for approval before Phase 5 (Budgets).

## Self-review notes
- Spec coverage: directory (all listed columns incl. finance-gated cost/rate) ✓; person detail (projects+allocation, hours, capacity, upcoming, vacations, skills, history, finance-gated financials) ✓; workload timeline with the four utilization states + "who's free/frees up/gaps" ✓; manual time source (allocation % + time-entry form) ✓. Person/skill/time-off CRUD is `manage_people` (admin-only role grant today) — directory is read+self-time-log for v1; note at gate whether to grant manage_people to PMs/HR.
- Calibration: Tasks 1 & 4 adversarial (view security + mutation); 2 & 3 quick (read-only, finance gating inherited from the view).
