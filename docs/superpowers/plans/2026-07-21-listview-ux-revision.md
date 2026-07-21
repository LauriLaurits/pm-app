# List-view UX revision — sorting, cross-links, inline edit, clarity

Date: 2026-07-21. Scope: every data view under `src/app/(app)/`. Driver: user review
("all views: logical, needed, easy to input and interact"). NOT deployed to Vercel until
user says so — local + GitHub only.

## Principles

- Reuse, don't rebuild: `InlineEditSelect` / `InlineEditText` for editing, `render={<Link/>}`
  base-ui convention, `formatMoney`/`formatDate`, `daysUntil`, consumption helpers in `lib/budget.ts`.
- Sorting is client-side: tables already receive serializable `rows` props. One shared hook +
  header component, applied per table. Server default order stays as the initial sort.
- Every entity name that has a destination page becomes a link. If no destination exists but one
  is clearly warranted (client), build the minimal destination.
- Inline edit only where a single field changes with no side-questions (enums, short text, money
  amounts). Anything multi-field stays in its dialog.

## Tasks

### T1 — Shared sorting infrastructure
- `src/components/data-table/use-sort.ts`: `useSort(rows, initial)` — sort state
  `{key, dir}`, cycle asc→desc, comparators for string/number/date with nulls last.
- `src/components/data-table/sortable-head.tsx`: `SortableHead` — `<TableHead>` wrapping a
  button (base-ui conventions), arrow indicator, `aria-sort`.
- Unify stray date formats onto `formatDate` (admin/users `toLocaleDateString`, budget-items-list local fmt).

### T2 — Projects table (flagship)
- Sorting: name, client, PM, status, health, deadline, team, budget consumption, progress, updated.
- Deadline: replace bare date range with deadline + countdown chip ("in 12d" / "due today" /
  "3d overdue", amber ≤14d, red overdue). Extract countdown logic shared with project-header
  into `src/lib/deadline.ts`.
- Budget cell: adopt portfolio `ConsumptionCell` style — invoiced/total, % + colored mini-bar,
  remaining. Consistent with /budgets.
- Client cell → `<Link>` to client detail (T3 builds it). PM cell → `<Link>` to `/people/{personId}`
  (server page builds user_id→person_id map from `people`).

### T3 — Client detail page (new, minimal)
- `clients/[id]/page.tsx`: client info card (contact, email, phone, edit via existing
  `ClientFormDialog`) + their projects (reuse projects table data shape or simple list linking
  to projects). Clients list name + project-count badge link here.

### T4 — Remaining list views
- Clients table: sorting; name links (T3).
- People table: sorting (incl. allocation/cost/billing); status → `InlineEditSelect` using existing
  status action from `PersonRowActions`.
- Budgets portfolio: sorting; client subtext → client link.
- Parts tab table: sorting; responsible person name links to `/people/{responsible_person_id}`
  (keep the inline select for reassigning; link sits in the read state).
- Project members table: person name → link (needs person id in roster query).
- Person detail recent-hours: project names → links.
- Activity table: project cell → link.
- Delegations: from/to person + project names → links.
- Admin users: sorting; `formatDate` for Joined.

### T5 — Project budget tab clarity (user's example URL)
- Inline edit invoiced/paid on fixed-parts rows (`InlineEditText` numeric, canManageBudget-gated,
  reusing the part-billing server action) — the two numbers PMs/finance actually update often.
- Consistent number/date formatting; hours already fixed (one decimal).
- Visual order check: summary → consumption → parts → monthly → ledger (keep, verify headings say
  what each block is).

### T6 — Color layer (demo feedback: "tables too same-blend, but keep it good looking")
- Semantic action colors, consistently: destructive row actions (delete/remove/revoke) get
  red icon+hover treatment; edit actions get a positive accent (subtle green); neutral actions
  stay ghost. Applied via shared class constants, not per-file ad hoc styles.
- Person/client avatars: deterministic soft tint per name (hash → hue from a fixed pastel set,
  readable in both modes) instead of uniform gray — rows stop blending without adding noise.
- Entity links: primary-tinted hover (color appears on interaction, not at rest).
- Status/health/consumption/countdown badges already carry semantic color — ensure every table
  shows at least one such colored signal column so no view is wall-of-gray.

## Verification
- `npm run build` + `npm run test` after each task; Playwright walkthrough on localhost:3000 with
  demo admin at the end (sorting clicks, link navigation, inline edits).
- Commit per task; push to GitHub; NO vercel deploy.
