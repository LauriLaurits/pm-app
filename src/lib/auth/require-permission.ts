import "server-only";
import { createClient } from "@/lib/supabase/server";
import { requireActiveUser } from "@/lib/auth/session";
import type { Permission } from "@/lib/auth/permissions";

/** Shared pre-check for every Phase-2+ server action (spec: requirePermission(user, action, resource)). */
export async function requirePermission(permission: Permission, projectId?: string) {
  const current = await requireActiveUser();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("has_permission", {
    uid: current.user.id,
    perm: permission,
    ...(projectId ? { project: projectId } : {}),
  });
  if (error || data !== true) throw new Error("Not authorized");
  return current;
}
