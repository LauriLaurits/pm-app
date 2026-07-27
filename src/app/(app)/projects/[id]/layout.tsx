import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { DotBadge } from "@/components/dot-badge";
import { STATUS_DOT, humanize } from "../types";
import { getProjectEditData } from "./edit-data";
import { OverviewEditDialog } from "./overview-edit-dialog";
import { ProjectDescription } from "./project-description";
import { TabNav } from "./tab-nav";
import type { ProjectRow } from "./types";

export default async function ProjectDetailLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  // RLS ("view project", scoped by has_permission(..., 'view_project', id)) means a caller
  // without access simply gets zero rows back here -- not an error. That is indistinguishable
  // from the project not existing, which is the point: we must never leak existence.
  // Selects every column the Edit-project dialog reads (see overview-edit-form.tsx toDefaults)
  // on top of what the header itself needs, since the dialog now mounts here instead of the
  // overview tab -- getProjectEditData below supplies everything else it needs (clients,
  // contacts, PM candidates, canEdit).
  // Milestones feed the dialog's Timeline section (toDefaults reads them). Same "view milestones"
  // RLS as the project row itself (gated by view_project, not edit_project), so fetching them
  // unconditionally here -- rather than only when canEdit -- leaks nothing beyond what the caller
  // can already see.
  const [{ data: project }, editData, { data: milestones }] = await Promise.all([
    supabase
      .from("projects")
      .select(
        "id, name, status, description, tags, client_id, client_contact_id, health, budget_type, start_date, deadline, pm_id, progress, risks, blockers, next_steps, internal_notes, client_notes"
      )
      .eq("id", id)
      .maybeSingle(),
    getProjectEditData(supabase, id),
    supabase.from("project_milestones").select("*").eq("project_id", id).order("due_on").order("sort"),
  ]);

  if (!project) notFound();

  // Client feedback: only the status badge belongs up here -- the derived-health badge
  // was noise at the title level ("Healthy – seda pole vaja"); health still shows in the
  // projects list.
  return (
    <div className="space-y-4">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink render={<Link href="/projects" />}>Projects</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>{project.name}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className="space-y-1.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold">{project.name}</h1>
            <DotBadge dotClassName={STATUS_DOT[project.status]}>{humanize(project.status)}</DotBadge>
          </div>
          {editData.canEdit && (
            <OverviewEditDialog
              project={project as ProjectRow}
              milestones={milestones ?? []}
              clients={editData.clients}
              contacts={editData.contacts}
              isAdmin={editData.isAdmin}
              pmCandidates={editData.pmCandidates}
              currentPmName={editData.currentPmName}
            />
          )}
        </div>
        {project.description && <ProjectDescription text={project.description} />}
      </div>

      <TabNav projectId={project.id} />

      {children}
    </div>
  );
}
