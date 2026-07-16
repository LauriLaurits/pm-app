# Phase 5 — Budgets & Main Dashboard — Implementation Plan (lean)

> Subagent-driven. Calibrated review: read-model/finance-gated tasks get adversarial review; the dashboard (presentational, but must not leak finance data) gets a focused review. Steps use `- [ ]`.

**Goal:** Surface the money — a portfolio budget dashboard, per-project budget detail (plan vs actual, margin, consumption alerts, change history), and the executive main dashboard (summary cards, charts, attention sections). All financial data stays permission-gated: client amounts need `view_budget`; internal cost/margin need `view_internal_cost` (finance).

**Architecture:** `security_invoker` read-model views roll up budget math (client amount, internal cost, margin, consumption %) so RLS nulls the finance columns for non-finance callers — the proven pattern from `project_list_rows`/`person_workload_rows`. Charts use Recharts (the fixed stack) in small client components fed by server-computed data. No new mutations beyond budget edits already covered by Phase 2/3 (`manage_budget`); this phase is mostly read + visualize.

**Tech Stack:** Next.js 16 App Router, shadcn base-nova, **Recharts** (charts), the existing `has_permission`/finance-gated RLS. New read-model migration.

## Global Constraints
- Server components default; components <150 lines; base-nova (`render` not `asChild`).
- **Financial gating is the whole point:** client-facing money (part_billing, budgets, budget_items non-cost) → `view_budget`; internal cost/rates/margin → `view_internal_cost` (finance only). A PM sees client amounts + consumption vs client budget on OWN projects; only finance sees internal cost + true margin. Gate via `security_invoker` views (RLS nulls columns) — NEVER read `part_costs`/`rates` in a component; NEVER compute margin client-side from separately-fetched cost.
- Charts must not plot finance-only series for non-finance viewers (if the data column is null, omit that series/panel, don't render a broken/empty chart implying zero).
- Loading skeletons, empty states, error handling on every view. Consumption alert thresholds: 75/90/100%.
- base-nova conventions; light + dark for all charts (Recharts colors via theme tokens / explicit palettes that work in both).

## Decisions (note at phase end)
1. **Budget rollup views** (`security_invoker`): `project_budget_rows` (per project: client_amount, invoiced, paid, remaining, consumption_pct, budget_type, health — client-facing, `view_budget`-gated; plus finance-only internal_cost, margin, margin_pct). `part_budget_rows` (per part: fixed vs hourly fields per spec). Consumption % = used/client_amount; "used" = invoiced or logged-cost depending on model — keep a documented, simple definition.
2. **Consumption alerts** (75/90/100%) are computed from the view (a `consumption_pct` → severity), surfaced as badges on the budget dashboard + a "over/near budget" attention section on the main dashboard. No new alerts table for v1 (spec allows in-app; we render live, not persisted).
3. **Project budget detail** lives as a **Budgets tab on the project detail page** (consistent with Overview/Parts/People/Links/Credentials), plus the portfolio view at `/budgets`.
4. **Main dashboard** at `/dashboard` (already a placeholder). Cards + charts + attention sections per spec. Charts: Recharts. Utilization/capacity reuses Phase-4's `person_workload_rows`/definer aggregates; budget charts use the new views. Each card/chart degrades gracefully when the viewer lacks the permission (e.g. a PM sees active-projects/utilization/deadlines but budget-remaining shows only across their own projects; internal-cost charts are finance-only).
5. **Flip `/budgets` and `/dashboard`** nav: Budgets from "Soon" to real; Dashboard already resolves (placeholder) — replace with the real dashboard.
6. Margin for a **mixed** project = roll up per-part (fixed parts: price−cost; hourly parts: logged client amount − logged cost) to project totals — computed in the view.

## File structure
```
supabase/migrations/20260716000005_budget_views.sql       # project_budget_rows, part_budget_rows (security_invoker) + pgTAP
src/lib/budget.ts                                          # pure: consumption severity (75/90/100), margin %, formatting (+ tests)
src/app/(app)/budgets/{page,budget-portfolio-table,budget-cards}.tsx   # portfolio dashboard (Task 1)
src/app/(app)/projects/[id]/budget/page.tsx + budget-* components      # project budget tab (Task 2)
src/app/(app)/dashboard/{page,cards,charts/*,attention/*}.tsx          # main dashboard (Task 3)
src/components/charts/*                                    # small Recharts wrappers (client)
```

---

### Task 1: Budget read-models + Portfolio budget dashboard
**Files:** `supabase/migrations/20260716000005_budget_views.sql`, `src/lib/budget.ts` (+tests), `src/app/(app)/budgets/{page,budget-portfolio-table,budget-cards}.tsx`; regen types; flip `/budgets` nav.

**Interfaces:** `project_budget_rows` (security_invoker) per project: id, name, client_name, budget_type, client_amount, invoiced, paid, remaining, consumption_pct (view_budget-gated); internal_cost, margin, margin_pct (view_internal_cost-gated, null otherwise). `src/lib/budget.ts`: `consumptionSeverity(pct): 'ok'|'warn75'|'warn90'|'over100'`, `formatMoney`, `marginPct`.

- [ ] Step 1: migration — `project_budget_rows` (+ `part_budget_rows` if cleaner) as `security_invoker`, rolling up part_billing (client) + budgets/budget_items (invoiced/paid) → client_amount/invoiced/paid/remaining/consumption_pct, and part_costs/rates → internal_cost/margin (LEFT JOINs so RLS nulls finance cols for non-finance). Grant select to authenticated. pgTAP `supabase/tests/phase5_budgets.test.sql` (~7): non-finance PM sees client_amount on OWN projects but NULL internal_cost/margin; finance sees cost+margin on all; member (no view_budget) sees NULL client_amount; consumption_pct math correct for a known fixture.
- [ ] Step 2: `src/lib/budget.ts` + TDD (severity thresholds 74/75/90/100/101).
- [ ] Step 3: `/budgets/page.tsx` (RSC) — portfolio: summary cards (total client budget, invoiced, remaining across visible projects; finance also total internal cost + blended margin) + per-project table/cards (name, type, client amount, used/consumption bar with 75/90/100 severity color, remaining, margin col "—" for non-finance). Filters (over-budget, at-risk). Loading/empty. Flip `/budgets` nav from comingSoon.
- [ ] Step 4: verify — db:reset, test:db (131 + new) green; test + build; dev as `frank.fin@pmcms.local` (sees cost+margin), `anna.pm@pmcms.local` (client amounts on own, margin "—"), `milo.dev` (client amounts "—"). Consumption bars colored by severity; an over-budget project flagged. Playwright/cached Chromium; screenshot.
- [ ] Step 5: commit `feat: budget read-models + portfolio budget dashboard (finance-gated margin)`. **Adversarial review** (view security + the two-tier finance gating).

---

### Task 2: Project budget detail (Budgets tab)
**Files:** `src/app/(app)/projects/[id]/budget/page.tsx` + budget components; add "Budgets" to the project tab nav in `[id]/layout.tsx`.

**Interfaces:** Consumes `project_budget_rows`/`part_budget_rows` + budget_items (change/monthly history). Produces the per-project budget breakdown.

- [ ] Step 1: add "Budgets" tab to `[id]/layout.tsx` nav.
- [ ] Step 2: `[id]/budget/page.tsx` — per-part table: fixed parts (agreed price, planned cost*, actual cost*, profit*, margin*, invoiced, paid, remaining — *finance-only, "—" otherwise); hourly parts (rate, est vs logged hours, billable/non-billable, client amount, internal cost*, margin*). Roll-up to project totals. Monthly cost breakdown (budget_items by month) + plan-vs-actual + a simple forecast-at-completion (linear from consumption) + budget change history (budget_items type='change'). Consumption alert banner at 75/90/100%. Everything gated: a PM sees client-side; finance sees cost/margin. notFound if project not visible.
- [ ] Step 3: verify — build; dev: PM on own project sees client amounts + consumption, no cost/margin; finance sees full margin breakdown; a mixed project (Retail e-shop / Intranet) shows both fixed and hourly parts rolled up. Screenshot. Commit `feat: project budget tab (per-part breakdown, plan vs actual, consumption alerts)`. **Focused review** (finance gating on the detail; reuse Task-1 view so gating is inherited — confirm no direct part_costs/rates read).

---

### Task 3: Main dashboard
**Files:** `src/app/(app)/dashboard/{page,...}.tsx`, `src/components/charts/*` (Recharts). **The implementer MUST read the `dataviz` skill first** (charts/colors/legends) before writing any chart.

**Interfaces:** Reads the budget views + `person_workload_rows` + projects/status/credentials. Produces the executive dashboard.

- [ ] Step 1: **Load the dataviz skill** for chart/color/layout guidance. Install Recharts (`npm i recharts`) if not present.
- [ ] Step 2: summary cards (spec): active projects, projects at risk (health warning/critical), total active budget, budget remaining, billable hours this month, team utilization, overallocated people count, approaching deadlines — each degrading to what the viewer may see (budget cards scoped to visible projects; finance-only totals hidden for non-finance).
- [ ] Step 3: charts (Recharts, light+dark): budget spent vs remaining, monthly costs (finance), capacity vs allocation, project status distribution, planned vs actual hours. Omit finance-only charts for non-finance viewers (don't render empty).
- [ ] Step 4: attention sections (spec): recently updated projects, projects needing attention (at-risk), expiring credentials, over-budget projects, overallocated people, projects without a PM, projects with no status update in 14+ days. Each links to the relevant detail.
- [ ] Step 5: verify — build; dev as finance (full dashboard incl. cost charts), PM (their-scope budget + utilization + attention, no internal-cost charts), member (minimal). Charts render light+dark, no leaked finance data. Screenshots. Commit `feat: main dashboard (cards, charts, attention sections)`. **Focused review** (no finance leak in cards/charts; charts read from the gated views not raw finance tables).

---

### Task 4: Verification + phase summary
- [ ] Step 1: full sweep — `npm run test`, db:reset, test:db (both orders), build.
- [ ] Step 2: e2e click-through: budgets portfolio + a project budget tab + the dashboard, as finance vs PM vs member — confirm margin/cost never shows to non-finance in any of the three surfaces.
- [ ] Step 3: STOP — summarize; wait for approval before Phase 6 (Credentials reveal, delegation UI, access management, audit UI).

## Self-review notes
- Spec coverage: budgets at project + part level (fixed & hourly fields, mixed roll-up) ✓; budget dashboard (portfolio) ✓; project budget detail ✓; monthly breakdown, forecast, plan-vs-actual, change history ✓; 75/90/100 alerts ✓; main dashboard cards + charts + attention sections ✓ — all finance-gated via security_invoker views (never raw part_costs/rates in components).
- Calibration: Task 1 adversarial (new finance-gated views = security surface); Tasks 2 & 3 focused (gating inherited from the views; confirm no direct finance-table reads + no chart leak).
- Risk carried from Phase 4: reuse the security_invoker + definer-aggregate discipline; margin needs BOTH view_budget AND view_internal_cost, so it's effectively finance-only — the view must null margin unless the caller has view_internal_cost.
