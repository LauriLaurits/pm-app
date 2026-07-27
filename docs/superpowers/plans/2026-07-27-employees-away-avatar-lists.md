# Employees: Away Dates, Avatar Upload, Inline Role/Team Add — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Employees list/detail show Away as one of exactly three statuses with a vacation return date; the person form supports photo upload; Role/Team dropdowns allow inline "+ Add" of new values; project Priority disappears ("Status & Budget" section); Add-person takes multiple membership periods; the project description 3-line clamp works again.

**Architecture:** Independent slices over the existing Supabase + Next.js App Router stack: (1) the `person_workload_rows` view grows a `vacation_ends_on` column consumed by the list status cell and detail header; (2) a public `avatars` Storage bucket receives browser uploads from the avatar picker; (3) a `managed_options` insert policy widens to `manage_people` and the Role/Team selects become creatable comboboxes; (4) project priority is UI-retired (DB column stays, like manual health); (5) `addMemberSchema` gains a `periods` array inserted as N `project_members` rows; (6) a clamp bug fix found by reproduction, not rewrite.

**Tech Stack:** Next.js 16 App Router, TypeScript, shadcn/ui base-nova on `@base-ui/react` 1.6, Supabase (local Docker) with pgTAP tests, zod v4, vitest.

**Spec:** `docs/superpowers/specs/2026-07-27-employees-away-avatar-lists-design.md`

## Global Constraints

- **This is NOT the Next.js you know** (AGENTS.md): before writing any Next-specific code, read the relevant guide in `node_modules/next/dist/docs/`. Heed deprecation notices.
- base-nova components use **render props, never `asChild`**; menu items take `onClick`, not `onSelect`.
- Base UI docs live in `node_modules/@base-ui/react/docs/react/components/*.md` — treat them as authoritative over training data (the package says so itself).
- zod v4 top-level APIs (`z.uuid()`, `z.enum([...])`).
- Exactly **three UI statuses**: green Active, yellow Away, red Deactivated. Away is derived from time off — never stored, never stacked beside Active.
- The user may run Codex in a parallel window on this same working tree — **check `git status` before starting each task** and don't clobber uncommitted work.
- Dev server: port 3000 may be occupied by another app — use `npx next dev -p 3005`.
- Local Supabase must be running (`npm run db:start` if not). `npx supabase db reset` applies migrations + seed. `npm run test:db` runs pgTAP. `npm run db:types` regenerates `src/lib/database.types.ts`.
- Commit after every task. Run `npm run lint` and `npm run test` before each commit that touches TS.

---

### Task 1: `vacation_ends_on` in `person_workload_rows` (DB + types)

**Files:**
- Create: `supabase/migrations/20260727000001_vacation_ends_on.sql`
- Create: `supabase/tests/phase8_vacation_ends.test.sql`
- Regenerate: `src/lib/database.types.ts` (via `npm run db:types` — never hand-edit)

**Interfaces:**
- Consumes: existing `person_workload_rows` view (`supabase/migrations/20260716000002_workload_views.sql`), `time_off` table (`type`, `starts_on`, `ends_on`).
- Produces: view column `vacation_ends_on: string | null` (a date) on `Database["public"]["Views"]["person_workload_rows"]["Row"]`, flowing into `PersonWorkloadRow`/`PersonListRow` (`src/app/(app)/people/types.ts`) with no TS changes needed. Task 2 reads `row.vacation_ends_on`.

- [ ] **Step 1: Write the failing pgTAP test**

Create `supabase/tests/phase8_vacation_ends.test.sql`:

```sql
begin;
create extension if not exists pgtap with schema extensions;
select plan(4);
-- 1 current vacation exposes its end date, 2 overlapping vacations expose the LATEST end,
-- 3 no vacation -> null, 4 on_vacation_now still true for a covered person

-- fixture: one member viewer + three people (no auth linkage needed on the people rows)
insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, raw_app_meta_data, encrypted_password, created_at, updated_at) values
  ('f0000000-0000-4000-8000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','viewer@test.local','{"full_name":"Viewer"}','{}','',now(),now());
update public.user_profiles set status='active' where id = 'f0000000-0000-4000-8000-000000000001';
insert into public.user_roles (user_id, role_key) values
  ('f0000000-0000-4000-8000-000000000001','member');

insert into public.people (id, full_name, weekly_capacity_hours) values
  ('f4000000-0000-4000-8000-000000000001','Vac Single', 40),
  ('f4000000-0000-4000-8000-000000000002','Vac Overlap', 40),
  ('f4000000-0000-4000-8000-000000000003','Vac None', 40);

insert into public.time_off (person_id, starts_on, ends_on, type) values
  ('f4000000-0000-4000-8000-000000000001', current_date - 2, current_date + 5, 'vacation'),
  ('f4000000-0000-4000-8000-000000000002', current_date - 3, current_date + 3, 'vacation'),
  ('f4000000-0000-4000-8000-000000000002', current_date - 1, current_date + 10, 'vacation');

set local role authenticated;
set local "request.jwt.claims" to '{"sub":"f0000000-0000-4000-8000-000000000001","role":"authenticated"}';

select is(
  (select vacation_ends_on from public.person_workload_rows where id = 'f4000000-0000-4000-8000-000000000001'),
  current_date + 5,
  'single current vacation: vacation_ends_on = its ends_on');
select is(
  (select vacation_ends_on from public.person_workload_rows where id = 'f4000000-0000-4000-8000-000000000002'),
  current_date + 10,
  'overlapping vacations: vacation_ends_on = max(ends_on)');
select is(
  (select vacation_ends_on from public.person_workload_rows where id = 'f4000000-0000-4000-8000-000000000003'),
  null,
  'no vacation today: vacation_ends_on is null');
select is(
  (select on_vacation_now from public.person_workload_rows where id = 'f4000000-0000-4000-8000-000000000001'),
  true,
  'on_vacation_now still true for a covered person');

select * from finish();
rollback;
```

- [ ] **Step 2: Run pgTAP to verify it fails**

Run: `npm run test:db`
Expected: `phase8_vacation_ends` FAILS with `column "vacation_ends_on" does not exist`. All pre-existing test files must still PASS.

- [ ] **Step 3: Write the migration**

Create `supabase/migrations/20260727000001_vacation_ends_on.sql`. The view body is IDENTICAL to `20260716000002_workload_views.sql` lines 50–97 except the `vac` lateral and the two vacation columns — copy it exactly, don't retype from memory:

```sql
-- Away with a return date: the employees list/detail show "Away until <date>", so the view must
-- expose WHEN the current vacation ends, not just that one exists. Same exposure rationale as
-- on_vacation_now (20260716000002): only type='vacation' rows are consulted -- the "view time_off"
-- policy already limits broad callers to vacation rows, so sick leave never surfaces here.
-- max(ends_on) handles overlapping vacation entries by reporting the latest return date.
--
-- create-or-replace can't insert a column mid-list, so drop + recreate (nothing else in the
-- schema depends on this view); security_invoker and grants restated below -- see the original
-- migration for why invoker rights are load-bearing (rates RLS gates cost/rate columns).

drop view public.person_workload_rows;

create view public.person_workload_rows
with (security_invoker = true)
as
select
  p.id,
  p.full_name,
  p.avatar_url,
  p.role_title,
  p.department,
  p.employment_type,
  p.weekly_capacity_hours,
  p.status,
  coalesce(alloc.allocation_pct, 0) as current_allocation_pct,
  coalesce(alloc.project_count, 0) as active_project_count,
  (vac.vacation_ends_on is not null) as on_vacation_now,
  vac.vacation_ends_on,
  coalesce(sk.skills, '{}'::text[]) as skills,
  cost.amount as internal_cost,
  billing.amount as billing_rate
from public.people p
left join lateral public.person_current_allocation(p.id) alloc on true
left join lateral (
  select max(t.ends_on) as vacation_ends_on
  from public.time_off t
  where t.person_id = p.id
    and t.type = 'vacation'
    and current_date between t.starts_on and t.ends_on
) vac on true
left join lateral (
  select array_agg(s.name order by s.name) as skills
  from public.person_skills ps
  join public.skills s on s.id = ps.skill_id
  where ps.person_id = p.id
) sk on true
left join lateral (
  select r.amount
  from public.rates r
  where r.person_id = p.id and r.rate_type = 'internal_cost'
  order by r.valid_from desc
  limit 1
) cost on true
left join lateral (
  select r.amount
  from public.rates r
  where r.person_id = p.id and r.rate_type = 'billing'
  order by r.valid_from desc
  limit 1
) billing on true;

grant select on public.person_workload_rows to authenticated;
grant select on public.person_workload_rows to service_role;
```

- [ ] **Step 4: Apply and verify tests pass**

Run: `npx supabase db reset` (applies all migrations + seed), then `npm run test:db`
Expected: ALL pgTAP files PASS, including the new `phase8_vacation_ends` (4/4). If `db reset` errors, fix the migration before proceeding.

- [ ] **Step 5: Regenerate database types**

Run: `npm run db:types`
Then run: `git diff src/lib/database.types.ts`
Expected diff: `person_workload_rows.Row` gains `vacation_ends_on: string | null` (and nothing unrelated disappears — if unrelated churn appears, the local DB is stale; re-run `npx supabase db reset` first).

- [ ] **Step 6: Verify the app still typechecks**

Run: `npm run lint && npm run build`
Expected: clean (no code consumes the column yet).

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/20260727000001_vacation_ends_on.sql supabase/tests/phase8_vacation_ends.test.sql src/lib/database.types.ts
git commit -m "feat: expose vacation_ends_on in person_workload_rows"
```

---

### Task 2: Away as one of three statuses (list + detail UI)

**Files:**
- Modify: `src/components/inline-edit-select.tsx` (add `display` override prop)
- Modify: `src/app/(app)/people/types.ts` (add `formatShortDate`)
- Modify: `src/app/(app)/people/people-table.tsx:387-412` (`StatusCell`)
- Modify: `src/app/(app)/people/[id]/person-header.tsx:10-13` (`availabilityBadge` away branch)
- Test: `tests/people-format.test.ts` (new)

**Interfaces:**
- Consumes: `row.vacation_ends_on: string | null` from Task 1; existing `InlineEditSelect` (`src/components/inline-edit-select.tsx`), `DotBadge`, `setPersonStatusAction`.
- Produces: `InlineEditSelect` accepts optional `display?: { label: string; dotClassName?: string }`; `formatShortDate(date: string): string` exported from `src/app/(app)/people/types.ts` (e.g. `"2026-08-03"` → `"3 Aug"`).

- [ ] **Step 1: Write the failing test for `formatShortDate`**

Create `tests/people-format.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { formatShortDate } from "@/app/(app)/people/types";

describe("formatShortDate", () => {
  it("formats an ISO date as day + short month", () => {
    expect(formatShortDate("2026-08-03")).toBe("3 Aug");
  });

  it("keeps single-digit days unpadded", () => {
    expect(formatShortDate("2026-12-09")).toBe("9 Dec");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- tests/people-format.test.ts`
Expected: FAIL — `formatShortDate` is not exported.

- [ ] **Step 3: Implement `formatShortDate`**

In `src/app/(app)/people/types.ts`, add below `formatMoney`:

```ts
/** "2026-08-03" -> "3 Aug" -- compact enough to live inside a status badge. */
export function formatShortDate(date: string) {
  return new Date(date).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- tests/people-format.test.ts`
Expected: PASS (2/2).

- [ ] **Step 5: Add the `display` override to `InlineEditSelect`**

In `src/components/inline-edit-select.tsx`, add the prop and use it in the closed-badge render. The dropdown itself is untouched — it still lists only the real stored options.

Add to the props type (after `ariaLabel`):

```ts
  /** Overrides what the CLOSED badge shows without changing the stored value or the dropdown
   * options -- for derived states layered over the stored one (e.g. "Away until 3 Aug" while
   * people.status stays 'active'). Opening the select still edits the real stored value. */
  display?: { label: string; dotClassName?: string };
```

Destructure `display` in the function signature, then change the `badge` construction (currently lines 56–69) to:

```tsx
  const active = options.find((o) => o.value === current);
  const dot = display?.dotClassName ?? active?.dotClassName;
  const badge = (
    <Badge
      variant={active?.badgeVariant ?? "outline"}
      className={cn(active?.badgeClassName, isPending && "opacity-60", className)}
    >
      {isPending && <Loader2Icon className="animate-spin" />}
      {dot && <span aria-hidden className={cn("size-1.5 shrink-0 rounded-full", dot)} />}
      {display?.label ?? active?.label ?? current}
      {/* Editability must be discoverable: editors always see a small chevron on the chip. */}
      {canEdit && <ChevronDownIcon aria-hidden className="size-3 opacity-50" />}
    </Badge>
  );
```

(Only the `dot` extraction and the two `display?.` fallbacks are new; everything else stays byte-identical.)

- [ ] **Step 6: Rewrite `StatusCell` in `people-table.tsx`**

Replace the whole `StatusCell` function (lines 387–412) and its leading comment with:

```tsx
// Exactly three statuses in this column: green Active, red Deactivated (stored, inline-
// editable), and amber Away (derived from a vacation covering today). Away REPLACES the shown
// status rather than stacking beside it, but only as a display override -- opening the select
// still edits the real stored status (earlier feedback: Away must never block status changes).
function StatusCell({ row, canManage }: { row: PersonListRow; canManage: boolean }) {
  if (!row.status) return <Badge variant="outline">—</Badge>;
  return (
    <InlineEditSelect
      // Keyed by status: InlineEditSelect seeds its optimistic state from `value` once, so an
      // EXTERNAL status change (the row menu's Deactivate/Activate) must remount it to re-sync.
      key={row.status}
      value={row.status}
      options={STATUS_OPTIONS}
      canEdit={canManage}
      display={
        row.on_vacation_now
          ? {
              label: row.vacation_ends_on
                ? `Away until ${formatShortDate(row.vacation_ends_on)}`
                : "Away",
              dotClassName: "bg-amber-400",
            }
          : undefined
      }
      ariaLabel={`${row.full_name} status`}
      onSave={(value) => setPersonStatusAction(row.id, value as "active" | "inactive")}
    />
  );
}
```

Update imports in the same file: add `formatShortDate` to the `import { EMPLOYMENT_TYPE_OPTIONS } from "./types"` line (i.e. `import { EMPLOYMENT_TYPE_OPTIONS, formatShortDate } from "./types";`). `DotBadge` stays imported — `ProjectsCell` still uses it. Also update the stale comment above `STATUS_OPTIONS` (lines 46–48): replace the sentence `"Away" is not a select option -- it's a derived vacation state rendered as a read-only DotBadge below.` with `"Away" is not a select option -- it's a derived vacation state shown via InlineEditSelect's display override in StatusCell.`

- [ ] **Step 7: Update the detail header away branch**

In `src/app/(app)/people/[id]/person-header.tsx`, change line 11 from:

```tsx
  if (person.on_vacation_now) return <DotBadge dotClassName="bg-amber-400">Away</DotBadge>;
```

to:

```tsx
  if (person.on_vacation_now)
    return (
      <DotBadge dotClassName="bg-amber-400">
        {person.vacation_ends_on ? `Away · until ${formatShortDate(person.vacation_ends_on)}` : "Away"}
      </DotBadge>
    );
```

and extend the existing `import { humanize } from "../types";` to `import { formatShortDate, humanize } from "../types";`.

- [ ] **Step 8: Full test + lint + build**

Run: `npm run test && npm run lint && npm run build`
Expected: all vitest suites PASS, lint clean, build clean.

- [ ] **Step 9: Verify visually**

With local Supabase running and seed data loaded (`npx supabase db reset` if unsure), run `npx next dev -p 3005`, open `http://localhost:3005/people`:
- Bella Kask (the seeded away person) shows ONE amber `● Away until <date>` chip in Status — no stacked Active badge.
- Clicking that chip still opens a dropdown offering Active/Deactivated; picking one saves without error and the chip stays "Away until …" (vacation still covers today).
- Her detail page header badge reads `● Away · until <date>`.
- The Away filter chip still finds her; sorting by Status is unchanged.

- [ ] **Step 10: Commit**

```bash
git add src/components/inline-edit-select.tsx src/app/(app)/people/types.ts src/app/(app)/people/people-table.tsx "src/app/(app)/people/[id]/person-header.tsx" tests/people-format.test.ts
git commit -m "feat: Away renders as its own status with vacation return date"
```

---

### Task 3: Avatars storage bucket + photo upload tile

**Files:**
- Create: `supabase/migrations/20260727000002_avatars_bucket.sql`
- Create: `supabase/tests/phase8_avatars_bucket.test.sql`
- Create: `src/components/person-avatar-picker.tsx` (client component — picker moves here)
- Modify: `src/components/person-avatar.tsx` (remove `PersonAvatarPicker`, export `PERSON_AVATAR_PRESET_META`)
- Modify: `src/app/(app)/people/person-form.tsx:14` (import path)
- Test: extend `tests/person-validation.test.ts`

**Interfaces:**
- Consumes: `createClient` from `@/lib/supabase/client` (browser Supabase client), `PERSON_AVATAR_PRESETS`/`isPersonAvatarPreset` from `@/lib/person-avatar-presets`, existing picker markup from `src/components/person-avatar.tsx:55-106`.
- Produces: `PersonAvatarPicker({ value, onChange, photoUrl })` — same signature as today, new home `@/components/person-avatar-picker`; `PERSON_AVATAR_PRESET_META: Record<PersonAvatarPreset, { label: string; icon: LucideIcon }>` exported from `@/components/person-avatar`. Storage bucket `avatars` (public read, authenticated insert, 2 MB / image-only caps enforced server-side by Storage).

- [ ] **Step 1: Write the failing pgTAP test**

Create `supabase/tests/phase8_avatars_bucket.test.sql`:

```sql
begin;
create extension if not exists pgtap with schema extensions;
select plan(3);

select is(
  (select public from storage.buckets where id = 'avatars'),
  true,
  'avatars bucket exists and is public-read');
select is(
  (select file_size_limit from storage.buckets where id = 'avatars'),
  2097152::bigint,
  'avatars bucket caps files at 2 MB');
select is(
  (select allowed_mime_types from storage.buckets where id = 'avatars'),
  array['image/*'],
  'avatars bucket only accepts images');

select * from finish();
rollback;
```

- [ ] **Step 2: Run pgTAP to verify it fails**

Run: `npm run test:db`
Expected: `phase8_avatars_bucket` FAILS (bucket row missing → nulls). Everything else PASSES.

- [ ] **Step 3: Write the bucket migration**

Create `supabase/migrations/20260727000002_avatars_bucket.sql`:

```sql
-- Person photo uploads (person form avatar picker). Public read: the resulting URL is stored
-- in people.avatar_url and rendered wherever that person appears -- exactly how the seeded
-- photo URLs already behave. Insert: any authenticated user -- the form is UX-gated to
-- manage_people and upsertPersonAction re-checks server-side; an orphaned upload by an
-- authenticated non-manager is harmless. Size/mime caps are enforced by Storage itself via the
-- bucket columns. No update/delete policies (YAGNI): replacing a photo uploads a new object
-- under a fresh uuid name.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 2097152, array['image/*'])
on conflict (id) do nothing;

create policy "public read avatars" on storage.objects
  for select using (bucket_id = 'avatars');
create policy "authenticated upload avatars" on storage.objects
  for insert to authenticated with check (bucket_id = 'avatars');
```

- [ ] **Step 4: Apply and verify tests pass**

Run: `npx supabase db reset && npm run test:db`
Expected: ALL pgTAP PASS including `phase8_avatars_bucket` (3/3).

- [ ] **Step 5: Extend the vitest validation test (fails only if schema breaks)**

In `tests/person-validation.test.ts`, add alongside the existing avatar cases:

```ts
it("accepts a Supabase storage public URL as avatar_url", () => {
  const url = "http://127.0.0.1:54321/storage/v1/object/public/avatars/0b0e846e-4c62-4f6e-9f0a-1e9d1a2b3c4d.png";
  const parsed = personSchema.parse({
    full_name: "Photo Person",
    employment_type: "employee",
    weekly_capacity_hours: 40,
    status: "active",
    avatar_url: url,
  });
  expect(parsed.avatar_url).toBe(url);
});
```

(Match the surrounding tests' fixture style — if they share a `base` object, reuse it.)

Run: `npm run test -- tests/person-validation.test.ts`
Expected: PASS immediately (the schema already accepts URLs) — this pins the contract the upload flow relies on.

- [ ] **Step 6: Split the picker into a client component with an upload tile**

`src/components/person-avatar.tsx` currently has no `"use client"` directive and `PersonAvatar` is rendered from server components (`person-header.tsx`) — adding upload state there would drag every avatar into the client bundle. So: **move** `PersonAvatarPicker` out.

6a. In `src/components/person-avatar.tsx`: delete the `PersonAvatarPicker` function (lines 55–106) and the imports that become unused with it (`cn`, `PERSON_AVATAR_PRESETS` — keep `DEFAULT_PERSON_AVATAR`/`isPersonAvatarPreset`, which `PersonAvatar` still uses); rename the module-private `PRESETS` record to an exported `PERSON_AVATAR_PRESET_META` (update the two usages inside `PersonAvatar`).

6b. Create `src/components/person-avatar-picker.tsx`:

```tsx
"use client";

import { useRef, useState } from "react";
import { CameraIcon, Loader2Icon } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { PERSON_AVATAR_PRESET_META } from "@/components/person-avatar";
import { PERSON_AVATAR_PRESETS, isPersonAvatarPreset } from "@/lib/person-avatar-presets";
import { cn } from "@/lib/utils";

const MAX_AVATAR_BYTES = 2 * 1024 * 1024;

const TILE_CLASS =
  "flex aspect-square items-center justify-center rounded-full border bg-muted/40 text-muted-foreground transition-colors hover:text-foreground";
const SELECTED_CLASS = "border-foreground/30 bg-muted text-foreground ring-2 ring-ring/30";

export function PersonAvatarPicker({
  value,
  onChange,
  photoUrl,
}: {
  value: string;
  onChange: (value: string) => void;
  /** The person's existing photo URL, when they have one -- rendered as a leading tile so
   * editing keeps the photo selectable instead of forcing a preset over it. */
  photoUrl?: string | null;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // One photo tile: a freshly uploaded photo (value is a non-preset URL) wins over the
  // pre-existing one, so uploading inside the edit form previews the replacement.
  const photo = !isPersonAvatarPreset(value) ? value : (photoUrl ?? null);

  async function onFile(file: File) {
    if (!file.type.startsWith("image/")) {
      setError("Choose an image file.");
      return;
    }
    if (file.size > MAX_AVATAR_BYTES) {
      setError("Image must be under 2 MB.");
      return;
    }
    setError(null);
    setUploading(true);
    try {
      const supabase = createClient();
      const ext = file.name.split(".").pop()?.toLowerCase() ?? "jpg";
      const path = `${crypto.randomUUID()}.${ext}`;
      const { error: uploadError } = await supabase.storage
        .from("avatars")
        .upload(path, file, { contentType: file.type });
      if (uploadError) {
        setError("Upload failed. Try again.");
        return;
      }
      onChange(supabase.storage.from("avatars").getPublicUrl(path).data.publicUrl);
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="space-y-1.5">
      <div className="grid grid-cols-8 gap-2">
        <button
          type="button"
          title="Upload photo"
          aria-label="Upload photo"
          disabled={uploading}
          onClick={() => inputRef.current?.click()}
          className={cn(TILE_CLASS, "disabled:opacity-50")}
        >
          {uploading ? <Loader2Icon className="size-5 animate-spin" /> : <CameraIcon className="size-5" />}
        </button>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void onFile(file);
            e.target.value = ""; // allow re-picking the same file after an error
          }}
        />
        {photo && (
          <button
            type="button"
            title="Photo"
            aria-label="Photo"
            aria-pressed={value === photo}
            onClick={() => onChange(photo)}
            className={cn(TILE_CLASS, "overflow-hidden", value === photo && SELECTED_CLASS)}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={photo} alt="" className="size-full object-cover" />
          </button>
        )}
        {PERSON_AVATAR_PRESETS.map((preset) => {
          const { icon: Icon, label } = PERSON_AVATAR_PRESET_META[preset];
          const selected = value === preset;
          return (
            <button
              key={preset}
              type="button"
              title={label}
              aria-label={label}
              aria-pressed={selected}
              onClick={() => onChange(preset)}
              className={cn(TILE_CLASS, selected && SELECTED_CLASS)}
            >
              <Icon className="size-5" />
            </button>
          );
        })}
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
```

6c. In `src/app/(app)/people/person-form.tsx`, change line 14 from
`import { PersonAvatarPicker } from "@/components/person-avatar";` to
`import { PersonAvatarPicker } from "@/components/person-avatar-picker";`.
(The `photoUrl` prop wiring at lines 82–87 is unchanged.)

6d. Search for any other `PersonAvatarPicker` imports (`grep -r "PersonAvatarPicker" src/`) and update them the same way — as of planning, `person-form.tsx` is the only consumer.

- [ ] **Step 7: Test + lint + build**

Run: `npm run test && npm run lint && npm run build`
Expected: all PASS/clean.

- [ ] **Step 8: Verify the upload end-to-end**

With local Supabase + `npx next dev -p 3005`:
- `/people` → "Add person": the avatar row shows the camera tile first, then the 6 presets.
- Upload a small image → spinner, then the photo appears as a selected tile; save; the new person's row shows the photo.
- Upload a >2 MB file → inline "Image must be under 2 MB.", form still usable.
- Edit a seeded person with a photo: their photo tile still appears and stays selected when untouched (regression check on the photo-preservation behavior).

- [ ] **Step 9: Commit**

```bash
git add supabase/migrations/20260727000002_avatars_bucket.sql supabase/tests/phase8_avatars_bucket.test.sql src/components/person-avatar.tsx src/components/person-avatar-picker.tsx src/app/(app)/people/person-form.tsx tests/person-validation.test.ts
git commit -m "feat: photo upload tile in person avatar picker (avatars storage bucket)"
```

---

### Task 4: Inline "+ Add" in Role/Team selects

**Files:**
- Create: `supabase/migrations/20260727000003_managed_options_insert.sql`
- Create: `supabase/tests/phase8_managed_options_insert.test.sql`
- Modify: `src/app/actions/managed-options.ts` (`addManagedOptionAction` permission)
- Create: `src/app/(app)/people/managed-option-combobox.tsx`
- Modify: `src/app/(app)/people/person-form-fields.tsx:77-118` (`ManagedOptionSelectField` uses the combobox)

**Interfaces:**
- Consumes: `addManagedOptionAction(kind: "role_title" | "team", value: string): Promise<{error: string} | {success: true; id: string}>` (existing, permission relaxed here); `requirePermission` from `@/lib/auth/require-permission`; Base UI `Combobox` from `@base-ui/react/combobox`.
- Produces: `ManagedOptionCombobox({ kind, value, onChange, options, ariaLabel })` with `kind: "role_title" | "team"`, `value: string | null`, `onChange: (v: string | null) => void`, `options: string[]`. `ManagedOptionSelectField`'s external signature (used by `person-form.tsx`) is unchanged.

- [ ] **Step 1: Write the failing pgTAP test**

Create `supabase/tests/phase8_managed_options_insert.test.sql`. Note: `project_manager` holds `manage_people` (see `phase4b_people_manage.test.sql`), `member` does not. A blocked DELETE under RLS affects 0 rows without erroring, so the delete check asserts row survival, not an exception:

```sql
begin;
create extension if not exists pgtap with schema extensions;
select plan(3);

insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, raw_app_meta_data, encrypted_password, created_at, updated_at) values
  ('a0000000-0000-4000-8000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','pm@test.local','{"full_name":"PM"}','{}','',now(),now()),
  ('a0000000-0000-4000-8000-000000000002','00000000-0000-0000-0000-000000000000','authenticated','authenticated','mem@test.local','{"full_name":"Mem"}','{}','',now(),now());
update public.user_profiles set status='active' where id::text like 'a0000000-%';
insert into public.user_roles (user_id, role_key) values
  ('a0000000-0000-4000-8000-000000000001','project_manager'),
  ('a0000000-0000-4000-8000-000000000002','member');

set local role authenticated;
set local "request.jwt.claims" to '{"sub":"a0000000-0000-4000-8000-000000000001","role":"authenticated"}';

select lives_ok(
  $$ insert into public.managed_options (kind, value) values ('role_title', 'Growth Designer') $$,
  'manage_people holder (PM) can insert a managed option');

-- PM is NOT admin: the admin-only write policy must not let them delete. RLS delete without a
-- matching policy silently affects 0 rows, so assert the row survives.
select lives_ok(
  $$ delete from public.managed_options where kind = 'role_title' and value = 'Growth Designer' $$,
  'PM delete attempt does not error');
select is(
  (select count(*)::int from public.managed_options where kind = 'role_title' and value = 'Growth Designer'),
  1,
  'row survives a non-admin delete attempt (delete stays admin-only)');

select * from finish();
rollback;
```

Also add a member-denied insert check if plan count allows — actually include it: bump `plan(3)` to `plan(4)` and append before `finish()`:

```sql
set local "request.jwt.claims" to '{"sub":"a0000000-0000-4000-8000-000000000002","role":"authenticated"}';
select throws_ok(
  $$ insert into public.managed_options (kind, value) values ('team', 'Rogue Team') $$,
  '42501', null,
  'plain member still cannot insert a managed option');
```

- [ ] **Step 2: Run pgTAP to verify it fails**

Run: `npm run test:db`
Expected: `phase8_managed_options_insert` FAILS on the first `lives_ok` (42501 — PM has no insert path yet). Others PASS.

- [ ] **Step 3: Write the policy migration**

Create `supabase/migrations/20260727000003_managed_options_insert.sql`:

```sql
-- Inline "+ Add" in the person form's Role/Team comboboxes: anyone who can use that form
-- (manage_people) may grow the vocabulary. Curation/removal stays admin-only via the existing
-- "admins manage managed_options" policy (20260721000001) -- policies are permissive (OR-ed),
-- so this just adds an insert path beside it.
create policy "people managers add managed_options" on public.managed_options
  for insert with check (public.has_permission(auth.uid(), 'manage_people'));
```

- [ ] **Step 4: Apply and verify tests pass**

Run: `npx supabase db reset && npm run test:db`
Expected: ALL pgTAP PASS including `phase8_managed_options_insert` (4/4).

- [ ] **Step 5: Relax the server action to `manage_people`**

In `src/app/actions/managed-options.ts`:
- Replace the import `import { requireAdmin } from "@/lib/auth/session";` with:

```ts
import { requireAdmin } from "@/lib/auth/session";
import { requirePermission } from "@/lib/auth/require-permission";
```

- In `addManagedOptionAction`, replace `const admin = await requireAdmin();` with `const current = await requirePermission("manage_people");` and update the audit call's `actorId: current.user.id, actorEmail: current.profile.email`. Rename remaining `admin.` references in that function to `current.`.
- `deleteManagedOptionAction` keeps `requireAdmin()` untouched.
- Update the file-top comment: writes are no longer uniformly admin-only — adds require `manage_people` (mirrors the new "people managers add managed_options" insert policy), deletes stay admin-only.

- [ ] **Step 6: Read the Base UI Combobox doc, then build `ManagedOptionCombobox`**

**First read** `node_modules/@base-ui/react/docs/react/components/combobox.md` — at minimum the Tailwind demo (top of file), the *creatable* example (~line 4854: shows an `items` array extended with a `{ creatable: string }` entry when the query matches nothing), and the Root props reference (~line 6491). That doc is authoritative; if any API below disagrees with it, follow the doc and adapt.

Create `src/app/(app)/people/managed-option-combobox.tsx`. Behavior contract (adapt markup to the real API from the doc; reuse the visual classes from `src/components/ui/select.tsx` — trigger-like input, `bg-popover` popup with `ring-1 ring-foreground/10 rounded-lg shadow-md`, item rows like `SelectItem`):

```tsx
"use client";

import { useMemo, useState, useTransition } from "react";
import { Combobox } from "@base-ui/react/combobox";
import { CheckIcon, ChevronDownIcon, Loader2Icon, PlusIcon, XIcon } from "lucide-react";
import { addManagedOptionAction } from "@/app/actions/managed-options";
import { cn } from "@/lib/utils";

type Item = { value: string; creatable?: boolean };

/** Single-select creatable combobox over an admin/PM-managed vocabulary (managed_options).
 * Typing filters; a query matching no existing option (case-insensitive) grows a trailing
 * `+ Add "…"` item that persists the value via addManagedOptionAction and selects it. The
 * Clear (X) affordance maps to null ("—" semantics of the old select). A saved value that has
 * since been removed from the list stays selectable (prepended), matching the old behavior. */
export function ManagedOptionCombobox({
  kind,
  value,
  onChange,
  options,
  ariaLabel,
}: {
  kind: "role_title" | "team";
  value: string | null;
  onChange: (value: string | null) => void;
  options: string[];
  ariaLabel: string;
}) {
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const baseOptions = useMemo(
    () => (value && !options.includes(value) ? [value, ...options] : options),
    [value, options]
  );

  const items = useMemo<Item[]>(() => {
    const trimmed = query.trim();
    const matches = baseOptions
      .filter((o) => o.toLowerCase().includes(trimmed.toLowerCase()))
      .map((o) => ({ value: o }));
    const exact = baseOptions.some((o) => o.toLowerCase() === trimmed.toLowerCase());
    return trimmed && !exact ? [...matches, { value: trimmed, creatable: true }] : matches;
  }, [baseOptions, query]);

  function select(item: Item | null) {
    setError(null);
    if (!item) {
      onChange(null);
      return;
    }
    if (!item.creatable) {
      onChange(item.value);
      return;
    }
    const previous = value;
    onChange(item.value); // optimistic -- reverted if the save fails
    startTransition(async () => {
      const result = await addManagedOptionAction(kind, item.value);
      if ("error" in result) {
        // "already exists" (unique violation) means the value is legitimately selectable --
        // keep it; anything else reverts.
        if (result.error !== "That entry already exists.") {
          onChange(previous);
          setError(result.error);
        }
      }
    });
  }

  /* Render per the Combobox doc: Root(items, value, onValueChange, inputValue/onInputValueChange,
     itemToStringValue for object items) > InputGroup(Input + Clear + Trigger) >
     Portal > Positioner > Popup > (Empty, List > Item). Creatable rows render
     `<PlusIcon /> Add "<text>"`; normal rows show an ItemIndicator check like SelectItem. */
  ...
}
```

Key wiring requirements regardless of exact API shape:
- Controlled selection: the combobox's selected value mirrors the `value` prop; selecting calls `select(item)`.
- Controlled input: `query` state via the doc's input-value props, cleared/reset on selection per the creatable example.
- Filtering is done by our `items` memo — disable built-in filtering (`filter={null}` per the doc) since items are precomputed.
- Clear affordance (`Combobox.Clear` or equivalent) → `select(null)`.
- While `isPending`, show `Loader2Icon` in the input group and disable the input.
- `error` renders as `<p className="text-xs text-destructive">{error}</p>` under the field.
- Every interactive part uses base-ui **render props** if customization is needed — never `asChild`.

- [ ] **Step 7: Swap `ManagedOptionSelectField` to the combobox**

In `src/app/(app)/people/person-form-fields.tsx`, replace the `ManagedOptionSelectField` body (lines 77–118) with:

```tsx
/** role_title/department are nullable text columns fed from managed lists (managed_options,
 * curated in Settings -> Lists). Rendered as a creatable combobox: manage_people holders can
 * add a missing value inline ("+ Add ..."), removal stays admin-only in Settings. A person's
 * saved value stays selectable even if an admin has since removed it from the list; clearing
 * maps back to null. */
export function ManagedOptionSelectField({
  control,
  name,
  label,
  options,
}: {
  control: Control<PersonInput>;
  name: "role_title" | "department";
  label: string;
  options: string[];
}) {
  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => (
        <FormItem>
          <FormLabel>{label}</FormLabel>
          <ManagedOptionCombobox
            kind={name === "role_title" ? "role_title" : "team"}
            value={field.value ?? null}
            onChange={(v) => field.onChange(v)}
            options={options}
            ariaLabel={label}
          />
          <FormMessage />
        </FormItem>
      )}
    />
  );
}
```

Add `import { ManagedOptionCombobox } from "./managed-option-combobox";` and delete the now-unused `NONE` constant (and the `Select*` imports if nothing else in the file uses them — `PersonEnumSelectField` still does, so keep those).

- [ ] **Step 8: Test + lint + build**

Run: `npm run test && npm run lint && npm run build`
Expected: all PASS/clean.

- [ ] **Step 9: Verify inline add end-to-end**

With local Supabase + `npx next dev -p 3005`, as the admin (or a PM) user:
- `/people` → "Add person" → Role title: typing filters the list; typing `Growth Designer` (not in the list) shows `+ Add "Growth Designer"`; choosing it selects the value with no error.
- Save the person; reopen the form → `Growth Designer` now appears as a normal option (revalidation refreshed `roleTitleOptions`).
- Settings → Lists shows `Growth Designer` under Role titles (and can remove it as admin).
- Team field behaves identically (kind `team`).
- Clearing via the X sets the field back to "—"/null and saves as null.
- Keyboard: arrow keys + Enter select; Escape closes.

- [ ] **Step 10: Commit**

```bash
git add supabase/migrations/20260727000003_managed_options_insert.sql supabase/tests/phase8_managed_options_insert.test.sql src/app/actions/managed-options.ts src/app/(app)/people/managed-option-combobox.tsx src/app/(app)/people/person-form-fields.tsx
git commit -m "feat: inline add for Role/Team managed options (manage_people can insert)"
```

---

### Task 5: Remove project Priority; "Status & Budget" section

Priority disappears from every project surface (create form, edit dialog, list column, plumbing). The DB column `projects.priority` (not null, default `'medium'`) and the `project_priority` enum STAY — no migration, mirroring how manual health was retired. `project_list_rows` also keeps its `priority` column; the TS field just goes unused.

**Files:**
- Modify: `tests/project-validation.test.ts` (priority expectations removed/inverted)
- Modify: `src/lib/validation/project.ts:12,80,111-123,125-141`
- Modify: `src/app/actions/projects.ts:275-305` (inline-field action)
- Modify: `src/app/(app)/projects/types.ts:7,77-84,111-126` (priority exports)
- Modify: `src/app/(app)/projects/projects-table.tsx` (flag column, sort, dots, name title)
- Modify: `src/app/(app)/projects/new/project-create-form.tsx:29-47,126-134`
- Modify: `src/app/(app)/projects/new/project-create-fields.tsx:207-235`
- Modify: `src/app/(app)/projects/[id]/overview-edit-form.tsx:44,147-160`
- Modify: `src/app/(app)/projects/[id]/overview-edit-fields.tsx:22-30`

**Interfaces:**
- Consumes: existing schemas/components listed above.
- Produces: `PROJECT_INLINE_FIELDS = ["status", "health"]`; `CreateProjectInput`/`EditProjectInput` without `priority`; `EnumSelectField` (both variants) `name` union without `"priority"`. Nothing downstream consumes priority after this task.

- [ ] **Step 1: Update the validation tests to expect no priority (failing first)**

In `tests/project-validation.test.ts`:
- Delete `priority: "high"` / `priority: "medium"` keys from the fixture objects (lines 14, 144, 172) — zod strips unknown keys by default, but the fixtures should reflect the real payload.
- Lines 43–52: rename the test to `"rejects an unknown status/health"` and delete the `priority: "urgent"` assertion inside it.
- Lines 126 and 132: delete the `projectInlineFieldSchema("priority")` assertions. Add in their place:

```ts
expect(PROJECT_INLINE_FIELDS).toEqual(["status", "health"]);
```

(import `PROJECT_INLINE_FIELDS` from `@/lib/validation/project` if not already imported).
- Lines 181–190: same rename/deletion for the create-schema variant.

Run: `npm run test -- tests/project-validation.test.ts`
Expected: FAIL — `PROJECT_INLINE_FIELDS` still contains `"priority"` (the new `toEqual` assertion), everything else PASSES.

- [ ] **Step 2: Strip priority from the validation module**

In `src/lib/validation/project.ts`:
- Delete line 12 (`export const PROJECT_PRIORITY_OPTIONS = ...`).
- Delete `priority: z.enum(PROJECT_PRIORITY_OPTIONS),` from `editProjectSchema` (line 80).
- `PROJECT_INLINE_FIELDS` (line 111) becomes `["status", "health"] as const`; delete the `case "priority":` branch from `projectInlineFieldSchema`.
- Delete `priority: z.enum(PROJECT_PRIORITY_OPTIONS).default("medium"),` from `createProjectSchema` (line 141).
- Fix the now-stale comments around lines 125–128: drop the parenthetical about priority not being asked on the create form; the surviving sentence should say status/health default to the same "healthy new project" values.

- [ ] **Step 3: Simplify the inline-field action**

In `src/app/actions/projects.ts` (lines ~296–305): the patch ternary loses its priority arm:

```ts
  const patch =
    field === "status"
      ? { status: parsed.data as EditProjectOutput["status"] }
      : { health: parsed.data as EditProjectOutput["health"] };
```

Update the doc comment above the action ("status/health/priority only" → "status/health only"). Then grep the file for any remaining `priority` reference — there must be none (create/edit actions build their payloads from the schema output, so they need no edits).

- [ ] **Step 4: Remove the priority exports from projects types**

In `src/app/(app)/projects/types.ts` delete: `ProjectPriority` (line 7), `PRIORITY_OPTIONS` (77), `PRIORITY_BADGE_CLASS` (79–85), `PRIORITY_INLINE_OPTIONS` (111–118), `PRIORITY_NAME_CLASS` (120–126) — each with its attached comment block. Nothing else imports them after Steps 5–7 (verify at Step 8 with a grep).

- [ ] **Step 5: Remove the flag column from the projects table**

In `src/app/(app)/projects/projects-table.tsx`:
- `SortKey` union (line 74): drop `"priority"`.
- Delete `PRIORITY_RANK` (77–78) and `PRIORITY_DOT_CLASS` (80–85) with their comments.
- Delete the `priority:` accessor entry (line 132).
- Delete the entire flag `<TableHead>` block (lines 160–186: the `w-8 px-1` head with the Flag sort button).
- Delete the priority-dot `<TableCell>` block (lines 243–254, including the "Priority dot… NO edge accent line" comment — move the NO-edge-accent-line warning onto the name cell so the hard-won rule survives:

```tsx
                {/* NO left edge accent line EVER -- tried twice (priority, then health),
                    rejected both times: the badges carry the signal. */}
                <TableCell>
```

- In the name `<Link>` (lines 264–274): remove the `title={row.priority ? … : undefined}` prop entirely.
- Remove now-unused lucide imports: `Flag`, `ChevronUp`, `ChevronDown` (pagination uses `ChevronLeft`/`ChevronRight` — keep those; `SortableHead` renders its own arrows).

- [ ] **Step 6: Create form — drop the field, retitle the section**

In `src/app/(app)/projects/new/project-create-form.tsx`:
- Remove `PROJECT_PRIORITY_OPTIONS` from the validation import (line 11).
- Delete `priority: "medium",` from `DEFAULT_VALUES` (line 41) and trim the comment above it (lines 29–32) to no longer mention priority.
- Section (lines 126–134): title `"Status & priority"` → `"Status & Budget"`, delete the Priority `EnumSelectField` line. Status + Budget type remain in the 2-col grid.

In `src/app/(app)/projects/new/project-create-fields.tsx`:
- `OPTION_DOT` (lines ~207–212): delete the `priority:` entry and drop priority from the comment above it.
- `EnumSelectField`'s `name` prop union (line ~234): `"status" | "health" | "budget_type"`.

- [ ] **Step 7: Edit dialog — drop the field, move Budget type in, retitle**

In `src/app/(app)/projects/[id]/overview-edit-form.tsx`:
- Remove `PROJECT_PRIORITY_OPTIONS` from the import (line 10) and `priority: project.priority,` from the defaults (line 44).
- Details section: remove the Budget type `EnumSelectField` from the details grid (line 149) — `ClientField` stays; collapse that `grid grid-cols-2` wrapper if `ClientField` is now its only child (make it a plain full-width field like `ClientContactField` below it).
- Section at lines 155–160 becomes:

```tsx
        <FormSection tone="amber" title="Status & Budget">
          <div className="grid grid-cols-2 gap-3">
            <EnumSelectField control={form.control} name="status" label="Status" options={PROJECT_STATUS_OPTIONS} />
            <EnumSelectField control={form.control} name="budget_type" label="Budget type" options={BUDGET_TYPE_OPTIONS} />
          </div>
        </FormSection>
```

In `src/app/(app)/projects/[id]/overview-edit-fields.tsx`: drop `"priority"` from the `EnumSelectField` `name` union (line ~30) and from the comment (line 22).

- [ ] **Step 8: Verify nothing references priority anymore**

Run: `grep -rn "priority" src/ --include="*.ts" --include="*.tsx" -i`
Expected remaining hits ONLY: `src/lib/database.types.ts` (generated — the DB column/enum legitimately still exist), `src/app/(app)/people/[id]/person-header.tsx` (the word "priority order" in a prose comment), and `src/components/inline-edit-select.tsx` (prose comment — update it in passing: "projects status/health/priority" → "projects status/health"). Any other hit is a missed removal — fix it.

- [ ] **Step 9: Test + lint + build**

Run: `npm run test && npm run lint && npm run build`
Expected: all PASS/clean (including the Step 1 assertions).

- [ ] **Step 10: Verify visually**

On `npx next dev -p 3005`:
- `/projects`: no flag column, no colored dots, no priority tooltip on names; sorting by other columns unchanged; gear menu lists no Priority entry (it never did — confirm nothing broke).
- `/projects/new` and the New-project dialog: section reads **"Status & Budget"** with Status + Budget type; no Priority select; creating a project works.
- Edit dialog on a project: details section has Client full-width, **"Status & Budget"** holds Status + Budget type; saving works and does not touch the stored priority value.

- [ ] **Step 11: Commit**

```bash
git add tests/project-validation.test.ts src/lib/validation/project.ts src/app/actions/projects.ts src/app/(app)/projects/types.ts src/app/(app)/projects/projects-table.tsx src/app/(app)/projects/new/project-create-form.tsx src/app/(app)/projects/new/project-create-fields.tsx "src/app/(app)/projects/[id]/overview-edit-form.tsx" "src/app/(app)/projects/[id]/overview-edit-fields.tsx" src/components/inline-edit-select.tsx
git commit -m "feat: remove project priority from UI; Status & Budget form section"
```

---

### Task 6: Repeatable period rows in "Add a person to this project"

**Files:**
- Modify: `src/lib/validation/project.ts:215-231` (`addMemberSchema` grows `periods`; `updateMemberSchema` decouples)
- Modify: `src/app/actions/project-members.ts:14-47` (`addMemberAction` multi-insert)
- Modify: `src/app/(app)/projects/[id]/people/add-person-form.tsx` (field-array UI)
- Test: `tests/project-validation.test.ts:446-468` (existing `addMemberSchema` block)

**Interfaces:**
- Consumes: `nullableText`/`nullableDate` helpers already in `src/lib/validation/project.ts`; `useFieldArray` pattern from `src/app/(app)/projects/milestones-editor.tsx:47`.
- Produces: `addMemberSchema` = `{ user_id: uuid, role_on_project: nullable text, periods: Array<{ starts_on: date|null, ends_on: date|null }> (min 1, per-row ends_on >= starts_on when both set) }`; `AddMemberInput`/`AddMemberOutput` update accordingly. `updateMemberSchema` KEEPS its current shape `{ role_on_project, starts_on, ends_on }` (defined standalone, no longer via `.omit`) — `updateMemberAction` and `member-edit-form.tsx` need no changes.

- [ ] **Step 1: Update the `addMemberSchema` tests (failing first)**

In `tests/project-validation.test.ts`, the `describe("addMemberSchema", ...)` block (lines 446–468): update the `validMember` fixture to the new shape and add period-rule cases:

```ts
const validMember = {
  user_id: "0b0e846e-4c62-4f6e-9f0a-1e9d1a2b3c4d",
  role_on_project: "Backend",
  periods: [{ starts_on: "2026-08-01", ends_on: "2026-09-30" }],
};

describe("addMemberSchema", () => {
  it("accepts a valid member with one period", () => {
    expect(addMemberSchema.safeParse(validMember).success).toBe(true);
  });

  it("accepts several periods, including open-ended ones", () => {
    expect(
      addMemberSchema.safeParse({
        ...validMember,
        periods: [
          { starts_on: "2026-08-01", ends_on: "2026-09-30" },
          { starts_on: "2026-11-01", ends_on: null },
        ],
      }).success
    ).toBe(true);
  });

  it("rejects an empty periods array", () => {
    expect(addMemberSchema.safeParse({ ...validMember, periods: [] }).success).toBe(false);
  });

  it("rejects a period ending before it starts", () => {
    expect(
      addMemberSchema.safeParse({
        ...validMember,
        periods: [{ starts_on: "2026-09-30", ends_on: "2026-08-01" }],
      }).success
    ).toBe(false);
  });

  it("rejects a non-uuid user", () => {
    expect(addMemberSchema.safeParse({ ...validMember, user_id: "not-a-uuid" }).success).toBe(false);
  });

  it("collapses a blank role to null", () => {
    const parsed = addMemberSchema.parse({ ...validMember, role_on_project: "" });
    expect(parsed.role_on_project).toBeNull();
  });

  it("rejects a malformed period date", () => {
    expect(
      addMemberSchema.safeParse({
        ...validMember,
        periods: [{ starts_on: "01/01/2026", ends_on: null }],
      }).success
    ).toBe(false);
  });
});
```

(Adapt the fixture keys/order to whatever the current block uses — keep any assertions not listed here that still apply.)

Run: `npm run test -- tests/project-validation.test.ts`
Expected: the new/updated `addMemberSchema` cases FAIL (schema still flat).

- [ ] **Step 2: Implement the schema change**

In `src/lib/validation/project.ts`, replace lines 217–231 with:

```ts
/** One membership period row. Both dates optional (open-ended engagements are normal), but a
 * closed range must not end before it starts. */
export const memberPeriodSchema = z
  .object({
    starts_on: nullableDate,
    ends_on: nullableDate,
  })
  .refine((p) => !p.starts_on || !p.ends_on || p.ends_on >= p.starts_on, {
    message: "End date can't be before start",
    path: ["ends_on"],
  });

/** Adds an existing user_profiles user as a project member -- one project_members row PER
 * period, so several engagement windows can be entered in one submit. */
export const addMemberSchema = z.object({
  user_id: z.uuid("Select a person"),
  role_on_project: nullableText(200),
  periods: z.array(memberPeriodSchema).min(1, "Add at least one period"),
});
export type AddMemberInput = z.input<typeof addMemberSchema>;
export type AddMemberOutput = z.output<typeof addMemberSchema>;

/** Editing an existing membership row can change role/dates but never which user it belongs
 * to -- that would just be a different membership. Deliberately NOT derived from
 * addMemberSchema anymore: an edit targets ONE period row. */
export const updateMemberSchema = z.object({
  role_on_project: nullableText(200),
  starts_on: nullableDate,
  ends_on: nullableDate,
});
export type UpdateMemberInput = z.input<typeof updateMemberSchema>;
export type UpdateMemberOutput = z.output<typeof updateMemberSchema>;
```

Run: `npm run test -- tests/project-validation.test.ts` → all PASS. (`npm run build` will fail until Steps 3–4 land — that's expected; don't commit yet.)

- [ ] **Step 3: Multi-insert in `addMemberAction`**

In `src/app/actions/project-members.ts` (lines 27–43), replace the single insert + audit with:

```ts
  const supabase = await createClient();
  // One project_members row per period -- since member periods (20260722000001) there is no
  // unique (project_id, user_id) constraint, so N rows for the same person are legal and each
  // is an independent engagement window.
  const { role_on_project, user_id } = parsed.data;
  const rows = parsed.data.periods.map((p) => ({
    project_id: projectId,
    user_id,
    role_on_project,
    starts_on: p.starts_on,
    ends_on: p.ends_on,
  }));
  const { error } = await supabase.from("project_members").insert(rows);
  if (error) return { error: "Add failed. Try again." };

  await writeAudit({
    action: "member.added",
    actorId: current.user.id,
    actorEmail: current.profile.email,
    resourceType: "project_member",
    resourceId: `${projectId}:${user_id}`,
    metadata: { project_id: projectId, user_id, period_count: rows.length },
  });
```

- [ ] **Step 4: Field-array UI in `AddPersonForm`**

In `src/app/(app)/projects/[id]/people/add-person-form.tsx`:
- Defaults become `{ user_id: fixedPerson?.user_id ?? "", role_on_project: null, periods: [{ starts_on: null, ends_on: null }] }`.
- Import `useFieldArray` from `react-hook-form`, `PlusIcon`/`XIcon` from `lucide-react`.
- Replace the single Starts/Ends grid (lines 113–136) with a `periods` field array. Pattern (mirror `milestones-editor.tsx` for row plumbing):

```tsx
        <div className="space-y-2">
          <FormLabel>Periods</FormLabel>
          {periodRows.fields.map((row, i) => (
            <div key={row.id} className="flex items-start gap-2">
              <FormField
                control={form.control}
                name={`periods.${i}.starts_on`}
                render={({ field }) => (
                  <FormItem className="flex-1">
                    <FormControl
                      render={
                        <Input type="date" aria-label={`Period ${i + 1} start`} {...field} value={field.value ?? ""} />
                      }
                    />
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name={`periods.${i}.ends_on`}
                render={({ field }) => (
                  <FormItem className="flex-1">
                    <FormControl
                      render={
                        <Input type="date" aria-label={`Period ${i + 1} end`} {...field} value={field.value ?? ""} />
                      }
                    />
                    <FormMessage />
                  </FormItem>
                )}
              />
              {periodRows.fields.length > 1 && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  aria-label={`Remove period ${i + 1}`}
                  onClick={() => periodRows.remove(i)}
                >
                  <XIcon />
                </Button>
              )}
            </div>
          ))}
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => periodRows.append({ starts_on: null, ends_on: null })}
          >
            <PlusIcon /> Add period
          </Button>
        </div>
```

with `const periodRows = useFieldArray({ control: form.control, name: "periods" });` after `useForm`.
- Pre-submit, drop EXTRA fully-blank rows (both dates empty) so an accidental "+ Add period" never blocks submit — but keep at least one row (a single all-blank row is a valid open-ended membership). Wrap submit like the create-project form does for milestones:

```tsx
  function handleFormSubmit(e: React.FormEvent<HTMLFormElement>) {
    const periods = form.getValues("periods") ?? [];
    const kept = periods.filter((p) => p.starts_on || p.ends_on);
    form.setValue("periods", kept.length > 0 ? kept : [{ starts_on: null, ends_on: null }]);
    form.handleSubmit(onSubmit)(e);
  }
```

and use `onSubmit={handleFormSubmit}` on the `<form>`.
- Update the component doc comment: it now adds one OR MORE periods per submit.

- [ ] **Step 5: Test + lint + build**

Run: `npm run test && npm run lint && npm run build`
Expected: all PASS/clean. (`member-edit-form.tsx` compiles untouched — `updateMemberSchema`'s shape didn't change.)

- [ ] **Step 6: Verify in the app**

On `npx next dev -p 3005`, a project → Team tab:
- "Add person": pick a person, add two period rows (one closed, one open-ended), submit → the member appears with BOTH periods listed.
- A period with end < start shows "End date can't be before start" on that row and blocks submit.
- "+ Add period" then submitting without touching the extra row succeeds (blank row dropped).
- Row menu "Add period" on an existing member: same repeatable rows work.
- Editing a single existing period row still works (regression).

- [ ] **Step 7: Commit**

```bash
git add tests/project-validation.test.ts src/lib/validation/project.ts src/app/actions/project-members.ts "src/app/(app)/projects/[id]/people/add-person-form.tsx"
git commit -m "feat: add multiple membership periods in one Add-person submit"
```

---

### Task 7: Fix — project description doesn't clamp to 3 lines

The clamp EXISTS (`src/app/(app)/projects/[id]/project-description.tsx`: `line-clamp-3` + measured Show more toggle, rendered at `[id]/layout.tsx:60`) but the user reports the detail page showing the full description unclamped. This is a DEBUGGING task — find the root cause before changing anything (superpowers:systematic-debugging).

**Files:**
- Investigate/Modify: `src/app/(app)/projects/[id]/project-description.tsx` (or wherever the root cause actually is)

**Interfaces:** unchanged — `ProjectDescription({ text: string })`.

- [ ] **Step 1: Reproduce**

Seed/edit a project description long enough to exceed 3 lines (the edit dialog's Notes/description textarea). Load `/projects/<id>` on `npx next dev -p 3005`. Confirm what the user sees: is the text unclamped? Is the "Show more" button missing, or present but non-functional? Check both a description WITH manual line breaks and one long unbroken paragraph.

- [ ] **Step 2: Root-cause**

Only proceed on evidence. Candidate checks, in order:
1. DevTools on the `<p>`: is `-webkit-line-clamp: 3` actually applied? If the utility classes are missing from the built CSS, the Tailwind side is the problem (e.g. the conditional `` `${expanded ? "" : "line-clamp-3"}` `` being transformed somewhere).
2. Is the rendered element even this component? (`data-*`/React DevTools) — the description may be rendered by a different code path than layout.tsx on the page the user looks at.
3. Does `scrollHeight > clientHeight + 1` evaluate false despite visual overflow (broken measurement → toggle hidden, but text should still clamp)?
4. Newline handling: with pre-line-less `<p>`, multi-paragraph text collapses to one flow — check whether the complaint is really "clamp broken" or "text renders as a wall" (fix must still satisfy: 3 clamped lines + toggle).

- [ ] **Step 3: Fix minimally at the root cause**

Whatever Step 2 finds, keep the contract: ≤3 rendered lines when collapsed, Show more ↔ Show less toggle only when the text actually overflows, no toggle for short text. Don't rewrite the component if a one-line fix suffices.

- [ ] **Step 4: Verify + regression-check**

- Long unbroken description: 3 lines + Show more → full text + Show less.
- Description with blank lines: same.
- Two-line description: no toggle.
- `npm run lint && npm run build` clean.

- [ ] **Step 5: Commit**

```bash
git add -A src/app/(app)/projects
git commit -m "fix: project description clamps to 3 lines again"
```

(Adjust the `git add` to the files actually touched.)

---

### Task 8: Final verification sweep

**Files:** none new.

- [ ] **Step 1: Full suite**

Run: `npm run test && npm run test:db && npm run lint && npm run build`
Expected: everything green.

- [ ] **Step 2: Cross-feature manual pass**

On `npx next dev -p 3005`:
- `/people`: three status colors only (green/amber/red), no stacked badges anywhere; Away rows show return dates; summary strip counts (available/busy/away) unchanged and consistent.
- Add a person with an uploaded photo AND a freshly-added role title in one flow — both persist and render in the list row.
- `/people/[id]` for an away person: header badge `Away · until <date>`.
- `/projects`: no priority anywhere (list, create form, edit dialog); both project forms show the "Status & Budget" section.
- A project Team tab: add a person with two periods in one submit; both appear.
- A project with a long description: clamped to 3 lines with a working Show more/Show less.

- [ ] **Step 3: Report deploy note**

Nothing here auto-deploys. When the user says ship: `npx vercel deploy --prod` + `npx supabase db push` (3 new migrations). Storage bucket migration must be pushed before the upload UI reaches prod users.
