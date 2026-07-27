# UI polish wave 2 — Design

Date: 2026-07-27
Status: Approved

Six improvements from user review of the live app.

## 1. Workload grid: compact heatmap

- Cells shrink: `WEEK_COL` minmax(56px→44px), cell height h-11→h-8, inner
  padding p-1→p-0.5. Percent stays the only in-cell content; the project
  breakdown stays tooltip-only (SECURITY INVARIANT: cell color/number must
  keep coming solely from the `person_weekly_allocation` definer RPC, never
  from the RLS-scoped assignments read).
- A 0% non-vacation week renders a faint dash (`–`, text-muted-foreground/40)
  instead of an empty tinted box; vacation dot behavior unchanged.

## 2. Project status updates: author edit + delete

Overrides the original "immutable updates" design (user decision).

- Migration: add UPDATE policy (author only: `author_id = auth.uid()`) +
  `grant update`; add author-delete (keep admin-delete). Update the
  immutability note in docs/schema.md. Adjust the pgTAP test that asserts
  updates are rejected; add author-can/other-cannot cases.
- Actions: `updateStatusUpdateAction(projectId, updateId, input)` and
  `deleteStatusUpdateAction(projectId, updateId)` — `requirePermission
  ("edit_status", projectId)` first, author check via RLS (0 rows affected =
  error), audit entries, revalidate.
- UI: each update in the history card gets a hover "…" menu (author only;
  admins additionally see Delete): Edit opens a dialog reusing
  `StatusUpdateForm` prefilled; Delete uses ConfirmDialog. The page passes
  the current user id down.

## 3. Edit project button → page header top-right

- The "Edit project" dialog trigger moves from the Details card's corner to
  the top-right of the project detail header (same row as the h1 + status
  badge, `justify-between`), rendered by `[id]/layout.tsx` — so it is
  available on every tab.
- Layout fetches the dialog's data needs (clients, contacts, PM candidates,
  canEdit) in its existing parallel batch; the overview page drops its copy
  and the Details card loses its `editAction` slot.

## 4. Dialog CTA always visible (sticky footer)

- `DialogFooter` becomes `sticky bottom-0 z-10` with an OPAQUE background so
  long dialog content scrolls under it — the submit button is always
  visible. All existing DialogFooter consumers inherit the fix.
- The two long forms that use a plain submit `div` instead of DialogFooter
  get the same treatment: status-update form switches to DialogFooter;
  the create-project form (also used on the standalone /projects/new page)
  gets sticky classes that work in both contexts.
- Out of scope: the dialog close (X) button still scrolls with content.

## 5. Clients list contacts: 2 columns, cap at 4

- `ContactsCell` renders contacts in a 2-column grid; only the first 4 show.
  More than 4 → a "+N more" line with the remaining names in a tooltip
  (clicking the row still opens the client detail, which shows all).
- Search continues to match ALL contacts, including hidden ones.
- Client detail page (already a 2-3 col card grid) unchanged.

## 6. Projects row "…" menu: all tabs, matching labels

- Menu items become the six detail tabs with EXACTLY the tab-nav labels:
  Overview, Parts, Budgets, Team, Links, Credentials (fixes "People" →
  "Team", "Budget" → "Budgets"; adds Overview/Links/Credentials).
- The hover "Open" button stays (duplicate of Overview is fine — Open is the
  primary affordance).

## Testing

pgTAP for the status-update policies; existing suites stay green; per-task
browser verification of each surface.

## Out of scope

- Editing others' updates (admins get delete only).
- Row-menu Edit/Delete for projects (exists on the detail page).
- Sticky dialog close button.
