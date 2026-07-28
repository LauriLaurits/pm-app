import { describe, it, expect } from "vitest";
import { buildAttentionFeed, buildDeadlineTimeline, buildMyProjects } from "@/app/(app)/dashboard/compute";
import type {
  BudgetRow,
  ExpiringCredential,
  MilestoneLite,
  ValidProject,
  WorkloadPerson,
} from "@/app/(app)/dashboard/types";

const TODAY = "2026-07-28";

// buildAttentionFeed/buildMyProjects have no `now`/`todayISO` parameter (per the brief's exact
// signatures) -- they lean on lib/dashboard.ts's `daysUntil`/`isStaleStatus` defaulting to the
// real current time, same as every other compute.ts builder today. So date-sensitive fixtures for
// those two are built relative to the real clock at test-run time, not a fixed fictional date
// (only buildDeadlineTimeline takes an explicit todayISO and can use the fixed TODAY above).
function daysFromNowISO(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
function isoTimestampDaysAgo(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString();
}

function project(overrides: Partial<ValidProject> & { id: string; name: string }): ValidProject {
  return {
    budget_remaining: null,
    budget_total: null,
    budget_type: null,
    budget_used: null,
    client_name: null,
    deadline: null,
    health: null,
    member_count: null,
    pm_avatar_url: null,
    pm_name: "Someone",
    pm_id: null,
    priority: null,
    progress: null,
    start_date: null,
    status: "active",
    updated_at: null,
    ...overrides,
  };
}

function budgetRow(overrides: Partial<BudgetRow> & { id: string; name: string }): BudgetRow {
  return {
    budget_type: null,
    client_amount: null,
    client_name: null,
    consumption_pct: null,
    health: null,
    internal_cost: null,
    invoiced: null,
    margin: null,
    margin_pct: null,
    paid: null,
    remaining: null,
    ...overrides,
  };
}

function person(overrides: Partial<WorkloadPerson> & { id: string; full_name: string }): WorkloadPerson {
  return {
    current_allocation_pct: null,
    weekly_capacity_hours: null,
    status: "active",
    on_vacation_now: false,
    avatar_url: null,
    ...overrides,
  };
}

describe("buildAttentionFeed", () => {
  it("sorts critical before warning before info and maps every source to its kind", () => {
    const projects: ValidProject[] = [
      // warning: due in 5 days
      project({ id: "p-warn", name: "Warning Project", deadline: daysFromNowISO(5), pm_name: "Alice" }),
      // no-pm source (info)
      project({ id: "p-nopm", name: "No PM Project", pm_name: null }),
      // stale-status source (info) -- also needs a PM so it doesn't double as a no-pm item
      project({ id: "p-stale", name: "Stale Project", pm_name: "Bob" }),
    ];

    const budgetRows: BudgetRow[] = [
      budgetRow({ id: "p-budget", name: "Over Budget Project", client_amount: 10000, consumption_pct: 130 }),
    ];

    const people: WorkloadPerson[] = [
      person({ id: "person-1", full_name: "Marko Saar", current_allocation_pct: 130 }),
    ];

    const expiringCredentials: ExpiringCredential[] = [
      { id: "cred-1", name: "Stripe API key", expires_at: daysFromNowISO(10), project_id: "p-stale", projectName: "Stale Project" },
    ];

    const latestUpdateByProject: Record<string, string | null> = {
      "p-warn": isoTimestampDaysAgo(1), // fresh -- keep this project out of the stale-status source
      "p-nopm": isoTimestampDaysAgo(1), // fresh -- keep this project out of the stale-status source
      "p-stale": isoTimestampDaysAgo(20), // > 14 days ago -> stale
    };

    const items = buildAttentionFeed({
      projects,
      budgetRows,
      people,
      latestUpdateByProject,
      expiringCredentials,
    });

    // every kind is represented
    const kinds = items.map((i) => i.kind).sort();
    expect(kinds).toEqual(["budget", "person", "pm", "project", "status", "credential"].sort());

    // severity is non-decreasing across the sorted list (critical -> warning -> info)
    const rank = { critical: 0, warning: 1, info: 2 } as const;
    for (let i = 1; i < items.length; i++) {
      expect(rank[items[i].severity]).toBeGreaterThanOrEqual(rank[items[i - 1].severity]);
    }

    // the over-budget row is critical
    const budgetItem = items.find((i) => i.kind === "budget")!;
    expect(budgetItem.severity).toBe("critical");
    expect(budgetItem.title).toBe("Over Budget Project");
    expect(budgetItem.href).toBe("/projects/p-budget/budget");

    // the overallocated person is warning, with the exact "N% allocated" reason
    const personItem = items.find((i) => i.kind === "person")!;
    expect(personItem.severity).toBe("warning");
    expect(personItem.title).toBe("Marko Saar");
    expect(personItem.reason).toBe("130% allocated");
    expect(personItem.href).toBe("/people/person-1");

    // no-PM is informational with the exact "no PM assigned" reason
    const pmItem = items.find((i) => i.kind === "pm")!;
    expect(pmItem.severity).toBe("info");
    expect(pmItem.reason).toBe("no PM assigned");

    // project health (warning tier) carries the deriveHealth reason text
    const projectItem = items.find((i) => i.kind === "project")!;
    expect(projectItem.severity).toBe("warning");
    expect(projectItem.reason).toContain("due in");

    // credential + stale status both land as informational
    expect(items.find((i) => i.kind === "credential")!.severity).toBe("info");
    expect(items.find((i) => i.kind === "status")!.severity).toBe("info");
  });

  it("excludes healthy projects, non-overallocated people, PM'd projects, fresh statuses", () => {
    const projects: ValidProject[] = [
      project({ id: "p-healthy", name: "Healthy Project", pm_name: "Alice", status: "active" }),
    ];
    const items = buildAttentionFeed({
      projects,
      budgetRows: [],
      people: [person({ id: "person-1", full_name: "Fine Person", current_allocation_pct: 80 })],
      latestUpdateByProject: { "p-healthy": isoTimestampDaysAgo(1) },
      expiringCredentials: [],
    });
    expect(items).toEqual([]);
  });
});

describe("buildDeadlineTimeline", () => {
  it("windows to overdue + next 30 days, sorts ascending, caps at 8, excludes completed/archived", () => {
    const projects: ValidProject[] = [
      project({ id: "p-overdue", name: "Overdue Project", status: "active", deadline: "2026-07-23" }), // 5d overdue
      project({ id: "p-soon", name: "Soon Project", status: "active", deadline: "2026-08-05" }), // 8d out
      project({ id: "p-far", name: "Far Project", status: "active", deadline: "2026-09-15" }), // outside window
      project({ id: "p-done", name: "Done Project", status: "completed", deadline: "2026-08-01" }), // excluded
    ];

    const milestones: MilestoneLite[] = [
      { id: "m-undone", project_id: "p-overdue", name: "Kickoff review", due_on: "2026-07-30", done: false, projectName: "Overdue Project" },
      { id: "m-done", project_id: "p-overdue", name: "Already done", due_on: "2026-07-29", done: true, projectName: "Overdue Project" },
      { id: "m-far", project_id: "p-soon", name: "Way out", due_on: "2026-10-01", done: false, projectName: "Soon Project" },
    ];

    const entries = buildDeadlineTimeline(projects, milestones, TODAY);

    // p-overdue's own deadline, then its undone milestone, then p-soon's deadline -- ascending by date
    expect(entries.map((e) => e.date)).toEqual(["2026-07-23", "2026-07-30", "2026-08-05"]);
    expect(entries.map((e) => e.kind)).toEqual(["deadline", "milestone", "deadline"]);
    expect(entries.find((e) => e.projectId === "p-far")).toBeUndefined();
    expect(entries.find((e) => e.projectName === "Done Project")).toBeUndefined();
    expect(entries.find((e) => e.date === "2026-10-01")).toBeUndefined();

    const deadlineEntry = entries.find((e) => e.kind === "deadline" && e.projectId === "p-overdue")!;
    expect(deadlineEntry.label).toBe("Project deadline");
    const milestoneEntry = entries.find((e) => e.kind === "milestone")!;
    expect(milestoneEntry.label).toBe("Kickoff review");
    expect(entries.find((e) => e.date === "2026-07-29")).toBeUndefined(); // done milestone excluded
  });

  it("caps the merged, sorted list at 8", () => {
    const projects: ValidProject[] = Array.from({ length: 12 }, (_, i) =>
      project({ id: `p-${i}`, name: `Project ${i}`, status: "active", deadline: `2026-07-${29 + (i % 2)}` })
    );
    const entries = buildDeadlineTimeline(projects, [], TODAY);
    expect(entries.length).toBe(8);
  });
});

describe("buildMyProjects", () => {
  const progressById: Record<string, number | null> = {};

  it("picks the viewer's own PM'd projects first when they PM at least one", () => {
    const projects: ValidProject[] = [
      project({ id: "p-mine", name: "Mine", status: "active", pm_id: "pm-1" }),
      project({ id: "p-other", name: "Other", status: "active", pm_id: "pm-2" }),
    ];
    const rows = buildMyProjects(projects, [], progressById, "pm-1");
    expect(rows.map((r) => r.id)).toEqual(["p-mine"]);
  });

  it("falls back to all active projects when the viewer PMs none", () => {
    const projects: ValidProject[] = [
      project({ id: "p-active", name: "Active", status: "active", pm_id: "pm-2" }),
      project({ id: "p-planning", name: "Planning", status: "planning", pm_id: "pm-2" }),
    ];
    const rows = buildMyProjects(projects, [], progressById, "pm-1");
    expect(rows.map((r) => r.id)).toEqual(["p-active"]);
  });

  it("caps at 6", () => {
    const projects: ValidProject[] = Array.from({ length: 9 }, (_, i) =>
      project({ id: `p-${i}`, name: `Project ${i}`, status: "active", pm_id: "pm-1" })
    );
    const rows = buildMyProjects(projects, [], progressById, "pm-1");
    expect(rows.length).toBe(6);
  });

  it("sorts by health severity desc, then deadline asc", () => {
    const projects: ValidProject[] = [
      project({ id: "p-healthy", name: "Healthy", status: "active", pm_id: "pm-1", deadline: daysFromNowISO(60) }),
      project({ id: "p-critical", name: "Critical", status: "active", pm_id: "pm-1", deadline: daysFromNowISO(-8) }), // overdue
      project({ id: "p-warning", name: "Warning", status: "active", pm_id: "pm-1", deadline: daysFromNowISO(5) }), // due soon
    ];
    const rows = buildMyProjects(projects, [], progressById, "pm-1");
    expect(rows.map((r) => r.id)).toEqual(["p-critical", "p-warning", "p-healthy"]);
  });
});
