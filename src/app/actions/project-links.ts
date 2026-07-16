"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requirePermission } from "@/lib/auth/require-permission";
import { createClient } from "@/lib/supabase/server";
import { writeAudit } from "@/lib/audit";
import { linkSchema, type LinkInput } from "@/lib/validation/project";

type ActionResult = { error: string } | { success: true; id: string };

export async function upsertLinkAction(
  projectId: string,
  input: LinkInput,
  linkId?: string | null
): Promise<ActionResult> {
  if (!z.uuid().safeParse(projectId).success) return { error: "Invalid project." };
  if (linkId && !z.uuid().safeParse(linkId).success) return { error: "Invalid link." };

  // Security boundary: throws "Not authorized" if the caller lacks manage_links on
  // this project. Must run before any validation/DB work. Note: RLS on project_links'
  // "view links" policy separately gates who can even *see* pm_only/admins_only rows —
  // never re-filter that in app code, it's already enforced at the row level.
  const current = await requirePermission("manage_links", projectId);

  const parsed = linkSchema.safeParse(input);
  if (!parsed.success) return { error: "Invalid link details." };

  const supabase = await createClient();
  // owner_id is set once on creation (the caller who added the link) and left untouched
  // on edits -- editing a link shouldn't silently reassign ownership to whoever clicked Save.
  const write = linkId
    ? supabase.from("project_links").update(parsed.data).eq("id", linkId).eq("project_id", projectId)
    : supabase
        .from("project_links")
        .insert({ project_id: projectId, owner_id: current.user.id, ...parsed.data });
  const { data: link, error } = await write.select("id").single();
  if (error || !link) return { error: "Save failed. Try again." };

  await writeAudit({
    action: "link.upserted",
    actorId: current.user.id,
    actorEmail: current.profile.email,
    resourceType: "project_link",
    resourceId: link.id,
    metadata: { project_id: projectId, visibility: parsed.data.visibility },
  });

  revalidatePath(`/projects/${projectId}/links`);
  return { success: true as const, id: link.id };
}

export async function deleteLinkAction(
  projectId: string,
  linkId: string
): Promise<{ error: string } | { success: true }> {
  if (!z.uuid().safeParse(projectId).success) return { error: "Invalid project." };
  if (!z.uuid().safeParse(linkId).success) return { error: "Invalid link." };

  // Security boundary: throws "Not authorized" if the caller lacks manage_links on
  // this project. Must run before any validation/DB work.
  const current = await requirePermission("manage_links", projectId);

  const supabase = await createClient();
  const { error } = await supabase
    .from("project_links")
    .delete()
    .eq("id", linkId)
    .eq("project_id", projectId);
  if (error) return { error: "Delete failed. Try again." };

  await writeAudit({
    action: "link.deleted",
    actorId: current.user.id,
    actorEmail: current.profile.email,
    resourceType: "project_link",
    resourceId: linkId,
    metadata: { project_id: projectId },
  });

  revalidatePath(`/projects/${projectId}/links`);
  return { success: true as const };
}
