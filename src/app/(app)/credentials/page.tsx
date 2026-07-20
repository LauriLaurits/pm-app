import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/session";
import type { DisplayCredentialRow } from "../projects/[id]/credentials/types";
import { CredentialsIndexList } from "./credentials-index-list";
import type { ProjectCredentialGroup } from "./types";

export default async function CredentialsIndexPage() {
  const supabase = await createClient();
  const current = await getCurrentUser();

  // "view credential metadata" RLS already restricts this to whatever the caller may see across
  // EVERY project they belong to (project_members/pms_only/admins_only tiers, plus any explicit
  // credential_access grant) -- same policy the project-scoped tab reads through. We never
  // re-filter by project membership or visibility here: RLS owns that, this page just groups
  // and renders what comes back.
  const { data: credentials, error } = await supabase
    .from("credentials")
    .select("*")
    .order("name", { ascending: true });

  const rows = credentials ?? [];
  const projectIds = [...new Set(rows.map((c) => c.project_id))];

  const [{ data: projects }, { data: owners }] = await Promise.all([
    projectIds.length
      ? supabase.from("projects").select("id, name").in("id", projectIds)
      : Promise.resolve({ data: [] as { id: string; name: string }[] }),
    (() => {
      const ownerIds = [...new Set(rows.map((c) => c.owner_id).filter((v): v is string => !!v))];
      return ownerIds.length
        ? supabase.from("people").select("user_id, full_name").in("user_id", ownerIds)
        : Promise.resolve({ data: [] as { user_id: string | null; full_name: string }[] });
    })(),
  ]);
  const projectNameById = new Map((projects ?? []).map((p) => [p.id, p.name]));
  const ownerNameByUserId = new Map((owners ?? []).map((o) => [o.user_id, o.full_name]));

  // reveal_credential is a per-project permission, so it's checked once per distinct project
  // this caller's visible credentials span (not per credential row) -- the project tab does the
  // same has_permission RPC call, just for a single project instead of a batch.
  const canRevealByProject = new Map<string, boolean>();
  if (current) {
    await Promise.all(
      projectIds.map(async (projectId) => {
        const { data } = await supabase.rpc("has_permission", {
          uid: current.user.id,
          perm: "reveal_credential",
          project: projectId,
        });
        canRevealByProject.set(projectId, !!data);
      }),
    );
  }

  const displayRows: (DisplayCredentialRow & { project_name: string })[] = rows.map((c) => ({
    ...c,
    owner_name: c.owner_id ? (ownerNameByUserId.get(c.owner_id) ?? null) : null,
    project_name: projectNameById.get(c.project_id) ?? "Unknown project",
  }));

  const groups: ProjectCredentialGroup[] = projectIds
    .map((projectId) => ({
      projectId,
      projectName: projectNameById.get(projectId) ?? "Unknown project",
      canReveal: canRevealByProject.get(projectId) ?? false,
      credentials: displayRows.filter((c) => c.project_id === projectId),
    }))
    .sort((a, b) => a.projectName.localeCompare(b.projectName));

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Credentials</h1>
        <p className="text-sm text-muted-foreground">
          Every credential you can access, across all of your projects. To add one, open a
          project&apos;s Credentials tab.
        </p>
      </div>

      {error ? (
        <p className="text-destructive">Failed to load credentials. Try again.</p>
      ) : groups.length === 0 ? (
        <EmptyState />
      ) : (
        <CredentialsIndexList groups={groups} />
      )}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="rounded-xl border border-dashed p-12 text-center text-muted-foreground">
      No credentials you can access yet.{" "}
      <Link href="/projects" className="underline underline-offset-2">
        Browse projects
      </Link>{" "}
      to add one from a project&apos;s Credentials tab.
    </div>
  );
}
