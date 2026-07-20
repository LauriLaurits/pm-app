"use client";

import { Bar, BarChart, Cell, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { utilizationClass } from "@/lib/workload";
import { TOOLTIP_CONTENT_STYLE, TOOLTIP_LABEL_STYLE, UTILIZATION_STATUS_COLOR, VIZ_INK_MUTED } from "./palette";

export type CapacityRow = { id: string; name: string; capacityHours: number; allocatedHours: number };

type CapacityDatum = {
  name: string;
  pct: number;
  filled: number;
  track: number;
  cls: ReturnType<typeof utilizationClass>;
  capacityHours: number;
  allocatedHours: number;
};

// Custom tooltip content (rather than Tooltip's `formatter`) so the box shows ONE line per
// person, not one per stacked segment (the meter renders two Bars -- filled + track -- to draw
// the severity fill against a flat track; the default per-dataKey tooltip would otherwise show
// both as separate rows).
function CapacityTooltip({ active, payload }: { active?: boolean; payload?: { payload: CapacityDatum }[] }) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  return (
    <div style={TOOLTIP_CONTENT_STYLE}>
      <div style={TOOLTIP_LABEL_STYLE}>{p.name}</div>
      <div>
        {p.allocatedHours}h / {p.capacityHours}h ({p.pct}%)
      </div>
    </div>
  );
}

// "A single ratio against a limit -> Meter" (dataviz skill: choosing-a-form.md) -- each row is one
// person's allocated hours against their own capacity, not an independent series, so this is a
// meter per row rather than a 2-series categorical chart. Because the ratio itself IS the
// severity (available/partial/full/overallocated -- the same tiers as the People/Workload pages'
// badges), the fill wears the fixed status scale per the skill's collision rule ("when a series
// means good/bad, it wears status tokens, never categorical"); the track is a flat neutral so the
// severity color is the only thing that varies. Domain is capped at 130% -- realistic
// overallocation tops out well under that in this dataset, and capping keeps one wildly
// overbooked person from squashing everyone else's bar to nothing.
const DOMAIN_MAX = 130;

export function CapacityChart({ rows }: { rows: CapacityRow[] }) {
  const data = rows.map((r) => {
    const pct = r.capacityHours > 0 ? Math.round((r.allocatedHours / r.capacityHours) * 100) : 0;
    const filled = Math.min(pct, DOMAIN_MAX);
    return {
      name: r.name,
      pct,
      filled,
      track: DOMAIN_MAX - filled,
      cls: utilizationClass(pct),
      capacityHours: r.capacityHours,
      allocatedHours: r.allocatedHours,
    };
  });
  const height = Math.max(data.length * 40, 120);

  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} layout="vertical" margin={{ left: 8, right: 32, top: 4, bottom: 4 }}>
        <XAxis type="number" domain={[0, DOMAIN_MAX]} hide />
        <YAxis
          type="category"
          dataKey="name"
          width={120}
          tick={{ fill: VIZ_INK_MUTED, fontSize: 11 }}
          axisLine={false}
          tickLine={false}
        />
        <Tooltip cursor={{ fill: "var(--foreground)", fillOpacity: 0.04 }} content={<CapacityTooltip />} />
        <Bar dataKey="filled" stackId="meter" radius={[4, 0, 0, 4]} maxBarSize={16}>
          {data.map((d) => (
            <Cell key={d.name} fill={UTILIZATION_STATUS_COLOR[d.cls]} />
          ))}
        </Bar>
        <Bar dataKey="track" stackId="meter" fill="var(--viz-track)" radius={[0, 4, 4, 0]} maxBarSize={16}>
          <LabelList
            dataKey="pct"
            position="right"
            formatter={(v) => `${v}%`}
            style={{ fill: "var(--foreground)", fontSize: 11 }}
          />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
