import "server-only";
import type { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/session";
import type { ClientContactOption, ClientOption, PmOption } from "./overview-edit-admin-fields";
import type { MilestoneRow } from "./types";

export type ProjectEditData = {
  canEdit: boolean;
  isAdmin: boolean;
  clients: ClientOption[];
  contacts: ClientContactOption[];
  pmCandidates: PmOption[];
  currentPmName: string;
  milestones: MilestoneRow[];
};

/**
 * Everything the Edit-project dialog needs beyond the project row itself: whether the viewer may
 * open it at all, the admin-only PM reassignment list, the client/contact pickers, and the
 * Timeline section's milestones. Lives here (rather than inline in layout.tsx) because it used to
 * be fetched by the overview page.tsx only -- now that the dialog mounts in the shared [id]
 * layout so it shows on every tab, both layout.tsx and page.tsx would otherwise need their own
 * copy.
 *
 * UX gating only -- canEdit here purely decides whether to render the dialog trigger at all. The
 * real security boundary is requirePermission() inside editProjectAction, which re-checks
 * has_permission server-side before any write regardless of what's rendered here.
 */
export async function getProjectEditData(
  supabase: Awaited<ReturnType<typeof createClient>>,
  projectId: string
): Promise<ProjectEditData> {
  const current = await getCurrentUser();
  const isAdmin = current?.role === "admin";

  const { data: canEditData } = current
    ? await supabase.rpc("has_permission", { uid: current.user.id, perm: "edit_project", project: projectId })
    : { data: false };
  const canEdit = !!canEditData;

  // "view clients" RLS (granted to project_manager/finance/admin) already limits these to
  // whatever this caller can actually see -- same queries as the New Project page and the old
  // overview page.tsx. Gated behind canEdit/isAdmin purely to skip the round trip for callers who
  // can never open the dialog (or the PM field within it) anyway. Milestones are gated behind
  // canEdit too: they're only ever read by this dialog's Timeline section (page.tsx's
  // MilestonesCard does its own independent fetch for display), so a non-editor -- who never
  // renders the dialog -- must not pay for this query on every tab.
  // pm_name comes from project_list_rows (security_invoker view over `people`, same precedent as
  // the projects list) instead of a second pm_id -> people round trip.
  const [
    { data: pmCandidateRows },
    { data: clients },
    { data: contactOptions },
    { data: pmRow },
    { data: milestoneRows },
  ] = await Promise.all([
    isAdmin
      ? supabase.from("people").select("user_id, full_name").not("user_id", "is", null).order("full_name")
      : Promise.resolve({ data: [] as { user_id: string | null; full_name: string }[] }),
    canEdit
      ? supabase.from("clients").select("id, name").order("name")
      : Promise.resolve({ data: [] as ClientOption[] }),
    canEdit
      ? supabase.from("client_contacts").select("id, client_id, name, email").order("name")
      : Promise.resolve({ data: [] as ClientContactOption[] }),
    canEdit
      ? supabase.from("project_list_rows").select("pm_name").eq("id", projectId).maybeSingle()
      : Promise.resolve({ data: null as { pm_name: string | null } | null }),
    canEdit
      ? supabase
          .from("project_milestones")
          .select("*")
          .eq("project_id", projectId)
          .order("due_on")
          .order("sort")
      : Promise.resolve({ data: [] as MilestoneRow[] }),
  ]);

  const pmCandidates: PmOption[] = (pmCandidateRows ?? [])
    .filter((p): p is { user_id: string; full_name: string } => !!p.user_id)
    .map((p) => ({ user_id: p.user_id, full_name: p.full_name }));

  return {
    canEdit,
    isAdmin,
    clients: (clients ?? []) as ClientOption[],
    contacts: (contactOptions ?? []) as ClientContactOption[],
    pmCandidates,
    currentPmName: pmRow?.pm_name ?? "Unassigned",
    milestones: (milestoneRows ?? []) as MilestoneRow[],
  };
}
