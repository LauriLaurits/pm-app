# Action-First Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild `/dashboard` as an action-first surface (greeting + quick actions, 5 KPI tiles, unified attention feed, My projects, Team, Deadlines, Activity, Financial overview, health strip) and move the four charts to a new `/reports` page.

**Architecture:** Pure re-composition of existing RLS-gated data — no migrations. `queries.ts`/`compute.ts` grow typed builders (unit-tested); the page stays one parallel fetch wave; presentational cards are new server components reusing the app's shared idioms (StatTile tone rule, DotBadge, PersonAvatar, utilization/consumption class helpers, deadlineCountdown).

**Tech Stack:** Next.js 16 App Router, TS, shadcn base-nova (@base-ui/react — render props, never asChild), Recharts (moved, not touched), zod v4, vitest.

**Spec:** `docs/superpowers/specs/2026-07-28-dashboard-action-first-design.md`

## Global Constraints

- Read `node_modules/next/dist/docs/` before writing Next-specific code (AGENTS.md).
- Work on master; `git status` first — foreign uncommitted changes ⇒ BLOCKED.
- **DO NOT DEPLOY. Local + GitHub only** (user instruction). No `vercel`, no `supabase db push`.
- Color only where something needs a human (dashboard tone rule, summary-cards.tsx:21) — healthy/informational stays monochrome.
- One parallel fetch wave per page; finance/budget gating exactly as today (`hasBudgetVisibility` = any `client_amount` non-null; `hasFinanceVisibility` = any `internal_cost` non-null).
- Dev server for verification: `npx next dev -p 3005` (never 3000); admin.demo@pmcms.local / Password123!; PM persona bella.pm@pmcms.local (same password); milo.dev = member persona.
- `npm run test && npm run lint && npm run build` before each commit. Commit per task.

---

### Task 1: `/reports` page — charts move out

**Files:**
- Create: `src/app/(app)/reports/page.tsx`, `src/app/(app)/reports/loading.tsx`
- Move (git mv, keep history): `src/app/(app)/dashboard/charts-section.tsx` → `src/app/(app)/reports/charts-section.tsx`; `src/app/(app)/dashboard/period-selector.tsx` → `src/app/(app)/reports/period-selector.tsx`
- Modify: `src/app/(app)/dashboard/page.tsx` (drop charts + period selector + their data), `src/app/(app)/dashboard/queries.ts` + `compute.ts` (move chart-only queries/builders — `fetchMonthlyHours`, `fetchMonthlyActualCosts`, `computeBudgetSpentChart`, `computeCapacityChart` — into reports-local modules or import from a shared location; keep ONE copy, no duplication), `src/app/(app)/dashboard/loading.tsx` (no chart skeletons), `src/app/(app)/nav-config.ts`
- Charts in `src/components/charts/*` are NOT modified.

**Interfaces:**
- Produces: `/reports` route with the exact four charts + `?months=` period selector, same gating (`monthly cost` finance-only, `budget spent` budget-gated) and empty states as today. Nav item `{ label: "Reports", href: "/reports", icon: BarChart3 }` inserted after Workload, no `comingSoon`. Dashboard compiles without any chart imports.
- The dashboard keeps `fetchDashboardBase`/`computeSummary` untouched in this task (Task 2 reworks them).

- [ ] Step 1: Create `/reports/page.tsx`: `?months=` validation (same `PERIOD_OPTIONS` logic dashboard used), one `Promise.all` fetch wave (project_list_rows + project_budget_rows + person_workload_rows + monthly hours; conditional monthly costs), `<h1>Reports</h1>` + subtitle, then the moved `ChartsSection` with the period selector. Reuse the null-guard row filtering idiom from the old dashboard page verbatim.
- [ ] Step 2: Strip charts/period data from the dashboard page + loading skeleton; move/re-home the chart-only query+compute builders; nav item added.
- [ ] Step 3: `npm run test && npm run lint && npm run build` green. Browser: /reports renders all four charts for admin, finance chart hidden for bella.pm (non-finance PM — verify what she saw before on the dashboard matches what she sees on /reports), period selector round-trips, dashboard shows no charts, nav highlights Reports.
- [ ] Step 4: Commit: `feat: Reports page hosts the analytics charts`

---

### Task 2: Dashboard data layer (queries + compute + tests)

**Files:**
- Modify: `src/app/(app)/dashboard/queries.ts`, `src/app/(app)/dashboard/compute.ts`, `src/app/(app)/dashboard/types.ts`
- Create: `src/lib/relative-time.ts`
- Test: `tests/relative-time.test.ts`, `tests/dashboard-feed.test.ts`

**Interfaces (produces — later tasks consume these exactly):**

```ts
// src/lib/relative-time.ts
/** "just now" | "12 min ago" | "2 h ago" | "3 d ago" | "28 Jul" (fallback past ~14d, en-GB day-first) */
export function formatRelativeTime(iso: string, now?: Date): string;
```

```ts
// compute.ts additions
export type AttentionSeverity = "critical" | "warning" | "info";
export type FeedItem = {
  severity: AttentionSeverity;
  title: string;          // "Loyalty program MVP" | "Marko Saar"
  reason: string;         // "13 days overdue" | "130% allocated" | "no PM assigned"
  kind: "project" | "budget" | "person" | "credential" | "status" | "pm";
  href: string;
};
export function buildAttentionFeed(input: {
  projects: ValidProject[]; budgetRows: BudgetRow[]; people: WorkloadPerson[];
  latestUpdateByProject: Record<string, string | null>; expiringCredentials: ExpiringCredential[];
}): FeedItem[];           // sorted critical → warning → info, deterministic within tier

export type MyProjectRow = {
  id: string; name: string; clientName: string | null;
  health: DerivedHealth; consumptionPct: number | null;
  progressPct: number | null; deadline: string | null;
};
export function buildMyProjects(projects: ValidProject[], budgetRows: BudgetRow[],
  progressById: Record<string, number | null>, viewerPmId: string | null): MyProjectRow[];
  // pm's own first (pm_id === viewerPmId); if they PM none → all active; sorted health severity desc then deadline asc; cap 6

export type DeadlineEntry = { date: string; label: string; projectId: string; projectName: string; kind: "deadline" | "milestone" };
export function buildDeadlineTimeline(projects: ValidProject[], milestones: MilestoneLite[], todayISO: string): DeadlineEntry[];
  // window: overdue + next 30 days; project deadline entries labeled "Project deadline"; undone milestones by name; asc; cap 8; excludes completed/archived projects

export type FinanceOverview = {
  invoicedThisMonth: number; outstanding: number;
  topConsumers: { id: string; name: string; pct: number }[]; // top 3 active by consumption_pct
  margin: { amount: number; pct: number } | null;            // finance only
} | null;                                                    // null without budget visibility
export function computeFinanceOverview(budgetRows: BudgetRow[], projects: ValidProject[],
  monthInvoiceTotal: number | null, hasBudget: boolean, hasFinance: boolean): FinanceOverview;
```

- `queries.ts` additions: widen the workload select with `avatar_url`; `fetchMilestonesUpcoming(supabase, todayISO)` (undone, `due_on <= today+30d`, join project names via the existing two-step idiom); `fetchMonthInvoiceTotal(supabase, monthStartISO)` (budget_items type `invoice`, `occurred_on >= monthStart`, sum in JS); `fetchRecentAudit(supabase, limit 6)` (only called for view_audit holders); `fetchRecentStatusUpdates` — reuse/extend the existing latest-status fetch to also return rows for the feed fallback (project name, newest non-empty field, created_at).
- `computeSummary` reworked to the 5-tile shape: keep activeProjects/atRisk/critical/warning; add `teamUtilizationPct` (exists), `availableCount`/`peopleCount` (active, not on vacation, utilizationClass available|partial — mirror people/page.tsx:78-83), `invoicesWaiting: { count; outstanding } | null` (projects with `invoiced > paid`; null without budget visibility). Remove budgetRemaining/margin tiles from the summary (they move into FinanceOverview).

- [ ] Step 1 (failing tests first): `tests/relative-time.test.ts` (now-anchored cases: 30s → "just now"; 12 min; 2 h; 3 d; 20 d → "8 Jul" style day-first). `tests/dashboard-feed.test.ts`: buildAttentionFeed sorts critical before warning before info and maps each source kind (fixture with one of each); buildDeadlineTimeline windows + sorts + caps; buildMyProjects picks own-PM rows, falls back to all-active, caps at 6. Run → fail (missing exports).
- [ ] Step 2: implement `src/lib/relative-time.ts` + the compute builders (pure functions, no fetching inside). `buildAttentionFeed` reuses the existing per-source rules verbatim from the current attention lists (deriveHealth reasons joined " · ", consumptionSeverity === "over", pct > 100, !pm_name, isStaleStatus, credential horizon) — the sources move, their logic must not drift.
- [ ] Step 3: queries additions; `page.tsx` NOT rewired yet (Task 3 does) — but keep it compiling (old compute API can remain temporarily alongside).
- [ ] Step 4: `npm run test && npm run lint && npm run build` green. Commit: `feat: dashboard data layer for the action-first redesign`

---

### Task 3: Page rewire — header, quick actions, KPI row

**Files:**
- Modify: `src/app/(app)/dashboard/page.tsx` (identity, fetch wave, layout skeleton for Tasks 4-6), `src/app/(app)/dashboard/summary-cards.tsx` (5-tile shape)
- Create: `src/app/(app)/dashboard/dashboard-header.tsx`

**Interfaces:**
- Consumes: Task 2 builders; `getCurrentUser` (src/lib/auth/session.ts); `ProjectCreateDialog` (src/app/(app)/projects/project-create-dialog.tsx — needs clients/contacts/pms/currentUserId, gate create_project; copy the option-fetch block from projects/page.tsx:76-107 including the pm_options self-unshift); `LogTimeDialog` + `resolveLogTimeData` (src/app/(app)/people/[id]/) — viewer's person row via `people.select("id").eq("user_id", uid)`, own assignments via the RLS-scoped assignments table (own rows are always visible), hide the button when no person row or no loggable projects.
- Produces: `DashboardHeader({ name, canCreate, createProps, logTimeProps })` — greeting by server local hour (<12 morning, <18 afternoon, else evening), first word of full_name (fallback email); actions right-aligned, wrapping on mobile. Page renders header → SummaryCards → placeholder sections for Tasks 4-6 (keep the OLD attention sections rendering until Task 4 replaces them — the page must stay shippable after every task).

- [ ] Step 1: header component + page identity/fetch additions (all in the one Promise.all wave).
- [ ] Step 2: summary-cards → the 5 tiles per spec (tone rule intact; invoices tile hidden without budget visibility; needs-attention tile counts the Task-2 feed length and links `#needs-attention`).
- [ ] Step 3: suites green. Browser: greeting correct for admin + bella (names differ), New project opens+creates, Log time opens for bella (has memberships) and is absent for a user with no person row; 5 tiles for admin, 4 for milo.dev (no budget visibility).
- [ ] Step 4: Commit: `feat: dashboard greeting, quick actions, action-first KPI row`

---

### Task 4: Attention feed + My projects + Team cards

**Files:**
- Create: `src/app/(app)/dashboard/attention-feed.tsx`, `src/app/(app)/dashboard/my-projects-card.tsx`, `src/app/(app)/dashboard/team-card.tsx`
- Modify: `src/app/(app)/dashboard/page.tsx` (mount; delete `attention-sections.tsx` + `attention-list.tsx` and their imports)
- Delete: `src/app/(app)/dashboard/attention-sections.tsx`, `attention-list.tsx`

**Interfaces:** consumes Task 2's `FeedItem[]`, `MyProjectRow[]`, workload people (with avatar_url). Progress data: page fetches `project_parts` (`project_id, status, estimated_hours`) for the My-projects candidate ids and derives per-project progress via `deriveProgress` (src/lib/progress.ts) — same derivation the projects list uses.
- `AttentionFeed({ items })`: Card, `#needs-attention` anchor + `scroll-mt-20`; row = severity dot (DERIVED_HEALTH_DOT red/amber; info rows use a muted dot), semibold title, muted reason, right-aligned type chip (Badge outline: Critical/Budget/Workload/Deadline/PM/Status/Credential); whole row a Link; cap 10 with "+N more need review" linking `/projects`. Empty: single calm line "Nothing needs your attention. 🎉" (no six empty boxes).
- `MyProjectsCard({ rows, hasBudget })`: compact table — name+client subline (links), health DotBadge, consumption % ("—" without budget), thin derived-progress bar + %, deadline via `deadlineCountdown(deadline, "short")` (red tone class when overdue). Header action "View all" → /projects.
- `TeamCard({ people })`: top 8 active by pct desc — PersonAvatar size-7 + name (link to /people/[id]) + thin bar (`utilizationBarClasses`) + tabular pct. Header action "View full" → /workload.

- [ ] Step 1: build the three cards; wire the grid (`grid gap-4 xl:grid-cols-3`, attention feed first).
- [ ] Step 2: delete the six-list components; grep `attention-sections|AttentionList` → no orphans.
- [ ] Step 3: suites green. Browser (admin): feed shows the seeded troubles (Loyalty overdue critical first, Warehouse over-budget, Marko 130%, stale statuses…), every row navigates; My projects for bella shows HER projects (FinServ, Data warehouse), for admin all active; Team shows photos + bars, Marko top at 130%.
- [ ] Step 4: Commit: `feat: unified attention feed, My projects, Team cards`

---

### Task 5: Deadlines, Activity, Financial cards

**Files:**
- Create: `src/app/(app)/dashboard/deadlines-card.tsx`, `src/app/(app)/dashboard/activity-card.tsx`, `src/app/(app)/dashboard/finance-card.tsx`
- Modify: `src/app/(app)/dashboard/page.tsx` (fetches: milestones window, month invoices, audit-or-status feed; mount cards)

**Interfaces:** consumes Task 2's `DeadlineEntry[]`, `FinanceOverview`, plus:
- `ActivityCard`: for `view_audit` holders (page checks the RPC once) — last 6 audit rows rendered "{actor_email's name part} {humanizeAction(action)}" + `formatRelativeTime`, "View all" → /activity. Fallback: latest 6 status updates — "{projectName}: {first non-empty of completed/in_progress/blockers}" (truncate ~60ch) + relative time, rows link to the project. Reuse `humanizeAction`/category helpers from src/app/(app)/activity/types.ts — import, don't copy.
- `DeadlinesCard`: date chip (rounded, tabular: "Today"/"Tomorrow"/"31 Jul"; red bg-tint when overdue, amber ≤3d — reuse deadlineCountdown tone logic), name, project subline, right "in Nd"/"Nd overdue".
- `FinanceCard`: two stat blocks (Invoiced this month / Outstanding, formatMoney), "Top budget usage" 3 rows with consumption bars + pct, finance-only margin line, footer "View all budgets" → /budgets. Card absent entirely without budget visibility (grid collapses gracefully).

- [ ] Step 1: page fetches (inside the existing wave; audit fetch only after the permission check — mirror how fetchMonthlyActualCosts is conditionally awaited today).
- [ ] Step 2: the three cards.
- [ ] Step 3: suites green. Browser: admin sees audit feed; bella sees status-update fallback; milo sees NO finance card and the grid still looks intact; deadlines list shows FinServ regulator submission + overdue Loyalty first.
- [ ] Step 4: Commit: `feat: deadlines timeline, activity feed, financial overview cards`

---

### Task 6: Health summary strip + skeleton + cleanup

**Files:**
- Create: `src/app/(app)/dashboard/health-strip.tsx`
- Modify: `src/app/(app)/dashboard/page.tsx`, `src/app/(app)/dashboard/loading.tsx`, `src/app/(app)/dashboard/compute.ts` (drop now-dead exports), `src/app/(app)/dashboard/types.ts`

**Interfaces:** `HealthStrip({ healthy, warning, critical })` — one wide Card, three segments (count + DERIVED_HEALTH_LABEL + dot), each a Link to `/projects?health=healthy|warning|critical` (confirm the projects page's health query param VALUES at src/app/(app)/projects/page.tsx before wiring — use exactly what it parses). Counts derive from the same per-project health map the feed uses (active+planning+on_hold projects, i.e. not completed/archived).

- [ ] Step 1: strip + mount at the bottom; loading.tsx rewritten to mirror the final layout (header, 5 tiles, 3-col grid ×2, strip).
- [ ] Step 2: dead-code sweep: `grep -n "computeBudgetSpentChart\|computeCapacityChart\|monthlyHours\|budgetRemaining\|totalMargin" src/app/(app)/dashboard/` — every hit either lives in /reports now or is deleted; `npm run lint` must show no unused exports/imports in dashboard files.
- [ ] Step 3: suites green. Browser: strip counts match the projects list health filter results when clicked (spot-check critical=1 → Loyalty).
- [ ] Step 4: Commit: `feat: project health summary strip; dashboard cleanup`

---

### Task 7: Final sweep + whole-branch review (NO deploy)

- [ ] Step 1: `npm run test && npm run test:db && npm run lint && npm run build` all green.
- [ ] Step 2: Browser matrix — admin (all cards + audit + finance), bella.pm (own projects, status fallback, budget-но-not-finance framing per her grants), milo.dev (no finance card, no create button unless permitted, feed still renders), vera.view if seeded. Console clean. Mobile-width sanity (stacking order sensible).
- [ ] Step 3: Whole-branch review (controller dispatches). DO NOT deploy — local + GitHub only per user instruction.
