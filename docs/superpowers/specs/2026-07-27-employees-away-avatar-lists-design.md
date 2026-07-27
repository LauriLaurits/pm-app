# Employees: Away dates, avatar photo upload, inline Role/Team add — Design

Date: 2026-07-27
Status: Approved

Three independent improvements to the Employees area, driven by feedback on the
`/people` list and add-person form:

1. The stacked amber "Away" badge looks bad and says nothing useful — show the
   vacation return date.
2. Seeded people have photos but a newly added person can only pick an icon
   preset — allow photo upload.
3. Role title / Team values are only extendable via the hidden Settings → Lists
   card — allow adding a value inline from the person form.

## 1. Away badge with return date

### Data

- New migration replaces `person_workload_rows` (create or replace view),
  adding `vacation_ends_on date` beside the existing `on_vacation_now` boolean:
  `max(t.ends_on)` across `time_off` rows of type `vacation` covering
  `current_date`; `null` when not away.
- Same exposure rationale as `on_vacation_now` (see
  `20260716000002_workload_views.sql`): only vacation-type rows are consulted,
  sick leave never surfaces.
- `max()` handles overlapping vacation rows by reporting the latest return date.
- `src/lib/database.types.ts` updated to include the new view column.

### UI

There are exactly three statuses in the UI: green **Active**, yellow **Away**,
red **Deactivated**. Away is never stacked beside Active — it replaces it while
a vacation covers today.

- **List status cell** (`people-table.tsx` `StatusCell`): one select. Its
  *displayed value* is the derived status — while away it reads
  `● Away until Aug 3` (amber dot; formatted from `vacation_ends_on`, falling
  back to plain `Away` if the date is null). Opening the dropdown still offers
  only the two *stored* statuses (Active/Deactivated), so status stays editable
  during a vacation (earlier feedback: Away must not block status edits) —
  Away itself is not directly settable, it comes from Time off entries.
- **Detail header** (`person-header.tsx` `availabilityBadge`): the away branch
  becomes `Away · until Aug 3`.
- Time off card on the detail page already shows full ranges — no change.

## 2. Avatar photo upload

### Storage

- New migration creates a public-read Storage bucket `avatars` with policies:
  - `select`: public (avatar URLs render for everyone who can see the page).
  - `insert`: any authenticated user. The person form is already UX-gated to
    `manage_people`, and `upsertPersonAction` re-checks server-side; an orphaned
    upload by an authenticated non-manager is harmless.
- No update/delete policies for now (YAGNI — replacing a photo uploads a new
  object under a fresh name).

### UI

- `PersonAvatarPicker` gains a leading **Upload photo** tile (camera icon):
  - Opens a hidden `<input type="file" accept="image/*">`.
  - Client-side validation: image mime type, max 2 MB.
  - Uploads via the browser Supabase client to
    `avatars/<crypto.randomUUID()>.<ext>`, then calls `onChange(publicUrl)`.
  - While uploading the tile shows a spinner; on failure an inline error.
  - After upload the photo renders as a selected tile (same anatomy as the
    existing "current photo" tile shown on edit).
- The 6 icon presets remain unchanged as alternatives/fallback.
- `avatar_url` stores the public URL — the same shape the seed data uses, so
  `PersonAvatar` display logic needs no changes. The `person` zod schema keeps
  accepting preset ids or URLs (verify it doesn't reject the storage URL).

## 3. Inline "Add option" in Role/Team selects

### Permissions

- `addManagedOptionAction` changes from `requireAdmin()` to
  `requirePermission("manage_people")` — anyone who can use the person form can
  grow the vocabulary. `deleteManagedOptionAction` stays admin-only.
- `managed_options` RLS: insert policy relaxed to
  `has_permission(auth.uid(), 'manage_people')`; update/delete stay `is_admin()`.
  (Migration.)

### UI

- `ManagedOptionSelectField` (used for `role_title` and `department`) becomes a
  combobox: a text input filters the option list; when the trimmed input matches
  no existing option (case-insensitive), a final `+ Add "…"` row appears.
- Choosing it calls `addManagedOptionAction(kind, value)`; on success the value
  is selected in the form immediately. `kind` is `role_title` for role,
  `team` for department (matching the existing managed-list kinds).
- On action error (e.g. permission), an inline message shows and the field keeps
  its previous value.
- A person's saved value that's no longer in the list stays selectable
  (existing behavior, preserved).
- Settings → Lists card unchanged — still the place to remove values.

## Testing

- pgTAP (existing `supabase/tests` pattern): `vacation_ends_on` returns the
  covering vacation's end date / null when none / max across overlaps; insert
  into `managed_options` allowed for a `manage_people` holder, denied for a
  plain viewer.
- Component behavior verified in the running app: away badge with date in list
  and detail header, photo upload end-to-end on add + edit, inline role add as
  manager.

## Out of scope

- Image resizing/cropping.
- Deleting old avatar objects from storage.
- Non-vacation time off surfacing in the list.
- Editing/renaming managed options.
