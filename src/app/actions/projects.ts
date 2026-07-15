"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requirePermission } from "@/lib/auth/require-permission";
import { createClient } from "@/lib/supabase/server";
import { writeAudit } from "@/lib/audit";
import {
  editProjectSchema,
  statusUpdateSchema,
  type EditProjectInput,
  type StatusUpdateInput,
} from "@/lib/validation/project";

export async function editProjectAction(
  projectId: string,
  input: EditProjectInput
): Promise<{ error: string } | { success: true }> {
  if (!z.uuid().safeParse(projectId).success) return { error: "Invalid project." };

  // Security boundary: throws "Not authorized" if the caller lacks edit_project on
  // this project. Must run before any validation/DB work.
  const current = await requirePermission("edit_project", projectId);

  const parsed = editProjectSchema.safeParse(input);
  if (!parsed.success) return { error: "Invalid project details." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("projects")
    .update(parsed.data)
    .eq("id", projectId);
  if (error) return { error: "Update failed. Try again." };

  await writeAudit({
    action: "project.updated",
    actorId: current.user.id,
    actorEmail: current.profile.email,
    resourceType: "project",
    resourceId: projectId,
    metadata: { fields: parsed.data },
  });

  revalidatePath(`/projects/${projectId}`);
  return { success: true as const };
}

export async function postStatusUpdateAction(
  projectId: string,
  input: StatusUpdateInput
): Promise<{ error: string } | { success: true }> {
  if (!z.uuid().safeParse(projectId).success) return { error: "Invalid project." };

  // Security boundary: throws "Not authorized" if the caller lacks edit_status on
  // this project. Must run before any validation/DB work.
  const current = await requirePermission("edit_status", projectId);

  const parsed = statusUpdateSchema.safeParse(input);
  if (!parsed.success) return { error: "Invalid status update." };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("project_status_updates")
    .insert({
      project_id: projectId,
      author_id: current.user.id,
      ...parsed.data,
    })
    .select("id")
    .single();
  if (error) return { error: "Post failed. Try again." };

  await writeAudit({
    action: "project.status_posted",
    actorId: current.user.id,
    actorEmail: current.profile.email,
    resourceType: "project",
    resourceId: projectId,
    metadata: { status_update_id: data.id },
  });

  revalidatePath(`/projects/${projectId}`);
  return { success: true as const };
}
