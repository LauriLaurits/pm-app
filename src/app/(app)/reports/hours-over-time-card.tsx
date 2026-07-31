"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { ChartCard, ChartEmptyState } from "@/components/charts/chart-card";
import { MonthlyHoursChart, type MonthlyHoursPoint } from "@/components/charts/monthly-hours-chart";
import { cumulative } from "./compute";

// The toggle needs to control what the chart renders, so toggle + chart live in one client
// component (state can't cross a server call site's two separate ChartCard slots) -- the shell
// itself (ChartCard/Card/CardHeader/CardContent) stays the same plain, directive-free component
// every other chart card uses, just invoked from inside this client boundary instead of a server
// one. `points` is the already-built, zero-filled MonthlyHoursPoint[] for the current window
// (buildMonthlyHours' output) -- "By month" renders it as-is, "Cumulative" runs it through
// compute.ts's `cumulative()` (a running total, month labels unchanged).
const VIEWS = [
  { key: "month", label: "By month" },
  { key: "cumulative", label: "Cumulative" },
] as const;
type ViewKey = (typeof VIEWS)[number]["key"];

export function HoursOverTimeCard({ points }: { points: MonthlyHoursPoint[] }) {
  const [view, setView] = useState<ViewKey>("month");
  const isEmpty = points.every((p) => p.billable === 0 && p.nonBillable === 0);
  const data = view === "cumulative" ? cumulative(points) : points;

  return (
    <ChartCard
      title="Hours logged over time"
      description="Billable vs non-billable hours logged, by month"
      action={
        <div
          className="inline-flex items-center gap-1 rounded-lg bg-muted/60 p-0.5"
          role="group"
          aria-label="Chart view"
        >
          {VIEWS.map((v) => {
            const on = v.key === view;
            return (
              <button
                key={v.key}
                type="button"
                onClick={() => setView(v.key)}
                aria-current={on ? "true" : undefined}
                className={cn(
                  "rounded-md px-2.5 py-1 text-sm font-medium transition",
                  on
                    ? "bg-background text-foreground shadow-sm ring-1 ring-foreground/10"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                {v.label}
              </button>
            );
          })}
        </div>
      }
    >
      {isEmpty ? <ChartEmptyState /> : <MonthlyHoursChart points={data} />}
    </ChartCard>
  );
}
