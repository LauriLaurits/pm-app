# Action-first dashboard redesign — Design

Date: 2026-07-28
Status: Approved (user-supplied direction + mockup; scope answers: real data only —
no global search/notifications/tasks/meetings/goals; activity feed falls back to
status updates for non-admins)

Goal: a PM opens the dashboard and knows in ~10 seconds what needs them today.
Charts are analytics, not action — they move to a new Reports page. The dashboard
becomes: greeting + quick actions → KPI row → action feed + compact overviews →
health summary. Visual weight follows urgency (color only where something needs
a human — the existing dashboard tone rule stays).

## Layout (top to bottom)

### 1. Header
- Time-based greeting: "Good morning|afternoon|evening, {first name} 👋"
  (first word of `profile.full_name`, fallback email; page now calls
  `getCurrentUser()`), subtitle "Here's what's happening with your projects today."
- Right side: quick actions — `+ New project` (existing ProjectCreateDialog,
  rendered when `create_project`; same 4 data queries the projects page runs) and
  `Log time` (existing LogTimeDialog fed by `resolveLogTimeData` for the viewer's
  own person row + own assignments; hidden when the viewer has no person row or
  no loggable projects).

### 2. KPI row (5 tiles, existing StatTile idiom + tone rule)
1. Active projects — n, context "of {total} · {planning} in planning".
2. Needs attention — count of items in the unified feed (below), context
   "{critical} critical · {warning} warnings"; links to `#needs-attention`.
3. Team utilization — avg %, context "{available} of {people} available"
   (available = active, not on vacation, utilizationClass available/partial).
4. Upcoming deadlines — count within 14d, context "next: {name} on {date}".
5. Invoices waiting — count of projects with `invoiced > paid`, context
   "{€ outstanding} outstanding" (view_budget gated; tile hidden without it).
   The old Budget-remaining and Margin tiles fold into the Financial card.

### 3. Main grid (xl: 3 columns, stacking below)
**Needs your attention** (the hero list, `#needs-attention`): ONE severity-sorted
feed replacing the six small attention lists. Row anatomy: severity dot
(red/amber), title, one-line reason, type chip, all wrapped in a link to the
entity. Sources (all existing computations): critical/warning projects (derived
health + reasons), over-budget projects, overallocated people, projects without
a PM, stale status (14d), expiring credentials (30d). Sort: critical first, then
warning-tier, then informational (no-PM, stale, credentials); cap 10 with a
"+N more" line linking to the relevant list pages. Empty state: one calm
"Nothing needs your attention" card — no six empty boxes.

**My projects**: compact table of the viewer's projects (pm_id = viewer;
fallback: all active projects when they PM none — admins/finance). Columns:
name (+client subline), health dot+label, budget consumption % (view_budget;
"—" otherwise), derived progress bar (progress from project_parts aggregates —
fetched for these projects only, so the dashboard finally gets the real
progress signal), deadline (`deadlineCountdown` short, overdue red). Rows link
to the project. Cap 6, "View all projects" → /projects.

**Team workload**: rows sorted by allocation desc — PersonAvatar (photos now
seeded), name, thin utilization bar (`utilizationBarClasses`), % right-aligned.
Active people only; top 8; "View full" → /workload.

**Upcoming deadlines**: merged timeline of (a) active projects' deadlines and
(b) undone milestones, next 30 days plus anything overdue. Row: date chip
(Today / Tomorrow / "31 Jul", red when overdue, amber ≤3d), name + project
subline, "in Nd"/"Nd overdue". Sorted ascending, cap 8. Links to the project.

**Recent activity**: admins (view_audit) get the last ~6 audit rows —
"{actor} {humanized action}" + relative time, reusing activity/types.ts
helpers; link "View all" → /activity. Everyone else gets the latest project
status updates in the same slot (project name + newest non-empty field snippet
+ relative time), linking to the project. Needs a small shared
`formatRelativeTime` helper ("12 min ago", "2 h ago", "3 d ago") with tests.

**Financial overview** (view_budget gated; card hidden without it):
- "Invoiced this month" — sum of `budget_items` type `invoice` with
  `occurred_on` in the current calendar month, across visible budgets.
- "Outstanding" — Σ(invoiced − paid) over active projects.
- "Top budget usage" — top 3 active projects by `consumption_pct` with
  consumption bars (`consumptionBarClasses`) and %.
- Finance-only extra line: blended margin (amount + %), replacing the old tile.
- "View all budgets" → /budgets.

### 4. Project health summary (bottom strip)
Healthy / At risk / Critical counts as three wide segments (derived health,
DERIVED_HEALTH_* styling), each linking to `/projects?health=<level>` (the
server-side derived-health filter already exists). No sparklines — there is no
health history data; counts only.

## Reports page (new)
- `/reports`: the four existing charts move here unchanged — "Over time"
  (monthly hours, monthly internal cost [finance]) with the period selector,
  and "Right now" (budget spent vs remaining [budget-gated], capacity vs
  allocation). Same queries, gating, and empty states — components physically
  move, not rewritten.
- Nav: "Reports" item (BarChart3 icon) after Workload, NOT comingSoon.
- Dashboard drops charts and the period selector entirely.

## Data / permissions
- No DB migrations. Every card reuses existing RLS-gated views/queries;
  new fetches: viewer identity, quick-action data, `project_parts` aggregates
  for the My-projects subset, current-month invoice items, audit rows
  (admin-only path). Finance/budget gating identical to today (two-tier:
  view_budget vs view_internal_cost).
- `person_workload_rows` select widens to include `avatar_url`.
- Both dashboard and reports keep the one-parallel-wave fetch discipline.
- loading.tsx skeletons updated for both pages.

## Out of scope (user decision)
Global search, notifications, tasks, meetings, monthly goals, invoice
documents; widening view_audit; deploy (stays LOCAL until user says ship).
