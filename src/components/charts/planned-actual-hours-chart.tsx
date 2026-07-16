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
import { TOOLTIP_CONTENT_STYLE, TOOLTIP_LABEL_STYLE, VIZ_INK_MUTED, VIZ_SERIES_1, VIZ_SERIES_2 } from "./palette";

export type PlannedActualRow = { id: string; name: string; planned: number; actual: number };

// "Tell distinct series apart" (planned estimate vs actual logged hours, per project) -> grouped
// bar, categorical color, 2 series so a legend always ships (dataviz skill: choosing-a-form.md,
// marks-and-anatomy.md). Horizontal because project names are long.
export function PlannedActualHoursChart({ rows }: { rows: PlannedActualRow[] }) {
  const data = rows.map((r) => ({
    name: r.name.length > 22 ? `${r.name.slice(0, 21)}…` : r.name,
    fullName: r.name,
    Planned: r.planned,
    Actual: r.actual,
  }));
  const height = Math.max(data.length * 44, 120);

  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} layout="vertical" margin={{ left: 8, right: 16, top: 4, bottom: 4 }}>
        <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="var(--viz-track)" />
        <XAxis
          type="number"
          tickFormatter={(v: number) => `${v}h`}
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
          contentStyle={TOOLTIP_CONTENT_STYLE}
          labelStyle={TOOLTIP_LABEL_STYLE}
          formatter={(value) => `${value}h`}
          labelFormatter={(_, payload) => payload?.[0]?.payload?.fullName ?? ""}
        />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Bar dataKey="Planned" fill={VIZ_SERIES_1} radius={[0, 4, 4, 0]} maxBarSize={16} />
        <Bar dataKey="Actual" fill={VIZ_SERIES_2} radius={[0, 4, 4, 0]} maxBarSize={16} />
      </BarChart>
    </ResponsiveContainer>
  );
}
