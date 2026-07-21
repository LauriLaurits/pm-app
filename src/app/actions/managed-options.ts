"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { writeAudit } from "@/lib/audit";

// Settings -> Lists (admin-curated selects for the person form). Writes are admin-only:
// requireAdmin() here mirrors the "admins manage managed_options" is_admin() RLS policy,
// which is the real backstop regardless of what this action does.

const addSchema = z.object({
  kind: z.enum(["role_title", "team"]),
  value: z.string().trim().min(1, "Value is required").max(200),
});

export async function addManagedOptionAction(
  kind: string,
  value: string
): Promise<{ error: string } | { success: true; id: string }> {
  // Security boundary first (same ordering as every other action).
  const admin = await requireAdmin();

  const parsed = addSchema.safeParse({ kind, value });
  if (!parsed.success) return { error: "Invalid entry." };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("managed_options")
    .insert(parsed.data)
    .select("id")
    .single();
  if (error || !data) {
    // 23505 = unique_violation on (kind, value)
    return { error: error?.code === "23505" ? "That entry already exists." : "Save failed. Try again." };
  }

  await writeAudit({
    action: "managed_option.created",
    actorId: admin.user.id,
    actorEmail: admin.profile.email,
    resourceType: "managed_option",
    resourceId: data.id,
    metadata: { kind: parsed.data.kind, value: parsed.data.value },
  });

  revalidatePath("/settings");
  revalidatePath("/people");
  return { success: true as const, id: data.id };
}

export async function deleteManagedOptionAction(
  id: string
): Promise<{ error: string } | { success: true }> {
  const admin = await requireAdmin();

  if (!z.uuid().safeParse(id).success) return { error: "Invalid entry." };

  const supabase = await createClient();

  // Capture the row before deletion for the audit trail (it's gone afterward).
  const { data: existing } = await supabase
    .from("managed_options")
    .select("kind, value")
    .eq("id", id)
    .maybeSingle();

  const { error } = await supabase.from("managed_options").delete().eq("id", id);
  if (error) return { error: "Delete failed. Try again." };

  await writeAudit({
    action: "managed_option.deleted",
    actorId: admin.user.id,
    actorEmail: admin.profile.email,
    resourceType: "managed_option",
    resourceId: id,
    metadata: { kind: existing?.kind ?? null, value: existing?.value ?? null },
  });

  revalidatePath("/settings");
  revalidatePath("/people");
  return { success: true as const };
}
