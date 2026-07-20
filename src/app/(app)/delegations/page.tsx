import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/session";
import { classifyDelegation } from "@/lib/delegations";
import { DelegationFormDialog } from "./delegation-form-dialog";
import { DelegationSections } from "./delegation-sections";
import type { DelegationListItem, PermissionOption, PersonOption, ProjectOption } from "./types";

export default async function DelegationsPage() {
  const supabase = await createClient();
  const current = await getCurrentUser();

  // "My own projects" -- exactly the set the create form is allowed to offer (own_projects scope
  // backstop lives in the DB triggers either way, this is just what the UI bothers to show).
  const { data: ownProjectRows } = current
    ? await supabase.from("projects").select("id, name").eq("pm_id", current.user.id).order("name")
    : { data: [] as ProjectOption[] };
  const ownProjects: ProjectOption[] = ownProjectRows ?? [];

  // UX gating only -- requirePermission inside createDelegationAction re-checks server-side
  // regardless of what's rendered here. manage_delegations is own_projects-scoped, so
  // has_permission needs a concrete project; any owned project answers the same either way.
  const { data: canManageDelegations } =
    current && ownProjects.length > 0
      ? await supabase.rpc("has_permission", {
          uid: current.user.id,
          perm: "manage_delegations",
          project: ownProjects[0].id,
        })
      : { data: false };
  const canCreate = !!canManageDelegations;

  const { data: delegatablePermissionRows } = canCreate
    ? await supabase.from("permissions").select("key, description").eq("delegatable", true).order("key")
    : { data: [] as PermissionOption[] };
  const delegatablePermissions: PermissionOption[] = delegatablePermissionRows ?? [];

  // People with a linked user account, self excluded (a delegation may not target yourself --
  // DB check `from_user <> to_user`). Same "view_people" RLS every people-directory read relies on.
  const { data: peopleRows } = canCreate
    ? await supabase
        .from("people")
        .select("user_id, full_name, avatar_url")
        .not("user_id", "is", null)
        .order("full_name")
    : { data: [] as { user_id: string | null; full_name: string; avatar_url: string | null }[] };
  const peopleOptions: PersonOption[] = (peopleRows ?? [])
    .filter((p): p is { user_id: string; full_name: string; avatar_url: string | null } => !!p.user_id)
    .filter((p) => p.user_id !== current?.user.id)
    .map((p) => ({ user_id: p.user_id, full_name: p.full_name, avatar_url: p.avatar_url }));

  // "view own delegations" RLS: from_user = me, to_user = me, or admin -- so this is already
  // scoped to exactly what the viewer is allowed to see, no extra filtering needed here.
  const { data: delegationRows } = await supabase
    .from("delegations")
    .select("*")
    .order("starts_at", { ascending: false });
  const delegations = delegationRows ?? [];

  const delegationIds = delegations.map((d) => d.id);
  const { data: permRows } = delegationIds.length
    ? await supabase
        .from("delegation_permissions")
        .select("delegation_id, project_id, permission_key")
        .in("delegation_id", delegationIds)
    : { data: [] as { delegation_id: string; project_id: string; permission_key: string }[] };
  const permsByDelegation = new Map<string, { project_id: string; permission_key: string }[]>();
  for (const row of permRows ?? []) {
    const list = permsByDelegation.get(row.delegation_id) ?? [];
    list.push(row);
    permsByDelegation.set(row.delegation_id, list);
  }

  const userIds = [...new Set(delegations.flatMap((d) => [d.from_user, d.to_user]))];
  const { data: nameRows } = userIds.length
    ? await supabase.from("people").select("user_id, full_name, avatar_url").in("user_id", userIds)
    : { data: [] as { user_id: string | null; full_name: string; avatar_url: string | null }[] };
  const nameByUserId = new Map((nameRows ?? []).map((p) => [p.user_id, p]));

  const projectIds = [...new Set([...permsByDelegation.values()].flat().map((p) => p.project_id))];
  const { data: projectRows } = projectIds.length
    ? await supabase.from("projects").select("id, name").in("id", projectIds)
    : { data: [] as ProjectOption[] };
  const projectNameById = new Map((projectRows ?? []).map((p) => [p.id, p.name]));

  const items: DelegationListItem[] = delegations.map((d) => {
    const perms = permsByDelegation.get(d.id) ?? [];
    const uniqueProjectIds = [...new Set(perms.map((p) => p.project_id))];
    const fromPerson = nameByUserId.get(d.from_user);
    const toPerson = nameByUserId.get(d.to_user);
    return {
      id: d.id,
      from_user: d.from_user,
      to_user: d.to_user,
      from_name: fromPerson?.full_name ?? "Unknown",
      to_name: toPerson?.full_name ?? "Unknown",
      from_avatar: fromPerson?.avatar_url ?? null,
      to_avatar: toPerson?.avatar_url ?? null,
      starts_at: d.starts_at,
      ends_at: d.ends_at,
      handover_notes: d.handover_notes,
      revoked_at: d.revoked_at,
      // Falls back to a short id when a project can't be resolved (e.g. RLS hides a project the
      // viewer wasn't granted view_project on for this specific delegation) rather than erroring.
      projects: uniqueProjectIds.map((id) => ({
        id,
        name: projectNameById.get(id) ?? `Project ${id.slice(0, 8)}`,
      })),
      permission_keys: [...new Set(perms.map((p) => p.permission_key))],
      group: classifyDelegation(d),
      canRevoke: !d.revoked_at && (d.from_user === current?.user.id || current?.role === "admin"),
    };
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Delegations</h1>
        {canCreate && (
          <DelegationFormDialog
            people={peopleOptions}
            projects={ownProjects}
            permissions={delegatablePermissions}
          />
        )}
      </div>

      {items.length === 0 ? (
        <EmptyState />
      ) : (
        <DelegationSections items={items} />
      )}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="rounded-xl border border-dashed p-12 text-center text-muted-foreground">
      No delegations yet. Handovers you grant or receive will show up here.
    </div>
  );
}
