# UI Polish Wave 2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Compact workload heatmap; author edit/delete for project status updates; Edit-project button in the detail header; sticky dialog CTAs; 2-column capped client contacts; projects row menu matching the detail tabs.

**Architecture:** Six independent UI slices. Only item 2 touches the DB (new UPDATE/DELETE policies on `project_status_updates` — a deliberate reversal of the original immutability design, per user decision). Everything else is component-level.

**Tech Stack:** Next.js 16 App Router, TS, shadcn base-nova on `@base-ui/react` (render props, never `asChild`; `onClick` not `onSelect`), Supabase + pgTAP, zod v4.

**Spec:** `docs/superpowers/specs/2026-07-27-ui-polish-wave2-design.md`

## Global Constraints

- Read `node_modules/next/dist/docs/` before writing Next-specific code (AGENTS.md).
- Work directly on master; `git status` first — foreign uncommitted changes ⇒ BLOCKED.
- Dev server for verification: `npx next dev -p 3005` (NEVER port 3000); login admin.demo@pmcms.local / Password123!; second author account bella.pm@pmcms.local / Password123!.
- WORKLOAD SECURITY INVARIANT: cell color/number come ONLY from the `person_weekly_allocation` definer RPC; the RLS-scoped assignments read feeds tooltips only and must never influence cells.
- `npm run test && npm run lint && npm run build` before each commit; `npm run test:db` when the DB changes. Commit per task.

---

### Task 1: Workload compact heatmap

**Files:**
- Modify: `src/app/(app)/workload/workload-timeline.tsx` (constants lines ~9-10; `WorkloadCell` lines ~85-122)

**Interfaces:** none produced; purely visual.

- [ ] **Step 1:** In `workload-timeline.tsx`: change `WEEK_COL` from `"minmax(56px, 1fr)"` to `"minmax(44px, 1fr)"`. In `WorkloadCell`, change the cell wrapper height `h-11` → `h-8` and padding `p-1` → `p-0.5`.
- [ ] **Step 2:** Change the cell content expression so an empty week reads as data, not absence. Current logic: `week.pct > 0 ? "${Math.round(pct)}%" : onVacation ? "•" : ""`. New: when pct is 0 and not on vacation, render `–` (en dash) with `text-muted-foreground/40` — add the class conditionally on the inner span, keep the tinted background classes exactly as they are (`utilizationCellClasses`), keep the vacation `•` + sky ring unchanged.
- [ ] **Step 3:** `npm run test && npm run lint && npm run build` — green. Visual check on `/workload` (12 columns visibly denser, dashes on empty weeks, tooltips still work, vacation ring unchanged).
- [ ] **Step 4:** Commit: `style: workload grid compact heatmap cells`

---

### Task 2: Status updates — author edit + delete

**Files:**
- Create: `supabase/migrations/20260727000004_status_update_edit.sql`
- Modify: `supabase/tests/phase2_projects.test.sql` (the "UPDATE rejected" assertion ~line 59)
- Create: `supabase/tests/phase8_status_update_edit.test.sql`
- Modify: `src/app/actions/projects.ts` (add two actions after `postStatusUpdateAction` ~line 427)
- Modify: `src/app/(app)/projects/[id]/status-history.tsx` (per-update actions slot)
- Create: `src/app/(app)/projects/[id]/status-update-actions.tsx` (menu + edit dialog + confirm delete)
- Modify: `src/app/(app)/projects/[id]/status-update-dialog.tsx` and/or `status-update-form.tsx` (form gains edit mode)
- Modify: `src/app/(app)/projects/[id]/page.tsx` (pass current user id + isAdmin into the history card)
- Modify: `docs/schema.md` (immutability note)

**Interfaces:**
- Produces: `updateStatusUpdateAction(projectId: string, updateId: number, input: StatusUpdateInput)` and `deleteStatusUpdateAction(projectId: string, updateId: number)`, both returning `{ error: string } | { success: true }`. `StatusUpdateForm` gains optional `update?: StatusUpdateRow` (prefill) + submits via update action when set. `StatusHistoryCard` gains `currentUserId: string | null` and `isAdmin: boolean` props.
- Consumes: `statusUpdateSchema` (unchanged), `requirePermission`, `writeAudit`, `ConfirmDialog` (`src/components/confirm-dialog.tsx`), `DESTRUCTIVE_ACTION_CLASS`/`EDIT_ACTION_CLASS` from `src/lib/action-styles.ts`, dropdown-menu components (REMEMBER: `DropdownMenuLabel` must sit inside `DropdownMenuGroup`).

- [ ] **Step 1 (failing pgTAP):** Create `supabase/tests/phase8_status_update_edit.test.sql` with fixtures mirroring `phase2_projects.test.sql` style: PM author + second PM + member; one status update row inserted as the author. Assertions (plan(4)): author `lives_ok` UPDATE own row; second user's UPDATE affects 0 rows (`is(count-check)` — RLS filters, no error); author `lives_ok` DELETE own; admin delete already covered by phase2 — instead assert member DELETE of someone else's row leaves it in place. Also EDIT `phase2_projects.test.sql`: the existing "status update UPDATE rejected" assertion must become "non-author update affects 0 rows" (or be removed in favor of the new file — keep plan() counts consistent). Run `npm run test:db` → new file FAILS (42501: no update grant).
- [ ] **Step 2 (migration):** Create `supabase/migrations/20260727000004_status_update_edit.sql`:

```sql
-- User decision (2026-07-27): status updates are no longer immutable -- the author may edit
-- or delete their own update (typo fixes, wrong-field pastes). Admin delete stays. This
-- deliberately reverses the "IMMUTABLE (no update policy)" design in 20260715000003 --
-- docs/schema.md is updated in the same commit.
create policy "authors edit own status update" on public.project_status_updates
  for update using (author_id = auth.uid()) with check (author_id = auth.uid());
create policy "authors delete own status update" on public.project_status_updates
  for delete using (author_id = auth.uid());
grant update on public.project_status_updates to authenticated;
```

Run `npx supabase db reset && npm run test:db` → ALL green (including the amended phase2 file).
- [ ] **Step 3 (actions):** In `src/app/actions/projects.ts`, after `postStatusUpdateAction`, following its exact conventions (security first, zod parse, audit, revalidate):

```ts
export async function updateStatusUpdateAction(
  projectId: string,
  updateId: number,
  input: StatusUpdateInput
): Promise<ActionResult> {
  if (!z.uuid().safeParse(projectId).success) return { error: "Invalid project." };
  if (!Number.isInteger(updateId) || updateId <= 0) return { error: "Invalid update." };
  const current = await requirePermission("edit_status", projectId);
  const parsed = statusUpdateSchema.safeParse(input);
  if (!parsed.success) return { error: "Fill in at least one field." };
  const supabase = await createClient();
  // RLS only matches the author's own row -- a non-author "succeeds" with 0 rows, so
  // select back the id to distinguish.
  const { data, error } = await supabase
    .from("project_status_updates")
    .update(parsed.data)
    .eq("id", updateId)
    .eq("project_id", projectId)
    .select("id");
  if (error || !data || data.length === 0) return { error: "Update failed. You can only edit your own updates." };
  await writeAudit({
    action: "project.status_update_edited",
    actorId: current.user.id,
    actorEmail: current.profile.email,
    resourceType: "project_status_update",
    resourceId: String(updateId),
    metadata: { project_id: projectId },
  });
  revalidatePath(`/projects/${projectId}`);
  return { success: true as const };
}

export async function deleteStatusUpdateAction(
  projectId: string,
  updateId: number
): Promise<ActionResult> {
  if (!z.uuid().safeParse(projectId).success) return { error: "Invalid project." };
  if (!Number.isInteger(updateId) || updateId <= 0) return { error: "Invalid update." };
  const current = await requirePermission("edit_status", projectId);
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("project_status_updates")
    .delete()
    .eq("id", updateId)
    .eq("project_id", projectId)
    .select("id");
  if (error || !data || data.length === 0) return { error: "Delete failed. You can only delete your own updates." };
  await writeAudit({
    action: "project.status_update_deleted",
    actorId: current.user.id,
    actorEmail: current.profile.email,
    resourceType: "project_status_update",
    resourceId: String(updateId),
    metadata: { project_id: projectId },
  });
  revalidatePath(`/projects/${projectId}`);
  return { success: true as const };
}
```

(Admin deletes of others' rows pass because the admin RLS delete policy matches — the "own updates" error copy is the common case.)
- [ ] **Step 4 (form edit mode):** Extend `StatusUpdateForm` with optional `update` (row) + `updateId`: when present, defaults come from the row and submit calls `updateStatusUpdateAction(projectId, updateId, values)`; button label "Save changes". Keep the create path byte-identical.
- [ ] **Step 5 (per-update menu):** New `status-update-actions.tsx` client component: hover-revealed "…" `DropdownMenu` (same reveal classes as the projects table actions: `opacity-0 group-hover:opacity-100 focus-within:opacity-100 has-aria-expanded:opacity-100`) with `Edit update` (opens controlled Dialog hosting the form in edit mode; only when `canEdit` = current user is the author) and `Delete update` (ConfirmDialog → delete action; when author OR admin). Wire it into `status-history.tsx` beside the timestamp of BOTH the latest update and each accordion item (the accordion trigger row needs the guard: actions must not toggle the accordion — stop propagation or render outside the trigger). `page.tsx` passes `currentUserId` (from `getCurrentUser()`) and `isAdmin` (`current.role === "admin"`) down.
- [ ] **Step 6:** `npm run test && npm run lint && npm run build` green; `npm run test:db` green. Update `docs/schema.md`'s status-update immutability sentence to describe author-edit/author-delete + admin-delete.
- [ ] **Step 7 (verify in browser):** as bella.pm on FinServ project: edit own update (fields change, timestamp unchanged), delete own update; as admin: no Edit on Bella's update but Delete works; as milo.dev (no edit_status): no menu at all.
- [ ] **Step 8:** Commit: `feat: status updates editable/deletable by author (admin delete stays)`

---

### Task 3: Edit-project button in the detail header

**Files:**
- Modify: `src/app/(app)/projects/[id]/layout.tsx` (header row + data fetch)
- Modify: `src/app/(app)/projects/[id]/page.tsx` (drop its edit-dialog fetch/mount)
- Modify: `src/app/(app)/projects/[id]/overview-details.tsx` (remove `editAction` slot)
- Possibly move: shared fetch helper into `src/app/(app)/projects/[id]/edit-data.ts`

**Interfaces:** `OverviewEditDialog` keeps its props; only its mount point moves.

- [ ] **Step 1:** Extract the overview page's clients/contacts/pmCandidates/canEdit fetch block (page.tsx ~lines 137-146 + the `has_permission` call) into `edit-data.ts` exporting `getProjectEditData(supabase, projectId, userId)` returning `{ canEdit, clients, contacts, pmCandidates, currentPmName, isAdmin }` — whatever `OverviewEditDialog` consumes today; keep queries running in ONE `Promise.all`.
- [ ] **Step 2:** In `layout.tsx`: the title row becomes `flex flex-wrap items-center justify-between gap-2` with a left group (h1 + status DotBadge) and, when `canEdit`, `<OverviewEditDialog …/>` on the right. Fetch via `getProjectEditData` in parallel with the existing project fetch (`Promise.all`). The project select in layout must add any fields the dialog needs (it currently selects only `id, name, status, description` — the dialog needs the full editable row; select the columns `toDefaults`/the form reads).
- [ ] **Step 3:** Overview `page.tsx`: remove the edit-dialog fetch + mount; `overview-details.tsx`: delete the `editAction` prop and its `CardAction` render; update its doc comment.
- [ ] **Step 4:** `npm run test && npm run lint && npm run build` green. Browser: Edit project sits top-right beside the title on EVERY tab; editing still round-trips; non-editor (viewer role) sees no button; Details card has no edit corner anymore.
- [ ] **Step 5:** Commit: `feat: Edit project lives in the detail header (all tabs)`

---

### Task 4: Sticky dialog CTA

**Files:**
- Modify: `src/components/ui/dialog.tsx` (`DialogFooter` ~lines 93-118)
- Modify: `src/app/(app)/projects/[id]/status-update-form.tsx` (plain submit div → DialogFooter)
- Modify: `src/app/(app)/projects/new/project-create-form.tsx` (sticky submit row that works in dialog AND on the standalone page)

**Interfaces:** none new; every DialogFooter consumer (19 files) inherits the change.

- [ ] **Step 1:** In `dialog.tsx`, `DialogFooter` classes: add `sticky bottom-0 z-10` and make the background OPAQUE so content scrolls beneath it — replace `bg-muted/50` with a solid layered background (e.g. `bg-popover` on the footer plus the existing `border-t`; keep `-mx-4 -mb-4 rounded-b-xl p-4` and the flex classes). Verify against the scroll model: the popup itself is the scroll container (`max-h-[85vh] overflow-y-auto` set per-dialog), so `sticky bottom-0` pins within it even though the footer's direct parent is the `<form>`.
- [ ] **Step 2:** `status-update-form.tsx`: wrap the submit button (line ~94) in `<DialogFooter>` (it is only ever rendered inside a dialog).
- [ ] **Step 3:** `project-create-form.tsx`: change the submit row `<div className="flex justify-end">` to `<div className="sticky bottom-0 z-10 -mx-1 flex justify-end border-t bg-background px-1 py-3">` — sticky works inside the create DIALOG's scroll container and is harmless on the standalone `/projects/new` page (sticks to viewport bottom while the form is long). If the dialog's popover background differs visibly from `bg-background`, match per context rather than leaving a seam (check both).
- [ ] **Step 4:** `npm run test && npm run lint && npm run build` green. Browser: open the LONGEST dialogs — Edit project, New project (dialog + /projects/new page), Add person (person form), New client — confirm the CTA is visible without scrolling at the bottom edge, content scrolls under it, no transparent see-through, ConfirmDialog and small dialogs look unchanged.
- [ ] **Step 5:** Commit: `fix: dialog CTAs stay visible (sticky DialogFooter)`

---

### Task 5: Clients list contacts — 2 columns, cap 4

**Files:**
- Modify: `src/app/(app)/clients/clients-table.tsx` (`ContactsCell` ~lines 242-269)

**Interfaces:** none; search behavior (`matchesQuery`) already covers all contacts and must stay untouched.

- [ ] **Step 1:** Replace `ContactsCell`'s `flex flex-col gap-1.5` stack with:

```tsx
function ContactsCell({ contacts }: { contacts: ClientContact[] }) {
  if (contacts.length === 0) return <span className="text-sm text-muted-foreground">—</span>;
  const shown = contacts.slice(0, 4);
  const hidden = contacts.slice(4);
  return (
    <div>
      <div className="grid grid-cols-1 gap-x-4 gap-y-1.5 xl:grid-cols-2">
        {shown.map((c) => (
          /* existing per-contact block markup, unchanged */
        ))}
      </div>
      {hidden.length > 0 && (
        <Tooltip>
          <TooltipTrigger render={<span className="mt-1 inline-block text-xs text-muted-foreground" />}>
            +{hidden.length} more
          </TooltipTrigger>
          <TooltipContent>
            <div className="flex flex-col gap-0.5">
              {hidden.map((c) => (
                <span key={c.id}>{c.name}{c.role ? ` · ${c.role}` : ""}</span>
              ))}
            </div>
          </TooltipContent>
        </Tooltip>
      )}
    </div>
  );
}
```

(Adapt names/imports to the file's actual types; keep the existing inner contact block exactly. `xl:grid-cols-2` keeps one column on narrower viewports where the 45% column gets tight — judge against the real table and use `lg:` if it fits.)
- [ ] **Step 2:** `npm run test && npm run lint && npm run build` green. Browser `/clients`: Baltic Retail (3 contacts) shows 2-col; a 5-contact client (FinServ Grupp after enrichment has 3 — temporarily add 2 via the edit form, then remove) shows 4 + "+1 more" tooltip; row click still navigates; searching a hidden contact's name still finds the client.
- [ ] **Step 3:** Commit: `style: clients list contacts flow in two columns, capped at four`

---

### Task 6: Projects row menu mirrors the detail tabs

**Files:**
- Modify: `src/app/(app)/projects/projects-table.tsx` (menu items ~lines 303-305)

**Interfaces:** none.

- [ ] **Step 1:** Replace the three `DropdownMenuItem` nav entries with six, labels EXACTLY matching `tab-nav.tsx`: `Overview` → `/projects/{id}`, `Parts` → `/projects/{id}/parts`, `Budgets` → `/projects/{id}/budget`, `Team` → `/projects/{id}/people`, `Links` → `/projects/{id}/links`, `Credentials` → `/projects/{id}/credentials`. Keep the existing item markup/idiom (base-nova: render props / `onClick`).
- [ ] **Step 2:** `npm run lint && npm run build` green. Browser: menu shows all six, each navigates to the right tab, hover-reveal behavior unchanged.
- [ ] **Step 3:** Commit: `fix: projects row menu lists all tabs with matching labels`

---

### Task 7: Final verification sweep

- [ ] **Step 1:** `npm run test && npm run test:db && npm run lint && npm run build` — all green.
- [ ] **Step 2:** Browser pass across all six surfaces (workload density + tooltips; edit/delete own update + admin delete; Edit project on every tab; long-dialog CTAs; clients contacts columns/cap; projects menu labels), plus regressions: dashboard, people list, a project detail walk-through. Console clean on visited pages.
- [ ] **Step 3:** Report: deploy needs `npx supabase db push` (1 new migration) BEFORE `npx vercel deploy --prod`.
