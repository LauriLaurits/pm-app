import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requireActiveUser } from "@/lib/auth/session";
import { AdminTabs } from "../admin-tabs";
import { AccessFilters } from "./access-filters";
import { GrantFormDialog } from "./grant-form-dialog";
import { GrantsTable } from "./grants-table";
import type { GrantListItem, PermissionOption, ProjectOption, UserOption } from "./types";

type AccessSearchParams = { project?: string; user?: string };

export default async function AdminAccessPage({
  searchParams,
}: {
  searchParams: Promise<AccessSearchParams>;
}) {
  const params = await searchParams;
  const current = await requireActiveUser();
  const supabase = await createClient();

  // manage_access has NO role_permissions rows at all (20260715000002_permission_model.sql) --
  // only the is_admin() bypass in has_permission ever satisfies it, at any scope -- so this gate
  // is effectively "is this caller an admin", computed through the same has_permission RPC every
  // mutation re-checks, rather than a hardcoded role === "admin". UX only: grantProjectAccessAction
  // and revokeProjectAccessAction both re-run requirePermission('manage_access', projectId)
  // server-side regardless of what's rendered here.
  const { data: canManageAccess } = await supabase.rpc("has_permission", {
    uid: current.user.id,
    perm: "manage_access",
  });

  if (!canManageAccess) {
    return (
      <div className="space-y-4">
        <AdminTabs active="access" />
        <p className="text-muted-foreground">
          You don&apos;t have access to this page. Access management is restricted to admins.
        </p>
      </div>
    );
  }

  const [{ data: projectRows }, { data: permissionRows }, { data: userRows }, { count: pendingCount }] =
    await Promise.all([
      supabase.from("projects").select("id, name").order("name"),
      supabase.from("permissions").select("key, description").order("key"),
      supabase
        .from("user_profiles")
        .select("id, email, full_name, avatar_url")
        .eq("status", "active")
        .order("full_name"),
      supabase.from("user_profiles").select("id", { count: "exact", head: true }).eq("status", "pending"),
    ]);

  const projects: ProjectOption[] = projectRows ?? [];
  const permissions: PermissionOption[] = permissionRows ?? [];
  const users: UserOption[] = (userRows ?? []).map((u) => ({
    user_id: u.id,
    full_name: u.full_name ?? u.email,
    avatar_url: u.avatar_url,
  }));

  let grantQuery = supabase
    .from("user_project_permissions")
    .select("id, user_id, project_id, permission_key, granted_by, granted_at, expires_at")
    .order("granted_at", { ascending: false });
  if (params.project) grantQuery = grantQuery.eq("project_id", params.project);
  if (params.user) grantQuery = grantQuery.eq("user_id", params.user);
  const { data: grantRows } = await grantQuery;

  // Names for grantee/granter resolved from the active-users list above where possible; falls
  // back to a short id for a granter whose account was later disabled (excluded from that list).
  const userById = new Map(users.map((u) => [u.user_id, u]));
  const projectNameById = new Map(projects.map((p) => [p.id, p.name]));
  const now = new Date();

  const items: GrantListItem[] = (grantRows ?? []).map((g) => {
    const grantee = userById.get(g.user_id);
    const granter = g.granted_by ? userById.get(g.granted_by) : undefined;
    return {
      id: g.id,
      user_id: g.user_id,
      user_name: grantee?.full_name ?? `User ${g.user_id.slice(0, 8)}`,
      user_avatar: grantee?.avatar_url ?? null,
      project_id: g.project_id,
      project_name: projectNameById.get(g.project_id) ?? `Project ${g.project_id.slice(0, 8)}`,
      permission_key: g.permission_key,
      granted_by_name: granter?.full_name ?? null,
      granted_at: g.granted_at,
      expires_at: g.expires_at,
      isExpired: !!g.expires_at && new Date(g.expires_at) < now,
    };
  });

  const hasFilters = Boolean(params.project || params.user);

  return (
    <div className="space-y-4">
      <AdminTabs active="access" />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold">Access management</h1>
        <GrantFormDialog users={users} projects={projects} permissions={permissions} />
      </div>

      {!!pendingCount && pendingCount > 0 && (
        <Link
          href="/admin/users"
          className="flex items-center justify-between rounded-lg border bg-muted/40 px-4 py-2.5 text-sm transition-colors hover:bg-muted/60"
        >
          <span>
            {pendingCount} user{pendingCount === 1 ? "" : "s"} awaiting approval
          </span>
          <span className="font-medium text-primary">Review →</span>
        </Link>
      )}

      <AccessFilters projects={projects} users={users} />

      {items.length === 0 ? (
        <EmptyState hasFilters={hasFilters} />
      ) : (
        <GrantsTable items={items} />
      )}
    </div>
  );
}

function EmptyState({ hasFilters }: { hasFilters: boolean }) {
  return (
    <div className="rounded-xl border border-dashed p-12 text-center text-muted-foreground">
      {hasFilters ? "No grants match these filters." : "No per-project access grants yet."}
    </div>
  );
}
