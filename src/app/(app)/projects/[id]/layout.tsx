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
import { ProjectDescription } from "./project-description";
import { TabNav } from "./tab-nav";

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
  const { data: project } = await supabase
    .from("projects")
    .select("id, name, status, description")
    .eq("id", id)
    .maybeSingle();

  if (!project) notFound();

  // Client feedback: only the status badge belongs up here -- the derived-health and priority
  // badges were noise at the title level ("Healthy, medium priority – seda pole vaja"); health
  // still shows in the projects list, priority stays editable in list/edit.
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
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-semibold">{project.name}</h1>
          <DotBadge dotClassName={STATUS_DOT[project.status]}>{humanize(project.status)}</DotBadge>
        </div>
        {project.description && <ProjectDescription text={project.description} />}
      </div>

      <TabNav projectId={project.id} />

      {children}
    </div>
  );
}
