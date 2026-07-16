"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requirePermission } from "@/lib/auth/require-permission";
import { createClient } from "@/lib/supabase/server";
import { writeAudit } from "@/lib/audit";
import { PERSON_STATUS_OPTIONS, personSchema, type PersonInput } from "@/lib/validation/person";

type ActionResult = { error: string } | { success: true; id: string };

export async function upsertPersonAction(
  input: PersonInput,
  personId?: string | null
): Promise<ActionResult> {
  if (personId && !z.uuid().safeParse(personId).success) return { error: "Invalid person." };

  // Security boundary: throws "Not authorized" if the caller lacks manage_people (global,
  // no project scope -- the people directory is shared). Must run before any validation/DB work.
  const current = await requirePermission("manage_people");

  const parsed = personSchema.safeParse(input);
  if (!parsed.success) return { error: "Invalid person details." };

  const supabase = await createClient();
  const write = personId
    ? supabase.from("people").update(parsed.data).eq("id", personId)
    : supabase.from("people").insert(parsed.data);
  const { data: person, error } = await write.select("id").single();
  if (error || !person) return { error: "Save failed. Try again." };

  await writeAudit({
    action: personId ? "person.updated" : "person.created",
    actorId: current.user.id,
    actorEmail: current.profile.email,
    resourceType: "person",
    resourceId: person.id,
    metadata: { full_name: parsed.data.full_name },
  });

  revalidatePath("/people");
  return { success: true as const, id: person.id };
}

export async function setPersonStatusAction(
  personId: string,
  status: (typeof PERSON_STATUS_OPTIONS)[number]
): Promise<{ error: string } | { success: true }> {
  if (!z.uuid().safeParse(personId).success) return { error: "Invalid person." };
  if (!(PERSON_STATUS_OPTIONS as readonly string[]).includes(status)) return { error: "Invalid status." };

  const current = await requirePermission("manage_people");

  const supabase = await createClient();
  const { error } = await supabase.from("people").update({ status }).eq("id", personId);
  if (error) return { error: "Update failed. Try again." };

  await writeAudit({
    action: "person.updated",
    actorId: current.user.id,
    actorEmail: current.profile.email,
    resourceType: "person",
    resourceId: personId,
    metadata: { status },
  });

  revalidatePath("/people");
  return { success: true as const };
}

/**
 * Hard delete -- only ever allowed when the person has NO assignments and NO time_entries.
 * Deleting a `people` row cascades (FK on delete cascade) to assignments/time_entries/rates/
 * person_skills, so this is destructive history loss whenever either exists; callers should
 * use setPersonStatusAction(id, "inactive") instead. This count-check exists purely to return
 * a friendly error -- the `people_prevent_delete_with_history` DB trigger (see migration
 * 20260716000004) is the real backstop against a race or a caller that skips this action.
 */
export async function deletePersonAction(
  personId: string
): Promise<{ error: string } | { success: true }> {
  if (!z.uuid().safeParse(personId).success) return { error: "Invalid person." };

  // Security boundary first.
  const current = await requirePermission("manage_people");

  const supabase = await createClient();

  // Capture the name before deletion for the audit trail (the row is gone afterward).
  const { data: person } = await supabase
    .from("people")
    .select("full_name")
    .eq("id", personId)
    .single();

  // Global history check (definer): accurate regardless of the caller's RLS scope.
  const { data: hasHistory } = await supabase.rpc("person_has_history", {
    p_person: personId,
  });
  if (hasHistory !== false) {
    return { error: "This person has assignments or logged time — set them inactive instead." };
  }

  const { error } = await supabase.from("people").delete().eq("id", personId);
  if (error) return { error: "This person has assignments or logged time — set them inactive instead." };

  await writeAudit({
    action: "person.deleted",
    actorId: current.user.id,
    actorEmail: current.profile.email,
    resourceType: "person",
    resourceId: personId,
    metadata: { full_name: person?.full_name ?? null },
  });

  revalidatePath("/people");
  return { success: true as const };
}
