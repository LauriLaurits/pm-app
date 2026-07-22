"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Database, Flag, Folder, Globe,
  Landmark, MoreHorizontal, Package, Settings2, ShoppingCart, Star, Truck, Users, Wrench,
  type LucideIcon,
} from "lucide-react";
import { updateProjectFieldAction } from "@/app/actions/projects";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuGroup,
  DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { InlineEditSelect } from "@/components/inline-edit-select";
import { SortableHead } from "@/components/data-table/sortable-head";
import { useSort, type SortAccessors } from "@/components/data-table/use-sort";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { consumptionBarClasses } from "@/lib/budget";
import { avatarTint } from "@/lib/avatar-tint";
import { deadlineCountdown } from "@/lib/deadline";
import {
  DERIVED_HEALTH_BADGE_CLASS, DERIVED_HEALTH_DOT, DERIVED_HEALTH_LABEL, deriveHealth,
  healthTitle, type DerivedHealth,
} from "@/lib/health";
import {
  STATUS_INLINE_OPTIONS,
  formatDate, formatMoney, humanize, initials,
} from "./types";
import type { ProjectListRow } from "./types";

/** Server-built cross-link targets per project (the list view lacks these ids). Either id may be
 * missing (no client set / PM without a people row) -- the cell falls back to plain text. */
export type ProjectRowLinks = Record<
  string,
  { clientId: string | null; pmPersonId: string | null }
>;

/** Parts-derived progress per project, built server-side (same deriveProgress as the project
 * page -- the stored `progress` column is deprecated and never shown). */
export type ProgressById = Record<string, { pct: number | null; label: string }>;

const PAGE_SIZE = 10;

const HEALTH_RANK: Record<DerivedHealth["level"], number> = {
  healthy: 0,
  warning: 1,
  critical: 2,
};

function consumptionPct(row: ProjectListRow): number | null {
  if (row.budget_total === null || row.budget_total === 0 || row.budget_used === null) return null;
  return (row.budget_used / row.budget_total) * 100;
}

// Best-effort category icon from the project's name + tags (retail cart, fintech bank, ...).
// Order matters where keywords overlap ("Data warehouse" must hit `data` before `warehouse`).
const ICON_RULES: [RegExp, LucideIcon][] = [
  [/(data|analytics|\bbi\b)/, Database],
  [/(retail|shop|commerce)/, ShoppingCart],
  [/(fin|bank|pay|kyc|invoice)/, Landmark],
  [/(warehouse|scanner|logistics|inventory)/, Package],
  [/(fleet|tracking|gps|transport)/, Truck],
  [/(intranet|web|site|portal)/, Globe],
  [/(loyalty|reward)/, Star],
  [/(maintenance|support|crm)/, Wrench],
];

function projectIcon(name: string | null, tags?: string[] | null): LucideIcon {
  const hay = `${name ?? ""} ${(tags ?? []).join(" ")}`.toLowerCase();
  for (const [re, icon] of ICON_RULES) if (re.test(hay)) return icon;
  return Folder;
}

const OPTIONAL_COLUMNS = [
  { key: "client", label: "Client" },
  { key: "pm", label: "PM" },
  { key: "status", label: "Status" },
  { key: "health", label: "Health" },
  { key: "dates", label: "Dates" },
  { key: "team", label: "Team" },
  { key: "budget", label: "Budget" },
  { key: "progress", label: "Progress" },
  { key: "updated", label: "Updated" },
] as const;
export type ColumnKey = (typeof OPTIONAL_COLUMNS)[number]["key"];

type SortKey =
  | "priority" | "name" | "client" | "pm" | "status" | "health" | "deadline"
  | "team" | "budget" | "progress" | "updated";

// Ascending = most important first, so the first click on the flag surfaces high priority.
const PRIORITY_RANK = { high: 0, medium: 1, low: 2 } as const;

// Tiny GitHub-style priority dots. LOW renders nothing -- a dot should only appear when it
// carries a signal, so the column stays empty for the default case.
const PRIORITY_DOT_CLASS: Record<"high" | "medium", string> = {
  high: "bg-red-500",
  medium: "bg-blue-500",
};

export function ProjectsTable({
  rows,
  editableProjectIds,
  links,
  progressById,
  initiallyHidden,
}: {
  rows: ProjectListRow[];
  /** Projects this viewer holds edit_project on -- computed server-side in page.tsx (same UX-
   * gating-only convention as every other page: the real boundary is requirePermission inside
   * updateProjectFieldAction, re-checked regardless of what's rendered here). Array (not Set)
   * because this is a client component and props must serialize. */
  editableProjectIds: string[];
  links: ProjectRowLinks;
  progressById: ProgressById;
  /** Columns hidden on first render (still re-showable via the gear menu) -- e.g. the client
   * detail page hides the redundant Client column on its own client's table. */
  initiallyHidden?: ColumnKey[];
}) {
  const editable = useMemo(() => new Set(editableProjectIds), [editableProjectIds]);
  const [page, setPage] = useState(1);
  const [hidden, setHidden] = useState<Set<ColumnKey>>(() => new Set(initiallyHidden));
  const show = (key: ColumnKey) => !hidden.has(key);

  // Health is derived (deadline + budget + parts progress -- see lib/health.ts), never the
  // stored hand-typed column: a flag a PM must remember to update is always stale.
  const healthById = useMemo(() => {
    const map: Record<string, DerivedHealth> = {};
    for (const r of rows) {
      if (!r.id) continue;
      map[r.id] = deriveHealth({
        status: r.status,
        startDate: r.start_date,
        deadline: r.deadline,
        consumptionPct: consumptionPct(r),
        progressPct: progressById[r.id]?.pct ?? null,
      });
    }
    return map;
  }, [rows, progressById]);

  const accessors = useMemo<SortAccessors<ProjectListRow, SortKey>>(
    () => ({
      priority: (r) => (r.priority ? PRIORITY_RANK[r.priority] : null),
      name: (r) => r.name,
      client: (r) => r.client_name,
      pm: (r) => r.pm_name,
      status: (r) => r.status,
      health: (r) => (r.id ? HEALTH_RANK[healthById[r.id]?.level ?? "healthy"] : null),
      deadline: (r) => r.deadline,
      team: (r) => r.member_count,
      budget: (r) => consumptionPct(r),
      progress: (r) => (r.id ? (progressById[r.id]?.pct ?? null) : null),
      updated: (r) => r.updated_at,
    }),
    [progressById, healthById]
  );
  const { rows: sorted, sort, toggle } = useSort(rows, accessors, {
    key: "updated",
    dir: "desc",
  });

  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageRows = sorted.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  return (
    <div className="space-y-2">
      <Table className="[&_tbody_td]:py-4">
        <TableHeader>
          <TableRow>
            <TableHead
              className="w-8 px-1"
              aria-sort={
                sort?.key === "priority"
                  ? sort.dir === "asc"
                    ? "ascending"
                    : "descending"
                  : undefined
              }
            >
              <button
                type="button"
                onClick={() => toggle("priority")}
                title="Sort by priority (red high, blue medium, gray low)"
                aria-label="Sort by priority"
                className="group inline-flex items-center gap-0.5 rounded p-0.5 transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
              >
                <Flag className="size-3.5" />
                {sort?.key === "priority" ? (
                  sort.dir === "asc" ? (
                    <ChevronUp className="size-3" />
                  ) : (
                    <ChevronDown className="size-3" />
                  )
                ) : null}
              </button>
            </TableHead>
            <SortableHead label="Project" sortKey="name" sort={sort} onToggle={toggle} />
            {show("client") && <SortableHead label="Client" sortKey="client" sort={sort} onToggle={toggle} />}
            {show("pm") && <SortableHead label="PM" sortKey="pm" sort={sort} onToggle={toggle} />}
            {show("status") && <SortableHead label="Status" sortKey="status" sort={sort} onToggle={toggle} className="pr-1" />}
            {show("health") && <SortableHead label="Health" sortKey="health" sort={sort} onToggle={toggle} className="px-1" />}
            {show("dates") && <SortableHead label="Dates" sortKey="deadline" sort={sort} onToggle={toggle} className="pl-1" />}
            {show("team") && <SortableHead label="Team" sortKey="team" sort={sort} onToggle={toggle} />}
            {show("budget") && <SortableHead label="Budget" sortKey="budget" sort={sort} onToggle={toggle} />}
            {show("progress") && <SortableHead label="Progress" sortKey="progress" sort={sort} onToggle={toggle} />}
            {show("updated") && <SortableHead label="Updated" sortKey="updated" sort={sort} onToggle={toggle} />}
            <TableHead className="w-10 text-right">
              <DropdownMenu>
                <DropdownMenuTrigger
                  aria-label="Configure columns"
                  className="rounded p-1 text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2"
                >
                  <Settings2 className="size-4" />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {/* base-ui gotcha: DropdownMenuLabel throws unless wrapped in a group. */}
                  <DropdownMenuGroup>
                    <DropdownMenuLabel>Columns</DropdownMenuLabel>
                  </DropdownMenuGroup>
                  {OPTIONAL_COLUMNS.map((c) => (
                    <DropdownMenuCheckboxItem
                      key={c.key}
                      checked={show(c.key)}
                      onCheckedChange={() =>
                        setHidden((prev) => {
                          const next = new Set(prev);
                          if (next.has(c.key)) next.delete(c.key);
                          else next.add(c.key);
                          return next;
                        })
                      }
                    >
                      {c.label}
                    </DropdownMenuCheckboxItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {pageRows.map((row) => {
            // project_list_rows is a plain view, so every column's type is nullable even though
            // `id` is never actually null in practice (it's the projects table's PK) -- guard so
            // the rest of this row can treat it as a plain string.
            if (!row.id) return null;
            const projectId = row.id;
            const canEdit = editable.has(projectId);
            const rowLinks = links[projectId];
            const Icon = projectIcon(row.name);
            return (
              <TableRow key={row.id} className="group">
                {/* Priority dot (red high / blue medium / faint low) under the flag header.
                    NO edge accent line -- tried twice (priority, then health), rejected both
                    times: the badges carry the signal. */}
                <TableCell className="w-8 px-1">
                  {(row.priority === "high" || row.priority === "medium") && (
                    <span
                      aria-label={`${row.priority} priority`}
                      title={`${row.priority.charAt(0).toUpperCase()}${row.priority.slice(1)} priority`}
                      className={`block size-2 rounded-full ${PRIORITY_DOT_CLASS[row.priority]}`}
                    />
                  )}
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-3">
                    <span
                      aria-hidden
                      className="flex size-10 shrink-0 items-center justify-center rounded-lg border border-border/25 bg-muted/30 text-muted-foreground"
                    >
                      <Icon className="size-4.5" />
                    </span>
                    <div className="min-w-0">
                      <Link
                        href={`/projects/${row.id}`}
                        title={
                          row.priority
                            ? `${row.priority.charAt(0).toUpperCase()}${row.priority.slice(1)} priority`
                            : undefined
                        }
                        className="text-base leading-tight font-semibold transition-opacity hover:opacity-70"
                      >
                        {row.name}
                      </Link>
                    </div>
                  </div>
                </TableCell>
                {show("client") && (
                  <TableCell>
                    <ClientCell name={row.client_name} clientId={rowLinks?.clientId ?? null} />
                  </TableCell>
                )}
                {show("pm") && (
                  <TableCell>
                    <PersonCell
                      name={row.pm_name}
                      avatarUrl={row.pm_avatar_url}
                      personId={rowLinks?.pmPersonId ?? null}
                    />
                  </TableCell>
                )}
                {show("status") && (
                  <TableCell className="pr-1">
                    {row.status && (
                      <InlineEditSelect
                        value={row.status}
                        options={STATUS_INLINE_OPTIONS}
                        canEdit={canEdit}
                        ariaLabel="project status"
                        onSave={updateProjectFieldAction.bind(null, projectId, "status")}
                      />
                    )}
                  </TableCell>
                )}
                {show("health") && (
                  <TableCell className="px-1">
                    <HealthBadge health={healthById[projectId]} />
                  </TableCell>
                )}
                {show("dates") && (
                  <TableCell className="pl-1">
                    <DatesCell start={row.start_date} deadline={row.deadline} status={row.status} />
                  </TableCell>
                )}
                {show("team") && (
                  <TableCell>
                    <span className="inline-flex items-center gap-1.5 text-sm text-muted-foreground tabular-nums">
                      <Users className="size-3.5" />
                      {row.member_count ?? 0}
                    </span>
                  </TableCell>
                )}
                {show("budget") && (
                  <TableCell>
                    <BudgetCell row={row} />
                  </TableCell>
                )}
                {show("progress") && (
                  <TableCell className="w-48">
                    <ProgressCell progress={progressById[projectId]} />
                  </TableCell>
                )}
                {show("updated") && (
                  <TableCell className="whitespace-nowrap text-muted-foreground">
                    <UpdatedCell date={row.updated_at} />
                  </TableCell>
                )}
                <TableCell className="text-right">
                  {/* Actions surface on row hover (GitHub/Linear style) -- and stay visible
                      while focused or while the menu is open, so keyboard users aren't locked out. */}
                  <div className="flex items-center justify-end gap-1 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100 has-aria-expanded:opacity-100">
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 px-2 text-xs"
                      render={<Link href={`/projects/${projectId}`} />}
                    >
                      Open
                    </Button>
                    <DropdownMenu>
                      <DropdownMenuTrigger
                        aria-label={`Actions for ${row.name}`}
                        className="rounded p-1 text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2"
                      >
                        <MoreHorizontal className="size-4" />
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem render={<Link href={`/projects/${projectId}/parts`}>Parts</Link>} />
                        <DropdownMenuItem render={<Link href={`/projects/${projectId}/budget`}>Budget</Link>} />
                        <DropdownMenuItem render={<Link href={`/projects/${projectId}/people`}>People</Link>} />
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>

      <div className="flex flex-wrap items-center justify-between gap-2 px-1 text-sm text-muted-foreground">
        <span>
          Showing {sorted.length === 0 ? 0 : (currentPage - 1) * PAGE_SIZE + 1} to{" "}
          {Math.min(currentPage * PAGE_SIZE, sorted.length)} of {sorted.length} project
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
  );
}

// Date range on top, semantic urgency underneath: green when comfortably out, orange within
// 14 days, red the moment it's overdue. Completed/archived projects show no countdown at all --
// a red "Overdue" next to a green "On track" on a finished project read as a contradiction.
export function DatesCell({
  start,
  deadline,
  status,
}: {
  start: string | null;
  deadline: string | null;
  status: string | null;
}) {
  const closed = status === "completed" || status === "archived";
  const countdown = !closed && deadline ? deadlineCountdown(deadline) : null;
  const days = countdown?.days ?? null;
  const label = closed
    ? status === "completed"
      ? "Completed"
      : "Archived"
    : days === null
      ? "No end date"
      : days < 0
        ? "Overdue"
        : `${days} ${days === 1 ? "day" : "days"} left`;
  const tone =
    closed || days === null
      ? "text-muted-foreground"
      : days < 0
        ? "text-red-600 dark:text-red-400 font-medium"
        : days <= 14
          ? "text-orange-600 dark:text-orange-400"
          : "text-emerald-600 dark:text-emerald-500";
  // Compact: deadline only; the full range lives in the hover title.
  return (
    <div
      className="whitespace-nowrap tabular-nums"
      title={`${formatDate(start)} → ${formatDate(deadline)}`}
    >
      <div className="text-sm">{formatDate(deadline)}</div>
      <div className={`text-xs ${tone}`}>{label}</div>
    </div>
  );
}

function ClientCell({ name, clientId }: { name: string | null; clientId: string | null }) {
  if (!name) return <span className="text-muted-foreground">—</span>;
  const inner = (
    <span className="flex items-center gap-2">
      <span
        aria-hidden
        className={`flex size-5 shrink-0 items-center justify-center rounded-md text-[9px] font-medium ${avatarTint(name)}`}
      >
        {initials(name)}
      </span>
      <span className="text-sm">{name}</span>
    </span>
  );
  if (!clientId) return inner;
  return (
    <Link href={`/clients/${clientId}`} className="transition-opacity hover:opacity-70">
      {inner}
    </Link>
  );
}

function PersonCell({
  name,
  avatarUrl,
  personId,
}: {
  name: string | null;
  avatarUrl: string | null;
  personId: string | null;
}) {
  const inner = (
    <span className="flex items-center gap-2">
      <Avatar size="sm">
        <AvatarImage src={avatarUrl ?? undefined} alt={name ?? ""} />
        <AvatarFallback className={avatarTint(name)}>{initials(name)}</AvatarFallback>
      </Avatar>
      <span>{name ?? "—"}</span>
    </span>
  );
  if (!personId || !name) return inner;
  return (
    <Link href={`/people/${personId}`} className="transition-opacity hover:opacity-70">
      {inner}
    </Link>
  );
}

// Derived health badge -- the one column that stays loudly colorful (soft filled green/orange/
// red): it's the "where is my attention needed" signal. WHY ("due in 8 days · over budget")
// lives in the hover title, keeping the rows quiet.
export function HealthBadge({ health }: { health?: DerivedHealth }) {
  if (!health) return null;
  return (
    <Badge
      variant="outline"
      className={DERIVED_HEALTH_BADGE_CLASS[health.level]}
      title={healthTitle(health)}
    >
      <span aria-hidden className={`size-1.5 shrink-0 rounded-full ${DERIVED_HEALTH_DOT[health.level]}`} />
      {DERIVED_HEALTH_LABEL[health.level]}
    </Badge>
  );
}

// Budget and Progress share ONE anatomy: bar on the first line, "X / Y · %" value pair on the
// second in identical type (euros here, hours there). The pricing model is deliberately NOT a
// per-row badge -- floating in a varying position it made the column read as scattered; it
// lives in the hover title, the filter chip, and the detail page.
export function BudgetCell({ row }: { row: ProjectListRow }) {
  const pct = consumptionPct(row);
  const typeTitle = row.budget_type ? `${humanize(row.budget_type)} budget` : undefined;
  if (pct === null) {
    return (
      <div
        className="min-w-44 text-sm text-muted-foreground"
        title={typeTitle ? `No budget set · ${typeTitle}` : "No budget set"}
      >
        —
      </div>
    );
  }
  return (
    <div className="min-w-40 text-xs" title={typeTitle}>
      <div className="h-[11px] w-full overflow-hidden rounded-full bg-muted">
        <div
          className={`h-full rounded-full ${consumptionBarClasses(pct)}`}
          style={{ width: `${Math.min(Math.max(pct, 0), 100)}%` }}
        />
      </div>
      {/* justify-between pins the % to the column's right edge -- vertically aligned across rows. */}
      <div className="mt-1 flex items-baseline justify-between gap-2 tabular-nums whitespace-nowrap">
        <span>
          <span className="text-sm font-medium text-foreground">{formatMoney(row.budget_used)}</span>{" "}
          <span className="text-muted-foreground">/ {formatMoney(row.budget_total)}</span>
        </span>
        <span className="text-muted-foreground">{pct.toFixed(0)}%</span>
      </div>
    </div>
  );
}

// Progress derived from parts (done est-hours / total est-hours; part-count fallback).
export function ProgressCell({ progress }: { progress?: { pct: number | null; label: string } }) {
  if (!progress || progress.pct === null) {
    return (
      <span className="text-sm text-muted-foreground" title={progress?.label ?? undefined}>
        —
      </span>
    );
  }
  const [first, ...rest] = progress.label.split(" ");
  return (
    <div className="min-w-44 text-xs">
      <div className="h-[11px] w-full overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-[var(--viz-series-1)]"
          style={{ width: `${Math.min(Math.max(progress.pct, 0), 100)}%` }}
        />
      </div>
      <div className="mt-1 flex items-baseline justify-between gap-2 tabular-nums whitespace-nowrap">
        <span>
          <span className="text-sm font-medium text-foreground">{first}</span>{" "}
          <span className="text-muted-foreground">{rest.join(" ")}</span>
        </span>
        <span className="text-muted-foreground">{progress.pct}%</span>
      </div>
    </div>
  );
}

// "20 Jul" -- the year renders only when it differs from the current year, so it isn't
// repeated on every row for no information.
function UpdatedCell({ date }: { date: string | null }) {
  if (!date) return <span className="text-sm">—</span>;
  const d = new Date(date);
  const dayMonth = d.toLocaleDateString("en-GB", { day: "2-digit", month: "short" });
  const year = d.getFullYear();
  return (
    <div className="text-sm leading-tight tabular-nums">
      <div>{dayMonth}</div>
      {year !== new Date().getFullYear() && (
        <div className="text-xs text-muted-foreground/60">{year}</div>
      )}
    </div>
  );
}
