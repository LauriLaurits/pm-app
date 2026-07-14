"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireActiveUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { writeAudit } from "@/lib/audit";

export async function revokeSessionAction(
  sessionId: string
): Promise<{ error: string } | { success: true }> {
  const current = await requireActiveUser();
  if (!z.uuid().safeParse(sessionId).success)
    return { error: "Invalid session id." };

  const supabase = await createClient();
  const { data: deleted, error } = await supabase.rpc("revoke_session", {
    session_id: sessionId,
  });
  if (error) return { error: "Could not revoke session." };
  if (!deleted)
    return { error: "Session not found or already revoked." };

  await writeAudit({
    action: "auth.session_revoked",
    actorId: current.user.id,
    actorEmail: current.profile.email,
    resourceType: "session",
    resourceId: sessionId,
  });

  revalidatePath("/settings/sessions");
  return { success: true as const };
}
