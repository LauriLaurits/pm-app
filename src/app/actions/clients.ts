"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requirePermission } from "@/lib/auth/require-permission";
import { createClient } from "@/lib/supabase/server";
import { writeAudit } from "@/lib/audit";
import { clientSchema, type ClientInput } from "@/lib/validation/client";

type UpsertResult = { error: string } | { success: true; id: string; name: string };

export async function upsertClientAction(
  input: ClientInput,
  clientId?: string | null
): Promise<UpsertResult> {
  if (clientId && !z.uuid().safeParse(clientId).success) return { error: "Invalid client." };

  // Security boundary: throws "Not authorized" if the caller lacks manage_clients (global,
  // no project scope -- clients are a shared directory like people). Must run before any
  // validation/DB work.
  const current = await requirePermission("manage_clients");

  const parsed = clientSchema.safeParse(input);
  if (!parsed.success) return { error: "Invalid client details." };

  const supabase = await createClient();
  const write = clientId
    ? supabase.from("clients").update(parsed.data).eq("id", clientId)
    : supabase.from("clients").insert(parsed.data);
  const { data: client, error } = await write.select("id, name").single();
  if (error || !client) return { error: "Save failed. Try again." };

  await writeAudit({
    action: clientId ? "client.updated" : "client.created",
    actorId: current.user.id,
    actorEmail: current.profile.email,
    resourceType: "client",
    resourceId: client.id,
    metadata: { name: client.name },
  });

  revalidatePath("/clients");
  revalidatePath("/projects/new");
  return { success: true as const, id: client.id, name: client.name };
}

/**
 * Refuses to delete a client that has any projects referencing it, rather than checking via an
 * RLS'd select (which could undercount for a caller who can't see every project) -- the
 * `projects.client_id` foreign key carries no ON DELETE clause, so Postgres defaults to RESTRICT
 * and raises 23503 (foreign_key_violation) regardless of the caller's row-visibility. That DB
 * constraint is the real backstop (mirrors how `people_prevent_delete_with_history` backstops
 * deletePersonAction); this handler just turns the raw FK error into a friendly message.
 */
export async function deleteClientAction(clientId: string): Promise<{ error: string } | { success: true }> {
  if (!z.uuid().safeParse(clientId).success) return { error: "Invalid client." };

  const current = await requirePermission("manage_clients");

  const supabase = await createClient();

  // Capture the name before deletion for the audit trail (the row is gone afterward).
  const { data: client } = await supabase.from("clients").select("name").eq("id", clientId).single();

  const { error } = await supabase.from("clients").delete().eq("id", clientId);
  if (error) {
    if (error.code === "23503") {
      return { error: "This client has projects — reassign or archive them first." };
    }
    return { error: "Delete failed. Try again." };
  }

  await writeAudit({
    action: "client.deleted",
    actorId: current.user.id,
    actorEmail: current.profile.email,
    resourceType: "client",
    resourceId: clientId,
    metadata: { name: client?.name ?? null },
  });

  revalidatePath("/clients");
  revalidatePath("/projects/new");
  return { success: true as const };
}
