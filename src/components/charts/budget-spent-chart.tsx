"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatMoney } from "@/lib/budget";
import { TOOLTIP_CONTENT_STYLE, TOOLTIP_LABEL_STYLE, VIZ_INK_MUTED, VIZ_SERIES_1, VIZ_SERIES_2 } from "./palette";

export type BudgetSpentRow = { id: string; name: string; invoiced: number; remaining: number };

// Part-to-whole (invoiced vs remaining, per project) -> stacked bar, horizontal because project
// names are long (dataviz skill: choosing-a-form.md). Two series always ships a legend (aqua's
// light-mode contrast sits under 3:1 per the palette's validated WARN, so the legend + tooltip
// value text is the required relief -- never color-alone here).
export function BudgetSpentChart({ rows }: { rows: BudgetSpentRow[] }) {
  const data = rows.map((r) => ({
    name: r.name.length > 22 ? `${r.name.slice(0, 21)}…` : r.name,
    fullName: r.name,
    Invoiced: r.invoiced,
    Remaining: Math.max(r.remaining, 0),
  }));
  const height = Math.max(data.length * 44, 120);

  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} layout="vertical" margin={{ left: 8, right: 16, top: 4, bottom: 4 }}>
        <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="var(--viz-track)" />
        <XAxis
          type="number"
          tickFormatter={(v: number) => formatMoney(v)}
          tick={{ fill: VIZ_INK_MUTED, fontSize: 11 }}
          axisLine={{ stroke: "var(--viz-track)" }}
          tickLine={false}
        />
        <YAxis
          type="category"
          dataKey="name"
          width={140}
          tick={{ fill: VIZ_INK_MUTED, fontSize: 11 }}
          axisLine={{ stroke: "var(--viz-track)" }}
          tickLine={false}
        />
        <Tooltip
          cursor={{ fill: "var(--foreground)", fillOpacity: 0.04 }}
          contentStyle={TOOLTIP_CONTENT_STYLE}
          labelStyle={TOOLTIP_LABEL_STYLE}
          formatter={(value) => formatMoney(Number(value))}
          labelFormatter={(_, payload) => payload?.[0]?.payload?.fullName ?? ""}
        />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Bar dataKey="Invoiced" stackId="budget" fill={VIZ_SERIES_1} radius={[0, 0, 0, 0]} maxBarSize={24} />
        <Bar dataKey="Remaining" stackId="budget" fill={VIZ_SERIES_2} radius={[0, 4, 4, 0]} maxBarSize={24} />
      </BarChart>
    </ResponsiveContainer>
  );
}
