import { updatePartFieldAction } from "@/app/actions/project-parts";
import { Progress } from "@/components/ui/progress";
import { InlineEditSelect, type InlineEditOption } from "@/components/inline-edit-select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { PART_STATUS_OPTIONS } from "@/lib/validation/project";
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

export function PartsTable({
  parts,
  nameByPersonId,
  canEdit,
  canViewBudget,
  projectId,
  people,
}: {
  parts: PartRow[];
  nameByPersonId: Map<string, string>;
  canEdit: boolean;
  canViewBudget: boolean;
  projectId: string;
  people: PersonOption[];
}) {
  if (parts.length === 0) {
    return <p className="text-muted-foreground">No parts yet.</p>;
  }

  // Shared across every row -- same "Unassigned" sentinel the full PartFormDialog's <Select>
  // already uses for a null responsible_person_id. Editors get the full roster (`people`, only
  // fetched for canEdit) so they can reassign to anyone; non-editors only need enough options to
  // label whichever person is *already* assigned (`nameByPersonId`, fetched for every viewer) --
  // the dropdown itself never renders for them, InlineEditSelect just needs a label to show.
  const responsibleOptions: InlineEditOption[] = canEdit
    ? [
        { value: "none", label: "Unassigned", badgeVariant: "outline" },
        ...people.map((p) => ({ value: p.id, label: p.full_name, badgeVariant: "outline" as const })),
      ]
    : [
        { value: "none", label: "Unassigned", badgeVariant: "outline" },
        ...[...nameByPersonId.entries()].map(([id, name]) => ({
          value: id, label: name, badgeVariant: "outline" as const,
        })),
      ];

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Part</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Responsible</TableHead>
          <TableHead>Billing</TableHead>
          <TableHead>Est. hours</TableHead>
          <TableHead>Progress</TableHead>
          <TableHead>Client price</TableHead>
          {canEdit && <TableHead className="text-right">Actions</TableHead>}
        </TableRow>
      </TableHeader>
      <TableBody>
        {parts.map((part) => (
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
              <InlineEditSelect
                value={part.responsible_person_id ?? "none"}
                options={responsibleOptions}
                canEdit={canEdit}
                ariaLabel="part responsible person"
                onSave={updatePartFieldAction.bind(null, projectId, part.id, "responsible_person_id")}
              />
            </TableCell>
            <TableCell>{humanize(part.billing_model)}</TableCell>
            <TableCell>{part.estimated_hours ?? "—"}</TableCell>
            <TableCell className="w-32">
              <Progress value={part.progress} />
              <div className="text-xs text-muted-foreground">{part.progress}%</div>
            </TableCell>
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
        ))}
      </TableBody>
    </Table>
  );
}
