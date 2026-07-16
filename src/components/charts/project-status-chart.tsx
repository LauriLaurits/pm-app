"use client";

import { Bar, BarChart, CartesianGrid, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { TOOLTIP_CONTENT_STYLE, TOOLTIP_LABEL_STYLE, VIZ_INK_MUTED, VIZ_SERIES_1 } from "./palette";

export type ProjectStatusCount = { status: string; label: string; count: number };

// "Compare magnitude" (count of projects per lifecycle status) -> single-hue bar (dataviz skill:
// choosing-a-form.md). This is one measure (count) sliced by a nominal category, not several
// series to tell apart, so every bar takes the same slot-1 hue and needs no legend -- the axis
// ticks already carry the category identity. Direct-labeled at the bar cap per the "columns ->
// value on the cap" convention.
export function ProjectStatusChart({ data }: { data: ProjectStatusCount[] }) {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={data} margin={{ left: 0, right: 8, top: 16, bottom: 4 }}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--viz-track)" />
        <XAxis
          dataKey="label"
          tick={{ fill: VIZ_INK_MUTED, fontSize: 11 }}
          axisLine={{ stroke: "var(--viz-track)" }}
          tickLine={false}
        />
        <YAxis hide />
        <Tooltip
          contentStyle={TOOLTIP_CONTENT_STYLE}
          labelStyle={TOOLTIP_LABEL_STYLE}
          formatter={(value) => [value, "Projects"]}
        />
        <Bar dataKey="count" fill={VIZ_SERIES_1} radius={[4, 4, 0, 0]} maxBarSize={48}>
          <LabelList dataKey="count" position="top" style={{ fill: "var(--foreground)", fontSize: 11 }} />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
