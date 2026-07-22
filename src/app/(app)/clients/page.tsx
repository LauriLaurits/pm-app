import { Building2, FolderKanban, Users, Wallet } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/session";
import { StatCard } from "@/components/stat-card";
import { formatMoney } from "../projects/types";
import { ClientFormDialog } from "./client-form-dialog";
import { ClientsTable } from "./clients-table";
import type { ClientContactRow, ClientListRow, ClientRow } from "./types";

export default async function ClientsPage() {
  const supabase = await createClient();

  // UX gating only -- the real security boundary is requirePermission() inside
  // upsertClientAction/deleteClientAction, which re-checks has_permission server-side
  // regardless of what's rendered here.
  const current = await getCurrentUser();

  // One parallel round trip for all independent reads (perf feedback: these used to run
  // in series, each adding a full DB round trip to TTFB).
  //
  // Clients list is RLS-scoped: "view clients" grants this to project_manager + finance (global)
  // and admin -- a member/viewer simply gets zero rows back, same as every other permission-gated
  // list in this app (see /budgets). No redirect: the page renders an empty state instead.
  //
  // Project counts/names/active-counts are derived from an RLS'd read of `projects` (view_project,
  // per-project scope) rather than a raw count() -- a caller who can't see every project will
  // undercount, same caveat as project_list_rows' member_count/budget rollups. Good enough for
  // display; the actual delete-guard (deleteClientAction) relies on the DB foreign key, not
  // this number. Names feed the projects-badge tooltip.
  //
  // Budget totals come from project_list_rows (the same gated view the projects list uses):
  // RLS nulls budget_total for viewers without view_budget, so the KPI card simply doesn't
  // render for them -- same convention as the projects page.
  const [
    { data, error },
    { data: projectRows },
    { data: contactRows },
    { data: budgetRows },
    { data: canManageClients },
  ] = await Promise.all([
    supabase.from("clients").select("*").order("name"),
    supabase.from("projects").select("id, client_id, name, status").order("name"),
    // Primary first, then alphabetical -- the table renders the list in this order as-is.
    supabase
      .from("client_contacts")
      .select("*")
      .order("is_primary", { ascending: false })
      .order("name"),
    supabase.from("project_list_rows").select("id, budget_total"),
    current
      ? supabase.rpc("has_permission", { uid: current.user.id, perm: "manage_clients" })
      : Promise.resolve({ data: false }),
  ]);
  const clients = (data ?? []) as ClientRow[];

  const projectNamesByClientId = new Map<string, string[]>();
  const activeCountByClientId = new Map<string, number>();
  const clientIdByProjectId = new Map<string, string>();
  for (const p of projectRows ?? []) {
    if (!p.client_id) continue;
    const names = projectNamesByClientId.get(p.client_id) ?? [];
    names.push(p.name);
    projectNamesByClientId.set(p.client_id, names);
    clientIdByProjectId.set(p.id, p.client_id);
    if (p.status === "active") {
      activeCountByClientId.set(p.client_id, (activeCountByClientId.get(p.client_id) ?? 0) + 1);
    }
  }
  const contactsByClientId = new Map<string, ClientContactRow[]>();
  for (const c of (contactRows ?? []) as ClientContactRow[]) {
    const list = contactsByClientId.get(c.client_id) ?? [];
    list.push(c);
    contactsByClientId.set(c.client_id, list);
  }
  const rows: ClientListRow[] = clients.map((c) => ({
    ...c,
    project_count: projectNamesByClientId.get(c.id)?.length ?? 0,
    project_names: projectNamesByClientId.get(c.id) ?? [],
    active_count: activeCountByClientId.get(c.id) ?? 0,
    contacts: contactsByClientId.get(c.id) ?? [],
  }));

  // KPI + summary-strip rollups over the visible clients. Budget: sum of budget_total across
  // the visible clients' projects; null (card hidden) when RLS nulled every amount.
  const clientIds = new Set(clients.map((c) => c.id));
  const totalContacts = rows.reduce((sum, r) => sum + r.contacts.length, 0);
  const totalActive = rows.reduce((sum, r) => sum + r.active_count, 0);
  const visibleBudgetRows = (budgetRows ?? []).filter(
    (b): b is { id: string; budget_total: number } => {
      if (!b.id || b.budget_total === null) return false;
      const clientId = clientIdByProjectId.get(b.id);
      return !!clientId && clientIds.has(clientId);
    }
  );
  const totalBudget = visibleBudgetRows.length
    ? visibleBudgetRows.reduce((sum, b) => sum + b.budget_total, 0)
    : null;

  const canManage = !!canManageClients;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold">Clients</h1>
          {rows.length > 0 && (
            <p className="mt-0.5 text-sm text-muted-foreground">
              {rows.length} client{rows.length === 1 ? "" : "s"}
              <span className="mx-1.5 text-border">·</span>
              {totalContacts} contact{totalContacts === 1 ? "" : "s"}
              <span className="mx-1.5 text-border">·</span>
              {totalActive} active project{totalActive === 1 ? "" : "s"}
            </p>
          )}
        </div>
        {canManage && <ClientFormDialog />}
      </div>

      {rows.length > 0 && (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <StatCard icon={Building2} label="Total clients" value={String(rows.length)} iconClass="bg-blue-500/10 text-blue-600 dark:text-blue-400" />
          <StatCard icon={Users} label="Contacts" value={String(totalContacts)} iconClass="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" />
          <StatCard icon={FolderKanban} label="Active projects" value={String(totalActive)} iconClass="bg-amber-500/10 text-amber-600 dark:text-amber-400" />
          {totalBudget !== null && (
            <StatCard icon={Wallet} label="Total budget" value={formatMoney(totalBudget)} iconClass="bg-violet-500/10 text-violet-600 dark:text-violet-400" />
          )}
        </div>
      )}

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
