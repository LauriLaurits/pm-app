"use client";

import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatMoney } from "@/lib/budget";
import { TOOLTIP_CONTENT_STYLE, TOOLTIP_LABEL_STYLE, VIZ_INK_MUTED, VIZ_STATUS } from "./palette";

export type MonthlyFinancePoint = { month: string; invoiced: number; cost: number | null };

// Trend over time, two series -> line chart (dataviz skill: choosing-a-form.md). Invoiced (money
// in) vs Cost (money out) is a good/bad comparison, not two arbitrary categories, so this wears
// the fixed status scale rather than a categorical slot -- same collision rule
// CONSUMPTION_STATUS_COLOR/UTILIZATION_STATUS_COLOR already follow, and it matches how the KPI
// row already treats invoiced-up as good (emerald) and cost-up as bad (red) deltas.
// Compact axis labels ("€25K") since monthly totals in this dataset run into the tens of
// thousands -- full formatMoney() would crowd the y-axis.
function compactMoney(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 1000) return `€${Math.round(value / 1000)}K`;
  return `€${Math.round(value)}`;
}

// `cost` is null for EVERY point when the viewer lacks finance visibility (buildMonthlyFinance's
// contract) -- the parent only renders this chart at all when it has budget visibility (the
// Invoiced line's own gate), and this component independently omits the Cost line whenever the
// data says so, rather than plotting a flat null/zero line.
export function MonthlyFinanceChart({ points }: { points: MonthlyFinancePoint[] }) {
  const hasCost = points.some((p) => p.cost !== null);

  return (
    <ResponsiveContainer width="100%" height={220}>
      <LineChart data={points} margin={{ left: 8, right: 16, top: 8, bottom: 4 }}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--viz-track)" />
        <XAxis
          dataKey="month"
          tick={{ fill: VIZ_INK_MUTED, fontSize: 11 }}
          axisLine={{ stroke: "var(--viz-track)" }}
          tickLine={false}
        />
        <YAxis
          tickFormatter={compactMoney}
          tick={{ fill: VIZ_INK_MUTED, fontSize: 11 }}
          axisLine={{ stroke: "var(--viz-track)" }}
          tickLine={false}
          width={56}
        />
        <Tooltip
          contentStyle={TOOLTIP_CONTENT_STYLE}
          labelStyle={TOOLTIP_LABEL_STYLE}
          formatter={(value, name) => [formatMoney(Number(value)), name]}
        />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Line
          type="monotone"
          dataKey="invoiced"
          name="Invoiced"
          stroke={VIZ_STATUS.good}
          strokeWidth={2}
          dot={{ r: 3, fill: VIZ_STATUS.good, stroke: "var(--viz-surface)", strokeWidth: 2 }}
        />
        {hasCost && (
          <Line
            type="monotone"
            dataKey="cost"
            name="Cost"
            stroke={VIZ_STATUS.critical}
            strokeWidth={2}
            dot={{ r: 3, fill: VIZ_STATUS.critical, stroke: "var(--viz-surface)", strokeWidth: 2 }}
          />
        )}
      </LineChart>
    </ResponsiveContainer>
  );
}
