import { describe, it, expect } from "vitest";
import {
  reportsWindow,
  trendDelta,
  cumulative,
  buildMonthlyHours,
  buildProjectHoursSlices,
  buildUtilizationRows,
  buildCapacityRows,
  buildMonthlyFinance,
  buildPerformanceRows,
  buildReportsKpis,
} from "@/app/(app)/reports/compute";
import type { MonthlyHoursPoint } from "@/app/(app)/reports/types";
import type { BudgetRow, WorkloadPerson } from "@/app/(app)/dashboard/types";

describe("reportsWindow", () => {
  it("computes the 6-month window ending in the month of todayISO, same-year label", () => {
    const w = reportsWindow(6, "2026-07-29");
    expect(w.months).toBe(6);
    expect(w.startISO).toBe("2026-02-01");
    expect(w.endISO).toBe("2026-08-01"); // exclusive -- first day of the month AFTER the window
    expect(w.prevStartISO).toBe("2025-08-01"); // previous window is the same length, ending at startISO
    expect(w.label).toBe("1 Feb – 31 Jul 2026");
  });

  it("computes a 3-month window that crosses a year boundary, cross-year label", () => {
    const w = reportsWindow(3, "2026-01-15");
    expect(w.startISO).toBe("2025-11-01");
    expect(w.endISO).toBe("2026-02-01");
    expect(w.prevStartISO).toBe("2025-08-01");
    expect(w.label).toBe("1 Nov 2025 – 31 Jan 2026");
  });

  it("computes the 12-month window", () => {
    const w = reportsWindow(12, "2026-07-29");
    expect(w.startISO).toBe("2025-08-01");
    expect(w.endISO).toBe("2026-08-01");
    expect(w.prevStartISO).toBe("2024-08-01");
  });
});

describe("trendDelta", () => {
  it("reports 'up' with the correct pct when current exceeds previous", () => {
    const d = trendDelta(120, 100);
    expect(d).not.toBeNull();
    expect(d?.direction).toBe("up");
    expect(d?.pct).toBeCloseTo(20, 5);
  });

  it("reports 'down' with a negative pct when current is below previous", () => {
    const d = trendDelta(80, 100);
    expect(d?.direction).toBe("down");
    expect(d?.pct).toBeCloseTo(-20, 5);
  });

  it("reports 'flat' with pct 0 when current equals previous (nonzero)", () => {
    const d = trendDelta(100, 100);
    expect(d?.direction).toBe("flat");
    expect(d?.pct).toBe(0);
  });

  it("is null when previous is zero -- no fake percentage off a zero base", () => {
    expect(trendDelta(50, 0)).toBeNull();
    expect(trendDelta(0, 0)).toBeNull();
  });
});

describe("cumulative", () => {
  it("running-sums billable/nonBillable across months, month label untouched", () => {
    const points: MonthlyHoursPoint[] = [
      { month: "Jan 2026", billable: 10, nonBillable: 5 },
      { month: "Feb 2026", billable: 20, nonBillable: 0 },
      { month: "Mar 2026", billable: 0, nonBillable: 5 },
    ];
    expect(cumulative(points)).toEqual([
      { month: "Jan 2026", billable: 10, nonBillable: 5 },
      { month: "Feb 2026", billable: 30, nonBillable: 5 },
      { month: "Mar 2026", billable: 30, nonBillable: 10 },
    ]);
  });

  it("returns an empty array for an empty input", () => {
    expect(cumulative([])).toEqual([]);
  });
});

describe("buildMonthlyHours", () => {
  const window = reportsWindow(3, "2026-03-15"); // Jan, Feb, Mar 2026

  it("zero-fills every month in the window and buckets billable vs non-billable", () => {
    const rows = [
      { hours: 5, billable: true, entry_date: "2026-01-10" },
      { hours: 2, billable: false, entry_date: "2026-01-20" },
      { hours: 3, billable: true, entry_date: "2026-03-05" },
      // outside the current window (previous window) -- must not leak into the current series
      { hours: 100, billable: true, entry_date: "2025-11-01" },
    ];
    const points = buildMonthlyHours(rows, window);
    expect(points).toHaveLength(3);
    expect(points[0]).toEqual({ month: "Jan 2026", billable: 5, nonBillable: 2 });
    expect(points[1]).toEqual({ month: "Feb 2026", billable: 0, nonBillable: 0 });
    expect(points[2]).toEqual({ month: "Mar 2026", billable: 3, nonBillable: 0 });
  });
});

describe("buildProjectHoursSlices", () => {
  const window = reportsWindow(1, "2026-03-15"); // Mar 2026 only

  it("keeps the top 5 projects by hours and rolls the rest into 'Other projects', pct sums to ~100", () => {
    const rows = [
      { project_id: "p1", hours: 50, entry_date: "2026-03-01" },
      { project_id: "p2", hours: 40, entry_date: "2026-03-01" },
      { project_id: "p3", hours: 30, entry_date: "2026-03-01" },
      { project_id: "p4", hours: 20, entry_date: "2026-03-01" },
      { project_id: "p5", hours: 10, entry_date: "2026-03-01" },
      { project_id: "p6", hours: 5, entry_date: "2026-03-01" },
      { project_id: "p7", hours: 5, entry_date: "2026-03-01" },
      // previous-window noise must not count toward this window's slices
      { project_id: "p1", hours: 999, entry_date: "2026-01-01" },
    ];
    const nameById: Record<string, string> = {
      p1: "Alpha",
      p2: "Beta",
      p3: "Gamma",
      p4: "Delta",
      p5: "Epsilon",
      p6: "Zeta",
      p7: "Eta",
    };
    const slices = buildProjectHoursSlices(rows, window, nameById);
    expect(slices).toHaveLength(6); // top 5 + "Other projects"
    expect(slices[0]).toMatchObject({ id: "p1", name: "Alpha", hours: 50 });
    const other = slices[slices.length - 1];
    expect(other.id).toBeNull();
    expect(other.name).toBe("Other projects");
    expect(other.hours).toBe(10); // p6 + p7

    const pctSum = slices.reduce((s, sl) => s + sl.pct, 0);
    expect(pctSum).toBeCloseTo(100, 5);
  });

  it("omits 'Other projects' when there are 5 or fewer projects", () => {
    const rows = [
      { project_id: "p1", hours: 10, entry_date: "2026-03-01" },
      { project_id: "p2", hours: 5, entry_date: "2026-03-01" },
    ];
    const slices = buildProjectHoursSlices(rows, window, { p1: "Alpha", p2: "Beta" });
    expect(slices).toHaveLength(2);
    expect(slices.every((s) => s.id !== null)).toBe(true);
  });

  it("returns an empty array when the window has no hours", () => {
    expect(buildProjectHoursSlices([], window, {})).toEqual([]);
  });
});

describe("buildUtilizationRows", () => {
  it("maps project_budget_rows columns straight through, no re-derivation", () => {
    const rows: BudgetRow[] = [
      {
        id: "proj-1",
        name: "Acme Site",
        client_name: "Acme",
        client_amount: 10000,
        invoiced: 4000,
        paid: 3000,
        remaining: 6000,
        consumption_pct: 40,
        internal_cost: null,
        margin: null,
        margin_pct: null,
        budget_type: "fixed",
        health: null,
      },
    ];
    expect(buildUtilizationRows(rows)).toEqual([
      { id: "proj-1", name: "Acme Site", invoiced: 4000, budget: 10000, consumptionPct: 40, remaining: 6000 },
    ]);
  });
});

describe("buildCapacityRows", () => {
  it("computes allocated hours from pct * capacity, carries avatarUrl", () => {
    const people: WorkloadPerson[] = [
      {
        id: "person-1",
        full_name: "Jamie Rivera",
        current_allocation_pct: 50,
        weekly_capacity_hours: 40,
        status: "active",
        on_vacation_now: false,
        avatar_url: "https://example.com/a.png",
      },
    ];
    expect(buildCapacityRows(people)).toEqual([
      {
        id: "person-1",
        name: "Jamie Rivera",
        avatarUrl: "https://example.com/a.png",
        pct: 50,
        allocatedHours: 20,
        capacityHours: 40,
      },
    ]);
  });
});

describe("buildMonthlyFinance", () => {
  const window = reportsWindow(2, "2026-02-15"); // Jan, Feb 2026

  it("sums invoiced per month always, cost only with finance visibility", () => {
    const items = [
      { amount: 1000, occurred_on: "2026-01-10", item_type: "invoice" as const },
      { amount: 500, occurred_on: "2026-01-15", item_type: "actual_cost" as const },
      { amount: 2000, occurred_on: "2026-02-01", item_type: "invoice" as const },
      { amount: 300, occurred_on: "2025-12-01", item_type: "invoice" as const }, // previous window, excluded
    ];
    const withFinance = buildMonthlyFinance(items, window, true);
    expect(withFinance).toEqual([
      { month: "Jan 2026", invoiced: 1000, cost: 500 },
      { month: "Feb 2026", invoiced: 2000, cost: 0 },
    ]);

    const withoutFinance = buildMonthlyFinance(items, window, false);
    expect(withoutFinance).toEqual([
      { month: "Jan 2026", invoiced: 1000, cost: null },
      { month: "Feb 2026", invoiced: 2000, cost: null },
    ]);
  });
});

describe("buildPerformanceRows -- gated-null fixture", () => {
  it("never coerces a null invoiced/cost/margin to 0 for a row without visibility", () => {
    const budgetRows: BudgetRow[] = [
      {
        id: "no-vis",
        name: "Hidden Project",
        client_name: "Client X",
        client_amount: null,
        invoiced: null,
        paid: null,
        remaining: null,
        consumption_pct: null,
        internal_cost: null,
        margin: null,
        margin_pct: null,
        budget_type: null,
        health: null,
      },
      {
        id: "full-vis",
        name: "Visible Project",
        client_name: "Client Y",
        client_amount: 10000,
        invoiced: 4000,
        paid: 4000,
        remaining: 6000,
        consumption_pct: 40,
        internal_cost: 3000,
        margin: 1000,
        margin_pct: 10,
        budget_type: "fixed",
        health: null,
      },
      {
        id: "no-hours",
        name: "Idle Project",
        client_name: null,
        client_amount: 5000,
        invoiced: 0,
        paid: 0,
        remaining: 5000,
        consumption_pct: 0,
        internal_cost: null,
        margin: null,
        margin_pct: null,
        budget_type: "fixed",
        health: null,
      },
    ];
    const hoursByProject: Record<string, { total: number; billable: number }> = {
      "no-vis": { total: 8, billable: 4 },
      "full-vis": { total: 20, billable: 15 },
      // "no-hours" intentionally absent -- 0 hours logged
    };

    const rows = buildPerformanceRows(budgetRows, hoursByProject);
    const byId = Object.fromEntries(rows.map((r) => [r.id, r]));

    // No visibility: every money figure stays null, never 0-coerced.
    expect(byId["no-vis"].budget).toBeNull();
    expect(byId["no-vis"].invoiced).toBeNull();
    expect(byId["no-vis"].invoicedPct).toBeNull();
    expect(byId["no-vis"].cost).toBeNull();
    expect(byId["no-vis"].costPct).toBeNull();
    expect(byId["no-vis"].remaining).toBeNull();
    expect(byId["no-vis"].marginPct).toBeNull();
    expect(byId["no-vis"].status).toBe("no_budget");
    // Hours are independent of budget visibility.
    expect(byId["no-vis"].hoursLogged).toBe(8);
    expect(byId["no-vis"].billablePct).toBeCloseTo(50, 5);

    // Full visibility: figures pass through / derive correctly, margin_pct read verbatim.
    expect(byId["full-vis"].budget).toBe(10000);
    expect(byId["full-vis"].invoiced).toBe(4000);
    expect(byId["full-vis"].invoicedPct).toBeCloseTo(40, 5);
    expect(byId["full-vis"].cost).toBe(3000);
    expect(byId["full-vis"].costPct).toBeCloseTo(30, 5);
    expect(byId["full-vis"].marginPct).toBe(10); // verbatim off margin_pct, never re-derived
    expect(byId["full-vis"].status).toBe("on_track");
    expect(byId["full-vis"].billablePct).toBeCloseTo(75, 5);

    // Zero hours logged -> billablePct is null, not 0/NaN.
    expect(byId["no-hours"].hoursLogged).toBe(0);
    expect(byId["no-hours"].billablePct).toBeNull();
  });
});

describe("buildReportsKpis", () => {
  const window = reportsWindow(1, "2026-03-15"); // Mar 2026, prev Feb 2026

  it("computes hours/invoiced/cost with gated nulls and deltas", () => {
    const timeEntries = [
      { hours: 10, entry_date: "2026-03-05" },
      { hours: 5, entry_date: "2026-02-05" }, // previous window
    ];
    const budgetItems = [
      { amount: 1000, occurred_on: "2026-03-01", item_type: "invoice" as const },
      { amount: 500, occurred_on: "2026-02-01", item_type: "invoice" as const },
      { amount: 300, occurred_on: "2026-03-01", item_type: "actual_cost" as const },
    ];
    const budgetRows: BudgetRow[] = [
      {
        id: "p1",
        name: "P1",
        client_name: null,
        client_amount: 10000,
        invoiced: 1000,
        paid: 1000,
        remaining: 9000,
        consumption_pct: 10,
        internal_cost: 300,
        margin: 700,
        margin_pct: 70,
        budget_type: "fixed",
        health: null,
      },
    ];
    const people: WorkloadPerson[] = [
      {
        id: "person-1",
        full_name: "A",
        current_allocation_pct: 80,
        weekly_capacity_hours: 40,
        status: "active",
        on_vacation_now: false,
        avatar_url: null,
      },
      {
        id: "person-2",
        full_name: "B",
        current_allocation_pct: 120,
        weekly_capacity_hours: 40,
        status: "active",
        on_vacation_now: false,
        avatar_url: null,
      },
    ];

    const kpis = buildReportsKpis({
      window,
      timeEntries,
      budgetItems,
      budgetRows,
      people,
      hasBudgetVisibility: true,
      hasFinanceVisibility: true,
    });

    expect(kpis.totalHours).toBe(10);
    expect(kpis.hoursDelta).toEqual({ pct: 100, direction: "up" });
    expect(kpis.totalInvoiced).toBe(1000);
    expect(kpis.invoicedDelta).toEqual({ pct: 100, direction: "up" });
    expect(kpis.totalCost).toBe(300);
    expect(kpis.costDelta).toBeNull(); // no actual_cost in the previous window -> no prior data
    expect(kpis.budgetRemaining).toBe(9000);
    expect(kpis.avgUtilization).toBe(100);
    expect(kpis.availableInfo).toBe("1 of 2 available");
  });

  it("nulls invoiced/cost figures without visibility, even if the underlying rows have amounts", () => {
    const kpis = buildReportsKpis({
      window,
      timeEntries: [],
      budgetItems: [{ amount: 1000, occurred_on: "2026-03-01", item_type: "invoice" }],
      budgetRows: [],
      people: [],
      hasBudgetVisibility: false,
      hasFinanceVisibility: false,
    });
    expect(kpis.totalInvoiced).toBeNull();
    expect(kpis.invoicedDelta).toBeNull();
    expect(kpis.totalCost).toBeNull();
    expect(kpis.costDelta).toBeNull();
    expect(kpis.budgetRemaining).toBeNull();
    expect(kpis.avgUtilization).toBe(0);
    expect(kpis.availableInfo).toBe("0 of 0 available");
  });
});
