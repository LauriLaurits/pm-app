import Link from "next/link";
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/server";
import { weekStartsFrom } from "@/lib/workload";
import {
  buildTimelineRows,
  parseFromDate,
  shiftISODate,
  type AssignmentLike,
  type TimeOffLike,
} from "@/lib/workload-timeline";
import { WorkloadLegend } from "./workload-legend";
import { WorkloadTimeline } from "./workload-timeline";
import { formatRangeLabel } from "./types";

const WEEKS = 12;

export default async function WorkloadPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string }>;
}) {
  const params = await searchParams;
  const supabase = await createClient();

  const weekStarts = weekStartsFrom(parseFromDate(params.from), WEEKS);
  const windowStart = weekStarts[0];
  const windowEnd = shiftISODate(weekStarts[weekStarts.length - 1], 6);

  // People this caller can see, most-booked first -- an overallocated/full person surfaces at the
  // top of the scan, an available one sinks to the bottom.
  const { data: peopleRows, error } = await supabase
    .from("person_workload_rows")
    .select("id, full_name, avatar_url, role_title, current_allocation_pct, on_vacation_now")
    .order("current_allocation_pct", { ascending: false })
    .order("full_name", { ascending: true });

  // The view's generated types mark every column nullable (typical for Postgres views), but `id`
  // is the underlying table's primary key and is never actually null -- filter defensively so
  // downstream typing (and the .in()/.rpc() calls below) can treat it as a plain string.
  const people = (peopleRows ?? []).filter(
    (p): p is typeof p & { id: string } => p.id !== null
  );
  const personIds = people.map((p) => p.id);

  const [weeklyResults, assignmentsResult, timeOffResult] = await Promise.all([
    // CELL COLOR: the TRUE per-week aggregate via the SECURITY DEFINER function -- one call per
    // visible person, never narrowed by this caller's RLS visibility into `assignments`.
    Promise.all(
      personIds.map((id) =>
        supabase.rpc("person_weekly_allocation", { p_person: id, p_from: windowStart, p_weeks: WEEKS })
      )
    ),
    // TOOLTIP DETAIL ONLY: ordinary RLS-scoped `assignments` read. A member only gets rows back
    // for projects they hold view_team on (or their own), so project names never leak beyond what
    // "view assignments" RLS already allows -- this must never influence cell color above.
    personIds.length
      ? supabase
          .from("assignments")
          .select("person_id, project_id, allocation_pct, start_date, end_date")
          .in("person_id", personIds)
          .lte("start_date", windowEnd)
          .or(`end_date.is.null,end_date.gte.${windowStart}`)
      : Promise.resolve({ data: [] as AssignmentLike[] }),
    personIds.length
      ? supabase
          .from("time_off")
          .select("person_id, starts_on, ends_on")
          .eq("type", "vacation")
          .in("person_id", personIds)
          .lte("starts_on", windowEnd)
          .gte("ends_on", windowStart)
      : Promise.resolve({ data: [] as TimeOffLike[] }),
  ]);

  const assignmentRows = (assignmentsResult.data ?? []) as AssignmentLike[];
  const timeOffRows = (timeOffResult.data ?? []) as TimeOffLike[];

  const projectIds = [...new Set(assignmentRows.map((a) => a.project_id))];
  const { data: projectRows } = projectIds.length
    ? await supabase.from("projects").select("id, name").in("id", projectIds)
    : { data: [] as { id: string; name: string }[] };
  const projectNameById = new Map((projectRows ?? []).map((p) => [p.id, p.name]));

  const weeklyByPerson = new Map(
    people.map((person, i) => [person.id, weeklyResults[i].data ?? []])
  );

  const rows = buildTimelineRows({
    people,
    weekStarts,
    weeklyByPerson,
    assignments: assignmentRows,
    timeOff: timeOffRows,
    projectNameById,
  });

  const prevFrom = shiftISODate(windowStart, -WEEKS * 7);
  const nextFrom = shiftISODate(windowStart, WEEKS * 7);
  const navClass = buttonVariants({ variant: "outline", size: "sm" });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Workload</h1>
          <p className="text-sm text-muted-foreground">
            {formatRangeLabel(windowStart, windowEnd)} — who&apos;s free, who&apos;s overallocated, and where the gaps are.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link href={`/workload?from=${prevFrom}`} className={navClass}>
            <ChevronLeftIcon /> Prev
          </Link>
          <Link href="/workload" className={navClass}>
            Today
          </Link>
          <Link href={`/workload?from=${nextFrom}`} className={navClass}>
            Next <ChevronRightIcon />
          </Link>
        </div>
      </div>

      <WorkloadLegend />

      {error ? (
        <p className="text-destructive">Failed to load workload. Try again.</p>
      ) : rows.length === 0 ? (
        <EmptyState />
      ) : (
        <WorkloadTimeline rows={rows} weekStarts={weekStarts} />
      )}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="rounded-xl border border-dashed p-12 text-center text-muted-foreground">
      No people or assignments to show yet.
    </div>
  );
}
