import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/session";
import { ProjectCreateForm } from "./project-create-form";
import type { ClientOption } from "./project-create-fields";

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

  // "view clients" RLS (granted to project_manager/finance/admin) already limits this to
  // whatever this caller can actually see.
  const { data: clients } = await supabase.from("clients").select("id, name").order("name");

  const currentUserLabel = current.profile.full_name ?? current.profile.email;

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">New project</h1>
      <ProjectCreateForm clients={(clients ?? []) as ClientOption[]} currentUserLabel={currentUserLabel} />
    </div>
  );
}
