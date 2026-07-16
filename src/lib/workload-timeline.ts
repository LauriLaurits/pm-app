// Pure helpers for the Workload timeline grid (src/app/(app)/workload/page.tsx). Kept here,
// separate from the RSC page, so the per-person/per-week assembly (date-range overlap math,
// project-name resolution) is unit-testable without a Supabase round trip.
//
// CRITICAL: `weeklyByPerson` must come from the SECURITY DEFINER `person_weekly_allocation`
// function (the TRUE aggregate -- drives cell color). `assignments`/`timeOff` are the caller's
// ordinary RLS-scoped rows (drive tooltip DETAIL only: which projects, on-vacation note). Never
// derive `pct` from `assignments` here -- that would reintroduce the RLS-understatement bug this
// function exists to avoid.

export type WeekCell = {
  weekStart: string; // ISO date, Monday-anchored
  pct: number;
  onVacation: boolean;
  projects: { name: string; pct: number }[];
};

export type PersonTimelineRow = {
  id: string;
  full_name: string;
  avatar_url: string | null;
  role_title: string | null;
  current_allocation_pct: number;
  on_vacation_now: boolean;
  weeks: WeekCell[];
};

export type PersonBase = {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
  role_title: string | null;
  current_allocation_pct: number | null;
  on_vacation_now: boolean | null;
};

export type WeeklyAllocation = { week_start: string; allocation_pct: number };
export type AssignmentLike = {
  person_id: string;
  project_id: string;
  allocation_pct: number;
  start_date: string;
  end_date: string | null;
};
export type TimeOffLike = { person_id: string; starts_on: string; ends_on: string };

export function shiftISODate(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function parseFromDate(raw?: string): Date {
  if (raw) {
    const d = new Date(`${raw}T00:00:00Z`);
    if (!Number.isNaN(d.getTime())) return d;
  }
  return new Date();
}

function overlaps(rangeStart: string, rangeEnd: string | null, weekStart: string, weekEnd: string) {
  return rangeStart <= weekEnd && (!rangeEnd || rangeEnd >= weekStart);
}

export function buildTimelineRows(args: {
  people: PersonBase[];
  weekStarts: string[];
  weeklyByPerson: Map<string, WeeklyAllocation[]>;
  assignments: AssignmentLike[];
  timeOff: TimeOffLike[];
  projectNameById: Map<string, string>;
}): PersonTimelineRow[] {
  const { people, weekStarts, weeklyByPerson, assignments, timeOff, projectNameById } = args;

  return people.map((person) => {
    const weekly = weeklyByPerson.get(person.id) ?? [];
    const pctByWeek = new Map(weekly.map((w) => [w.week_start, Number(w.allocation_pct)]));
    const personAssignments = assignments.filter((a) => a.person_id === person.id);
    const personTimeOff = timeOff.filter((t) => t.person_id === person.id);

    const weeks: WeekCell[] = weekStarts.map((weekStart) => {
      const weekEnd = shiftISODate(weekStart, 6);
      const projects = personAssignments
        .filter((a) => overlaps(a.start_date, a.end_date, weekStart, weekEnd))
        .map((a) => ({ name: projectNameById.get(a.project_id) ?? "Project", pct: Number(a.allocation_pct) }));
      const onVacation = personTimeOff.some((t) => overlaps(t.starts_on, t.ends_on, weekStart, weekEnd));
      return { weekStart, pct: pctByWeek.get(weekStart) ?? 0, onVacation, projects };
    });

    return {
      id: person.id,
      full_name: person.full_name ?? "Unnamed",
      avatar_url: person.avatar_url,
      role_title: person.role_title,
      current_allocation_pct: person.current_allocation_pct ?? 0,
      on_vacation_now: person.on_vacation_now ?? false,
      weeks,
    };
  });
}
