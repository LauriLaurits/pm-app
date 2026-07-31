"use client";

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { TOOLTIP_CONTENT_STYLE, TOOLTIP_LABEL_STYLE, VIZ_SERIES, VIZ_SERIES_OTHER } from "./palette";

export type ProjectHoursSlice = { id: string | null; name: string; hours: number; pct: number };

// Part-to-whole, top N + "Other" (dataviz skill: choosing-a-form.md caps a donut/pie at ~6
// segments read "at a glance" -- this is exactly that: top 5 + Other, never more). Slice order is
// hours descending (already the shape buildProjectHoursSlices returns), so color assignment is
// positional: slot 1..5 for the named projects, the dedicated muted "Other" token for the id:null
// aggregate slice regardless of its position -- never a 6th hue. The legend is the identity
// channel (color dot + name + hours + pct per row); the center total is direct-labeled text, not
// color-decoded, so nothing here relies on hue alone.
function sliceColor(slice: ProjectHoursSlice, index: number): string {
  if (slice.id === null) return VIZ_SERIES_OTHER;
  return VIZ_SERIES[index % VIZ_SERIES.length];
}

export function ProjectHoursDonut({ slices }: { slices: ProjectHoursSlice[] }) {
  const total = slices.reduce((s, slice) => s + slice.hours, 0);
  const data = slices.map((slice, index) => ({ ...slice, fill: sliceColor(slice, index) }));

  return (
    <div className="flex flex-col items-center gap-4">
      <div className="relative h-[180px] w-full shrink-0">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              dataKey="hours"
              nameKey="name"
              cx="50%"
              cy="50%"
              innerRadius={62}
              outerRadius={86}
              paddingAngle={2}
              stroke="var(--viz-surface)"
              strokeWidth={2}
            >
              {data.map((d) => (
                <Cell key={d.id ?? "other"} fill={d.fill} />
              ))}
            </Pie>
            <Tooltip
              contentStyle={TOOLTIP_CONTENT_STYLE}
              labelStyle={TOOLTIP_LABEL_STYLE}
              formatter={(value, _name, item) => [
                `${Number(value).toFixed(1)}h (${item.payload.pct.toFixed(1)}%)`,
                item.payload.name,
              ]}
            />
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-2xl font-semibold leading-none">{Math.round(total).toLocaleString("en-US")}h</span>
          <span className="mt-1 text-xs text-muted-foreground">Total</span>
        </div>
      </div>

      <ul className="w-full space-y-1.5">
        {data.map((d) => (
          <li key={d.id ?? "other"} className="flex items-center justify-between gap-2 text-sm">
            <span className="flex min-w-0 items-center gap-2">
              <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: d.fill }} />
              <span className="truncate">{d.name}</span>
            </span>
            <span className="shrink-0 tabular-nums text-muted-foreground">
              {d.hours.toFixed(1)}h · {d.pct.toFixed(1)}%
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
