"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requirePermission } from "@/lib/auth/require-permission";
import { createClient } from "@/lib/supabase/server";
import { writeAudit } from "@/lib/audit";
import { personSkillSchema, type PersonSkillInput } from "@/lib/validation/person-skills";

type ActionResult = { error: string } | { success: true };
type SupabaseClient = Awaited<ReturnType<typeof createClient>>;

/** Resolves the skill to link: an existing `skill_id`, or -- when the caller instead typed a
 * new name -- find-or-create a `skills` row for it. `skills.name` is unique, so a race with
 * another caller creating the same name in parallel is resolved by re-reading on the 23505
 * conflict rather than surfacing an error. */
async function resolveSkillId(
  supabase: SupabaseClient,
  data: { skill_id: string | null; new_skill_name: string | null; new_skill_category: string | null }
): Promise<{ skillId: string } | { error: string }> {
  if (data.skill_id) return { skillId: data.skill_id };

  const { data: created, error } = await supabase
    .from("skills")
    .insert({ name: data.new_skill_name!, category: data.new_skill_category })
    .select("id")
    .single();
  if (created) return { skillId: created.id };

  if (error?.code === "23505") {
    const { data: existing } = await supabase
      .from("skills")
      .select("id")
      .eq("name", data.new_skill_name!)
      .maybeSingle();
    if (existing) return { skillId: existing.id };
  }
  return { error: "Could not create the skill. Try again." };
}

/** Adds (or re-links) a skill on a person. `input.skill_id` picks an existing `skills` row;
 * `input.new_skill_name` instead creates one on the fly (see resolveSkillId). Upserts on the
 * (person_id, skill_id) primary key so re-adding an already-linked skill just updates its level
 * instead of erroring on the unique constraint. */
export async function addPersonSkillAction(
  personId: string,
  input: PersonSkillInput
): Promise<ActionResult> {
  if (!z.uuid().safeParse(personId).success) return { error: "Invalid person." };

  // Security boundary: throws "Not authorized" if the caller lacks manage_people (global, no
  // project scope -- the people directory is shared). Must run before any validation/DB work.
  const current = await requirePermission("manage_people");

  const parsed = personSkillSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid skill." };

  const supabase = await createClient();
  const resolved = await resolveSkillId(supabase, parsed.data);
  if ("error" in resolved) return resolved;

  const { error } = await supabase
    .from("person_skills")
    .upsert(
      { person_id: personId, skill_id: resolved.skillId, level: parsed.data.level },
      { onConflict: "person_id,skill_id" }
    );
  if (error) return { error: "Add failed. Try again." };

  await writeAudit({
    action: "person_skill.added",
    actorId: current.user.id,
    actorEmail: current.profile.email,
    resourceType: "person_skill",
    resourceId: `${personId}:${resolved.skillId}`,
    metadata: { person_id: personId, skill_id: resolved.skillId, level: parsed.data.level },
  });

  revalidatePath(`/people/${personId}`);
  revalidatePath("/people");
  return { success: true as const };
}

export async function setPersonSkillLevelAction(
  personId: string,
  skillId: string,
  level: number
): Promise<ActionResult> {
  if (!z.uuid().safeParse(personId).success) return { error: "Invalid person." };
  if (!z.uuid().safeParse(skillId).success) return { error: "Invalid skill." };
  if (!Number.isInteger(level) || level < 1 || level > 5) {
    return { error: "Level must be between 1 and 5." };
  }

  const current = await requirePermission("manage_people");

  const supabase = await createClient();
  const { error } = await supabase
    .from("person_skills")
    .update({ level })
    .eq("person_id", personId)
    .eq("skill_id", skillId);
  if (error) return { error: "Update failed. Try again." };

  // Reuses "person_skill.added" -- there's no separate audit action for a level-only change,
  // since it's the same link being updated, not created/removed. `level_updated` distinguishes
  // it in the metadata for anyone reading the audit trail.
  await writeAudit({
    action: "person_skill.added",
    actorId: current.user.id,
    actorEmail: current.profile.email,
    resourceType: "person_skill",
    resourceId: `${personId}:${skillId}`,
    metadata: { person_id: personId, skill_id: skillId, level, level_updated: true },
  });

  revalidatePath(`/people/${personId}`);
  revalidatePath("/people");
  return { success: true as const };
}

export async function removePersonSkillAction(
  personId: string,
  skillId: string
): Promise<ActionResult> {
  if (!z.uuid().safeParse(personId).success) return { error: "Invalid person." };
  if (!z.uuid().safeParse(skillId).success) return { error: "Invalid skill." };

  const current = await requirePermission("manage_people");

  const supabase = await createClient();
  const { error } = await supabase
    .from("person_skills")
    .delete()
    .eq("person_id", personId)
    .eq("skill_id", skillId);
  if (error) return { error: "Remove failed. Try again." };

  await writeAudit({
    action: "person_skill.removed",
    actorId: current.user.id,
    actorEmail: current.profile.email,
    resourceType: "person_skill",
    resourceId: `${personId}:${skillId}`,
    metadata: { person_id: personId, skill_id: skillId },
  });

  revalidatePath(`/people/${personId}`);
  revalidatePath("/people");
  return { success: true as const };
}
