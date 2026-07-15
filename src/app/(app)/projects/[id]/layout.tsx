import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Badge } from "@/components/ui/badge";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { HEALTH_BADGE_CLASS, STATUS_BADGE, humanize } from "../types";
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
    .select("id, name, status, health, priority")
    .eq("id", id)
    .maybeSingle();

  if (!project) notFound();

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

      <div className="flex flex-wrap items-center gap-2">
        <h1 className="text-2xl font-semibold">{project.name}</h1>
        <Badge variant={STATUS_BADGE[project.status]}>{humanize(project.status)}</Badge>
        <Badge
          variant={project.health === "critical" ? "destructive" : "outline"}
          className={HEALTH_BADGE_CLASS[project.health]}
        >
          {humanize(project.health)}
        </Badge>
        <Badge variant="outline">{humanize(project.priority)} priority</Badge>
      </div>

      <TabNav projectId={project.id} />

      {children}
    </div>
  );
}
