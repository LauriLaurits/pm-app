"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requirePermission } from "@/lib/auth/require-permission";
import { createClient } from "@/lib/supabase/server";
import { writeAudit } from "@/lib/audit";
import { partSchema, type PartInput } from "@/lib/validation/project";

type ActionResult = { error: string } | { success: true; id: string };

export async function upsertPartAction(
  projectId: string,
  input: PartInput,
  partId?: string | null
): Promise<ActionResult> {
  if (!z.uuid().safeParse(projectId).success) return { error: "Invalid project." };
  if (partId && !z.uuid().safeParse(partId).success) return { error: "Invalid part." };

  // Security boundary: throws "Not authorized" if the caller lacks edit_project on
  // this project. Must run before any validation/DB work.
  const current = await requirePermission("edit_project", projectId);

  const parsed = partSchema.safeParse(input);
  if (!parsed.success) return { error: "Invalid part details." };

  // Billing figures (client_price/fixed_amount/hourly_rate) live in the separate
  // manage_budget-gated part_billing table, never in project_parts.
  const { client_price, fixed_amount, hourly_rate, ...partFields } = parsed.data;

  const supabase = await createClient();
  const isNewPart = !partId;
  const write = partId
    ? supabase.from("project_parts").update(partFields).eq("id", partId).eq("project_id", projectId)
    : supabase.from("project_parts").insert({ project_id: projectId, ...partFields });
  const { data: part, error } = await write.select("id").single();
  if (error || !part) return { error: "Save failed. Try again." };

  // Only write part_billing if the form actually submitted billing figures AND the
  // caller holds manage_budget — this matches the RLS "manage part billing" policy on
  // part_billing exactly (that policy checks manage_budget, not view_budget, which
  // only gates reads). A caller without manage_budget never sees/submits these fields
  // in the UI, but we re-check server-side rather than trusting the client — and skip
  // silently (not an error) rather than attempting a write RLS would reject anyway.
  const billingProvided = client_price != null || fixed_amount != null || hourly_rate != null;
  if (billingProvided) {
    const { data: canManageBudget } = await supabase.rpc("has_permission", {
      uid: current.user.id,
      perm: "manage_budget",
      project: projectId,
    });
    if (canManageBudget === true) {
      const { error: billingError } = await supabase
        .from("part_billing")
        .upsert({ part_id: part.id, client_price, fixed_amount, hourly_rate });
      if (billingError) {
        if (isNewPart) {
          // Compensating cleanup: the client never learned this part's id, so leaving
          // it in place would cause a resubmit to insert a duplicate part. Delete it
          // so the failure is atomic — nothing was saved.
          await supabase
            .from("project_parts")
            .delete()
            .eq("id", part.id)
            .eq("project_id", projectId);
          return { error: "Could not save part billing. Nothing was saved — try again." };
        }
        return { error: "Part saved, but billing update failed." };
      }
    }
  }

  await writeAudit({
    action: "part.upserted",
    actorId: current.user.id,
    actorEmail: current.profile.email,
    resourceType: "project_part",
    resourceId: part.id,
    metadata: { project_id: projectId, billing_updated: billingProvided },
  });

  revalidatePath(`/projects/${projectId}/parts`);
  return { success: true as const, id: part.id };
}

export async function deletePartAction(
  projectId: string,
  partId: string
): Promise<{ error: string } | { success: true }> {
  if (!z.uuid().safeParse(projectId).success) return { error: "Invalid project." };
  if (!z.uuid().safeParse(partId).success) return { error: "Invalid part." };

  // Security boundary: throws "Not authorized" if the caller lacks edit_project on
  // this project. Must run before any validation/DB work.
  const current = await requirePermission("edit_project", projectId);

  const supabase = await createClient();
  const { error } = await supabase
    .from("project_parts")
    .delete()
    .eq("id", partId)
    .eq("project_id", projectId);
  if (error) return { error: "Delete failed. Try again." };

  await writeAudit({
    action: "part.deleted",
    actorId: current.user.id,
    actorEmail: current.profile.email,
    resourceType: "project_part",
    resourceId: partId,
    metadata: { project_id: projectId },
  });

  revalidatePath(`/projects/${projectId}/parts`);
  return { success: true as const };
}
