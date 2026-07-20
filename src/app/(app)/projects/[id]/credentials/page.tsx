import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/session";
import { CredentialFormDialog } from "./credential-form-dialog";
import { CredentialsList } from "./credentials-list";
import type { DisplayCredentialRow } from "./types";

export default async function ProjectCredentialsPage({
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
  // addCredentialAction/deleteCredentialAction/revealCredentialAction, which re-checks
  // has_permission server-side regardless of what's rendered here. canReveal in particular also
  // decides whether CredentialRevealControl (the only place a secret is ever fetched
  // client-side) is mounted at all -- a non-holder never even gets the option to try.
  const current = await getCurrentUser();
  const { data: canManageCredentials } = current
    ? await supabase.rpc("has_permission", { uid: current.user.id, perm: "manage_credentials", project: id })
    : { data: false };
  const { data: canRevealCredentials } = current
    ? await supabase.rpc("has_permission", { uid: current.user.id, perm: "reveal_credential", project: id })
    : { data: false };

  // "view credential metadata" RLS already restricts pms_only/admins_only rows (and rows
  // granted only via credential_access) to whoever the has_credential_access/has_permission
  // checks in that policy allow -- we never re-filter visibility in app code, RLS owns it.
  // secret_id is selected (it's just a uuid FK, not the secret) but is never rendered below.
  const { data: credentials } = await supabase
    .from("credentials")
    .select("*")
    .eq("project_id", id)
    .order("environment", { ascending: true })
    .order("name", { ascending: true });

  // owner_id -> name resolved via `people` (RLS: view_people, granted globally to every
  // seeded role), same precedent as Links' owner name -- see links/page.tsx.
  const ownerIds = [...new Set((credentials ?? []).map((c) => c.owner_id).filter((v): v is string => !!v))];
  const { data: owners } = ownerIds.length
    ? await supabase.from("people").select("user_id, full_name").in("user_id", ownerIds)
    : { data: [] as { user_id: string | null; full_name: string }[] };
  const nameByUserId = new Map((owners ?? []).map((o) => [o.user_id, o.full_name]));

  const rows: DisplayCredentialRow[] = (credentials ?? []).map((c) => ({
    ...c,
    owner_name: c.owner_id ? nameByUserId.get(c.owner_id) ?? null : null,
  }));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Credentials</h2>
        {canManageCredentials && <CredentialFormDialog projectId={id} />}
      </div>
      <CredentialsList
        credentials={rows}
        projectId={id}
        canManage={!!canManageCredentials}
        canReveal={!!canRevealCredentials}
      />
    </div>
  );
}
