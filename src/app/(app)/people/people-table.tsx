"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, XIcon } from "lucide-react";
import { setPersonStatusAction } from "@/app/actions/people";
import { PersonAvatar } from "@/components/person-avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DotBadge } from "@/components/dot-badge";
import { InlineEditSelect, type InlineEditOption } from "@/components/inline-edit-select";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { SortableHead } from "@/components/data-table/sortable-head";
import { useSort, type SortAccessors } from "@/components/data-table/use-sort";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { utilizationBarClasses, utilizationLabel } from "@/lib/workload";
import { EmploymentTypeBadge } from "./employment-type-badge";
import { EMPLOYMENT_TYPE_OPTIONS } from "./types";
import type { EmploymentType, PersonListRow } from "./types";
import { PersonRowActions } from "./person-row-actions";

const PAGE_SIZE = 10;

type SortKey = "name" | "status" | "workload" | "projects";

// Away (on vacation now) sorts and filters as its own state between Active and Deactivated.
function derivedStatus(r: PersonListRow): "active" | "away" | "inactive" {
  if (r.on_vacation_now) return "away";
  return r.status === "inactive" ? "inactive" : "active";
}

const ACCESSORS: SortAccessors<PersonListRow, SortKey> = {
  name: (r) => r.full_name,
  status: (r) => derivedStatus(r),
  workload: (r) => r.current_allocation_pct,
  projects: (r) => r.active_project_count,
};

// Same pill-less dot language as the projects list status column (see STATUS_INLINE_OPTIONS in
// projects/types.ts): green Active, red Deactivated. "Away" is not a select option -- it's a
// derived vacation state rendered as a read-only DotBadge below.
const STATUS_OPTIONS: InlineEditOption[] = [
  {
    value: "active",
    label: "Active",
    badgeVariant: "outline",
    badgeClassName: "border-transparent bg-transparent px-0 font-normal text-foreground/80",
    dotClassName: "bg-emerald-500",
  },
  {
    value: "inactive",
    label: "Deactivated",
    badgeVariant: "outline",
    badgeClassName: "border-transparent bg-transparent px-0 font-normal text-foreground/80",
    dotClassName: "bg-red-500",
  },
];

/** Thin vertical rule between filter chips -- separates them without adding visual weight. */
function FilterDivider() {
  return <span aria-hidden className="h-4 w-px shrink-0 bg-border" />;
}

const ALL = "__all__";

type StatusFilter = "active" | "away" | "inactive";
const STATUS_FILTER_LABEL: Record<StatusFilter, string> = {
  active: "Active",
  away: "Away",
  inactive: "Deactivated",
};
const STATUS_FILTER_DOT: Record<StatusFilter, string> = {
  active: "bg-emerald-500",
  away: "bg-amber-400",
  inactive: "bg-red-500",
};
const STATUS_FILTER_OPTIONS: StatusFilter[] = ["active", "away", "inactive"];

type CapacityFilter = "under40" | "full40";
const CAPACITY_FILTER_LABEL: Record<CapacityFilter, string> = {
  under40: "Under 40 h",
  full40: "40 h",
};
const CAPACITY_FILTER_OPTIONS: CapacityFilter[] = ["under40", "full40"];

export function PeopleTable({
  rows,
  canManage,
  roleTitleOptions,
  teamOptions,
  roleFilterOptions,
  projectNamesByPersonId,
}: {
  rows: PersonListRow[];
  canManage: boolean;
  roleTitleOptions: string[];
  teamOptions: string[];
  /** Distinct role_title values present in the list (filter facet) -- distinct from
   * roleTitleOptions, the Settings-curated vocabulary that feeds the person FORM. */
  roleFilterOptions: string[];
  /** Visible active-project names per person (RLS-scoped -- may list fewer than the count). */
  projectNamesByPersonId: Record<string, string[]>;
}) {
  const router = useRouter();
  // Client-side search + facets (list is small): name/role text, derived status, role title,
  // employment type, weekly capacity.
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<StatusFilter | typeof ALL>(ALL);
  const [role, setRole] = useState<string>(ALL);
  const [type, setType] = useState<EmploymentType | typeof ALL>(ALL);
  const [capacity, setCapacity] = useState<CapacityFilter | typeof ALL>(ALL);
  const [page, setPage] = useState(1);

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase();
    return rows.filter((row) => {
      if (
        query &&
        !(row.full_name ?? "").toLowerCase().includes(query) &&
        !(row.role_title ?? "").toLowerCase().includes(query)
      ) {
        return false;
      }
      if (status !== ALL && derivedStatus(row) !== status) return false;
      if (role !== ALL && row.role_title !== role) return false;
      if (type !== ALL && row.employment_type !== type) return false;
      if (capacity === "under40" && (row.weekly_capacity_hours ?? 0) >= 40) return false;
      if (capacity === "full40" && (row.weekly_capacity_hours ?? 0) < 40) return false;
      return true;
    });
  }, [rows, q, status, role, type, capacity]);

  const { rows: sorted, sort, toggle } = useSort(filtered, ACCESSORS, { key: "name", dir: "asc" });

  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageRows = sorted.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  const hasActiveFilters = Boolean(q.trim()) || status !== ALL || role !== ALL || type !== ALL || capacity !== ALL;

  function clearAll() {
    setQ("");
    setStatus(ALL);
    setRole(ALL);
    setType(ALL);
    setCapacity(ALL);
  }

  // Same chip language as the projects filters: muted wash at rest, solid surface when active.
  const chip = (active: boolean) =>
    active
      ? "rounded-full border-border bg-background shadow-xs"
      : "rounded-full border-transparent bg-muted/60 shadow-none";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Input
          placeholder="Search employees or roles…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="mr-3 w-84 rounded-full border-transparent bg-muted/60 shadow-none"
        />
        <Select value={status} onValueChange={(v) => setStatus((v as StatusFilter | typeof ALL) ?? ALL)}>
          <SelectTrigger className={chip(status !== ALL)}>
            <SelectValue>
              {(v: string) =>
                v === ALL ? (
                  "All statuses"
                ) : (
                  <span className="flex items-center gap-2">
                    <span
                      aria-hidden
                      className={`size-1.5 shrink-0 rounded-full ${STATUS_FILTER_DOT[v as StatusFilter]}`}
                    />
                    {STATUS_FILTER_LABEL[v as StatusFilter]}
                  </span>
                )
              }
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All statuses</SelectItem>
            {STATUS_FILTER_OPTIONS.map((s) => (
              <SelectItem key={s} value={s}>
                <span className="flex items-center gap-2">
                  <span aria-hidden className={`size-1.5 shrink-0 rounded-full ${STATUS_FILTER_DOT[s]}`} />
                  {STATUS_FILTER_LABEL[s]}
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <FilterDivider />
        {roleFilterOptions.length > 0 && (
          <>
            <Select value={role} onValueChange={(v) => setRole(v ?? ALL)}>
              <SelectTrigger className={chip(role !== ALL)}>
                <SelectValue>{(v: string) => (v === ALL ? "All roles" : v)}</SelectValue>
              </SelectTrigger>
              <SelectContent className="min-w-52">
                <SelectItem value={ALL}>All roles</SelectItem>
                {roleFilterOptions.map((r) => (
                  <SelectItem key={r} value={r}>
                    {r}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <FilterDivider />
          </>
        )}
        <Select value={type} onValueChange={(v) => setType((v as EmploymentType | typeof ALL) ?? ALL)}>
          <SelectTrigger className={chip(type !== ALL)}>
            <SelectValue>
              {(v: string) =>
                v === ALL ? "All types" : <EmploymentTypeBadge type={v as EmploymentType} />
              }
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All types</SelectItem>
            {EMPLOYMENT_TYPE_OPTIONS.map((t) => (
              <SelectItem key={t} value={t}>
                <EmploymentTypeBadge type={t} />
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <FilterDivider />
        <Select value={capacity} onValueChange={(v) => setCapacity((v as CapacityFilter | typeof ALL) ?? ALL)}>
          <SelectTrigger className={chip(capacity !== ALL)}>
            <SelectValue>
              {(v: string) => (v === ALL ? "All capacities" : CAPACITY_FILTER_LABEL[v as CapacityFilter])}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All capacities</SelectItem>
            {CAPACITY_FILTER_OPTIONS.map((c) => (
              <SelectItem key={c} value={c}>
                {CAPACITY_FILTER_LABEL[c]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {hasActiveFilters && (
          <Button
            variant="ghost"
            size="sm"
            onClick={clearAll}
            className="rounded-full bg-red-500/8 text-red-700 hover:bg-red-500/15 hover:text-red-800 dark:bg-red-500/15 dark:text-red-400 dark:hover:bg-red-500/25"
          >
            <XIcon /> Clear filters
          </Button>
        )}
      </div>
      {sorted.length === 0 ? (
        <div className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
          No employees match your filters.
        </div>
      ) : (
        <div className="space-y-2">
          <Table className="[&_tbody_td]:py-4">
            <TableHeader>
              <TableRow>
                <SortableHead label="Person" sortKey="name" sort={sort} onToggle={toggle} />
                <SortableHead label="Status" sortKey="status" sort={sort} onToggle={toggle} />
                <SortableHead label="Workload" sortKey="workload" sort={sort} onToggle={toggle} />
                <SortableHead label="Active projects" sortKey="projects" sort={sort} onToggle={toggle} />
                <TableHead className="w-10 text-right">
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pageRows.map((row) => (
                <TableRow
                  key={row.id}
                  className="group cursor-pointer"
                  onClick={(e) => {
                    // Whole row navigates ("who should I open next?") -- but never when the
                    // click landed on a real control inside the row (same guard as the
                    // clients list).
                    if ((e.target as HTMLElement).closest("a, button, [role='menuitem']")) return;
                    router.push(`/people/${row.id}`);
                  }}
                >
                  <TableCell>
                    <PersonCell row={row} />
                  </TableCell>
                  <TableCell>
                    <StatusCell row={row} canManage={canManage} />
                  </TableCell>
                  <TableCell>
                    <WorkloadCell row={row} />
                  </TableCell>
                  <TableCell>
                    <ProjectsCell row={row} names={projectNamesByPersonId[row.id] ?? []} />
                  </TableCell>
                  <TableCell className="text-right">
                    <PersonRowActions
                      person={row}
                      canManage={canManage}
                      roleTitleOptions={roleTitleOptions}
                      teamOptions={teamOptions}
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          <div className="flex flex-wrap items-center justify-between gap-2 px-1 text-sm text-muted-foreground">
            <span>
              Showing {sorted.length === 0 ? 0 : (currentPage - 1) * PAGE_SIZE + 1} to{" "}
              {Math.min(currentPage * PAGE_SIZE, sorted.length)} of {sorted.length} employee
              {sorted.length === 1 ? "" : "s"}
            </span>
            {totalPages > 1 && (
              <div className="flex items-center gap-1">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={currentPage === 1}
                  onClick={() => setPage(currentPage - 1)}
                  aria-label="Previous page"
                >
                  <ChevronLeft />
                </Button>
                {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
                  <Button
                    key={p}
                    variant={p === currentPage ? "default" : "outline"}
                    size="sm"
                    onClick={() => setPage(p)}
                  >
                    {p}
                  </Button>
                ))}
                <Button
                  variant="outline"
                  size="sm"
                  disabled={currentPage === totalPages}
                  onClick={() => setPage(currentPage + 1)}
                  aria-label="Next page"
                >
                  <ChevronRight />
                </Button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// Avatar tile + 16px semibold name link, role title + employment-type micro-chip underneath --
// the same leading-cell anatomy as the projects/clients tables.
function PersonCell({ row }: { row: PersonListRow }) {
  return (
    <div className="flex items-center gap-3">
      <PersonAvatar name={row.full_name} avatarUrl={row.avatar_url} className="size-10" />
      <div className="min-w-0">
        <Link
          href={`/people/${row.id}`}
          className="text-base leading-tight font-semibold transition-opacity hover:opacity-70"
        >
          {row.full_name}
        </Link>
        <div className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
          <span className="truncate">{row.role_title ?? "—"}</span>
          {row.employment_type && <EmploymentTypeBadge type={row.employment_type} />}
        </div>
      </div>
    </div>
  );
}

// Green Active / red Deactivated stay inline-editable. "Away" (currently on vacation) is a
// derived state layered ON TOP of the stored status, so the amber badge renders above the
// select rather than replacing it -- the underlying status must stay editable while someone
// is on vacation (client feedback: the Away tag blocked status changes).
function StatusCell({ row, canManage }: { row: PersonListRow; canManage: boolean }) {
  if (!row.status) return <Badge variant="outline">—</Badge>;
  const select = (
    <InlineEditSelect
      // Keyed by status: InlineEditSelect seeds its optimistic state from `value` once, so an
      // EXTERNAL status change (the row menu's Deactivate/Activate) must remount it to re-sync.
      key={row.status}
      value={row.status}
      options={STATUS_OPTIONS}
      canEdit={canManage}
      ariaLabel={`${row.full_name} status`}
      onSave={(value) => setPersonStatusAction(row.id, value as "active" | "inactive")}
    />
  );
  if (!row.on_vacation_now) return select;
  return (
    <div className="flex flex-col items-start gap-1">
      <DotBadge dotClassName="bg-amber-400">Away</DotBadge>
      {select}
    </div>
  );
}

// Allocation vs weekly capacity in the projects budget-cell anatomy: severity-colored bar
// (emerald/blue/amber/red via the shared UTILIZATION classes), bold allocated hours "/ capacity"
// muted, % pinned to the column's right edge. Over 100% clamps the fill but shows red.
function WorkloadCell({ row }: { row: PersonListRow }) {
  const pct = row.current_allocation_pct ?? 0;
  const capacity = row.weekly_capacity_hours ?? 0;
  const allocated = Math.round((pct / 100) * capacity * 10) / 10;
  return (
    <div className="min-w-40 max-w-44 text-xs" title={utilizationLabel(pct)}>
      <div className="h-2.5 w-full overflow-hidden rounded-full bg-muted">
        <div
          className={`h-full rounded-full ${utilizationBarClasses(pct)}`}
          style={{ width: `${Math.min(Math.max(pct, 0), 100)}%` }}
        />
      </div>
      {/* justify-between pins the % to the column's right edge -- vertically aligned across rows. */}
      <div className="mt-1 flex items-baseline justify-between gap-2 tabular-nums whitespace-nowrap">
        <span>
          <span className="text-sm font-medium text-foreground">{allocated}</span>{" "}
          <span className="text-muted-foreground">/ {capacity} h</span>
        </span>
        <span className="text-muted-foreground">{Math.round(pct)}%</span>
      </div>
    </div>
  );
}

// "N active" in the shared DotBadge language (emerald dot -- same as the clients list); muted 0
// otherwise. The hover tooltip lists the person's visible active-project names -- an RLS-scoped
// read, so a viewer who can't see some projects simply gets a shorter list (or none).
function ProjectsCell({ row, names }: { row: PersonListRow; names: string[] }) {
  const count = row.active_project_count ?? 0;
  const badge =
    count > 0 ? (
      <DotBadge dotClassName="bg-emerald-500" className="tabular-nums">
        {count} active
      </DotBadge>
    ) : (
      <span className="text-sm text-muted-foreground tabular-nums">0</span>
    );
  if (names.length === 0) return badge;
  return (
    <Tooltip>
      <TooltipTrigger
        render={<Link href={`/people/${row.id}`} aria-label={`${row.full_name} projects`} />}
      >
        {badge}
      </TooltipTrigger>
      <TooltipContent>
        <div className="flex flex-col gap-0.5">
          {names.map((name) => (
            <span key={name}>{name}</span>
          ))}
        </div>
      </TooltipContent>
    </Tooltip>
  );
}
