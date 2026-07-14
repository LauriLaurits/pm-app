"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { writeAudit } from "@/lib/audit";
import { approveUserSchema, type ApproveUserInput } from "@/lib/validation/auth";

export async function approveUserAction(
  input: ApproveUserInput
): Promise<{ error: string } | { success: true }> {
  const admin = await requireAdmin();
  const parsed = approveUserSchema.safeParse(input);
  if (!parsed.success) return { error: "Invalid approval request." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("user_profiles")
    .update({
      status: "active",
      role: parsed.data.role,
      approved_by: admin.user.id,
      approved_at: new Date().toISOString(),
    })
    .eq("id", parsed.data.userId)
    .eq("status", "pending");

  if (error) return { error: "Approval failed. Try again." };

  const service = createAdminClient();
  await service.from("notifications").insert({
    user_id: parsed.data.userId,
    type: "user_approved",
    title: "Account approved",
    body: `You now have access as ${parsed.data.role.replace("_", " ")}.`,
  });

  await writeAudit({
    action: "user.approved",
    actorId: admin.user.id,
    actorEmail: admin.profile.email,
    resourceType: "user",
    resourceId: parsed.data.userId,
    metadata: { role: parsed.data.role },
  });

  revalidatePath("/admin/users");
  return { success: true as const };
}

const statusSchema = z.object({
  userId: z.uuid(),
  status: z.enum(["active", "disabled"]),
});

export async function setUserStatusAction(
  input: z.infer<typeof statusSchema>
): Promise<{ error: string } | { success: true }> {
  const admin = await requireAdmin();
  const parsed = statusSchema.safeParse(input);
  if (!parsed.success) return { error: "Invalid request." };
  if (parsed.data.userId === admin.user.id)
    return { error: "You cannot change your own status." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("user_profiles")
    .update({ status: parsed.data.status })
    .eq("id", parsed.data.userId);
  if (error) return { error: "Update failed." };

  if (parsed.data.status === "disabled") {
    await supabase.rpc("admin_revoke_user_sessions", {
      target_user: parsed.data.userId,
    });
  }

  await writeAudit({
    action: "user.status_changed",
    actorId: admin.user.id,
    actorEmail: admin.profile.email,
    resourceType: "user",
    resourceId: parsed.data.userId,
    metadata: { status: parsed.data.status },
  });

  revalidatePath("/admin/users");
  return { success: true as const };
}

export async function adminSignOutUserAction(
  userId: string
): Promise<{ error: string } | { success: true }> {
  const admin = await requireAdmin();
  if (!z.uuid().safeParse(userId).success)
    return { error: "Invalid user id." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_revoke_user_sessions", {
    target_user: userId,
  });
  if (error) return { error: "Could not revoke sessions." };

  await writeAudit({
    action: "auth.sessions_revoked_all",
    actorId: admin.user.id,
    actorEmail: admin.profile.email,
    resourceType: "user",
    resourceId: userId,
  });

  revalidatePath("/admin/users");
  return { success: true as const };
}
