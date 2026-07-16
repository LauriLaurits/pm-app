import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { formatMoney, humanize } from "../../types";
import { PartDeleteButton } from "./part-actions";
import { PartFormDialog } from "./part-form-dialog";
import type { PartRow, PersonOption } from "./types";

const PART_STATUS_BADGE: Record<PartRow["status"], "default" | "secondary" | "destructive" | "outline"> = {
  not_started: "outline",
  in_progress: "default",
  blocked: "destructive",
  done: "secondary",
};

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
              <Badge variant={PART_STATUS_BADGE[part.status]}>{humanize(part.status)}</Badge>
            </TableCell>
            <TableCell>
              {part.responsible_person_id ? nameByPersonId.get(part.responsible_person_id) ?? "—" : "—"}
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
