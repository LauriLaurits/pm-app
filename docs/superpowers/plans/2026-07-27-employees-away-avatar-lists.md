# Employees: Away Dates, Avatar Upload, Inline Role/Team Add — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Employees list/detail show Away as one of exactly three statuses with a vacation return date; the person form supports photo upload; Role/Team dropdowns allow inline "+ Add" of new values.

**Architecture:** Three independent slices over the existing Supabase + Next.js App Router stack: (1) the `person_workload_rows` view grows a `vacation_ends_on` column consumed by the list status cell and detail header; (2) a public `avatars` Storage bucket receives browser uploads from the avatar picker; (3) a `managed_options` insert policy widens to `manage_people` and the Role/Team selects become creatable comboboxes.

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

### Task 5: Final verification sweep

**Files:** none new.

- [ ] **Step 1: Full suite**

Run: `npm run test && npm run test:db && npm run lint && npm run build`
Expected: everything green.

- [ ] **Step 2: Cross-feature manual pass**

On `npx next dev -p 3005`:
- `/people`: three status colors only (green/amber/red), no stacked badges anywhere; Away rows show return dates; summary strip counts (available/busy/away) unchanged and consistent.
- Add a person with an uploaded photo AND a freshly-added role title in one flow — both persist and render in the list row.
- `/people/[id]` for an away person: header badge `Away · until <date>`.

- [ ] **Step 3: Report deploy note**

Nothing here auto-deploys. When the user says ship: `npx vercel deploy --prod` + `npx supabase db push` (3 new migrations). Storage bucket migration must be pushed before the upload UI reaches prod users.
