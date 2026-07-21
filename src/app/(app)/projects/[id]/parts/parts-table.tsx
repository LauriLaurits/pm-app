"use client";

import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { updatePartFieldAction } from "@/app/actions/project-parts";
import { InlineEditSelect, type InlineEditOption } from "@/components/inline-edit-select";
import { SortableHead } from "@/components/data-table/sortable-head";
import { useSort, type SortAccessors } from "@/components/data-table/use-sort";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { PART_STATUS_OPTIONS } from "@/lib/validation/project";
import { deriveProgress, hoursOverrun, progressBasisLabel } from "@/lib/progress";
import { formatMoney, humanize } from "../../types";
import { PartDeleteButton } from "./part-actions";
import { PartFormDialog } from "./part-form-dialog";
import type { PartRow, PersonOption } from "./types";

// Each part_status gets a distinct, accessible color (not just variant) so e.g. "not_started"
// and "done" never render visually identical -- text label stays in all cases, so color is a
// reinforcing signal, not the only one.
const PART_STATUS_BADGE_CLASS: Record<PartRow["status"], string> = {
  not_started: "text-muted-foreground",
  in_progress:
    "border-blue-500/30 bg-blue-500/10 text-blue-700 dark:border-blue-500/40 dark:bg-blue-500/15 dark:text-blue-400",
  blocked:
    "border-red-500/30 bg-red-500/10 text-red-700 dark:border-red-500/40 dark:bg-red-500/15 dark:text-red-400",
  done:
    "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:border-emerald-500/40 dark:bg-emerald-500/15 dark:text-emerald-400",
};

const PART_STATUS_INLINE_OPTIONS: InlineEditOption[] = PART_STATUS_OPTIONS.map((s) => ({
  value: s,
  label: humanize(s),
  badgeVariant: "outline",
  badgeClassName: PART_STATUS_BADGE_CLASS[s],
}));

// Actual-vs-estimate hours color: neutral under estimate, amber once over, red when meaningfully
// over. The `▲` marker makes "over" legible without relying on color alone.
const HOURS_TONE: Record<"none" | "warn" | "over", string> = {
  none: "",
  warn: "text-amber-700 dark:text-amber-400",
  over: "text-red-700 font-medium dark:text-red-400",
};

function fmtHrs(n: number | null): string {
  if (n === null) return "—";
  return String(Math.round(n * 10) / 10);
}

const STATUS_RANK: Record<PartRow["status"], number> = {
  in_progress: 0,
  blocked: 1,
  not_started: 2,
  done: 3,
};

export function PartsTable({
  parts,
  nameByPersonId,
  actualByPartId,
  canEdit,
  canViewBudget,
  projectId,
  people,
}: {
  parts: PartRow[];
  nameByPersonId: Record<string, string>;
  actualByPartId: Record<string, number>;
  canEdit: boolean;
  canViewBudget: boolean;
  projectId: string;
  people: PersonOption[];
}) {
  // Accessors close over the page-provided rollups, so build them here (stable per props).
  const accessors: SortAccessors<PartRow, "part" | "status" | "responsible" | "hours" | "price"> = {
    part: (p) => p.name,
    status: (p) => STATUS_RANK[p.status],
    responsible: (p) => (p.responsible_person_id ? (nameByPersonId[p.responsible_person_id] ?? null) : null),
    hours: (p) => actualByPartId[p.id] ?? 0,
    price: (p) => p.part_billing?.client_price ?? null,
  };
  const { rows: sorted, sort, toggle } = useSort(parts, accessors, null);

  if (parts.length === 0) {
    return <p className="text-muted-foreground">No parts yet.</p>;
  }

  // Shared across every row -- same "Unassigned" sentinel the full PartFormDialog's <Select>
  // already uses for a null responsible_person_id. Editors get the full roster (`people`, only
  // fetched for canEdit) so they can reassign to anyone; non-editors only need enough options to
  // label whichever person is *already* assigned (`nameByPersonId`, fetched for every viewer).
  const responsibleOptions: InlineEditOption[] = canEdit
    ? [
        { value: "none", label: "Unassigned", badgeVariant: "outline" },
        ...people.map((p) => ({ value: p.id, label: p.full_name, badgeVariant: "outline" as const })),
      ]
    : [
        { value: "none", label: "Unassigned", badgeVariant: "outline" },
        ...Object.entries(nameByPersonId).map(([id, name]) => ({
          value: id, label: name, badgeVariant: "outline" as const,
        })),
      ];

  const totalActual = parts.reduce((sum, p) => sum + (actualByPartId[p.id] ?? 0), 0);
  const totalEst = parts.reduce((sum, p) => sum + (p.estimated_hours ?? 0), 0);
  const progress = deriveProgress(parts);

  return (
    <div className="space-y-2">
      <Table>
        <TableHeader>
          <TableRow>
            <SortableHead label="Part" sortKey="part" sort={sort} onToggle={toggle} />
            <SortableHead label="Status" sortKey="status" sort={sort} onToggle={toggle} />
            <SortableHead label="Responsible" sortKey="responsible" sort={sort} onToggle={toggle} />
            <SortableHead label="Hours (actual / est.)" sortKey="hours" sort={sort} onToggle={toggle} />
            <TableHead>Billing</TableHead>
            <SortableHead label="Client price" sortKey="price" sort={sort} onToggle={toggle} />
            {canEdit && <TableHead className="text-right">Actions</TableHead>}
          </TableRow>
        </TableHeader>
        <TableBody>
          {sorted.map((part) => {
            const est = part.estimated_hours;
            const actual = actualByPartId[part.id] ?? 0;
            const tone = HOURS_TONE[hoursOverrun(actual, est)];
            const noHours = est === null && actual === 0;
            return (
              <TableRow key={part.id}>
                <TableCell>
                  <div className="font-medium">{part.name}</div>
                  {part.description && (
                    <div className="text-xs text-muted-foreground">{part.description}</div>
                  )}
                </TableCell>
                <TableCell>
                  <InlineEditSelect
                    value={part.status}
                    options={PART_STATUS_INLINE_OPTIONS}
                    canEdit={canEdit}
                    ariaLabel="part status"
                    onSave={updatePartFieldAction.bind(null, projectId, part.id, "status")}
                  />
                </TableCell>
                <TableCell>
                  <span className="inline-flex items-center gap-1">
                    <InlineEditSelect
                      value={part.responsible_person_id ?? "none"}
                      options={responsibleOptions}
                      canEdit={canEdit}
                      ariaLabel="part responsible person"
                      onSave={updatePartFieldAction.bind(null, projectId, part.id, "responsible_person_id")}
                    />
                    {part.responsible_person_id && (
                      <Link
                        href={`/people/${part.responsible_person_id}`}
                        className="text-muted-foreground transition-colors hover:text-foreground"
                        aria-label="open person"
                      >
                        <ArrowUpRight className="size-3.5" />
                      </Link>
                    )}
                  </span>
                </TableCell>
                <TableCell>
                  {noHours ? (
                    <span className="text-muted-foreground">—</span>
                  ) : (
                    <span className="tabular-nums">
                      <span className={tone}>{fmtHrs(actual)}</span>
                      <span className="text-muted-foreground"> / {est === null ? "—" : `${fmtHrs(est)}h`}</span>
                      {tone === HOURS_TONE.over && <span className="ml-1 text-red-600 dark:text-red-400">▲</span>}
                    </span>
                  )}
                </TableCell>
                <TableCell>{humanize(part.billing_model)}</TableCell>
                {/* part_billing is null here whenever RLS withheld it (no view_budget) --
                    same "—" as a genuinely-unset price, which is the intended behavior:
                    we never want to reveal *whether* a price merely hasn't been set yet. */}
                <TableCell>{formatMoney(part.part_billing?.client_price ?? null)}</TableCell>
                {canEdit && (
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <PartFormDialog
                        projectId={projectId}
                        people={people}
                        canViewBudget={canViewBudget}
                        part={part}
                      />
                      <PartDeleteButton projectId={projectId} part={part} />
                    </div>
                  </TableCell>
                )}
              </TableRow>
            );
          })}
        </TableBody>
      </Table>

      <div className="flex flex-wrap items-center justify-between gap-2 px-1 text-sm text-muted-foreground">
        <span>
          Total logged{" "}
          <span className="font-medium tabular-nums text-foreground">
            {fmtHrs(totalActual)} / {totalEst > 0 ? `${fmtHrs(totalEst)}h` : "—"}
          </span>
        </span>
        <span>
          {progress.pct === null ? (
            progressBasisLabel(progress)
          ) : (
            <>
              <span className="font-medium text-foreground">{progress.pct}% done</span> · {progressBasisLabel(progress)}
            </>
          )}
        </span>
      </div>
    </div>
  );
}
