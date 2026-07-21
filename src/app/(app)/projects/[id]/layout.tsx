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
import { DotBadge } from "@/components/dot-badge";
import { DERIVED_HEALTH_BADGE_CLASS, DERIVED_HEALTH_LABEL, deriveHealth, healthTitle } from "@/lib/health";
import { deriveProgress } from "@/lib/progress";
import { PRIORITY_BADGE_CLASS, STATUS_DOT, humanize } from "../types";
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
    .select("id, name, status, priority, start_date, deadline")
    .eq("id", id)
    .maybeSingle();

  if (!project) notFound();

  // Health is DERIVED from deadline + budget consumption + parts progress (lib/health.ts),
  // exactly like the projects list -- the stored hand-typed column is never shown. Budget %
  // comes from the RLS-gated view (null for viewers without view_budget -- health then simply
  // derives from the other signals).
  const [{ data: budgetRow }, { data: parts }] = await Promise.all([
    supabase.from("project_budget_rows").select("consumption_pct").eq("id", id).maybeSingle(),
    supabase.from("project_parts").select("status, estimated_hours").eq("project_id", id),
  ]);
  const health = deriveHealth({
    status: project.status,
    startDate: project.start_date,
    deadline: project.deadline,
    consumptionPct: budgetRow?.consumption_pct ?? null,
    progressPct: deriveProgress(parts ?? []).pct,
  });

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
        <DotBadge dotClassName={STATUS_DOT[project.status]}>{humanize(project.status)}</DotBadge>
        <Badge
          variant="outline"
          className={DERIVED_HEALTH_BADGE_CLASS[health.level]}
          title={healthTitle(health)}
        >
          {DERIVED_HEALTH_LABEL[health.level]}
        </Badge>
        <Badge variant="outline" className={PRIORITY_BADGE_CLASS[project.priority]}>
          {humanize(project.priority)} priority
        </Badge>
      </div>

      <TabNav projectId={project.id} />

      {children}
    </div>
  );
}
