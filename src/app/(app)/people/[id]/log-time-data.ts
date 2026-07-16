import "server-only";
import type { createClient } from "@/lib/supabase/server";
import type { AssignedProjectOption, AssignmentWithProject, PartOption } from "./types";

/** Resolves the projects/parts the viewer may log time against: their OWN assignments (ALL of
 * them -- current/upcoming/past -- matching the "log own time" RLS policy's date-unfiltered
 * assignment guard exactly) joined to already-resolved project names, plus parts on those
 * projects. Only ever called from page.tsx when the viewer is on their OWN person page; never
 * derived from client input, never an open-ended project/part list. */
export async function resolveLogTimeData(
  supabase: Awaited<ReturnType<typeof createClient>>,
  assignments: AssignmentWithProject[],
  projectNameById: Map<string, string>
): Promise<{ assignedProjects: AssignedProjectOption[]; partsByProject: Record<string, PartOption[]> }> {
  const assignedProjectIds = [...new Set(assignments.map((a) => a.project_id))];
  const assignedProjects: AssignedProjectOption[] = assignedProjectIds.map((pid) => ({
    id: pid,
    name: projectNameById.get(pid) ?? "Untitled project",
  }));

  const { data: partRows } = assignedProjectIds.length
    ? await supabase.from("project_parts").select("id, name, project_id").in("project_id", assignedProjectIds)
    : { data: [] as { id: string; name: string; project_id: string }[] };
  const partsByProject = (partRows ?? []).reduce<Record<string, PartOption[]>>((acc, p) => {
    (acc[p.project_id] ??= []).push({ id: p.id, name: p.name });
    return acc;
  }, {});

  return { assignedProjects, partsByProject };
}
