"use client";

import { useTransition } from "react";
import { CheckIcon } from "lucide-react";
import { toggleMilestoneDoneAction } from "@/app/actions/projects";
import { daysUntil } from "@/lib/dashboard";
import { cn } from "@/lib/utils";
import { formatDate } from "../types";
import type { MilestoneRow } from "./types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DotBadge } from "@/components/dot-badge";

// Start borrows the planning dot (violet), End the completed dot (blue) -- same dot-badge
// language as project statuses, so the two special kinds read as timeline anchors, not states.
const KIND_BADGE: Record<string, { label: string; dot: string }> = {
  start: { label: "Start", dot: "bg-violet-400" },
  end: { label: "End", dot: "bg-blue-500" },
};

/**
 * Chronological milestone list on the project Overview (P4 feedback). Row states: done =
 * green check, overdue-and-not-done = red date, upcoming = neutral. Editors (edit_project)
 * toggle done inline; adding/removing/renaming lives in the Edit project dialog's Timeline
 * section. Start/End rows are the ones feeding the project's start date and deadline.
 */
export function MilestonesCard({
  projectId,
  milestones,
  canEdit,
}: {
  projectId: string;
  milestones: MilestoneRow[];
  canEdit: boolean;
}) {
  if (milestones.length === 0) {
    // Quiet empty state; the card earns its slot only for editors, who can add milestones.
    if (!canEdit) return null;
    return (
      <Card>
        <CardHeader>
          <CardTitle>Milestones</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            No milestones yet. Add them via Edit project — a Start and an End milestone set the
            project&apos;s dates.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Milestones</CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="space-y-2.5">
          {milestones.map((m) => (
            <MilestoneItem key={m.id} projectId={projectId} milestone={m} canEdit={canEdit} />
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

function MilestoneItem({
  projectId,
  milestone,
  canEdit,
}: {
  projectId: string;
  milestone: MilestoneRow;
  canEdit: boolean;
}) {
  const [isPending, startTransition] = useTransition();
  const overdue = !milestone.done && daysUntil(milestone.due_on) < 0;
  const kindBadge = KIND_BADGE[milestone.kind];

  const indicator = (
    <span
      className={cn(
        "flex size-4 shrink-0 items-center justify-center rounded-full border transition-colors",
        milestone.done
          ? "border-emerald-500 bg-emerald-500 text-white"
          : "border-muted-foreground/40 bg-transparent",
        canEdit && !milestone.done && "group-hover:border-emerald-500",
        isPending && "opacity-50"
      )}
    >
      {milestone.done && <CheckIcon className="size-3" strokeWidth={3} />}
    </span>
  );

  return (
    <li className="flex items-center gap-2.5">
      {canEdit ? (
        <button
          type="button"
          className="group cursor-pointer"
          disabled={isPending}
          aria-label={milestone.done ? `Mark ${milestone.name} not done` : `Mark ${milestone.name} done`}
          title={milestone.done ? "Mark not done" : "Mark done"}
          onClick={() =>
            startTransition(async () => {
              await toggleMilestoneDoneAction(projectId, milestone.id, !milestone.done);
            })
          }
        >
          {indicator}
        </button>
      ) : (
        indicator
      )}
      <span className={cn("min-w-0 flex-1 truncate text-sm", milestone.done && "text-muted-foreground")}>
        {milestone.name}
      </span>
      {kindBadge && <DotBadge dotClassName={kindBadge.dot}>{kindBadge.label}</DotBadge>}
      <span
        className={cn(
          "shrink-0 text-sm tabular-nums",
          overdue ? "font-medium text-red-600 dark:text-red-400" : "text-muted-foreground"
        )}
        title={overdue ? `${-daysUntil(milestone.due_on)} days overdue` : undefined}
      >
        {formatDate(milestone.due_on)}
      </span>
    </li>
  );
}
