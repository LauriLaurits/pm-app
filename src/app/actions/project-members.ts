"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requirePermission } from "@/lib/auth/require-permission";
import { createClient } from "@/lib/supabase/server";
import { writeAudit } from "@/lib/audit";
import {
  addMemberSchema, updateMemberSchema, type AddMemberInput, type UpdateMemberInput,
} from "@/lib/validation/project";

type ActionResult = { error: string } | { success: true };

export async function addMemberAction(
  projectId: string,
  input: AddMemberInput
): Promise<ActionResult> {
  if (!z.uuid().safeParse(projectId).success) return { error: "Invalid project." };

  // Security boundary: throws "Not authorized" if the caller lacks manage_project_members
  // on this project. Must run before any validation/DB work.
  const current = await requirePermission("manage_project_members", projectId);

  const parsed = addMemberSchema.safeParse(input);
  if (!parsed.success) return { error: "Invalid member details." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("project_members")
    .insert({ project_id: projectId, ...parsed.data });
  if (error) {
    // unique (project_id, user_id) — a friendlier message than the raw constraint error.
    if (error.code === "23505") return { error: "That person is already a member of this project." };
    return { error: "Add failed. Try again." };
  }

  await writeAudit({
    action: "member.added",
    actorId: current.user.id,
    actorEmail: current.profile.email,
    resourceType: "project_member",
    resourceId: `${projectId}:${parsed.data.user_id}`,
    metadata: { project_id: projectId, user_id: parsed.data.user_id },
  });

  revalidatePath(`/projects/${projectId}/people`);
  return { success: true as const };
}

/** Edits role/date range on an existing membership -- never which user it belongs to (that's
 * remove-and-re-add, a different membership). */
export async function updateMemberAction(
  projectId: string,
  memberId: number,
  input: UpdateMemberInput
): Promise<ActionResult> {
  if (!z.uuid().safeParse(projectId).success) return { error: "Invalid project." };
  if (!Number.isInteger(memberId) || memberId <= 0) return { error: "Invalid member." };

  // Security boundary: throws "Not authorized" if the caller lacks manage_project_members
  // on this project. Must run before any validation/DB work.
  const current = await requirePermission("manage_project_members", projectId);

  const parsed = updateMemberSchema.safeParse(input);
  if (!parsed.success) return { error: "Invalid member details." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("project_members")
    .update(parsed.data)
    .eq("id", memberId)
    .eq("project_id", projectId);
  if (error) return { error: "Update failed. Try again." };

  await writeAudit({
    action: "member.updated",
    actorId: current.user.id,
    actorEmail: current.profile.email,
    resourceType: "project_member",
    resourceId: String(memberId),
    metadata: { project_id: projectId },
  });

  revalidatePath(`/projects/${projectId}/people`);
  return { success: true as const };
}

export async function removeMemberAction(
  projectId: string,
  memberId: number
): Promise<ActionResult> {
  if (!z.uuid().safeParse(projectId).success) return { error: "Invalid project." };
  if (!Number.isInteger(memberId) || memberId <= 0) return { error: "Invalid member." };

  // Security boundary: throws "Not authorized" if the caller lacks manage_project_members
  // on this project. Must run before any validation/DB work.
  const current = await requirePermission("manage_project_members", projectId);

  const supabase = await createClient();
  const { error } = await supabase
    .from("project_members")
    .delete()
    .eq("id", memberId)
    .eq("project_id", projectId);
  if (error) return { error: "Remove failed. Try again." };

  await writeAudit({
    action: "member.removed",
    actorId: current.user.id,
    actorEmail: current.profile.email,
    resourceType: "project_member",
    resourceId: String(memberId),
    metadata: { project_id: projectId },
  });

  revalidatePath(`/projects/${projectId}/people`);
  return { success: true as const };
}
