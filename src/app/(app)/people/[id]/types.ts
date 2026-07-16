import type { Database } from "@/lib/database.types";

export type AssignmentRow = Database["public"]["Tables"]["assignments"]["Row"];
export type TimeEntryRow = Database["public"]["Tables"]["time_entries"]["Row"];
export type TimeOffRow = Database["public"]["Tables"]["time_off"]["Row"];

export type AssignmentWithProject = AssignmentRow & { project_name: string | null };
export type TimeEntryWithProject = TimeEntryRow & { project_name: string | null };

export type PersonSkillRow = {
  skill_id: string;
  level: number;
  skills: { name: string; category: string | null } | null;
};

// All-skills picker option for the "add skill" form -- deliberately narrow (id/name/category),
// fetched server-side in page.tsx and only ever passed down when the viewer can manage skills.
export type SkillOption = { id: string; name: string; category: string | null };

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
