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
  projectInlineFieldSchema,
  statusUpdateSchema,
  type CreateProjectInput,
  type EditProjectInput,
  type EditProjectOutput,
  type ProjectInlineField,
  type StatusUpdateInput,
} from "@/lib/validation/project";

/**
 * A client_contact_id is only valid when it points at a contact OF the selected client -- a
 * bare uuid check can't know that, and the FK alone would happily accept another client's
 * contact. Reads via the RLS client, so a caller who can't see client_contacts (no
 * view_clients) simply can't set one either. Returns an error message or null. Not exported:
 * "use server" files may only export async server actions.
 */
async function validateClientContact(
  supabase: Awaited<ReturnType<typeof createClient>>,
  clientId: string | null,
  contactId: string | null
): Promise<string | null> {
  if (!contactId) return null;
  if (!clientId) return "Pick a client before picking a contact.";
  const { data: contact } = await supabase
    .from("client_contacts")
    .select("client_id")
    .eq("id", contactId)
    .maybeSingle();
  if (!contact || contact.client_id !== clientId) {
    return "That contact doesn't belong to the selected client.";
  }
  return null;
}

export async function createProjectAction(
  input: CreateProjectInput
): Promise<{ error: string }> {
  // Security boundary: throws "Not authorized" if the caller lacks create_project globally.
  // Must run before any validation/DB work.
  const current = await requirePermission("create_project");

  const parsed = createProjectSchema.safeParse(input);
  if (!parsed.success) return { error: "Invalid project details." };

  const supabase = await createClient();

  // pm_id defaults to the caller; assigning someone ELSE is only for admins/PMs (everyone
  // holding create_project) and only onto another active PM/admin. Mirrors -- and is backstopped
  // by -- the "create project" RLS policy (see 20260721000003), which re-checks exactly this
  // with has_permission(pm_id,'create_project') server-side. protect_project_pm still makes any
  // LATER reassignment admin-only.
  const pmId = parsed.data.pm_id ?? current.user.id;
  if (pmId !== current.user.id) {
    if (current.role !== "admin" && current.role !== "project_manager") {
      return { error: "Only an admin or project manager can assign another project manager." };
    }
    const { data: pmOk } = await supabase.rpc("has_permission", {
      uid: pmId,
      perm: "create_project",
    });
    if (pmOk !== true) return { error: "Selected project manager can't manage projects." };
  }

  const contactError = await validateClientContact(
    supabase, parsed.data.client_id, parsed.data.client_contact_id
  );
  if (contactError) return { error: contactError };

  const { data: project, error } = await supabase
    .from("projects")
    .insert({ ...parsed.data, pm_id: pmId })
    .select("id")
    .single();
  if (error) return { error: "Create failed. Try again." };

  // Auto-add the project's PM to the new project so a PM is never locked out of their own
  // project (the "PM isn't a member" gap): a project_members row for the People tab, which is
  // also what the "log own time" RLS policy now checks (membership-or-assignment). No synthetic
  // `assignments` row is created here -- that previously inflated workload allocation (a PM
  // managing N projects would show N*100% allocated). Best-effort: a failure here must not fail
  // the create, since the project itself was already committed successfully.
  try {
    const { error: memberError } = await supabase
      .from("project_members")
      .insert({ project_id: project.id, user_id: pmId, role_on_project: "Project Manager" });
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

  const contactError = await validateClientContact(
    supabase, parsed.data.client_id, parsed.data.client_contact_id
  );
  if (contactError) return { error: contactError };

  // Read the current pm_id BEFORE the update so we can detect a real change below. Only an
  // admin can ever actually change it -- the `protect_project_pm` DB trigger raises for anyone
  // else -- but a non-admin's form round-trips the same unchanged value, so this comparison
  // only ever fires for an admin's deliberate reassignment.
  const { data: before } = await supabase.from("projects").select("pm_id").eq("id", projectId).single();

  const { error } = await supabase
    .from("projects")
    .update(parsed.data)
    .eq("id", projectId);
  if (error) return { error: "Update failed. Try again." };

  // Auto-add a newly-assigned PM as a project_member, mirroring createProjectAction's
  // auto-add-self-as-member logic, so a reassigned PM isn't locked out of their own project
  // (the "PM isn't a member" gap). Best-effort: a failure here must not fail the whole edit,
  // since the project update itself already committed successfully. Ignores 23505 (already
  // a member) silently.
  if (parsed.data.pm_id && before && before.pm_id !== parsed.data.pm_id) {
    try {
      const { error: memberError } = await supabase
        .from("project_members")
        .insert({ project_id: projectId, user_id: parsed.data.pm_id, role_on_project: "Project Manager" });
      if (memberError && memberError.code !== "23505") {
        console.error("auto-add new PM as project member failed:", memberError.message);
      }
    } catch (e) {
      console.error("auto-add new PM as project member failed:", e);
    }
  }

  await writeAudit({
    action: "project.updated",
    actorId: current.user.id,
    actorEmail: current.profile.email,
    resourceType: "project",
    resourceId: projectId,
    metadata: { fields: parsed.data },
  });

  revalidatePath(`/projects/${projectId}`);
  revalidatePath(`/projects/${projectId}/people`);
  return { success: true as const };
}

/**
 * Inline single-field edit for the projects list table (ux-interaction-audit.md #20) --
 * status/health/priority only, one at a time, not the full editProjectSchema payload the
 * Overview edit dialog submits. `field` selects which enum to validate `value` against; the
 * inline cell only ever sends the one field the user just changed.
 */
export async function updateProjectFieldAction(
  projectId: string,
  field: ProjectInlineField,
  value: string
): Promise<{ error: string } | { success: true }> {
  if (!z.uuid().safeParse(projectId).success) return { error: "Invalid project." };

  // Security boundary: throws "Not authorized" if the caller lacks edit_project on
  // this project. Must run before any validation/DB work.
  const current = await requirePermission("edit_project", projectId);

  const parsed = projectInlineFieldSchema(field).safeParse(value);
  if (!parsed.success) return { error: "Invalid value." };

  const supabase = await createClient();
  // Built as a switch (not a computed `{ [field]: ... }`) so each branch's value keeps its own
  // narrow enum type instead of collapsing to a generic index signature Supabase's typed
  // `.update()` rejects.
  const patch =
    field === "status"
      ? { status: parsed.data as EditProjectOutput["status"] }
      : field === "health"
        ? { health: parsed.data as EditProjectOutput["health"] }
        : { priority: parsed.data as EditProjectOutput["priority"] };
  const { error } = await supabase.from("projects").update(patch).eq("id", projectId);
  if (error) return { error: "Update failed. Try again." };

  await writeAudit({
    action: "project.updated",
    actorId: current.user.id,
    actorEmail: current.profile.email,
    resourceType: "project",
    resourceId: projectId,
    metadata: { fields: { [field]: parsed.data } },
  });

  revalidatePath("/projects");
  revalidatePath(`/projects/${projectId}`);
  return { success: true as const };
}

/**
 * The app's soft-delete path: sets status='archived'. Archived projects stay fully visible
 * (the projects list/detail pages already render the "archived" status badge) -- this never
 * removes data, just retires the project from active use. Reversible via the normal Edit
 * project dialog (change status back).
 */
export async function archiveProjectAction(
  projectId: string
): Promise<{ error: string } | { success: true }> {
  if (!z.uuid().safeParse(projectId).success) return { error: "Invalid project." };

  // Security boundary: throws "Not authorized" if the caller lacks edit_project on this project.
  const current = await requirePermission("edit_project", projectId);

  const supabase = await createClient();
  const { error } = await supabase.from("projects").update({ status: "archived" }).eq("id", projectId);
  if (error) return { error: "Archive failed. Try again." };

  await writeAudit({
    action: "project.archived",
    actorId: current.user.id,
    actorEmail: current.profile.email,
    resourceType: "project",
    resourceId: projectId,
    metadata: {},
  });

  revalidatePath(`/projects/${projectId}`);
  revalidatePath("/projects");
  return { success: true as const };
}

/**
 * Hard delete -- admin-only. `edit_project` alone (which a PM holds on their own project) must
 * NOT be enough to permanently delete it; requirePermission establishes the caller holds at
 * least edit_project (per convention, run first), and the explicit role check below is the
 * real gate, mirroring the "admin delete project" RLS policy (`using (is_admin())`), which is
 * the actual backstop regardless of what this check does. Cascades via ON DELETE CASCADE to
 * project_members/project_parts/project_links/credentials/project_status_updates/budgets/etc --
 * irreversible, hence the heavy confirm copy in the UI (see project-danger-zone.tsx).
 */
export async function deleteProjectAction(projectId: string): Promise<{ error: string }> {
  if (!z.uuid().safeParse(projectId).success) return { error: "Invalid project." };

  const current = await requirePermission("edit_project", projectId);
  if (current.role !== "admin") {
    return { error: "Only an admin can permanently delete a project." };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("projects").delete().eq("id", projectId);
  if (error) return { error: "Delete failed. Try again." };

  await writeAudit({
    action: "project.deleted",
    actorId: current.user.id,
    actorEmail: current.profile.email,
    resourceType: "project",
    resourceId: projectId,
    metadata: {},
  });

  revalidatePath("/projects");
  redirect("/projects");
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
