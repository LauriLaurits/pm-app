# Client-Boundary Over-Serialization Audit — RSC Flight Payload / Browser Leaks

Date: 2026-07-29
Scope: every `"use client"` component (120 files) that receives DB-derived row data as props,
traced back to the server component/query that builds it. Goal: find fields present in the
serialized prop object that are (a) sensitive and (b) not rendered by that client component,
distinguishing "reaches unauthorized viewers" (worse) from "reaches authorized viewers beyond
what the UI shows" (still a finding, lower severity when RLS already nulls the field for
everyone else).

Prior art confirmed still holding: the `/credentials` index list CRITICAL (full DB rows incl.
`secret_id` shipped to every viewer) was fixed with an explicit `SafeCredentialRow` allowlist
mapped server-side — verified clean below. `activity-table.tsx`'s `SafeActivityItem` allowlist
also verified clean.

## Findings, ranked

| # | Severity | Component | Leaked fields | Reaches | RLS mitigates? |
|---|---|---|---|---|---|
| 1 | **HIGH** | `projects/[id]/credentials/credential-form-dialog.tsx`, `credential-actions.tsx` | `secret_id` (Vault ref UUID), `owner_id`, `type`, `created_at`, `updated_at`, `last_rotated_at` | Any `manage_credentials` holder on the project | Only at row level (RLS scopes *which* credential rows are visible), not column level — `secret_id` rides along on every visible row regardless |
| 2 | MEDIUM | `people/people-table.tsx`, `person-row-actions.tsx`, `person-form.tsx` | `internal_cost`, `billing_rate` | Any viewer with `manage_people` **and** `view_internal_cost` | Yes for everyone else (DB-nulled) — not mitigated for the finance-visibility population itself |
| 3 | MEDIUM | `projects/[id]/parts/parts-table.tsx` | `notes` (internal, unrendered, no form field at all); `part_billing.fixed_amount` / `hourly_rate` (only `client_price` is rendered) | `notes`: every viewer with `view_project` (broad). Rate fields: every `view_budget` holder, not just editors | `notes`: **no** — plain column select, no column-level RLS. Rate fields: yes for non-`view_budget` viewers (whole `part_billing` join nulled) |
| 4 | LOW | `clients/clients-table.tsx`, `client-row-actions.tsx` | `notes` (internal notes), legacy `contact_name`/`contact_email` | Every `view_clients` holder | Partial — same population can already read `notes` on the client detail page, so no new population reached, just earlier/redundant exposure |
| 5 | LOW | `reports/export-button.tsx` | `cost`, `marginPct` (real finance figures) in `PerformanceRow` | `manage`-adjacent viewers who load `/reports` with finance visibility | Yes — values are DB-nulled (`security_invoker` view) for non-`view_internal_cost` viewers, and every field is genuinely used by the CSV export (not an "unused field" leak, flagged only as a fragile pattern) |
| 6 | LOW | `projects/[id]/budget/part-budget-edit-dialog.tsx` | `PartBudgetRow`/`ProjectBudgetRow` typed as full view `Row` (not `Pick<>`) | N/A today — no active leak | Yes, fully — but the allowlist boundary is the SQL view, not app code; a future column added to the view without a matching `CASE WHEN` gate would silently start flowing through this untyped-allowlist prop |
| — | CLEAN | `credentials/credentials-index-list.tsx` | — | — | `SafeCredentialRow` allowlist confirmed excludes `secret_id`/`owner_id`/`notes` |
| — | CLEAN | `activity/activity-table.tsx` | — | — | `SafeActivityItem` allowlist confirmed; `metadata` jsonb never crosses, `summarizeMetadata()` also strips `/secret\|password\|token\|plaintext/i` keys defense-in-depth |
| — | CLEAN | `budgets/budget-portfolio-table.tsx` | `health` column unused but non-sensitive | — | `project_budget_rows` is `security_invoker`; finance columns DB-nulled per caller |
| — | CLEAN | `projects/projects-table.tsx`, `projects-cards.tsx` | `priority`, `progress` unused but non-sensitive | — | `project_list_rows` is an explicit allowlist view, not `select("*")`; budget/client_name correctly DB-nulled and both are rendered |
| — | CLEAN | `components/global-search.tsx` | — | — | `SearchResultItem` built field-by-field from explicit narrow `select()`s in `src/app/actions/search.ts`; normal RLS'd client, not service-role |
| — | CLEAN | `admin/users/users-table.tsx` | — | — | Explicit column select, `requireAdmin()`-gated page |
| — | CLEAN | `admin/access/*` (grants-table, user-picker-field, grant-form) | — | — | Explicit allowlists (`UserOption`, `GrantListItem`), admin-only page |
| — | CLEAN | `delegations/*` | — | — | `DelegationListItem` built field-by-field; RLS already scopes rows to `from_user`/`to_user`/admin before the query runs |
| — | CLEAN | `settings/sessions/sessions-list.tsx` | — | — | `list_my_sessions()` RPC returns exactly `id, created_at, updated_at, user_agent, ip`, own sessions only |
| — | CLEAN | Dashboard (`finance-card.tsx`, `team-card.tsx`, etc.) | `internal_cost`/`margin`/rate data touches server-side variables | — | **None of these files are `"use client"`** — data is rendered straight to HTML server-side, never serialized as JS props across a client boundary |
| — | CLEAN | Workload (`workload-timeline.tsx`, `workload-legend.tsx`) | — | — | Query explicitly selects `id, full_name, avatar_url, role_title, current_allocation_pct, on_vacation_now` only — `billing_rate`/`internal_cost` never even queried |
| — | CLEAN | `components/charts/*` | — | — | All four charts take narrow, chart-specific prop shapes; only caller (`reports/charts-section.tsx`, a server component) already passes computed aggregates |
| — | CLEAN | Project overview tab (`overview-edit-form.tsx`, `milestones-card.tsx`, `project-danger-zone.tsx`, `status-update-actions.tsx`) | — | — | Edit form gated behind real `has_permission('edit_project', ...)`; `OverviewNotesCard` (risks/internal_notes/client_notes) is a **server component**, rendered straight to HTML, never crosses into client JS |
| — | CLEAN | Project people tab (`candidate-row.tsx`, `add-person-form.tsx`, `member-edit-form.tsx`) | — | — | Narrow `CandidateOption`/`MemberRow` types; `project_members` has no finance columns to begin with |
| — | CLEAN | `people/[id]` detail (`FinancialsCard`, `PersonHeader`) | — | — | Both server components; `FinancialsCard` only renders (and only receives real numbers) when `internal_cost`/`billing_rate` are non-null, which is itself `rates` table RLS (`view_internal_cost`) |
| — | CLEAN | `people/[id]` time forms | — | — | `time_entries`/`time_off` tables have no rate/cost columns |
| — | CLEAN | Auth forms (`login-form.tsx`, `signup-form.tsx`, `azure-button.tsx`) | — | — | No server data passed at all |
| — | CLEAN | `NEXT_PUBLIC_*` env vars | — | — | Only `NEXT_PUBLIC_SITE_URL`/`NEXT_PUBLIC_SUPABASE_URL`/`NEXT_PUBLIC_SUPABASE_ANON_KEY` — anon key is meant to be public (protected by RLS); `SUPABASE_SERVICE_ROLE_KEY` is correctly un-prefixed in `.env.example` |

---

## #1 — HIGH: `secret_id` (Vault reference) leaks via the project-scoped Credentials tab

This is the same field class as the already-fixed CRITICAL (`/credentials` index list), reappearing
through a different route that the earlier fix didn't cover.

- `src/app/(app)/projects/[id]/credentials/types.ts:8` —
  `export type DisplayCredentialRow = CredentialRow & { owner_name: string | null };` where
  `CredentialRow = Database["public"]["Tables"]["credentials"]["Row"]` (full table row). Lines
  6-7 explicitly comment: *"secret_id is present on CredentialRow ... but must never be read for
  display anywhere in this tab"* — the author knew the field was there and unused, but didn't
  strip it.
- `src/app/(app)/projects/[id]/credentials/page.tsx:39-44` — `supabase.from("credentials").select("*")`.
- `page.tsx:54-57` — `rows: DisplayCredentialRow[] = credentials.map((c) => ({ ...c, owner_name }))`
  — full spread, not an allowlist.
- `credentials-list.tsx:82-83` — passes the full `credential` object into two `"use client"` components:
  - `credential-form-dialog.tsx:16-22` — `CredentialFormDialog({ credential }: { credential?: DisplayCredentialRow })`
  - `credential-actions.tsx:9-15` — `CredentialDeleteButton({ credential }: { credential: DisplayCredentialRow })`
- `CredentialFormDialog` forwards the whole object again into `credential-edit-form.tsx:34-48`'s
  `toDefaults()`, which only actually reads `name, username, related_url, environment,
  visibility, notes, expires_at, id`.

Unused-but-present in the serialized props: **`secret_id`**, `owner_id`, `type`, `created_at`,
`updated_at`, `last_rotated_at`.

**Why HIGH not CRITICAL:** verified (`src/app/actions/credential-reveal.ts:38-51`) that
`revealCredentialAction` resolves the secret server-side by `credentialId` through the
`reveal_credential_secret` RPC — it never trusts a client-supplied `secret_id`, and no RPC in the
repo accepts one. So there is no direct exploit path today. It's HIGH rather than MEDIUM because
(a) it's the exact field/class that was already a CRITICAL once, (b) the code's own comment shows
the team considers this an absolute rule ("must never be read for display anywhere in this tab"),
and (c) it reaches a real, non-trivial population (every `manage_credentials` holder on the
project, not just `reveal_credential` holders — `page.tsx:22-26`'s own comment distinguishes the
two).

**Fix:** build a `DisplayCredentialRow`-style allowlist analogous to the index list's
`SafeCredentialRow` — `Pick<CredentialRow, "id"|"name"|"username"|"related_url"|"environment"|
"visibility"|"notes"|"expires_at"> & { owner_name }` — map it server-side in `page.tsx`, and stop
spreading the raw `credentials` row into `CredentialFormDialog`/`CredentialDeleteButton`/
`CredentialEditForm`.

---

## #2 — MEDIUM: People list ships `internal_cost`/`billing_rate` for every employee (the case flagged in the brief)

- `src/app/(app)/people/page.tsx:31` — `supabase.from("person_workload_rows").select("*")`.
  View definition (`supabase/migrations/20260727000001_vacation_ends_on.sql:13-60`) LEFT JOIN
  LATERALs into `rates` for `internal_cost`/`billing_rate` (lines 47-59).
- `src/app/(app)/people/types.ts:12` — `PersonListRow = Omit<PersonWorkloadRow,"id"> & {id:string; email:string|null}`
  — a raw passthrough of the view, not an allowlist.
- `page.tsx:69-71` builds `rows` via `{...r, email}` and passes the whole array into
  `<PeopleTable rows={rows} ... />` (`page.tsx:120-127`), and per-row into
  `<PersonRowActions person={row} .../>` (`people-table.tsx:308-313`) — unconditionally, not
  gated by `canManage`.
- `people-table.tsx` (lines 367-474) renders `full_name, avatar_url, role_title,
  employment_type, status, current_allocation_pct, weekly_capacity_hours, active_project_count,
  on_vacation_now, vacation_ends_on`. Never rendered on the list: `department`, `skills`, and —
  the sensitive ones — **`internal_cost`, `billing_rate`**.
- `PersonFormDialog` → `person-form.tsx` `toDefaults()` extracts only 7 fields from the same
  full row; the two rate fields ride along unused there too.

RLS (`"finance reads rates"`, `supabase/migrations/20260715000004_people_workload.sql:159`,
requires `view_internal_cost`) correctly nulls both fields for everyone without that permission
— confirmed directly. The leak is specifically to viewers who hold both `manage_people` (to see
the list at all in its editable form) and `view_internal_cost`: they get every employee's real
cost/rate numbers shipped into the browser bundle on a page whose UI never shows them, a much
wider blast radius than the person-detail page's `FinancialsCard` (server-rendered, one person
at a time, only when non-null).

**Fix:** select an explicit column list in `page.tsx:31` excluding `internal_cost`/`billing_rate`
for the list view (or map to a `SafePersonListRow` before the `PeopleTable`/`PersonRowActions`
call). Keep the full `PersonWorkloadRow` only for the server-rendered detail-page card.

---

## #3 — MEDIUM: Project Parts tab — internal `notes` (no RLS gate at all) + unrendered billing internals

- `src/app/(app)/projects/[id]/parts/page.tsx:44-45` —
  `supabase.from("project_parts").select("*, part_billing(client_price, fixed_amount, hourly_rate, currency)")`.
- `project_parts` RLS (`supabase/migrations/20260715000003_projects.sql:217`) is
  `has_permission(..., 'view_project', project_id)` — **row-level only, no column masking** —
  so `notes` (`Database["public"]["Tables"]["project_parts"]["Row"].notes`) comes back verbatim
  for every project viewer.
- `notes` is never rendered in `parts-table.tsx` (only `part.description` is, line 134-136), and
  has **no form field at all** in `part-form-fields.tsx` (grepped — zero matches) despite
  `part-form.tsx:32` seeding `notes: part?.notes ?? null` into form defaults. It is pure dead
  weight in the client bundle, silently round-tripped on save.
- `part_billing.fixed_amount`/`hourly_rate` are fetched for every row and passed into
  `parts-table.tsx`'s `parts` prop, but the table itself only ever renders `client_price`
  (line 182). Editors see them inside `PartFormDialog` when editing a specific part — fine — but
  the full `PartRow[]` (all rate/cost fields, for every part) is already sitting in the page's
  client-side props for **every** `view_budget` holder as soon as the tab loads, not just when a
  dialog opens.

RLS mitigates the rate fields for non-`view_budget` viewers (`part_billing` join returns null
entirely — confirmed via the code's own comment at `parts-table.tsx:179-181` and the RLS policy).
It does **not** mitigate `notes` at all — that field has no permission gate anywhere.

**Fix:** drop `notes` from the parts-list query (or the `PartRow` type) since it isn't used by
any current UI; narrow `part_billing` fields passed to `PartsTable` to `client_price` only,
fetching `fixed_amount`/`hourly_rate` inside `PartFormDialog` on open instead.

---

## #4 — LOW: Clients list ships internal `notes` unrendered

- `src/app/(app)/clients/page.tsx:33` — `supabase.from("clients").select("*")`.
- `src/app/(app)/clients/types.ts:11-16` — `ClientListRow = ClientRow & {...}` — raw spread, not
  an allowlist.
- `clients-table.tsx` renders `name`, `contacts[]`, `project_names`, `active_count` (lines
  145-300); never renders `notes` or the legacy `contact_name`/`contact_email` columns.
- `"view clients"` RLS (`supabase/migrations/20260715000003_projects.sql:204`) requires only
  `view_clients` (granted to `project_manager`/`finance` globally) — same population can already
  read `notes` on the client detail page (`clients/[id]/page.tsx:308`), so this is early/redundant
  exposure rather than a new disclosure.

**Fix:** map to a `SafeClientListRow` with `id, name, project_count, project_names, active_count,
contacts`; load `notes`/legacy contact fields only inside the edit dialog.

---

## #5 / #6 — LOW: fragile-but-currently-safe patterns

- `reports/export-button.tsx` receives `PerformanceRow[]` with real `cost`/`marginPct` — every
  field is genuinely used by the CSV export and DB-gated via `project_budget_rows`
  (`security_invoker`), so this is not an "unused field" leak. Flagged only because a future
  field added to `PerformanceRow` would ship to the browser with no additional gate to catch it.
- `projects/[id]/budget/part-budget-edit-dialog.tsx` types its `part` prop as the full
  `PartBudgetRow`/`ProjectBudgetRow` view `Row` rather than `Pick<>`. Currently safe because the
  *view* is the allowlist boundary (finance columns are `NULL` per caller via `security_invoker`
  re-run RLS), but the app-layer type doesn't independently enforce that — a future column added
  to the view without matching `CASE WHEN` gating would flow straight through.

Neither needs urgent action; both are documented as "narrow the type to `Pick<>` for
defense-in-depth" hardening, not exploitable today.

---

## Method notes / what was verified directly (not just cited from sub-audits)

- Manually confirmed `people/page.tsx:31` (`select("*")` on `person_workload_rows`) and the view
  definition's `rates` LATERAL joins + `"finance reads rates"` RLS policy.
- Manually confirmed the credentials-tab `secret_id` leak end-to-end: `types.ts` →
  `page.tsx` → `credentials-list.tsx` → `credential-form-dialog.tsx` / `credential-actions.tsx`,
  reading every hop.
- Manually confirmed `project_parts`/`part_billing` query and RLS policy (row-level only, no
  column masking) via `supabase/migrations/20260715000003_projects.sql`.
- Manually confirmed dashboard cards (`finance-card.tsx`, `team-card.tsx`, etc.) carry **no**
  `"use client"` directive — full-row finance/people data touches server-only code paths and
  never crosses into a client bundle, regardless of what those server components hold internally.
- Manually confirmed `admin/access/*`, `admin/users/users-table.tsx`, `delegations/*`,
  `settings/sessions/sessions-list.tsx` (incl. the `list_my_sessions()` RPC's exact return
  columns), `person-avatar-picker.tsx`, `managed-option-combobox.tsx`,
  `project-danger-zone.tsx`, `overview-edit-form.tsx`/`overview-notes.tsx`,
  `client-quick-create-dialog.tsx`, `project-create-form.tsx`, `login-form.tsx`, and
  `.env.example` (no service-role key under `NEXT_PUBLIC_`).
- Findings #1 (credentials tab), the projects/clients/people list rows (finding #2), activity
  feed, budgets portfolio, and global search were independently corroborated by dedicated
  sub-audits covering `people`/`clients`/`projects` lists, `budgets`/`activity`/`search`/
  `credentials`, the project budget tab, and `dashboard`/`reports`/`workload`/`charts`/detail-page
  forms respectively — the people-list finding (#2) was found independently by two separate
  passes, increasing confidence it's real and not a false positive.
