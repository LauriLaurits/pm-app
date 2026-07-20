"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requirePermission } from "@/lib/auth/require-permission";
import { createClient } from "@/lib/supabase/server";
import { writeAudit } from "@/lib/audit";
import {
  addProjectPersonSchema, allocationDaysSchema, type AddProjectPersonInput,
} from "@/lib/validation/project";
import { daysToPct } from "@/lib/allocation";

type ActionResult = { error: string } | { success: true };

// A "person on a project" is one concept for the PM: adding writes both their access
// (project_members) and their allocation (assignments) atomically via add_project_person. The
// allocation flows straight into the Workload view. Every action re-checks manage_project_members
// server-side (the RPC self-checks too) before any write.

export async function addProjectPersonAction(
  projectId: string,
  input: AddProjectPersonInput
): Promise<ActionResult> {
  if (!z.uuid().safeParse(projectId).success) return { error: "Invalid project." };
  const current = await requirePermission("manage_project_members", projectId);

  const parsed = addProjectPersonSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid details." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("add_project_person", {
    p_project: projectId,
    p_user_id: parsed.data.user_id,
    // Postgres accepts NULL for these (nullable columns / coalesced start); the generated RPC
    // types just don't model nullable args, so assert past them.
    p_role: parsed.data.role_on_project as string,
    p_allocation: daysToPct(parsed.data.days_per_week),
    p_start: parsed.data.starts_on as string,
    p_end: parsed.data.ends_on as string,
  });
  if (error) return { error: "Could not add this person. Try again." };

  await writeAudit({
    action: "member.added",
    actorId: current.user.id,
    actorEmail: current.profile.email,
    resourceType: "project_member",
    resourceId: `${projectId}:${parsed.data.user_id}`,
    metadata: { project_id: projectId, user_id: parsed.data.user_id, allocation_pct: daysToPct(parsed.data.days_per_week) },
  });

  revalidatePath(`/projects/${projectId}/people`);
  return { success: true as const };
}

// Inline days/week cell in the members table -- takes a raw string from InlineEditText and
// converts to allocation_pct for storage.
export async function setPersonAllocationAction(
  projectId: string,
  userId: string,
  value: string
): Promise<ActionResult> {
  if (!z.uuid().safeParse(projectId).success) return { error: "Invalid project." };
  if (!z.uuid().safeParse(userId).success) return { error: "Invalid person." };
  const current = await requirePermission("manage_project_members", projectId);

  const parsed = allocationDaysSchema.safeParse(Number(value));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Enter 0.5–5 days." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("set_person_allocation", {
    p_project: projectId,
    p_user_id: userId,
    p_allocation: daysToPct(parsed.data),
  });
  if (error) return { error: "Could not update allocation." };

  await writeAudit({
    action: "member.updated",
    actorId: current.user.id,
    actorEmail: current.profile.email,
    resourceType: "project_member",
    resourceId: `${projectId}:${userId}`,
    metadata: { project_id: projectId, user_id: userId, allocation_pct: daysToPct(parsed.data) },
  });

  revalidatePath(`/projects/${projectId}/people`);
  return { success: true as const };
}

export async function removeProjectPersonAction(
  projectId: string,
  userId: string
): Promise<ActionResult> {
  if (!z.uuid().safeParse(projectId).success) return { error: "Invalid project." };
  if (!z.uuid().safeParse(userId).success) return { error: "Invalid person." };
  const current = await requirePermission("manage_project_members", projectId);

  const supabase = await createClient();
  const { error } = await supabase.rpc("remove_project_person", {
    p_project: projectId,
    p_user_id: userId,
  });
  if (error) return { error: "Could not remove this person." };

  await writeAudit({
    action: "member.removed",
    actorId: current.user.id,
    actorEmail: current.profile.email,
    resourceType: "project_member",
    resourceId: `${projectId}:${userId}`,
    metadata: { project_id: projectId, user_id: userId },
  });

  revalidatePath(`/projects/${projectId}/people`);
  return { success: true as const };
}
