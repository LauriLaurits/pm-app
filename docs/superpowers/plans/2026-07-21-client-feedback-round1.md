# Client feedback round 1 (Aleksei, 2026-07-21) — plan

Source: first real-user feedback on the live demo. Execute in order; every view adopts the
projects-page element language (sortable headers, dot badges, avatar tints, twin bar cells,
hover actions, quiet empty states). Do NOT touch nav sections beyond these ("Ära ülejäänute
menüüpunktidega praegu kiirusta").

## P0 — Performance ("veidi aeglane, datat pole — võiks olla palju kiirem")
- Parallelize the sequential Supabase round trips in every server page (projects/page.tsx has
  ~7 awaits in series: has_permission, options, rows, editable, links, parts, clients).
  `Promise.all` the independent ones. Same audit for people/clients/dashboard/detail pages.
- Check Vercel region vs Supabase eu-central-1 (set Vercel function region to fra1 if not).

## P1 — People → "Employees"
List view:
- Rename nav + page title People → Employees (nav label, breadcrumbs, headings).
- Columns REMOVED: Department, Projects, Cost, Billing, Allocation.
- Type (employee/contractor/freelance) moves INTO the person cell subline (name · role · type).
- Status colors: green Active, yellow Away (on vacation now), red Deactivated (inactive) —
  dot-badge style like projects status.
- Capacity header → "Capacity (per week)", value plain hours ("40 h").
- Action buttons smaller (size xs / icon-only pills).
- HIDE the filter row (Departments, Availability, Skills) — keep search only? Feedback says
  hide the three dropdowns for now (code stays, render removed).
New-person form:
- Role title → select fed from a managed list; Department → renamed "Team", select from managed
  list. Lists managed in Settings → new `option_lists` storage (migration: table
  `managed_options(kind text, value text, sort int)` seeded from existing distinct values;
  admin-editable UI in Settings).
Detail view:
- Remove the Capacity block.

## P2 — Clients
List:
- Show ALL contact persons per client (needs P2a schema).
- Search input (client name, contact name, email) — same chip style as projects.
- Projects count badge: tooltip lists project names.
New/edit:
- P2a MIGRATION: `client_contacts(id, client_id fk, name, email, phone, role, is_primary)`;
  backfill from clients.contact_* columns; keep old columns for now (views read new table).
  Multiple contacts per client; manage in client form (repeatable rows).

## P3 — Projects create/edit form
- REMOVE ALL help texts app-wide ("abitekstid" — FormSection descriptions + per-field why
  texts). FormSection keeps title + tone dot only. Sweep delegation/grant/person/client forms too.
- Project manager: select listing ALL PMs in the system, default = current user.
- Client: can also attach client CONTACT person(s) per project (depends on P2a; add
  `projects.client_contact_id` fk or join table if multiple).
- "Status & priority" section → "Status & Budget": Status + Budget type only (priority stays
  editable in list/detail, out of the create form).
- Tags: comma input bug — reproduce and fix TagsField.

## P4 — Milestones ("verstapostid")
- MIGRATION: `project_milestones(id, project_id fk, name, due_on date, kind text check in
  ('start','end','milestone'), done bool default false, sort)`. A start-kind milestone feeds
  the project's start date, end-kind feeds deadline (derive in queries; keep columns synced via
  action for compatibility).
- Create-form Timeline block → milestone list editor (add rows: name + date + kind).
- Overview: milestones block, chronological, with done/overdue states.
- Health/deadline derivations read the end milestone when set.

## P5 — Project detail People → "Team"
- Tab + headings rename; "Role on project" → "Role"; REMOVE Days-per-week (allocation) from the
  add form AND the members table column.
- Multiple membership periods per person (dev comes and goes): drop unique(project_id,user_id)
  constraint (migration), allow several rows with start/end; UI lists periods; add-person can
  add a new period for an existing member.
- NOTE: allocation/assignments plumbing stays (workload uses it) but is no longer set from this
  tab — decide later whether workload moves to periods.

## P6 — Project Overview polish
- Description: same level as title area, clamp to 3 lines, expandable (collapsible).
- REMOVE the health + priority badges from the detail header row (feedback: not needed there;
  status stays).
- Milestones block (from P4) chronological on Overview.
- Parts stays (= project stages; answer given); Budgets<->parts relationship: THINK ONLY, no
  build yet.

## Answers to give (no code)
- Credentials security: secrets live in Supabase Vault (encrypted at rest), reveal is
  permission-gated + audited + auto-remask; never stored client-side.

## Element-language parity checklist (apply while touching each view)
- Sortable headers w/ visible chevrons; dot-badge statuses; avatar tints/photos; hover-revealed
  row actions; em-dash empty states; tabular numerals; pagination at 10 when lists grow.
