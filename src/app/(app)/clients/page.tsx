import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/session";
import { ClientFormDialog } from "./client-form-dialog";
import { ClientsTable } from "./clients-table";
import type { ClientListRow, ClientRow } from "./types";

export default async function ClientsPage() {
  const supabase = await createClient();

  // UX gating only -- the real security boundary is requirePermission() inside
  // upsertClientAction/deleteClientAction, which re-checks has_permission server-side
  // regardless of what's rendered here.
  const current = await getCurrentUser();

  // One parallel round trip for all three independent reads (perf feedback: these used to run
  // in series, each adding a full DB round trip to TTFB).
  //
  // Clients list is RLS-scoped: "view clients" grants this to project_manager + finance (global)
  // and admin -- a member/viewer simply gets zero rows back, same as every other permission-gated
  // list in this app (see /budgets). No redirect: the page renders an empty state instead.
  //
  // Project counts are derived from an RLS'd read of `projects` (view_project, per-project
  // scope) rather than a raw count() -- a caller who can't see every project will undercount,
  // same caveat as project_list_rows' member_count/budget rollups. Good enough for display;
  // the actual delete-guard (deleteClientAction) relies on the DB foreign key, not this number.
  const [{ data, error }, { data: projectRows }, { data: canManageClients }] = await Promise.all([
    supabase.from("clients").select("*").order("name"),
    supabase.from("projects").select("client_id"),
    current
      ? supabase.rpc("has_permission", { uid: current.user.id, perm: "manage_clients" })
      : Promise.resolve({ data: false }),
  ]);
  const clients = (data ?? []) as ClientRow[];

  const countByClientId = new Map<string, number>();
  for (const p of projectRows ?? []) {
    if (!p.client_id) continue;
    countByClientId.set(p.client_id, (countByClientId.get(p.client_id) ?? 0) + 1);
  }
  const rows: ClientListRow[] = clients.map((c) => ({
    ...c,
    project_count: countByClientId.get(c.id) ?? 0,
  }));

  const canManage = !!canManageClients;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Clients</h1>
        {canManage && <ClientFormDialog />}
      </div>

      {error ? (
        <p className="text-destructive">Failed to load clients. Try again.</p>
      ) : rows.length === 0 ? (
        <EmptyState />
      ) : (
        <ClientsTable rows={rows} canManage={canManage} />
      )}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="rounded-xl border border-dashed p-12 text-center text-muted-foreground">
      No clients yet.
    </div>
  );
}
