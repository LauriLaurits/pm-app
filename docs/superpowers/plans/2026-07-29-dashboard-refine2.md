# Dashboard Refinement Round 2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eight user-itemized dashboard refinements: activity View-all + row icons + density; financial card = month selector top-right, inner stat sub-cards with real-number progress bars, View-all-budgets bottom; deadline chip color coding; health strip removed; attention-feed row alignment; clearer card headings; global grouped search in the header.

**Architecture:** All presentational except the finance month selector (link-based query param, same pattern as the old period selector) and global search (one debounced server action running three RLS-scoped ilike selects, results grouped by section in a dropdown).

**Global Constraints:** Work on master; `git status` first. DO NOT DEPLOY — local + GitHub only. base-nova render props (never asChild). npm run test && npm run lint && npm run build green per commit. Verify live via the authenticated-HTTP technique (GoTrue REST login + hand-built @supabase/ssr cookie) as admin.demo and bella.pm (Password123!).

---

### Task 1: Card refinements (user items 1–7)

**Files:** `src/app/(app)/dashboard/{activity-card,finance-card,deadlines-card,attention-feed,page,summary-cards}.tsx`, `health-strip.tsx` (delete), `compute.ts`/`queries.ts` (finance month param), possibly `types.ts`.

1. **Activity card**: (a) VERIFY the audit variant actually renders "View all" → /activity in admin HTML — fix if a rendering bug hides it; fallback variant keeps no button (its audience can't open /activity). (b) Add a leading icon per row in a `size-7 rounded-md bg-muted/60` chip: audit rows by `categoryOf(action)` (create → Plus, update → Pencil, delete → Trash2, reveal → KeyRound, auth → LogIn, other → Activity — lucide icons); status-update fallback rows → MessageSquare. (c) Tighten density: rows `py-2`, no dead vertical gaps; the card must not look emptier than its neighbors.
2. **Financial overview layout** (mockup-faithful): month SELECTOR top-right in the CardAction ("This month" / "Last month" — link-based `?finMonth=this|last` handled server-side like the old dashboard period selector; it re-scopes ONLY the invoiced figure via `fetchMonthInvoiceTotal` with the chosen month's start/end); two inner sub-cards side by side (`rounded-lg border p-3`): "Invoiced {this|last} month" big € + progress bar = monthInvoiced / totalClientAmount (real numbers, label "{pct}% of portfolio value"), and "Remaining budget" big € (= Σ client_amount − Σ invoiced over active projects, already available as outstanding-adjacent data — compute from budgetRows) + bar = remaining/total with "{pct}% left". Below: "Top budget usage" rows as today. BOTTOM: full-width outline button "View all budgets" → /budgets (remove the top-right View-budgets button — the selector takes that slot).
3. **Deadlines color coding**: chip variants — overdue → red tint ("N d overdue" right text red), today → emerald "Today", tomorrow → amber "Tomorrow", within 7d → orange date chip, later → muted date chip. Right-side countdown text tones match.
4. **Delete the health strip**: unmount from page.tsx, delete health-strip.tsx, drop its now-unused count computation if nothing else consumes it (grep first).
5. **Attention feed alignment**: make每 row a fixed grid: `grid grid-cols-[auto_1fr_auto_auto_auto] items-center gap-3` (dot | title+reason block | pill | avatar | chevron) so pills/avatars/chevrons align vertically across rows regardless of text length; truncate long titles/reasons.
6. **Headings**: every dashboard CardTitle becomes `text-base font-semibold` (consistent, clearly larger than body); KPI tile labels stay text-xs muted.
7. Keep the tone rules established this wave (pastel chips, cause-based pills).

Commit: `style: dashboard refinements round 2 (activity icons, finance layout, deadline colors)`

---

### Task 2: Global search with grouped dropdown (user item 8)

**Files:** Create `src/app/actions/search.ts`, `src/components/global-search.tsx`; modify `src/app/(app)/dashboard/dashboard-header.tsx` (mount search left of the quick-action buttons).

- Server action `globalSearchAction(q: string)`: `requireActiveUser()`; trimmed q < 2 chars → `{ results: [] }`. Three parallel RLS-scoped selects, `.ilike("name"/"full_name", `%${q}%`)`, limit 5 each: projects (id, name, status), clients (id, name), people (id, full_name, role_title, avatar_url). Also match client contact names→their client (contacts ilike → parent client id/name, merged into the Clients group). Return `{ results: { section: "Projects"|"Clients"|"Employees"; items: { id; label; sublabel?: string|null; href }[] }[] }` with empty sections omitted. Escape `%`/`_` in q for ilike.
- `GlobalSearch` client component: input (rounded-full, Search icon, placeholder "Search projects, clients, people…", width ~w-72) + dropdown panel (absolute, bg-popover ring-1 rounded-lg shadow-md, z-50): debounced 250ms action call, section headers (text-xs uppercase muted), rows = label + muted sublabel, keyboard: ArrowUp/Down + Enter navigates (router.push), Escape closes, click-outside closes; loading spinner in the input while pending; "No results" empty row. Roving focus can be simple (index state + aria-activedescendant) — no need for a full combobox primitive.
- Mount in the dashboard header row: `[greeting block] --- [GlobalSearch] [New project] [Log time]`, wrapping gracefully on small screens.
- Add a vitest for the ilike-escape helper (export it from the action module or a lib file — pure function).

Commit: `feat: global search with grouped results in the dashboard header`

---

### Task 3: Review sweep

Full suites; live HTML checks (admin + bella): activity icons + View-all (admin), finance selector switches months and inner cards show real-number bars, deadline chips colored by proximity, no health strip, feed rows aligned, search returns grouped results for "fin" (FinServ project + FinServ Grupp client) and respects RLS for a low-permission persona. Then whole-branch review of the round-2 diff (controller dispatches). NO deploy.
