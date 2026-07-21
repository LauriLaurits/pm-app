"use client";

import { useMemo } from "react";
import Link from "next/link";
import { updateProjectFieldAction } from "@/app/actions/projects";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { InlineEditSelect } from "@/components/inline-edit-select";
import { SortableHead } from "@/components/data-table/sortable-head";
import { useSort, type SortAccessors } from "@/components/data-table/use-sort";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { ArrowRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { consumptionBarClasses } from "@/lib/budget";
import { avatarTint } from "@/lib/avatar-tint";
import { deadlineCountdown } from "@/lib/deadline";
import {
  DERIVED_HEALTH_BADGE_CLASS, DERIVED_HEALTH_LABEL, deriveHealth, healthTitle,
  type DerivedHealth,
} from "@/lib/health";
import {
  BUDGET_TYPE_CHIP_CLASS, PRIORITY_INLINE_OPTIONS, STATUS_INLINE_OPTIONS,
  formatDate, formatMoney, formatMoneyCompact, humanize, initials,
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
    <Table className="[&_tbody_td]:py-4">
      <TableHeader>
        <TableRow>
          <SortableHead label="Project" sortKey="name" sort={sort} onToggle={toggle} />
          <SortableHead label="Client" sortKey="client" sort={sort} onToggle={toggle} />
          <SortableHead label="PM" sortKey="pm" sort={sort} onToggle={toggle} />
          <SortableHead label="Status" sortKey="status" sort={sort} onToggle={toggle} />
          <SortableHead label="Health" sortKey="health" sort={sort} onToggle={toggle} />
          <SortableHead label="Deadline" sortKey="deadline" sort={sort} onToggle={toggle} className="text-right" />
          <SortableHead label="Team" sortKey="team" sort={sort} onToggle={toggle} className="text-right" />
          <SortableHead label="Budget" sortKey="budget" sort={sort} onToggle={toggle} className="text-right" />
          <SortableHead label="Progress" sortKey="progress" sort={sort} onToggle={toggle} className="text-right" />
          <SortableHead label="Updated" sortKey="updated" sort={sort} onToggle={toggle} className="text-right" />
          <TableHead aria-hidden className="w-8" />
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
          // At-risk rows get a whisper of a left accent so attention-needing projects catch the
          // eye while scanning -- never a colored row.
          const level = healthById[projectId]?.level ?? "healthy";
          const accent =
            level === "critical"
              ? "border-l-2 border-l-red-400/70"
              : level === "warning"
                ? "border-l-2 border-l-amber-400/70"
                : "border-l-2 border-l-transparent";
          return (
            <TableRow key={row.id} className="group">
              <TableCell className={accent}>
                <Link
                  href={`/projects/${row.id}`}
                  className="text-base leading-tight font-semibold hover:underline"
                >
                  {row.name}
                </Link>
                {row.priority && (
                  <div className="mt-0.5 flex items-center gap-1 text-[11px] text-muted-foreground">
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
                <ClientCell name={row.client_name} clientId={rowLinks?.clientId ?? null} />
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
              <TableCell className="text-right">
                <DeadlineCell deadline={row.deadline} />
              </TableCell>
              <TableCell className="text-right tabular-nums">{row.member_count ?? 0}</TableCell>
              <TableCell className="text-right">
                <BudgetCell row={row} />
              </TableCell>
              <TableCell className="w-40 text-right">
                <ProgressCell progress={progressById[projectId]} />
              </TableCell>
              <TableCell className="text-right text-sm whitespace-nowrap text-muted-foreground">
                {formatDate(row.updated_at)}
              </TableCell>
              <TableCell className="pr-3">
                <Link
                  href={`/projects/${row.id}`}
                  aria-label={`Open ${row.name}`}
                  className="text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 hover:text-foreground focus-visible:opacity-100"
                >
                  <ArrowRight className="size-4" />
                </Link>
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}

// Semantic urgency at a glance: green when comfortably out, orange within 14 days, red the
// moment it's overdue.
function DeadlineCell({ deadline }: { deadline: string | null }) {
  if (!deadline) return <span className="text-sm text-muted-foreground">—</span>;
  const countdown = deadlineCountdown(deadline);
  const days = countdown.days ?? 0;
  const label = days < 0 ? "Overdue" : `${days} ${days === 1 ? "day" : "days"}`;
  const tone =
    days < 0
      ? "text-red-600 dark:text-red-400 font-medium"
      : days <= 14
        ? "text-orange-600 dark:text-orange-400"
        : "text-emerald-600 dark:text-emerald-500";
  return (
    <div className="whitespace-nowrap">
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
    <Link href={`/clients/${clientId}`} className="hover:underline">
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
    <Link href={`/people/${personId}`} className="hover:underline">
      {inner}
    </Link>
  );
}

// Budget cell: pricing-model chip (mixed purple / fixed blue / hourly teal), severity bar,
// compact "spent / total" with "% used" grayed. Full figures stay in the hover title.
function BudgetCell({ row }: { row: ProjectListRow }) {
  const pct = consumptionPct(row);
  const title = `${formatMoney(row.budget_used)} of ${formatMoney(row.budget_total)}`;
  return (
    <div className="min-w-32 text-xs" title={title}>
      {row.budget_type && (
        <Badge
          variant="outline"
          className={`px-1.5 py-0 text-[10px] ${BUDGET_TYPE_CHIP_CLASS[row.budget_type]}`}
        >
          {humanize(row.budget_type)}
        </Badge>
      )}
      {pct !== null && (
        <div className="mt-1 ml-auto h-1.5 w-full max-w-28 overflow-hidden rounded-full bg-muted">
          <div
            className={`h-full rounded-full ${consumptionBarClasses(pct)}`}
            style={{ width: `${Math.min(Math.max(pct, 0), 100)}%` }}
          />
        </div>
      )}
      <div className="mt-0.5 tabular-nums whitespace-nowrap">
        <span className="font-medium text-foreground">
          {formatMoneyCompact(row.budget_used)} / {formatMoneyCompact(row.budget_total)}
        </span>
        {pct !== null && <span className="ml-1 text-muted-foreground">· {pct.toFixed(0)}% used</span>}
      </div>
    </div>
  );
}

// Derived health badge -- the one column that stays loudly colorful (soft filled green/orange/
// red): it's the "where is my attention needed" signal. The second line says WHY ("due in 8
// days · over budget"), so the color is explained right where it appears.
export function HealthBadge({ health }: { health?: DerivedHealth }) {
  if (!health) return null;
  return (
    <div className="min-w-0">
      <Badge
        variant="outline"
        className={DERIVED_HEALTH_BADGE_CLASS[health.level]}
        title={healthTitle(health)}
      >
        {DERIVED_HEALTH_LABEL[health.level]}
      </Badge>
      {health.reasons.length > 0 && (
        <div className="mt-0.5 max-w-36 truncate text-xs text-muted-foreground" title={healthTitle(health)}>
          {healthTitle(health)}
        </div>
      )}
    </div>
  );
}

// Progress derived from parts (done est-hours / total est-hours; part-count fallback).
// Deliberately more visual weight than budget: a full-width blue bar, then hours + %.
function ProgressCell({ progress }: { progress?: { pct: number | null; label: string } }) {
  if (!progress || progress.pct === null) {
    return <span className="text-xs text-muted-foreground">{progress?.label ?? "—"}</span>;
  }
  const [first, ...rest] = progress.label.split(" ");
  return (
    <div className="min-w-36 text-xs">
      <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-[var(--viz-series-1)]"
          style={{ width: `${Math.min(Math.max(progress.pct, 0), 100)}%` }}
        />
      </div>
      <div className="mt-1 tabular-nums whitespace-nowrap">
        <span className="text-sm font-medium text-foreground">{first}</span>{" "}
        <span className="text-muted-foreground">{rest.join(" ")}</span>
        <span className="ml-1 text-muted-foreground">· {progress.pct}%</span>
      </div>
    </div>
  );
}
