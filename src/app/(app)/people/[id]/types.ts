import type { Database } from "@/lib/database.types";

export type AssignmentRow = Database["public"]["Tables"]["assignments"]["Row"];
export type TimeEntryRow = Database["public"]["Tables"]["time_entries"]["Row"];
export type TimeOffRow = Database["public"]["Tables"]["time_off"]["Row"];

export type AssignmentWithProject = AssignmentRow & { project_name: string | null };
export type TimeEntryWithProject = TimeEntryRow & { project_name: string | null };

export type ProjectStatus = Database["public"]["Enums"]["project_status"];

/** One row of the "Current projects" list -- an assignment joined (server-side, RLS-scoped)
 * with its project's status/dates/PM and the person's project_members role. Any join the
 * caller can't see (view_project, view_team, view_people) degrades to null -> em-dash. */
export type CurrentProjectItem = {
  assignmentId: string;
  projectId: string;
  projectName: string | null;
  projectStatus: ProjectStatus | null;
  projectStart: string | null;
  projectDeadline: string | null;
  pmName: string | null;
  roleOnProject: string | null;
  allocationPct: number | null;
  /** allocation_pct applied to the person's weekly capacity, rounded to 1 decimal. */
  allocatedHours: number | null;
  /** Extra membership periods (only when the person has >1 membership row on the project). */
  membershipPeriods: { starts_on: string | null; ends_on: string | null }[];
};

/** Minimal audit_logs projection for the Recent activity card (view_audit holders only). */
export type ActivityItem = { id: number; action: string; created_at: string };

// Log-time picker options — deliberately narrow (id/name only), built server-side in page.tsx
// from the viewer's OWN assignments/parts, never from an open-ended projects/parts query.
export type AssignedProjectOption = { id: string; name: string };
export type PartOption = { id: string; name: string };

export function formatDate(date: string | null) {
  if (!date) return "—";
  return new Date(date).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export function formatPeriod(startDate: string, endDate: string | null) {
  return `${formatDate(startDate)} – ${endDate ? formatDate(endDate) : "ongoing"}`;
}
