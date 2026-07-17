"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requirePermission } from "@/lib/auth/require-permission";
import { createClient } from "@/lib/supabase/server";
import { writeAudit } from "@/lib/audit";
import { timeEntrySchema, type TimeEntryInput } from "@/lib/validation/time-entry";

type ActionResult = { error: string } | { success: true; id: number };

export async function logTimeAction(input: TimeEntryInput): Promise<ActionResult> {
  // Security boundary: throws "Not authorized" if the caller lacks log_time. log_time is a
  // GLOBAL grant (member/PM/finance all have it) — there is no project to scope it to here;
  // the actual "can this person log time on THIS project" check is the RLS assignment guard
  // below, not this permission check. Must run before any validation/DB work.
  const current = await requirePermission("log_time");

  const parsed = timeEntrySchema.safeParse(input);
  if (!parsed.success) return { error: "Invalid time entry." };

  const supabase = await createClient();

  // person_id is ALWAYS derived server-side from the caller's own `people` row via the
  // `current_person_id()` SECURITY DEFINER RPC — never accepted from client input. A caller
  // with no linked people row (e.g. an admin account with no person record) gets a friendly
  // error instead of a broken insert.
  const { data: personId, error: personError } = await supabase.rpc("current_person_id");
  if (personError || !personId) {
    return { error: "Your account isn't linked to a person record — ask an admin." };
  }

  const { project_id, project_part_id, entry_date, hours, billable, description } = parsed.data;
  const { data: entry, error } = await supabase
    .from("time_entries")
    .insert({
      person_id: personId,
      project_id,
      project_part_id,
      entry_date,
      hours,
      billable,
      description,
    })
    .select("id")
    .single();

  if (error || !entry) {
    // The "log own time" RLS policy requires an EXISTS assignment row for (person, project) —
    // a caller who isn't assigned to this project gets a row-level-security policy violation
    // here (not a schema/validation error, since the picker already only offers assigned
    // projects). Surface a friendly message rather than the raw Postgres error either way.
    return { error: "You can only log time on projects you're assigned to." };
  }

  await writeAudit({
    action: "time.logged",
    actorId: current.user.id,
    actorEmail: current.profile.email,
    resourceType: "time_entry",
    resourceId: String(entry.id),
    metadata: { project_id, project_part_id, hours, billable },
  });

  revalidatePath(`/people/${personId}`);
  return { success: true as const, id: entry.id };
}

/** Edits an existing entry -- own entry only. The RLS "edit own time" policy
 * (person_id = current_person_id()) is the real backstop, applied here via the same
 * .eq("person_id", personId) defense-in-depth pattern as deleteTimeEntryAction below.
 * Its WITH CHECK also requires the (possibly changed) project_id to be one the caller is
 * a member of or assigned to -- same project relationship "log own time" requires on
 * insert -- so re-pointing an entry at an arbitrary project is rejected at the DB layer. */
export async function updateTimeEntryAction(
  entryId: number,
  input: TimeEntryInput
): Promise<{ error: string } | { success: true }> {
  if (!z.number().int().positive().safeParse(entryId).success) return { error: "Invalid entry." };

  // Security boundary: throws "Not authorized" if the caller lacks log_time. Must run before
  // any validation/DB work.
  const current = await requirePermission("log_time");

  const parsed = timeEntrySchema.safeParse(input);
  if (!parsed.success) return { error: "Invalid time entry." };

  const supabase = await createClient();
  const { data: personId, error: personError } = await supabase.rpc("current_person_id");
  if (personError || !personId) {
    return { error: "Your account isn't linked to a person record — ask an admin." };
  }

  const { project_id, project_part_id, entry_date, hours, billable, description } = parsed.data;
  const { error } = await supabase
    .from("time_entries")
    .update({ project_id, project_part_id, entry_date, hours, billable, description })
    .eq("id", entryId)
    .eq("person_id", personId);
  if (error) {
    // RLS "edit own time" WITH CHECK rejects re-pointing this entry to a project the
    // caller has no membership/assignment on (Postgres code 42501) -- surface a friendly
    // message instead of the raw policy-violation error.
    if (error.code === "42501") {
      return { error: "You can only log time on projects you're assigned to." };
    }
    return { error: "Update failed. Try again." };
  }

  await writeAudit({
    action: "time.updated",
    actorId: current.user.id,
    actorEmail: current.profile.email,
    resourceType: "time_entry",
    resourceId: String(entryId),
    metadata: { project_id, project_part_id, hours, billable },
  });

  revalidatePath(`/people/${personId}`);
  return { success: true as const };
}

export async function deleteTimeEntryAction(
  entryId: number
): Promise<{ error: string } | { success: true }> {
  if (!z.number().int().positive().safeParse(entryId).success) return { error: "Invalid entry." };

  // Security boundary: throws "Not authorized" if the caller lacks log_time. The real
  // ownership guard is the "delete own time" RLS policy (person_id = current_person_id()),
  // applied via the .eq("person_id", personId) filter below — but every mutation still starts
  // with requirePermission, per convention.
  const current = await requirePermission("log_time");

  const supabase = await createClient();
  const { data: personId, error: personError } = await supabase.rpc("current_person_id");
  if (personError || !personId) {
    return { error: "Your account isn't linked to a person record — ask an admin." };
  }

  // Scoped by person_id in addition to RLS: defense-in-depth so this can never delete
  // anyone else's row, even if the RLS policy were ever loosened.
  const { error } = await supabase
    .from("time_entries")
    .delete()
    .eq("id", entryId)
    .eq("person_id", personId);
  if (error) return { error: "Delete failed. Try again." };

  await writeAudit({
    action: "time.deleted",
    actorId: current.user.id,
    actorEmail: current.profile.email,
    resourceType: "time_entry",
    resourceId: String(entryId),
    metadata: {},
  });

  revalidatePath(`/people/${personId}`);
  return { success: true as const };
}
