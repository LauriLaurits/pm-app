import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { AssignmentWithProject } from "./types";
import { formatPeriod } from "./types";

function AssignmentRow({ assignment }: { assignment: AssignmentWithProject }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border p-3">
      <div className="min-w-0">
        {assignment.project_name ? (
          <Link
            href={`/projects/${assignment.project_id}`}
            className="font-medium hover:underline"
          >
            {assignment.project_name}
          </Link>
        ) : (
          <span className="font-medium text-muted-foreground">Untitled project</span>
        )}
        <div className="text-xs text-muted-foreground">
          {assignment.role_on_project ?? "—"} · {formatPeriod(assignment.start_date, assignment.end_date)}
        </div>
      </div>
      <Badge variant="outline">{assignment.allocation_pct}%</Badge>
    </div>
  );
}

function AssignmentGroup({
  title,
  assignments,
  emptyLabel,
}: {
  title: string;
  assignments: AssignmentWithProject[];
  emptyLabel: string;
}) {
  return (
    <div className="space-y-2">
      <h3 className="text-sm font-medium text-muted-foreground">{title}</h3>
      {assignments.length === 0 ? (
        <p className="text-sm text-muted-foreground">{emptyLabel}</p>
      ) : (
        <div className="space-y-2">
          {assignments.map((a) => (
            <AssignmentRow key={a.id} assignment={a} />
          ))}
        </div>
      )}
    </div>
  );
}

export function CurrentProjectsCard({
  current,
  upcoming,
  past,
}: {
  current: AssignmentWithProject[];
  upcoming: AssignmentWithProject[];
  past: AssignmentWithProject[];
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Projects</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <AssignmentGroup
          title="Current"
          assignments={current}
          emptyLabel="No active assignments right now."
        />
        {upcoming.length > 0 && (
          <AssignmentGroup title="Upcoming" assignments={upcoming} emptyLabel="" />
        )}
        {past.length > 0 && (
          <AssignmentGroup title="History" assignments={past} emptyLabel="" />
        )}
      </CardContent>
    </Card>
  );
}
