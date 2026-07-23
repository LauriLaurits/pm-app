import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { DotBadge } from "@/components/dot-badge";
import { utilizationBarClasses } from "@/lib/workload";
import { STATUS_DOT } from "../../projects/types";
import { humanize } from "../types";
import type { AssignmentWithProject, CurrentProjectItem } from "./types";
import { formatDate, formatPeriod } from "./types";

// One current engagement, assignment-decision framing: what project, in what role, for how many
// hours, until when, and who runs it. Same cell language as the projects list -- status dot
// chip, tabular-nums for every number, hover-dim link.
function CurrentProjectRow({ item }: { item: CurrentProjectItem }) {
  return (
    <div className="rounded-xl bg-card p-4 ring-1 ring-foreground/10 transition-shadow hover:shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <div className="flex min-w-0 items-center gap-2">
          {item.projectName ? (
            <Link
              href={`/projects/${item.projectId}`}
              className="truncate font-medium transition-opacity hover:opacity-70"
            >
              {item.projectName}
            </Link>
          ) : (
            <span className="font-medium text-muted-foreground">Untitled project</span>
          )}
          {item.projectStatus && (
            <DotBadge dotClassName={STATUS_DOT[item.projectStatus]} className="capitalize">
              {humanize(item.projectStatus)}
            </DotBadge>
          )}
        </div>
        <div className="text-base tabular-nums whitespace-nowrap">
          {item.allocationPct === null || item.allocatedHours === null ? (
            <span className="text-muted-foreground">—</span>
          ) : (
            <>
              <span className="font-semibold">{item.allocatedHours} h/week</span>{" "}
              <span className="font-medium text-muted-foreground">· {Math.round(item.allocationPct)}%</span>
            </>
          )}
        </div>
      </div>
      {item.allocationPct !== null && (
        <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-muted">
          <div
            className={"h-full rounded-full " + utilizationBarClasses(item.allocationPct)}
            style={{ width: Math.min(Math.max(item.allocationPct, 0), 100) + "%" }}
          />
        </div>
      )}
      <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground tabular-nums">
        <span>{item.roleOnProject ?? "—"}</span>
        <span aria-hidden className="text-border">·</span>
        <span className="whitespace-nowrap">
          {formatDate(item.projectStart)} → {formatDate(item.projectDeadline)}
        </span>
        <span aria-hidden className="text-border">·</span>
        <span className="truncate">PM {item.pmName ?? "—"}</span>
      </div>
      {item.membershipPeriods.length > 1 && (
        <div className="mt-1 text-xs text-muted-foreground/70 tabular-nums">
          Member{" "}
          {item.membershipPeriods
            .map((p) => (p.starts_on ? formatPeriod(p.starts_on, p.ends_on) : "—"))
            .join(", ")}
        </div>
      )}
    </div>
  );
}

// Upcoming/past engagements keep the previous compact anatomy -- they inform, they don't drive
// this week's assignment decision.
function CompactAssignmentRow({ assignment }: { assignment: AssignmentWithProject }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border p-3">
      <div className="min-w-0">
        {assignment.project_name ? (
          <Link
            href={`/projects/${assignment.project_id}`}
            className="font-medium transition-opacity hover:opacity-70"
          >
            {assignment.project_name}
          </Link>
        ) : (
          <span className="font-medium text-muted-foreground">Untitled project</span>
        )}
        <div className="text-xs text-muted-foreground tabular-nums">
          {assignment.role_on_project ?? "—"} · {formatPeriod(assignment.start_date, assignment.end_date)}
        </div>
      </div>
      <Badge variant="outline" className="tabular-nums">{assignment.allocation_pct}%</Badge>
    </div>
  );
}

function CompactGroup({ title, assignments }: { title: string; assignments: AssignmentWithProject[] }) {
  return (
    <div className="space-y-2">
      <h3 className="text-sm font-medium text-muted-foreground">{title}</h3>
      <div className="space-y-2">
        {assignments.map((a) => (
          <CompactAssignmentRow key={a.id} assignment={a} />
        ))}
      </div>
    </div>
  );
}

export function CurrentProjectsCard({
  current,
  upcoming,
  past,
}: {
  current: CurrentProjectItem[];
  upcoming: AssignmentWithProject[];
  past: AssignmentWithProject[];
}) {
  return (
    <section className="space-y-3">
      <h2 className="text-base font-medium">Current projects</h2>
      <div className="space-y-5">
        {current.length === 0 ? (
          <p className="text-sm text-muted-foreground">No active assignments right now.</p>
        ) : (
          <div className="space-y-2">
            {current.map((item) => (
              <CurrentProjectRow key={item.assignmentId} item={item} />
            ))}
          </div>
        )}
        {upcoming.length > 0 && <CompactGroup title="Upcoming" assignments={upcoming} />}
        {past.length > 0 && <CompactGroup title="History" assignments={past} />}
      </div>
    </section>
  );
}
