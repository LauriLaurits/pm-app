"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requirePermission } from "@/lib/auth/require-permission";
import { createClient } from "@/lib/supabase/server";
import { writeAudit } from "@/lib/audit";
import { grantAccessSchema, type GrantAccessInput } from "@/lib/validation/access";

type ActionResult = { error: string } | { success: true };

/**
 * Grants a user one or more permissions on a single project (`user_project_permissions`, one row
 * per permission_key). `manage_access` has NO role_permissions rows at all (see
 * 20260715000002_permission_model.sql) -- only the is_admin() bypass in has_permission ever
 * satisfies it, at any scope -- so this action (and the page that renders its form) is
 * effectively admin-only, enforced the same way every other permission check in the app is:
 * through has_permission, not a hardcoded role === "admin".
 *
 * `requirePermission('manage_access', project_id)` runs before any DB write, fed from a minimal
 * shape check on the raw input (same "pull the id out before the full zod parse" shape used by
 * createDelegationAction, since the project id lives in the form body, not a route param). The
 * "managers insert project grants" RLS policy re-checks the identical has_permission call
 * independently -- this action is not the only backstop.
 */
export async function grantProjectAccessAction(input: GrantAccessInput): Promise<ActionResult> {
  const rawProjectId = (input as { project_id?: unknown })?.project_id;
  if (typeof rawProjectId !== "string" || !z.uuid().safeParse(rawProjectId).success) {
    return { error: "Select a project." };
  }

  const current = await requirePermission("manage_access", rawProjectId);

  const parsed = grantAccessSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid grant." };
  const { user_id, project_id, permission_keys, expires_at } = parsed.data;

  const supabase = await createClient();

  const rows = permission_keys.map((permission_key) => ({
    user_id,
    project_id,
    permission_key,
    granted_by: current.user.id,
    expires_at,
  }));

  // ON CONFLICT DO NOTHING -- re-granting a permission the user already holds on this project is
  // a no-op, not an error (the unique (user_id, project_id, permission_key) constraint would
  // otherwise reject the whole batch on a partial overlap).
  const { error } = await supabase
    .from("user_project_permissions")
    .upsert(rows, { onConflict: "user_id,project_id,permission_key", ignoreDuplicates: true });
  if (error) return { error: "Could not grant access. Try again." };

  await writeAudit({
    action: "access.granted",
    actorId: current.user.id,
    actorEmail: current.profile.email,
    resourceType: "user_project_permission",
    resourceId: user_id,
    metadata: { user_id, project_id, permission_keys, expires_at },
  });

  revalidatePath("/admin/access");
  return { success: true as const };
}

/**
 * Revokes a single ad-hoc grant row. `user_project_permissions` has no UPDATE policy (grants are
 * insert/delete only, by design) -- this deletes the row outright, matching the "managers delete
 * project grants" RLS policy exactly (has_permission(auth.uid(),'manage_access', project_id)).
 * Effective instantly: has_permission's user_project_permissions branch reads the table live, so
 * once the row is gone the grantee's access is gone on their very next check.
 */
export async function revokeProjectAccessAction(grantId: number, projectId: string): Promise<ActionResult> {
  if (!Number.isInteger(grantId) || grantId <= 0) return { error: "Invalid grant." };
  if (!z.uuid().safeParse(projectId).success) return { error: "Invalid project." };

  const current = await requirePermission("manage_access", projectId);

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("user_project_permissions")
    .delete()
    .eq("id", grantId)
    .eq("project_id", projectId)
    .select("user_id, permission_key")
    .maybeSingle();
  if (error) return { error: "Could not revoke access. Try again." };
  if (!data) return { error: "Grant not found." };

  await writeAudit({
    action: "access.revoked",
    actorId: current.user.id,
    actorEmail: current.profile.email,
    resourceType: "user_project_permission",
    resourceId: data.user_id,
    metadata: { grant_id: grantId, project_id: projectId, permission_key: data.permission_key },
  });

  revalidatePath("/admin/access");
  return { success: true as const };
}
