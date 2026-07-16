import { describe, it, expect } from "vitest";
import {
  buildTimelineRows,
  parseFromDate,
  shiftISODate,
  type AssignmentLike,
  type PersonBase,
  type TimeOffLike,
  type WeeklyAllocation,
} from "@/lib/workload-timeline";

const weekStarts = ["2026-07-13", "2026-07-20", "2026-07-27"];

const person: PersonBase = {
  id: "p1",
  full_name: "Marko Saar",
  avatar_url: null,
  role_title: "DevOps Engineer",
  current_allocation_pct: 130,
  on_vacation_now: false,
};

describe("shiftISODate", () => {
  it("adds days across a month boundary", () => {
    expect(shiftISODate("2026-07-30", 3)).toBe("2026-08-02");
  });

  it("subtracts days", () => {
    expect(shiftISODate("2026-07-13", -7)).toBe("2026-07-06");
  });
});

describe("parseFromDate", () => {
  it("defaults to now when no raw value is given", () => {
    const before = Date.now();
    const parsed = parseFromDate(undefined);
    expect(Math.abs(parsed.getTime() - before)).toBeLessThan(5000);
  });

  it("parses a valid ISO date string", () => {
    expect(parseFromDate("2026-07-16").toISOString().slice(0, 10)).toBe("2026-07-16");
  });

  it("falls back to now for an invalid string instead of throwing", () => {
    expect(() => parseFromDate("not-a-date")).not.toThrow();
  });
});

describe("buildTimelineRows", () => {
  it("uses the definer weekly aggregate for pct, not a naive sum of RLS-scoped assignments", () => {
    // The RLS-scoped assignments list below only totals 70 for the middle week, but the definer
    // aggregate says 130 -- pct must come from the aggregate, proving color isn't narrowed by
    // whatever assignment rows happen to be visible to the caller.
    const weeklyByPerson = new Map<string, WeeklyAllocation[]>([
      ["p1", [
        { week_start: "2026-07-13", allocation_pct: 0 },
        { week_start: "2026-07-20", allocation_pct: 130 },
        { week_start: "2026-07-27", allocation_pct: 0 },
      ]],
    ]);
    const assignments: AssignmentLike[] = [
      { person_id: "p1", project_id: "proj-a", allocation_pct: 70, start_date: "2026-07-15", end_date: "2026-07-22" },
    ];

    const rows = buildTimelineRows({
      people: [person],
      weekStarts,
      weeklyByPerson,
      assignments,
      timeOff: [],
      projectNameById: new Map([["proj-a", "Retail e-shop replatform"]]),
    });

    expect(rows[0].weeks.map((w) => w.pct)).toEqual([0, 130, 0]);
  });

  it("resolves project names for cell tooltip detail and defaults to 'Project' when unresolved", () => {
    const weeklyByPerson = new Map<string, WeeklyAllocation[]>([
      ["p1", weekStarts.map((week_start) => ({ week_start, allocation_pct: 70 }))],
    ]);
    const assignments: AssignmentLike[] = [
      { person_id: "p1", project_id: "proj-a", allocation_pct: 70, start_date: "2026-07-01", end_date: null },
    ];
    const rows = buildTimelineRows({
      people: [person],
      weekStarts,
      weeklyByPerson,
      assignments,
      timeOff: [],
      projectNameById: new Map(), // name intentionally not resolvable (e.g. RLS-hidden)
    });
    expect(rows[0].weeks[0].projects).toEqual([{ name: "Project", pct: 70 }]);
  });

  it("marks weeks overlapping a time_off row as onVacation, independent of allocation", () => {
    const weeklyByPerson = new Map<string, WeeklyAllocation[]>([
      ["p1", weekStarts.map((week_start) => ({ week_start, allocation_pct: 0 }))],
    ]);
    // Week 1 is 2026-07-13..19, week 2 is 2026-07-20..26 -- a vacation from the 18th to the 25th
    // overlaps both (it starts inside week 1 and ends inside week 2), but not week 3.
    const timeOff: TimeOffLike[] = [{ person_id: "p1", starts_on: "2026-07-18", ends_on: "2026-07-25" }];
    const rows = buildTimelineRows({
      people: [person],
      weekStarts,
      weeklyByPerson,
      assignments: [],
      timeOff,
      projectNameById: new Map(),
    });
    expect(rows[0].weeks.map((w) => w.onVacation)).toEqual([true, true, false]);
  });

  it("defaults a missing weekly-allocation row to 0 (free)", () => {
    const rows = buildTimelineRows({
      people: [person],
      weekStarts,
      weeklyByPerson: new Map(), // no data returned for this person at all
      assignments: [],
      timeOff: [],
      projectNameById: new Map(),
    });
    expect(rows[0].weeks.every((w) => w.pct === 0)).toBe(true);
  });

  it("falls back nullable current_allocation_pct/on_vacation_now to safe defaults", () => {
    const nullish: PersonBase = { ...person, current_allocation_pct: null, on_vacation_now: null };
    const rows = buildTimelineRows({
      people: [nullish],
      weekStarts,
      weeklyByPerson: new Map(),
      assignments: [],
      timeOff: [],
      projectNameById: new Map(),
    });
    expect(rows[0].current_allocation_pct).toBe(0);
    expect(rows[0].on_vacation_now).toBe(false);
  });
});
