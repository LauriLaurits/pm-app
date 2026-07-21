"use client";

import { useMemo } from "react";
import Link from "next/link";
import { updateProjectFieldAction } from "@/app/actions/projects";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { InlineEditSelect } from "@/components/inline-edit-select";
import { SortableHead } from "@/components/data-table/sortable-head";
import { useSort, type SortAccessors } from "@/components/data-table/use-sort";
import {
  Table, TableBody, TableCell, TableHeader, TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { consumptionBarClasses } from "@/lib/budget";
import { avatarTint } from "@/lib/avatar-tint";
import { deadlineCountdown } from "@/lib/deadline";
import {
  DERIVED_HEALTH_BADGE_CLASS, deriveHealth, healthTitle, type DerivedHealth,
} from "@/lib/health";
import {
  PRIORITY_INLINE_OPTIONS, STATUS_INLINE_OPTIONS,
  formatDate, formatMoney, humanize, initials,
} from "./types";
import type { ProjectListRow } from "./types";

/** Server-built cross-link targets per project (the list view lacks these ids). Either id may be
 * missing (no client set / PM without a people row) -- the cell falls back to plain text. */
export type ProjectRowLinks = Record<
  string,
  { clientId: string | null; pmPersonId: string | null }
>;

const HEALTH_RANK: Record<DerivedHealth["level"], number> = {
  healthy: 0,
  warning: 1,
  critical: 2,
};

function consumptionPct(row: ProjectListRow): number | null {
  if (row.budget_total === null || row.budget_total === 0 || row.budget_used === null) return null;
  return (row.budget_used / row.budget_total) * 100;
}

type SortKey =
  | "name" | "client" | "pm" | "status" | "health" | "deadline"
  | "team" | "budget" | "progress" | "updated";

/** Parts-derived progress per project, built server-side (same deriveProgress as the project
 * page -- the stored `progress` column is deprecated and never shown). */
export type ProgressById = Record<string, { pct: number | null; label: string }>;

export function ProjectsTable({
  rows,
  editableProjectIds,
  links,
  progressById,
}: {
  rows: ProjectListRow[];
  /** Projects this viewer holds edit_project on -- computed server-side in page.tsx (same UX-
   * gating-only convention as every other page: the real boundary is requirePermission inside
   * updateProjectFieldAction, re-checked regardless of what's rendered here). Array (not Set)
   * because this is now a client component and props must serialize. */
  editableProjectIds: string[];
  links: ProjectRowLinks;
  progressById: ProgressById;
}) {
  const editable = useMemo(() => new Set(editableProjectIds), [editableProjectIds]);
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

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <SortableHead label="Project" sortKey="name" sort={sort} onToggle={toggle} />
          <SortableHead label="Client" sortKey="client" sort={sort} onToggle={toggle} />
          <SortableHead label="PM" sortKey="pm" sort={sort} onToggle={toggle} />
          <SortableHead label="Status" sortKey="status" sort={sort} onToggle={toggle} />
          <SortableHead label="Health" sortKey="health" sort={sort} onToggle={toggle} />
          <SortableHead label="Deadline" sortKey="deadline" sort={sort} onToggle={toggle} />
          <SortableHead label="Team" sortKey="team" sort={sort} onToggle={toggle} />
          <SortableHead label="Budget" sortKey="budget" sort={sort} onToggle={toggle} />
          <SortableHead label="Progress" sortKey="progress" sort={sort} onToggle={toggle} />
          <SortableHead label="Updated" sortKey="updated" sort={sort} onToggle={toggle} />
        </TableRow>
      </TableHeader>
      <TableBody>
        {sorted.map((row) => {
          // project_list_rows is a plain view, so every column's type is nullable even though
          // `id` is never actually null in practice (it's the projects table's PK) -- guard so
          // the rest of this row can treat it as a plain string.
          if (!row.id) return null;
          const projectId = row.id;
          const canEdit = editable.has(projectId);
          const rowLinks = links[projectId];
          const countdown = deadlineCountdown(row.deadline);
          return (
            <TableRow key={row.id}>
              <TableCell>
                <Link href={`/projects/${row.id}`} className="font-medium hover:underline">
                  {row.name}
                </Link>
                {row.priority && (
                  <div className="flex items-center gap-1 text-xs text-muted-foreground">
                    <InlineEditSelect
                      value={row.priority}
                      options={PRIORITY_INLINE_OPTIONS}
                      canEdit={canEdit}
                      ariaLabel="project priority"
                      onSave={updateProjectFieldAction.bind(null, projectId, "priority")}
                    />
                    <span>priority</span>
                  </div>
                )}
              </TableCell>
              <TableCell>
                {row.client_name && rowLinks?.clientId ? (
                  <Link href={`/clients/${rowLinks.clientId}`} className="hover:underline">
                    {row.client_name}
                  </Link>
                ) : (
                  (row.client_name ?? "—")
                )}
              </TableCell>
              <TableCell>
                <PersonCell
                  name={row.pm_name}
                  avatarUrl={row.pm_avatar_url}
                  personId={rowLinks?.pmPersonId ?? null}
                />
              </TableCell>
              <TableCell>
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
              <TableCell>
                <HealthBadge health={healthById[projectId]} />
              </TableCell>
              <TableCell>
                <div className="text-sm">{formatDate(row.deadline)}</div>
                {countdown.days !== null && (
                  <div className={`text-xs ${countdown.toneClass}`}>{countdown.label}</div>
                )}
              </TableCell>
              <TableCell>{row.member_count ?? 0}</TableCell>
              <TableCell>
                <BudgetCell row={row} />
              </TableCell>
              <TableCell className="w-36">
                <ProgressCell progress={progressById[projectId]} />
              </TableCell>
              <TableCell className="text-sm text-muted-foreground">
                {formatDate(row.updated_at)}
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
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
    <Link href={`/people/${personId}`} className="hover:underline">
      {inner}
    </Link>
  );
}

// Same consumption language as /budgets (ConsumptionCell there): used-of-total on top, the
// severity-colored bar in the middle, and "% used · remaining" together on the bottom line.
function BudgetCell({ row }: { row: ProjectListRow }) {
  const pct = consumptionPct(row);
  return (
    <div className="min-w-32 text-xs">
      <div className="text-muted-foreground">
        <span className="font-medium text-foreground">{formatMoney(row.budget_used)}</span>
        {" of "}
        {formatMoney(row.budget_total)}
        <span className="ml-1">· {humanize(row.budget_type ?? "")}</span>
      </div>
      {pct !== null && (
        <div className="mt-1 flex items-center gap-2">
          <div className="h-2 w-full max-w-24 overflow-hidden rounded-full bg-muted">
            <div
              className={`h-full rounded-full ${consumptionBarClasses(pct)}`}
              style={{ width: `${Math.min(Math.max(pct, 0), 100)}%` }}
            />
          </div>
          <span className="text-muted-foreground tabular-nums whitespace-nowrap">
            {pct.toFixed(0)}% used
          </span>
        </div>
      )}
    </div>
  );
}

// Derived health badge: the color says how bad, the second line says WHY ("due in 8 days ·
// over budget"), so the signal is explained right where it appears.
export function HealthBadge({ health }: { health?: DerivedHealth }) {
  if (!health) return null;
  return (
    <div className="min-w-0">
      <Badge variant="outline" className={DERIVED_HEALTH_BADGE_CLASS[health.level]}>
        {health.level}
      </Badge>
      {health.reasons.length > 0 && (
        <div className="mt-0.5 max-w-36 truncate text-xs text-muted-foreground" title={healthTitle(health)}>
          {healthTitle(health)}
        </div>
      )}
    </div>
  );
}

// Progress derived from parts (done est-hours / total est-hours; part-count fallback). Same
// two-line anatomy as BudgetCell: what it's based on on top, then the bar with "% done" inline.
function ProgressCell({ progress }: { progress?: { pct: number | null; label: string } }) {
  if (!progress || progress.pct === null) {
    return <span className="text-xs text-muted-foreground">{progress?.label ?? "—"}</span>;
  }
  // Bold the leading number, mirroring BudgetCell's "€8,000 of …" emphasis.
  const [first, ...rest] = progress.label.split(" ");
  return (
    <div className="min-w-32 text-xs">
      <div className="text-muted-foreground">
        <span className="font-medium text-foreground">{first}</span> {rest.join(" ")}
      </div>
      <div className="mt-1 flex items-center gap-2">
        <div className="h-2 w-full max-w-24 overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-[var(--viz-series-1)]"
            style={{ width: `${Math.min(Math.max(progress.pct, 0), 100)}%` }}
          />
        </div>
        <span className="text-muted-foreground tabular-nums whitespace-nowrap">
          {progress.pct}% done
        </span>
      </div>
    </div>
  );
}
