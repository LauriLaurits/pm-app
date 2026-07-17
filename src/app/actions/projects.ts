"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requirePermission } from "@/lib/auth/require-permission";
import { createClient } from "@/lib/supabase/server";
import { writeAudit } from "@/lib/audit";
import {
  createProjectSchema,
  editProjectSchema,
  statusUpdateSchema,
  type CreateProjectInput,
  type EditProjectInput,
  type StatusUpdateInput,
} from "@/lib/validation/project";

export async function createProjectAction(
  input: CreateProjectInput
): Promise<{ error: string }> {
  // Security boundary: throws "Not authorized" if the caller lacks create_project globally.
  // Must run before any validation/DB work.
  const current = await requirePermission("create_project");

  const parsed = createProjectSchema.safeParse(input);
  if (!parsed.success) return { error: "Invalid project details." };

  const supabase = await createClient();
  // pm_id is server-derived from the session, never taken from the client -- the "create
  // project" RLS policy requires pm_id = auth.uid() for every non-admin anyway, but this is
  // the actual security boundary the client-side form never gets a chance to violate.
  const { data: project, error } = await supabase
    .from("projects")
    .insert({ ...parsed.data, pm_id: current.user.id })
    .select("id")
    .single();
  if (error) return { error: "Create failed. Try again." };

  // Auto-add the creator to the new project so a PM is never locked out of their own
  // project (the "PM isn't a member" gap): a project_members row for the People tab, which is
  // also what the "log own time" RLS policy now checks (membership-or-assignment). No synthetic
  // `assignments` row is created here -- that previously inflated workload allocation (a PM
  // managing N projects would show N*100% allocated). Best-effort: a failure here must not fail
  // the create, since the project itself was already committed successfully.
  try {
    const { error: memberError } = await supabase
      .from("project_members")
      .insert({ project_id: project.id, user_id: current.user.id, role_on_project: "Project Manager" });
    if (memberError) console.error("auto-add PM as project member failed:", memberError.message);
  } catch (e) {
    console.error("auto-add PM as project member failed:", e);
  }

  await writeAudit({
    action: "project.created",
    actorId: current.user.id,
    actorEmail: current.profile.email,
    resourceType: "project",
    resourceId: project.id,
    metadata: { name: parsed.data.name },
  });

  revalidatePath("/projects");
  redirect(`/projects/${project.id}`);
}

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
