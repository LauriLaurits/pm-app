"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requirePermission } from "@/lib/auth/require-permission";
import { createClient } from "@/lib/supabase/server";
import { writeAudit } from "@/lib/audit";
import { withProjectIcon } from "@/lib/project-icons";
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
): Promise<{ error: string } | { success: true; id: string }> {
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

  // milestones live in their own table -- split off before the projects insert.
  const { milestones, icon_key, ...projectFields } = parsed.data;

  const { data: project, error } = await supabase
    .from("projects")
    .insert({
      ...projectFields,
      tags: withProjectIcon(projectFields.tags, icon_key),
      pm_id: pmId,
    })
    .select("id")
    .single();
  if (error) return { error: "Create failed. Try again." };

  // Timeline milestones: sort follows the order the PM entered them. The DB trigger
  // (20260721000004) syncs any start/end kind into projects.start_date/deadline, which is how
  // a new project gets its dates now. The project itself is already committed, so a failure
  // here is reported honestly rather than pretending the whole create failed.
  if (milestones.length > 0) {
    const { error: milestoneError } = await supabase
      .from("project_milestones")
      .insert(milestones.map((m, i) => ({ ...m, project_id: project.id, sort: i })));
    if (milestoneError) {
      return { error: "Project was created, but its milestones failed to save. Add them via Edit project." };
    }
  }

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
  return { success: true as const, id: project.id };
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

  // milestones live in their own table -- split off before the projects update. The update
  // round-trips the unchanged start_date/deadline; the milestone replace-all AFTER it lets the
  // sync trigger apply any changed start/end dates last, so they win.
  const { milestones, icon_key, ...projectFields } = parsed.data;

  const { error } = await supabase
    .from("projects")
    .update({ ...projectFields, tags: withProjectIcon(projectFields.tags, icon_key) })
    .eq("id", projectId);
  if (error) return { error: "Update failed. Try again." };

  // Replace-all write for the milestone rows, same pattern as client contacts (clients.ts):
  // tiny lists, and it keeps removals/reorders/kind changes one code path. `done` round-trips
  // through the form so toggled states survive the rewrite. RLS ("edit milestones" =
  // edit_project) is the real backstop. Deleting a start/end milestone deliberately leaves the
  // project's last-known dates in place (trigger only fires on insert/update).
  const { error: clearError } = await supabase
    .from("project_milestones")
    .delete()
    .eq("project_id", projectId);
  if (clearError) return { error: "Update failed. Try again." };
  if (milestones.length > 0) {
    const { error: milestoneError } = await supabase
      .from("project_milestones")
      .insert(milestones.map((m, i) => ({ ...m, project_id: projectId, sort: i })));
    if (milestoneError) return { error: "Saving milestones failed. Try again." };
  }

  // Auto-add a newly-assigned PM as a project_member, mirroring createProjectAction's
  // auto-add-self-as-member logic, so a reassigned PM isn't locked out of their own project
  // (the "PM isn't a member" gap). Best-effort: a failure here must not fail the whole edit,
  // since the project update itself already committed successfully. Dedupe is an explicit
  // existence check now -- member periods (20260722000001) dropped the unique
  // (project_id, user_id) constraint, so the old rely-on-23505 approach would silently stack
  // duplicate "Project Manager" periods on every reassignment.
  if (parsed.data.pm_id && before && before.pm_id !== parsed.data.pm_id) {
    try {
      const { data: existing } = await supabase
        .from("project_members")
        .select("id")
        .eq("project_id", projectId)
        .eq("user_id", parsed.data.pm_id)
        .limit(1)
        .maybeSingle();
      if (!existing) {
        const { error: memberError } = await supabase
          .from("project_members")
          .insert({ project_id: projectId, user_id: parsed.data.pm_id, role_on_project: "Project Manager" });
        if (memberError) {
          console.error("auto-add new PM as project member failed:", memberError.message);
        }
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
    metadata: { fields: projectFields, milestone_count: milestones.length },
  });

  revalidatePath(`/projects/${projectId}`);
  revalidatePath(`/projects/${projectId}/people`);
  return { success: true as const };
}

/**
 * Inline done-toggle for the Overview Milestones card -- one boolean on one row, so it skips
 * the full editProjectSchema replace-all the edit dialog uses. The extra `project_id` filter
 * pins the row to THIS project so a foreign milestone id can't ride in on this project's
 * edit_project grant (RLS would still require edit_project on the OTHER project, but belt and
 * braces). Kind/date/name edits stay in the edit dialog.
 */
export async function toggleMilestoneDoneAction(
  projectId: string,
  milestoneId: string,
  done: boolean
): Promise<{ error: string } | { success: true }> {
  if (!z.uuid().safeParse(projectId).success) return { error: "Invalid project." };
  if (!z.uuid().safeParse(milestoneId).success) return { error: "Invalid milestone." };
  if (typeof done !== "boolean") return { error: "Invalid value." };

  // Security boundary: throws "Not authorized" if the caller lacks edit_project on
  // this project. Must run before any validation/DB work.
  const current = await requirePermission("edit_project", projectId);

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("project_milestones")
    .update({ done })
    .eq("id", milestoneId)
    .eq("project_id", projectId)
    .select("name")
    .maybeSingle();
  if (error || !data) return { error: "Update failed. Try again." };

  await writeAudit({
    action: "milestone.toggled",
    actorId: current.user.id,
    actorEmail: current.profile.email,
    resourceType: "project",
    resourceId: projectId,
    metadata: { milestone_id: milestoneId, name: data.name, done },
  });

  revalidatePath(`/projects/${projectId}`);
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
