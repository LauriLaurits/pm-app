import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/session";
import { LinkFormDialog } from "./link-form-dialog";
import { LinksList } from "./links-list";
import type { LinkRow } from "./types";

export default async function ProjectLinksPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  // RLS ("view project") means a caller without access gets zero rows -- indistinguishable
  // from not existing, which is the point (never leak existence). Layout already 404s too,
  // but this route can be reached directly, so check again here.
  const { data: project } = await supabase.from("projects").select("id").eq("id", id).maybeSingle();
  if (!project) notFound();

  // UX gating only -- the real security boundary is requirePermission() inside
  // upsertLinkAction/deleteLinkAction, which re-checks has_permission server-side
  // regardless of what's rendered here.
  const current = await getCurrentUser();
  const { data: canManageLinks } = current
    ? await supabase.rpc("has_permission", { uid: current.user.id, perm: "manage_links", project: id })
    : { data: false };

  // "view links" RLS already restricts pm_only/admins_only rows to callers who hold
  // edit_project / are admin -- we never re-filter visibility in app code, RLS owns it.
  const { data: links } = await supabase
    .from("project_links")
    .select("*")
    .eq("project_id", id)
    .order("type", { ascending: true })
    .order("name", { ascending: true });

  // owner_id -> name resolved via `people` (RLS: view_people, granted globally to every
  // seeded role), same precedent as Overview's pm/owner names and Parts' responsible person.
  const ownerIds = [...new Set((links ?? []).map((l) => l.owner_id).filter((v): v is string => !!v))];
  const { data: owners } = ownerIds.length
    ? await supabase.from("people").select("user_id, full_name").in("user_id", ownerIds)
    : { data: [] as { user_id: string | null; full_name: string }[] };
  const nameByUserId = new Map((owners ?? []).map((o) => [o.user_id, o.full_name]));

  const linkRows: LinkRow[] = (links ?? []).map((l) => ({
    ...l,
    owner_name: l.owner_id ? nameByUserId.get(l.owner_id) ?? null : null,
  }));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Links</h2>
        {canManageLinks && <LinkFormDialog projectId={id} />}
      </div>
      <LinksList links={linkRows} projectId={id} canManage={!!canManageLinks} />
    </div>
  );
}
