import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/session";
import { ProjectCreateForm } from "./project-create-form";
import type { ClientContactOption, ClientOption, PmOption } from "./project-create-fields";

export default async function NewProjectPage() {
  const current = await getCurrentUser();
  if (!current) redirect("/login");

  const supabase = await createClient();

  // UX gating only -- the real security boundary is requirePermission() inside
  // createProjectAction, which re-checks has_permission('create_project') server-side
  // regardless of what's rendered here.
  const { data: canCreate } = await supabase.rpc("has_permission", {
    uid: current.user.id,
    perm: "create_project",
  });
  if (!canCreate) redirect("/projects");

  // One parallel round trip (P0 perf convention). "view clients" RLS (granted to
  // project_manager/finance/admin) already limits clients AND their contacts to whatever this
  // caller can actually see; pm_options() is the security-definer list of active PMs/admins,
  // itself gated on create_project (see migration 20260721000003).
  const [{ data: clients }, { data: contacts }, { data: pmRows }] = await Promise.all([
    supabase.from("clients").select("id, name").order("name"),
    supabase.from("client_contacts").select("id, client_id, name, email").order("name"),
    supabase.rpc("pm_options"),
  ]);

  // The creator must always be selectable (and is the default) even if they're outside the
  // PM/admin list pm_options returns -- e.g. an admin account with no people row would
  // otherwise render an empty-looking select.
  const pms: PmOption[] = pmRows ?? [];
  if (!pms.some((p) => p.user_id === current.user.id)) {
    pms.unshift({
      user_id: current.user.id,
      full_name: current.profile.full_name ?? current.profile.email,
    });
  }

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">New project</h1>
      <div className="max-w-2xl">
        <ProjectCreateForm
          clients={(clients ?? []) as ClientOption[]}
          contacts={(contacts ?? []) as ClientContactOption[]}
          pms={pms}
          currentUserId={current.user.id}
        />
      </div>
    </div>
  );
}
