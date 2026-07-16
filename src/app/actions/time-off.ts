"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requirePermission } from "@/lib/auth/require-permission";
import { createClient } from "@/lib/supabase/server";
import { writeAudit } from "@/lib/audit";
import { timeOffSchema, type TimeOffInput } from "@/lib/validation/time-off";

type ActionResult = { error: string } | { success: true; id: number };

/** Add (no `timeOffId`) or edit (`timeOffId` set) a time-off period. The `ends_on >= starts_on`
 * check is mirrored in `timeOffSchema`, but the DB constraint (20260715000004_people_workload.sql)
 * remains the real backstop. */
export async function upsertTimeOffAction(
  personId: string,
  input: TimeOffInput,
  timeOffId?: number | null
): Promise<ActionResult> {
  if (!z.uuid().safeParse(personId).success) return { error: "Invalid person." };
  if (timeOffId != null && (!Number.isInteger(timeOffId) || timeOffId <= 0)) {
    return { error: "Invalid time-off entry." };
  }

  // Security boundary: throws "Not authorized" if the caller lacks manage_people (global, no
  // project scope). Must run before any validation/DB work.
  const current = await requirePermission("manage_people");

  const parsed = timeOffSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid time-off period." };

  const supabase = await createClient();
  const write = timeOffId
    ? supabase.from("time_off").update(parsed.data).eq("id", timeOffId).eq("person_id", personId)
    : supabase.from("time_off").insert({ ...parsed.data, person_id: personId });
  const { data: row, error } = await write.select("id").single();
  if (error || !row) return { error: "Save failed. Try again." };

  await writeAudit({
    action: "time_off.upserted",
    actorId: current.user.id,
    actorEmail: current.profile.email,
    resourceType: "time_off",
    resourceId: String(row.id),
    metadata: {
      person_id: personId,
      starts_on: parsed.data.starts_on,
      ends_on: parsed.data.ends_on,
      type: parsed.data.type,
    },
  });

  revalidatePath(`/people/${personId}`);
  revalidatePath("/people");
  return { success: true as const, id: row.id };
}

export async function deleteTimeOffAction(
  personId: string,
  timeOffId: number
): Promise<{ error: string } | { success: true }> {
  if (!z.uuid().safeParse(personId).success) return { error: "Invalid person." };
  if (!Number.isInteger(timeOffId) || timeOffId <= 0) return { error: "Invalid time-off entry." };

  const current = await requirePermission("manage_people");

  const supabase = await createClient();
  // Scoped by person_id in addition to RLS: defense-in-depth so this can never delete
  // anyone else's row, even if the RLS policy were ever loosened.
  const { error } = await supabase
    .from("time_off")
    .delete()
    .eq("id", timeOffId)
    .eq("person_id", personId);
  if (error) return { error: "Delete failed. Try again." };

  await writeAudit({
    action: "time_off.deleted",
    actorId: current.user.id,
    actorEmail: current.profile.email,
    resourceType: "time_off",
    resourceId: String(timeOffId),
    metadata: { person_id: personId },
  });

  revalidatePath(`/people/${personId}`);
  revalidatePath("/people");
  return { success: true as const };
}
