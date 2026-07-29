# Parity Wave 4 Implementation Plan (budgets / credentials / delegations / activity)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring /budgets, /credentials, /delegations, and /activity into the projects-list flagship element language (stat tiles, subtitle strip, chip filters + red Clear pill, zebra tables with identity cells and hover actions, pagination) while preserving each page's information architecture and security constraints. Nav Soon badges already removed (committed separately).

**Architecture:** Pure presentational re-composition. No migrations, no new data paths except cheap additions noted per task. Each page keeps its existing gating EXACTLY (RLS column-nulling on budgets; per-project reveal RPC on credentials; manage_delegations/canRevoke on delegations; view_audit early-return on activity).

## Global Constraints

- Work on master; `git status` first — foreign changes ⇒ BLOCKED. **DO NOT DEPLOY — local + GitHub only.**
- base-nova render props, never asChild; DropdownMenuLabel inside DropdownMenuGroup.
- **NO left-edge accent lines ever** (rejected twice historically).
- Color only where it carries a signal (severity, status); healthy/informational monochrome.
- `npm run test && npm run lint && npm run build` green per commit; live-verify per task via the authenticated-HTTP technique (GoTrue REST login + hand-built sb cookie; admin.demo / bella.pm / milo.dev, Password123!).

## SHARED FLAGSHIP INVENTORY (cite these exact pieces; source of truth listed per item)

- **StatCard** (`src/components/stat-card.tsx`): `StatCard({icon, label, value, iconClass})`; grid row `grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5`; pastel iconClass pairs `bg-{blue|emerald|amber|violet}-500/10 text-*-600 dark:text-*-400`.
- **Header + subtitle strip** (projects/page.tsx:246-282): h1 `text-2xl font-semibold`; subtitle `mt-0.5 text-sm text-muted-foreground` with `·` separators `mx-1.5 text-border`; right-side actions `flex items-center gap-2`.
- **Chip filters** (projects/project-filters.tsx): container `flex flex-wrap items-center gap-2`; search `mr-3 w-84 rounded-full border-transparent bg-muted/60 shadow-none`; chip active `rounded-full border-border bg-background shadow-xs`, inactive `rounded-full border-transparent bg-muted/60 shadow-none`; FilterDivider `h-4 w-px shrink-0 bg-border`; Clear pill `rounded-full bg-red-500/8 text-red-700 hover:bg-red-500/15 hover:text-red-800 dark:bg-red-500/15 dark:text-red-400 dark:hover:bg-red-500/25` with `<XIcon /> Clear filters`; dot-in-chip idiom `size-1.5 shrink-0 rounded-full ${DOT}`.
- **Table**: `<Table className="[&_tbody_td]:py-4">`, zebra comes from ui/table.tsx; NO bordered wrapper around flagship tables.
- **Identity cell** (projects-table.tsx:205-222): `flex items-center gap-3` + size-10 tile `flex size-10 shrink-0 items-center justify-center rounded-lg border border-border/25 bg-muted/30 text-muted-foreground` (or `avatarTint(name)` tinted initials tile) + `min-w-0` block with Link `text-base leading-tight font-semibold transition-opacity hover:opacity-70` + `text-xs text-muted-foreground` subline; secondary chip `flex size-5 shrink-0 items-center justify-center rounded-md text-[9px] font-medium ${avatarTint(name)}`.
- **Hover row actions** (projects-table.tsx:283-312): row `className="group"`; wrapper `flex items-center justify-end gap-1 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100 has-aria-expanded:opacity-100`; Open `Button variant="outline" size="sm" className="h-7 px-2 text-xs" render={<Link/>}`; "…" trigger `rounded p-1 text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2` + MoreHorizontal size-4.
- **Pagination** (projects-table.tsx:319-357): PAGE_SIZE 10 client-side; "Showing X to Y of N" + numbered buttons.
- **SortableHead/useSort** (`src/components/data-table/*`).
- **DotBadge** (`src/components/dot-badge.tsx`); STATUS_DOT (projects/types.ts); BUDGET_TYPE_CHIP_CLASS (projects/types.ts:48-52).
- **Bar anatomy** (projects-table.tsx:471-531): track `h-[11px] w-full overflow-hidden rounded-full bg-muted`; value row BELOW the bar `mt-1 flex items-baseline justify-between gap-2 tabular-nums whitespace-nowrap` (bold amount, muted denominator, pct pinned right). Keep budgets' existing role="progressbar" aria attrs when porting.
- Empty state `rounded-xl border border-dashed p-12 text-center text-muted-foreground`; page root `space-y-4`.

---

### Task 1: /budgets flagship parity

**Files:** `src/app/(app)/budgets/{page.tsx, budget-cards.tsx → delete, budget-filters.tsx, budget-portfolio-table.tsx, types.ts, loading.tsx}`.

- Header: h1 "Budgets" + subtitle strip `{n} projects · {over} over budget · {atRisk} at risk` (+ ` · {formatMoney(total)} portfolio` when budget-visible). No create button.
- KPI row → StatCard tiles (replace local SummaryCard; delete budget-cards.tsx or rewrite to use StatCard): Portfolio value (Wallet, blue), Invoiced (Receipt, emerald), Remaining (PiggyBank or Wallet, amber), + finance-only: Internal cost (violet), Margin (TrendingUp, emerald; value `"{formatMoney(m)} · {pct}%"`). Conditional tiles omitted exactly as flagship. CONSTRAINT: never re-derive margin client-side; sums only over rows with non-null gated columns.
- Filters → chip idiom: search input (matches project OR client name, client-side), severity chip-Select with dots (at-risk amber-400, over red-500), FilterDivider, red Clear pill. Keep totals portfolio-wide (unfiltered).
- Table: `[&_tbody_td]:py-4`, no border wrapper; identity cell = size-10 `avatarTint(name)` initials tile + semibold name link (→ /projects/{id}/budget) + client subline with size-5 tint chip; Type → `BUDGET_TYPE_CHIP_CLASS` chips; consumption cell → flagship bar anatomy (h-[11px], values below, KEEP the aria progressbar attrs); hover actions: Open → /projects/{id}/budget + "…" menu (Overview → /projects/{id}, Budgets → /projects/{id}/budget); pagination 10/page; sorting kept (useSort already present — extend accessors if columns change).
- loading.tsx updated to the new shape.
- Verify: admin (all tiles), bella (view_budget-tier per her grants), milo (client-tier columns "—", finance tiles absent — confirm what his grants yield). Commit: `feat: budgets page flagship parity`

### Task 2: /credentials flagship parity

**Files:** `src/app/(app)/credentials/{page.tsx, credentials-index-list.tsx, types.ts, loading.tsx}`.

- KEEP the project → environment grouping IA and the bordered credential rows (the reveal control's expanded state needs the room). Restyle around them:
- Header: h1 "Credentials" + subtitle strip `{n} credentials · {p} projects · {e} expiring soon` (expiryStatus over all rows).
- StatCards ×3: Total (KeyRound, blue), Expiring soon (AlertTriangle, amber — value includes expired), Projects (FolderKanban, violet).
- Search input (chip idiom): filters credential name / project name client-side; red Clear pill. (No other facets — YAGNI at this volume.)
- Project group headers: `avatarTint` size-8 initials tile + `text-lg font-semibold` name (link to /projects/{id}) + "Manage on project" becomes `Button variant="outline" size="sm"` render Link → /projects/{id}/credentials.
- Credential rows: name `font-medium` → `text-sm font-semibold`; type/visibility badges stay; expiry badges stay; the metadata strip keeps its layout. **HARD CONSTRAINT: the `canReveal ? <CredentialRevealControl/> : masked-span` branch and its placement are UNTOUCHED — never mount the control for non-holders, never lift its state.**
- Verify: admin sees reveal buttons where permitted; a non-holder still gets the masked tooltip span; search narrows groups; groups with zero matches hide. Commit: `feat: credentials page flagship parity`

### Task 3: /delegations flagship parity

**Files:** `src/app/(app)/delegations/{page.tsx, delegation-sections.tsx, delegation-card.tsx, loading.tsx}`.

- KEEP the 3-section IA (Active/Upcoming/Expired-revoked, always visible) and the card grid (dual-identity rows don't map to the single-identity table cell). Restyle:
- Header: h1 + subtitle strip `{a} active · {u} upcoming · {p} past`; New delegation button stays right.
- StatCards ×3: Active (ArrowRightLeft, emerald), Upcoming (CalendarClock, blue), Past (History, violet — muted value fine).
- Cards: add a status DotBadge in the header row (Active emerald / Upcoming blue / Expired muted / "Revoked" red-dot with the revoked date), keep PersonAvatar pair + arrow; date range gets `tabular-nums`; RevokeButton restyled with DESTRUCTIVE_ACTION_CLASS (src/lib/action-styles.ts) if not already; project badges keep their link behavior.
- Section headings restyle to the flagship uppercase micro-heading they already have — keep, just ensure spacing matches `space-y-8` → fine.
- Verify: bella (PM — sees own delegation to Milo, revoke visible), milo (sees it as recipient, no revoke), admin (revoke visible). Commit: `feat: delegations page flagship parity`

### Task 4: /activity flagship parity

**Files:** `src/app/(app)/activity/{page.tsx, activity-table.tsx, activity-filters.tsx, activity-pagination.tsx, types.ts, loading.tsx}`.

- PRESERVE EXACTLY: the view_audit early-return branch, metadata redaction (summarizeMetadata), the project-filter id-whitelist `.or()` guard, DATE_RE guards, server-side pagination (PAGE_SIZE 50).
- Header: h1 "Activity log" + subtitle strip `page {n} · filtered by {…}` or simply `{sampleInfo}` — use `latest {PAGE_SIZE} per page` phrasing; no stat tiles (log data, counts would need extra queries — skip).
- Filters → chip idiom: rounded-full chip Selects (actor/action/resource/project) with `min-w-52` contents where long, FilterDivider between groups, date inputs restyled `w-36 rounded-full border-transparent bg-muted/60 shadow-none`, red Clear pill. Keep `params.delete("page")` behavior.
- Table: drop the `rounded-xl border` wrapper (flagship tables are bare); Actor cell gets `avatarTint` size-5 initials chip + the email's name-part (`anna.pm` → "anna.pm" is fine; use the part before @); IP + Device columns become gear-menu column-visibility items, hidden by default (port the flagship gear: Settings2 trigger + DropdownMenuCheckboxItem list; client-side visibility state); category badges stay; add `[&_tbody_td]:py-2.5` (denser than flagship — log rows are many).
- Pagination: keep prev/next server model, restyle the block to the flagship typography (`flex flex-wrap items-center justify-between gap-2 px-1 text-sm text-muted-foreground`, outline sm buttons).
- The gate-denied branch gets the same h1 + a bordered-dashed empty-state box for visual consistency.
- Verify: admin full table + filters + gear hides IP/Device by default; bella gets the access-denied branch (she lacks view_audit); filter round-trips keep working. Commit: `feat: activity page flagship parity`

### Task 5: Sweep + whole-wave review (NO deploy)

- Suites; live persona pass across all four pages + regression check of projects/clients/people/dashboard; whole-wave review dispatch (controller); ledger triage. NO deploy.
