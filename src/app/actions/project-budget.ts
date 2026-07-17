"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requirePermission } from "@/lib/auth/require-permission";
import { createClient } from "@/lib/supabase/server";
import { writeAudit } from "@/lib/audit";
import {
  partBillingSchema, partCostsSchema, type PartBillingInput, type PartCostsInput,
} from "@/lib/validation/budget";

type ActionResult = { error: string } | { success: true };

/** Edit a part's client-facing billing figures (client_price/fixed_amount/hourly_rate) --
 * `part_billing`, gated by `manage_budget`. This is the fix for the finance-role bug: unlike
 * upsertPartAction (project-parts.ts), which is gated on `edit_project` for the whole part-editing
 * dialog, this action is reachable purely on `manage_budget` -- exactly what finance holds
 * (global) but PMs also hold (own_projects), so both can use it. */
export async function upsertPartBillingAction(
  projectId: string,
  partId: string,
  input: PartBillingInput
): Promise<ActionResult> {
  if (!z.uuid().safeParse(projectId).success) return { error: "Invalid project." };
  if (!z.uuid().safeParse(partId).success) return { error: "Invalid part." };

  // Security boundary: throws "Not authorized" if the caller lacks manage_budget on this
  // project. Must run before any validation/DB work. Matches the RLS "manage part billing"
  // policy on part_billing exactly.
  const current = await requirePermission("manage_budget", projectId);

  const parsed = partBillingSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid billing figures." };

  const supabase = await createClient();

  // Defense in depth: confirm the part actually belongs to this project before writing --
  // RLS on part_billing itself only checks manage_budget on the part's OWN project (via
  // part_project()), so without this check a caller could pass a mismatched projectId/partId
  // pair and still succeed as long as they hold manage_budget on the part's real project.
  const { data: part } = await supabase
    .from("project_parts")
    .select("id")
    .eq("id", partId)
    .eq("project_id", projectId)
    .maybeSingle();
  if (!part) return { error: "Part not found." };

  const { error } = await supabase.from("part_billing").upsert({ part_id: partId, ...parsed.data });
  if (error) return { error: "Save failed. Try again." };

  await writeAudit({
    action: "part_billing.updated",
    actorId: current.user.id,
    actorEmail: current.profile.email,
    resourceType: "part_billing",
    resourceId: partId,
    metadata: { project_id: projectId, ...parsed.data },
  });

  revalidatePath(`/projects/${projectId}/budget`);
  revalidatePath(`/projects/${projectId}/parts`);
  return { success: true as const };
}

/** Edit a part's internal cost figures (planned/actual_internal_cost) -- `part_costs`, gated by
 * `view_internal_cost`. The RLS "finance manages part costs" policy additionally requires
 * `manage_budget`, which every `view_internal_cost` holder in the seeded role set (finance) also
 * holds -- but the DB is the real backstop for that combination, not this check. This action
 * must never be reachable by a PM: PMs hold `manage_budget` but not `view_internal_cost`, so
 * requirePermission throws for them before any DB work happens. */
export async function upsertPartCostsAction(
  projectId: string,
  partId: string,
  input: PartCostsInput
): Promise<ActionResult> {
  if (!z.uuid().safeParse(projectId).success) return { error: "Invalid project." };
  if (!z.uuid().safeParse(partId).success) return { error: "Invalid part." };

  // Security boundary: throws "Not authorized" if the caller lacks view_internal_cost on this
  // project. Must run before any validation/DB work.
  const current = await requirePermission("view_internal_cost", projectId);

  const parsed = partCostsSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid cost figures." };

  const supabase = await createClient();

  const { data: part } = await supabase
    .from("project_parts")
    .select("id")
    .eq("id", partId)
    .eq("project_id", projectId)
    .maybeSingle();
  if (!part) return { error: "Part not found." };

  // RLS ("finance manages part costs") additionally requires manage_budget -- if it's ever
  // missing for this caller despite holding view_internal_cost, the upsert is rejected here
  // rather than silently succeeding.
  const { error } = await supabase.from("part_costs").upsert({ part_id: partId, ...parsed.data });
  if (error) return { error: "Save failed. Try again." };

  await writeAudit({
    action: "part_costs.updated",
    actorId: current.user.id,
    actorEmail: current.profile.email,
    resourceType: "part_costs",
    resourceId: partId,
    metadata: { project_id: projectId, ...parsed.data },
  });

  revalidatePath(`/projects/${projectId}/budget`);
  return { success: true as const };
}
