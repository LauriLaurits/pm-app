import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { PersonWorkloadRow } from "../types";
import { CapacitySummaryCard } from "./capacity-summary-card";
import { CurrentProjectsCard } from "./current-projects-card";
import { FinancialsCard } from "./financials-card";
import { PersonHeader } from "./person-header";
import { RecentHoursCard } from "./recent-hours-card";
import { SkillsCard } from "./skills-card";
import { TimeOffCard } from "./time-off-card";
import type {
  AssignmentWithProject,
  PersonSkillRow,
  TimeEntryWithProject,
  TimeOffRow,
} from "./types";

export default async function PersonDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  // "view people" RLS (view_people permission, granted globally to every seeded role) means a
  // caller without access simply gets zero rows back here -- not an error. That is
  // indistinguishable from the person not existing, which is the point: never leak existence.
  const { data: person } = await supabase
    .from("person_workload_rows")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (!person) notFound();
  const row = person as PersonWorkloadRow;

  // "view assignments" / "read own time" / "view time_off" / "view person_skills" RLS already
  // scopes each of these to whatever the caller may see (global for PM/finance/admin, own rows
  // for a plain member) -- this page does not widen any of that, it just reads through it.
  const [{ data: assignmentRows }, { data: timeEntryRows }, { data: timeOffRows }, { data: skillRows }] =
    await Promise.all([
      supabase
        .from("assignments")
        .select("*")
        .eq("person_id", id)
        .order("start_date", { ascending: false }),
      supabase
        .from("time_entries")
        .select("*")
        .eq("person_id", id)
        .order("entry_date", { ascending: false })
        .limit(20),
      supabase
        .from("time_off")
        .select("*")
        .eq("person_id", id)
        .order("starts_on", { ascending: false }),
      supabase
        .from("person_skills")
        .select("level, skills(name, category)")
        .eq("person_id", id),
    ]);

  // Project names resolved via a separate `projects` query (RLS: "view project", scoped by
  // has_permission(..., 'view_project', id)) rather than a nested select on assignments/
  // time_entries -- same precedent as pm/owner names on the Project Overview tab and member
  // names on the Project People tab: a caller who can see the assignment row but lacks
  // view_project on that specific project gets a missing name here rather than a join error.
  const projectIds = [
    ...new Set([
      ...(assignmentRows ?? []).map((a) => a.project_id),
      ...(timeEntryRows ?? []).map((t) => t.project_id),
    ]),
  ];
  const { data: projectRows } = projectIds.length
    ? await supabase.from("projects").select("id, name").in("id", projectIds)
    : { data: [] as { id: string; name: string }[] };
  const projectNameById = new Map((projectRows ?? []).map((p) => [p.id, p.name]));

  const assignments: AssignmentWithProject[] = (assignmentRows ?? []).map((a) => ({
    ...a,
    project_name: projectNameById.get(a.project_id) ?? null,
  }));
  const timeEntries: TimeEntryWithProject[] = (timeEntryRows ?? []).map((t) => ({
    ...t,
    project_name: projectNameById.get(t.project_id) ?? null,
  }));

  const today = new Date().toISOString().slice(0, 10);
  const current = assignments.filter(
    (a) => a.start_date <= today && (!a.end_date || a.end_date >= today)
  );
  const upcoming = assignments.filter((a) => a.start_date > today);
  const past = assignments.filter((a) => a.end_date && a.end_date < today);

  // Finance gating lives entirely in `person_workload_rows` (security_invoker view whose LEFT
  // JOIN onto `rates` is nulled by RLS for non-finance callers) -- this page never reads
  // `rates` directly. Non-null here means the caller already has view_internal_cost.
  const showFinancials = row.internal_cost !== null || row.billing_rate !== null;

  return (
    <div className="space-y-4">
      <PersonHeader person={row} />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <CurrentProjectsCard current={current} upcoming={upcoming} past={past} />
          <RecentHoursCard entries={timeEntries} />
        </div>
        <div className="space-y-4">
          <CapacitySummaryCard person={row} />
          <SkillsCard skills={(skillRows ?? []) as PersonSkillRow[]} />
          <TimeOffCard timeOff={(timeOffRows ?? []) as TimeOffRow[]} />
          {showFinancials && <FinancialsCard person={row} />}
        </div>
      </div>
    </div>
  );
}
