"use client";

import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { TOOLTIP_CONTENT_STYLE, TOOLTIP_LABEL_STYLE, VIZ_INK_MUTED, VIZ_SERIES_1, VIZ_SERIES_2 } from "./palette";

export type MonthlyHoursPoint = { month: string; billable: number; nonBillable: number };

// Hours logged per month, split billable vs non-billable -> stacked bars (part-to-whole over
// time). Two series always ships a legend + value tooltip (never colour alone). Uses the logged
// time_entries the caller can see; not finance-sensitive (hours, not money), so it renders for
// everyone with time visibility.
export function MonthlyHoursChart({ points }: { points: MonthlyHoursPoint[] }) {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={points} margin={{ left: 8, right: 16, top: 8, bottom: 4 }}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--viz-track)" />
        <XAxis
          dataKey="month"
          tick={{ fill: VIZ_INK_MUTED, fontSize: 11 }}
          axisLine={{ stroke: "var(--viz-track)" }}
          tickLine={false}
        />
        <YAxis
          tickFormatter={(v: number) => `${v}h`}
          tick={{ fill: VIZ_INK_MUTED, fontSize: 11 }}
          axisLine={{ stroke: "var(--viz-track)" }}
          tickLine={false}
          width={48}
        />
        <Tooltip
          cursor={{ fill: "var(--foreground)", fillOpacity: 0.04 }}
          contentStyle={TOOLTIP_CONTENT_STYLE}
          labelStyle={TOOLTIP_LABEL_STYLE}
          formatter={(value, name) => [`${Number(value)}h`, name]}
        />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Bar dataKey="billable" name="Billable" stackId="h" fill={VIZ_SERIES_1} maxBarSize={40} />
        <Bar dataKey="nonBillable" name="Non-billable" stackId="h" fill={VIZ_SERIES_2} radius={[3, 3, 0, 0]} maxBarSize={40} />
      </BarChart>
    </ResponsiveContainer>
  );
}
