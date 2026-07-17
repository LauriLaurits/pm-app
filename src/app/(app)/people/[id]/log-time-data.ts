import "server-only";
import type { createClient } from "@/lib/supabase/server";
import type { AssignedProjectOption, AssignmentWithProject, PartOption } from "./types";

/** Resolves the projects/parts the viewer may log time against. Mirrors the "log own time" RLS
 * policy exactly: a project is loggable if the viewer is a MEMBER of it (project_members) OR has
 * an assignment on it. (The policy was widened from assignment-only to membership-or-assignment
 * so PMs -- who are auto-added as members of their own projects but need no allocation -- can log
 * time without a synthetic assignment inflating the workload view.) Only ever called from page.tsx
 * when the viewer is on their OWN person page; never derived from client input. */
export async function resolveLogTimeData(
  supabase: Awaited<ReturnType<typeof createClient>>,
  viewerUserId: string,
  assignments: AssignmentWithProject[],
  projectNameById: Map<string, string>
): Promise<{ assignedProjects: AssignedProjectOption[]; partsByProject: Record<string, PartOption[]> }> {
  // Projects the viewer is a member of (RLS lets a member read their own project_members rows).
  const { data: memberRows } = await supabase
    .from("project_members")
    .select("project_id")
    .eq("user_id", viewerUserId);

  const loggableIds = [
    ...new Set([
      ...assignments.map((a) => a.project_id),
      ...(memberRows ?? []).map((m) => m.project_id),
    ]),
  ];

  if (loggableIds.length === 0) {
    return { assignedProjects: [], partsByProject: {} };
  }

  // Names for any loggable project not already resolved from the assignment join (membership-only
  // projects won't be in projectNameById). RLS returns only projects the viewer may see.
  const missingIds = loggableIds.filter((id) => !projectNameById.has(id));
  if (missingIds.length) {
    const { data: named } = await supabase
      .from("projects")
      .select("id, name")
      .in("id", missingIds);
    for (const p of named ?? []) projectNameById.set(p.id, p.name);
  }

  const assignedProjects: AssignedProjectOption[] = loggableIds.map((pid) => ({
    id: pid,
    name: projectNameById.get(pid) ?? "Untitled project",
  }));

  const { data: partRows } = await supabase
    .from("project_parts")
    .select("id, name, project_id")
    .in("project_id", loggableIds);
  const partsByProject = (partRows ?? []).reduce<Record<string, PartOption[]>>((acc, p) => {
    (acc[p.project_id] ??= []).push({ id: p.id, name: p.name });
    return acc;
  }, {});

  return { assignedProjects, partsByProject };
}
