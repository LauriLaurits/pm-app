# Dashboard & Project-Detail Redesign — Design

> Goal: make every number carry meaning (label + unit + interpretation), cut duplication, and lift
> the visual quality to a shadcn/Linear standard. Human-centered: a PM should understand each screen
> without a manual. Driven by owner feedback: "bare numbers are noise; progress % is meaningless;
> the empty Risks card is noise; parts should show estimated-vs-actual hours; think how it works
> together."

## Decisions (locked with owner)

1. **Progress is derived, never typed.** Project progress = Σ(estimated_hours of parts with
   status `done`) ÷ Σ(estimated_hours of all parts). Fallback when no estimates exist: count of
   `done` parts ÷ total parts. `null` (show "No parts yet") when a project has no parts. The manual
   `projects.progress` and `project_parts.progress` columns stay in the DB but are removed from all
   UI (display and edit). Per-part "%": gone — **status is the completion signal.**
2. **Dashboard = tiles + lists; tiles link down** to their matching action list. Tiles answer "how
   am I doing", lists answer "which exactly".
3. **Both surfaces this pass** — they share the progress / hours / header vocabulary.

## Part A — Project detail (`/projects/[id]`)

### A1. Header summary strip (new component `project-header.tsx`)
Replaces scattered facts with one labeled strip under the project title/client/PM:

| Cell | Value | Context line |
|------|-------|--------------|
| Progress | derived bar + `42%` | `40 of 95 est. hrs` (or `3 of 7 parts` on fallback) |
| Deadline | date | countdown `in 74d` / `12d overdue` (reuse `isApproachingDeadline` logic) |
| Budget | `€48k of €90k` (finance only; omit cell otherwise) | `53% spent` toned by consumption |
| Team | `6 people` | `2 overallocated` when >0 |

Status + health render as badges beside the title. Uses existing `HEALTH_BADGE_CLASS` /
status colors. Pure presentational; data assembled in `page.tsx`.

### A2. Overview cards: 6 → 3, de-duplicated
- **Latest status** (`status-history.tsx`, kept): current check-in shown expanded, older ones in
  the accordion. The always-open `StatusUpdateForm` becomes a **"Post update"** button opening a
  dialog (new `status-update-dialog.tsx` wrapping the existing form). Fields unchanged
  (Completed / In progress / Blockers / Decisions needed / Next milestone / Handover).
- **Risks & notes** (`overview-notes.tsx`, trimmed): show **Risks · Internal notes · Client notes**
  only. Drop **Blockers** and **Next steps** here — they live in the status update (kills the
  double-entry). When there is no content: render **nothing** for read-only viewers; editors see a
  quiet `+ Add note` affordance, not a dead card.
- **Details** (`overview-details.tsx`, trimmed): description, start/deadline, tags, and PM/owner/
  team folded in (absorbs `overview-people.tsx`). Progress row **removed** (now in the header).
- **Danger zone**: kept, visually de-emphasized (muted, below the fold).

### A3. Parts table (`parts-table.tsx`)
Columns: `Part | Status | Responsible | Hours | Billing | Client price | Actions`.
- **Drop the Progress column.**
- **Hours** cell = `actual / estimated` (e.g. `38 / 40h`). Actual = Σ `time_entries.hours` for that
  `project_part_id` (RLS-scoped; when the viewer can't see time or none logged → `— / 40h`).
  Tone: neutral when actual ≤ est, amber when 1–15% over, red when >15% over, with a `▲` marker.
- **Footer row**: `Total  <actualΣ> / <estΣ>h · <derived%> done`.
- Part status icons: `○ not started · ◐ in progress · ⛔ blocked · ● done` (icon reinforces the
  existing color badge, never color-alone).
- Remove `progress` from `part-form-fields.tsx` (create/edit).

### A4. Data (in `projects/[id]/page.tsx` + `parts/page.tsx`)
- Fetch parts (already done) + a per-part actual-hours map: one grouped read of `time_entries`
  (`project_part_id, hours`) for the project, summed in JS. RLS already scopes it.
- Compute derived progress in a small pure helper `lib/progress.ts` (`deriveProgress(parts)`),
  unit-tested. Reused by header + parts footer + (later) project list.

## Part B — Dashboard (`/dashboard`)

### B1. KPI tiles — value + interpretation + link
Keep 4 core tiles (+2 finance), each gains a context subline and links to its list/filtered view:

| Tile | Value | Subline | Links to |
|------|-------|---------|----------|
| Active projects | `6` | `of 9 · 3 in planning` | `/projects?status=active` |
| Needs attention | `4` | `2 critical, 2 warning` | scrolls to "needs attention" list |
| Team load | `40%` | `avg · 1 over capacity` | `/workload` |
| Deadlines (14d) | `0` | `next: FinServ in 21d` (or `none scheduled`) | `/projects` |
| Budget remaining | `€147.7k` | `of €258.7k · 43% spent` | `/budgets` |
| Blended margin | `€X` | `Y%` toned by health | `/budgets` |

`computeSummary` extends to return the extra context (planning count, total count, critical vs
warning split, overallocated count, next-deadline name+days). No new queries — all from rows already
fetched.

### B2. Visual polish (applies to tiles + chart cards + lists)
- Type hierarchy: number `text-2xl font-semibold`, label `text-sm text-muted-foreground`, context
  `text-xs`. Accent icon chip keyed to tone (already added).
- Hairline separators, consistent card padding rhythm, calmer accents (no full-saturation fills).
- Lists get section ids so tiles can anchor-link; list headers show the count inline.

## Non-goals / YAGNI
- No new charts. No re-introduction of the cut status-distribution / planned-vs-actual charts.
- Manual progress columns are hidden, not dropped (a later migration can remove them).
- No change to permissions/RLS — this is presentation + one read-only time rollup.

## Testing
- `lib/progress.ts` unit tests: all-done → 100%, none → 0%, no estimates → count fallback, no parts
  → null, mixed.
- Build + full vitest green. Manual: PM view (no finance cells), finance view (all cells), a
  project with over-estimate parts (amber/red hours), an empty-notes project (no dead card).
