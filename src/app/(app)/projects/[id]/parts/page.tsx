import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/session";
import { PartFormDialog } from "./part-form-dialog";
import { PartsTable } from "./parts-table";
import type { PartRow, PersonOption, SafePartRow } from "./types";

export default async function ProjectPartsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  // RLS ("view project") means a caller without access gets zero rows -- indistinguishable
  // from not existing, which is the point (never leak existence). Layout already 404s too,
  // but this route can be reached directly, so check again here.
  const { data: project } = await supabase.from("projects").select("id").eq("id", id).maybeSingle();
  if (!project) notFound();

  // UX gating only -- the real security boundary is requirePermission() inside
  // upsertPartAction/deletePartAction, which re-checks has_permission server-side
  // regardless of what's rendered here.
  const current = await getCurrentUser();

  // One parallel round trip for everything that only depends on the route id / viewer (perf
  // feedback: these used to run in series, each adding a full DB round trip to TTFB).
  // part_billing is left-joined; RLS nulls it entirely for a caller without view_budget,
  // which is exactly the "—" behavior the table needs, no manual filtering required.
  // Actual hours per part are rolled up from time_entries (RLS scopes this to time the caller
  // may see -- own entries plus any project they hold view_time on; a viewer without it simply
  // gets zero rows and the table shows "— / est"). Entries with a null project_part_id are
  // project-level and intentionally excluded from the per-part actual.
  const [{ data: canEdit }, { data: canViewBudget }, { data: parts }, { data: timeRows }] =
    await Promise.all([
      current
        ? supabase.rpc("has_permission", { uid: current.user.id, perm: "edit_project", project: id })
        : Promise.resolve({ data: false }),
      current
        ? supabase.rpc("has_permission", { uid: current.user.id, perm: "view_budget", project: id })
        : Promise.resolve({ data: false }),
      supabase
        .from("project_parts")
        .select("*, part_billing(client_price, fixed_amount, hourly_rate, currency)")
        .eq("project_id", id)
        .order("created_at", { ascending: true }),
      supabase
        .from("time_entries")
        .select("project_part_id, hours")
        .eq("project_id", id)
        .not("project_part_id", "is", null),
    ]);
  // Plain Record (not Map): PartsTable is a client component now (sorting), props must serialize.
  const actualByPartId: Record<string, number> = {};
  for (const r of timeRows ?? []) {
    if (r.project_part_id) {
      actualByPartId[r.project_part_id] = (actualByPartId[r.project_part_id] ?? 0) + Number(r.hours);
    }
  }

  // responsible_person_id -> name resolved via `people` (RLS: view_people, granted
  // globally to every seeded role), same precedent as the Overview tab's pm/owner names.
  const personIds = [
    ...new Set((parts ?? []).map((p) => p.responsible_person_id).filter((v): v is string => !!v)),
  ];

  // Second parallel wave for the row-dependent lookups (assigned names depend on `parts`, the
  // full picker list depends on `canEdit` -- both from the wave above, independent of each other).
  const [{ data: assignedPeople }, { data: allPeople }] = await Promise.all([
    personIds.length
      ? supabase.from("people").select("id, full_name").in("id", personIds)
      : Promise.resolve({ data: [] as PersonOption[] }),
    // Full people list for the add/edit form's picker -- only fetched for editors.
    canEdit
      ? supabase.from("people").select("id, full_name").order("full_name")
      : Promise.resolve({ data: [] as PersonOption[] }),
  ]);
  const nameByPersonId: Record<string, string> = Object.fromEntries(
    (assignedPeople ?? []).map((p) => [p.id, p.full_name])
  );

  // PartsTable (below) is a "use client" component -- it owns the sort state -- so whatever
  // shape crosses that boundary gets serialized into the flight payload, readable in the raw
  // page response by ANY view_project holder on this project, edit rights or not. Build an
  // explicit allowlist (SafePartRow) rather than spreading each part: `notes` has no permission
  // gate of its own (project_parts RLS is row-level only), and `fixed_amount`/`hourly_rate` are
  // only ever rendered inside the edit form's canViewBudget block (PartsTable itself only shows
  // `client_price`). A JSON key survives serialization even when its value is null, so for
  // anyone who isn't edit_project these keys are OMITTED from the object entirely (not just
  // nulled) -- same effective masking RLS already applies to the whole `part_billing` join for a
  // non-view_budget caller (no row, not a row of nulls).
  const canEditParts = !!canEdit;
  const safeParts: SafePartRow[] = (parts ?? []).map((p) => {
    const part = p as PartRow;
    const row: SafePartRow = {
      id: part.id,
      name: part.name,
      description: part.description,
      status: part.status,
      responsible_person_id: part.responsible_person_id,
      billing_model: part.billing_model,
      estimated_hours: part.estimated_hours,
      part_billing: part.part_billing ? { client_price: part.part_billing.client_price } : null,
    };
    if (!canEditParts) return row;
    return {
      ...row,
      progress: part.progress,
      start_date: part.start_date,
      end_date: part.end_date,
      notes: part.notes,
      part_billing: part.part_billing
        ? {
            client_price: part.part_billing.client_price,
            fixed_amount: part.part_billing.fixed_amount,
            hourly_rate: part.part_billing.hourly_rate,
          }
        : null,
    };
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Parts</h2>
        {canEdit && <PartFormDialog projectId={id} people={allPeople ?? []} canViewBudget={!!canViewBudget} />}
      </div>
      <PartsTable
        parts={safeParts}
        nameByPersonId={nameByPersonId}
        actualByPartId={actualByPartId}
        canEdit={canEditParts}
        canViewBudget={!!canViewBudget}
        projectId={id}
        people={allPeople ?? []}
      />
    </div>
  );
}
