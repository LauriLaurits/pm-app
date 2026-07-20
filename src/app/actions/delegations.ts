"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requirePermission } from "@/lib/auth/require-permission";
import { requireActiveUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { writeAudit } from "@/lib/audit";
import { createDelegationSchema, type CreateDelegationInput } from "@/lib/validation/delegation";

type ActionResult = { error: string } | { success: true; id: string };

const CREATE_ERROR =
  "Could not create the delegation. Every project must be one you own, and every permission must be delegatable.";

/**
 * Creates a delegation header (`delegations`) plus one `delegation_permissions` row per
 * (project, permission) pair. `manage_delegations` is an `own_projects`-scoped permission (see
 * `has_permission`'s own_projects branch), so `requirePermission` needs a concrete project id to
 * evaluate against -- there's no route param to hand it here (the project is part of the form
 * input, not the URL), so a minimal shape check pulls the first selected project id out of the
 * raw input before the full zod parse. This still runs the permission check before any DB write,
 * matching the "requirePermission first" rule; it's just fed from validated-enough input instead
 * of a path segment.
 *
 * The real enforcement is structural either way: the "create own delegation" RLS policy requires
 * `from_user = auth.uid()` AND ownership of at least one project, and each `delegation_permissions`
 * insert is independently re-checked by `enforce_delegatable_permission` (rejects non-delegatable
 * keys) and `validate_delegation_project` (rejects projects the caller doesn't own) -- so even if
 * a caller somehow got a foreign project id or a non-delegatable key past the UI, the DB rejects it.
 *
 * The header insert and the permission-row inserts happen inside a single `create_delegation`
 * SQL function (SECURITY INVOKER -- RLS and the two triggers above still apply exactly as they
 * would to direct client inserts) so the whole thing is atomic: if any permission row is rejected,
 * Postgres rolls back the header insert too. There used to be a two-step insert-header-then-
 * insert-permissions dance here with a manual "delete the header if permissions failed" cleanup,
 * but that cleanup silently no-op'd (there is no "delete own delegation" RLS policy, only
 * admin-only delete), leaving a permanent permission-less phantom delegation behind. The RPC
 * removes the possibility entirely instead of relying on cleanup code.
 */
export async function createDelegationAction(input: CreateDelegationInput): Promise<ActionResult> {
  const rawProjectIds = (input as { project_ids?: unknown })?.project_ids;
  const firstProjectId = Array.isArray(rawProjectIds) ? rawProjectIds[0] : undefined;
  if (typeof firstProjectId !== "string" || !z.uuid().safeParse(firstProjectId).success) {
    return { error: "Select at least one project." };
  }

  const current = await requirePermission("manage_delegations", firstProjectId);

  const parsed = createDelegationSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid delegation." };
  const { to_user, project_ids, permission_keys, starts_at, ends_at, handover_notes } = parsed.data;

  if (to_user === current.user.id) return { error: "Choose someone other than yourself." };

  const supabase = await createClient();

  const { data: delegationId, error: createError } = await supabase.rpc("create_delegation", {
    p_to_user: to_user,
    p_project_ids: project_ids,
    p_permission_keys: permission_keys,
    p_starts_at: starts_at,
    p_ends_at: ends_at,
    p_handover_notes: handover_notes ?? undefined,
  });
  // Trigger rejections (foreign project / non-delegatable permission) and any other failure
  // surface here as a single RPC error -- the whole call rolled back atomically, so there is
  // never a header left behind to clean up.
  if (createError || !delegationId) return { error: CREATE_ERROR };

  await writeAudit({
    action: "delegation.created",
    actorId: current.user.id,
    actorEmail: current.profile.email,
    resourceType: "delegation",
    resourceId: delegationId,
    metadata: { to_user, project_ids, permission_keys, starts_at, ends_at },
  });

  revalidatePath("/delegations");
  return { success: true as const, id: delegationId };
}

/**
 * Revokes a delegation (sets revoked_at/revoked_by). Authority here is deliberately "from_user OR
 * admin" -- exactly what the "revoke own delegation" RLS policy checks -- rather than a
 * `requirePermission('manage_delegations')` gate: the DB policy intentionally does NOT re-check
 * manage_delegations on update, so a PM who delegated a project and was later reassigned/demoted
 * can still revoke their own handover (never leaving an orphaned active delegation behind because
 * a role changed). RLS + the `enforce_delegation_update` trigger (revoked is immutable, only
 * revoked_at/revoked_by may change) are the real backstop either way.
 */
export async function revokeDelegationAction(
  delegationId: string
): Promise<{ error: string } | { success: true }> {
  if (!z.uuid().safeParse(delegationId).success) return { error: "Invalid delegation." };

  const current = await requireActiveUser();

  const supabase = await createClient();
  // "view own delegations" RLS already hides this row from anyone but from_user/to_user/admin --
  // a stranger's call sees nothing here, same generic error as "not found".
  const { data: delegation } = await supabase
    .from("delegations")
    .select("from_user, revoked_at")
    .eq("id", delegationId)
    .maybeSingle();
  if (!delegation) return { error: "Delegation not found." };
  if (delegation.revoked_at) return { error: "Already revoked." };
  if (delegation.from_user !== current.user.id && current.role !== "admin") {
    return { error: "Not authorized." };
  }

  const { error } = await supabase
    .from("delegations")
    .update({ revoked_at: new Date().toISOString(), revoked_by: current.user.id })
    .eq("id", delegationId);
  if (error) return { error: "Could not revoke. Try again." };

  await writeAudit({
    action: "delegation.revoked",
    actorId: current.user.id,
    actorEmail: current.profile.email,
    resourceType: "delegation",
    resourceId: delegationId,
    metadata: { from_user: delegation.from_user },
  });

  revalidatePath("/delegations");
  return { success: true as const };
}
