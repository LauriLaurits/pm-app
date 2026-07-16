"use client";

import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatMoney } from "@/lib/budget";
import { TOOLTIP_CONTENT_STYLE, TOOLTIP_LABEL_STYLE, VIZ_INK_MUTED, VIZ_SERIES_1 } from "./palette";

export type MonthlyCostPoint = { month: string; cost: number };

// Finance-only: internal cost trend over time -> single-hue area+line (dataviz skill: trend over
// time = line/area, one series needs no legend -- the card title already names what's plotted).
// The parent only renders this component at all when the viewer has view_internal_cost (rows
// come from project_budget_rows-gated visibility, never rendered empty for a non-finance viewer).
export function MonthlyCostChart({ points }: { points: MonthlyCostPoint[] }) {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <AreaChart data={points} margin={{ left: 8, right: 16, top: 8, bottom: 4 }}>
        <defs>
          <linearGradient id="viz-cost-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={VIZ_SERIES_1} stopOpacity={0.1} />
            <stop offset="100%" stopColor={VIZ_SERIES_1} stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--viz-track)" />
        <XAxis
          dataKey="month"
          tick={{ fill: VIZ_INK_MUTED, fontSize: 11 }}
          axisLine={{ stroke: "var(--viz-track)" }}
          tickLine={false}
        />
        <YAxis
          tickFormatter={(v: number) => formatMoney(v)}
          tick={{ fill: VIZ_INK_MUTED, fontSize: 11 }}
          axisLine={{ stroke: "var(--viz-track)" }}
          tickLine={false}
          width={72}
        />
        <Tooltip
          contentStyle={TOOLTIP_CONTENT_STYLE}
          labelStyle={TOOLTIP_LABEL_STYLE}
          formatter={(value) => [formatMoney(Number(value)), "Internal cost"]}
        />
        <Area
          type="monotone"
          dataKey="cost"
          stroke={VIZ_SERIES_1}
          strokeWidth={2}
          fill="url(#viz-cost-fill)"
          dot={{ r: 4, fill: VIZ_SERIES_1, stroke: "var(--viz-surface)", strokeWidth: 2 }}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
