import type { CSSProperties } from "react";

// Chart color roles, consumed as CSS custom properties (defined for :root/.dark in
// src/app/globals.css) so a single set of hex values swaps at paint time between light and dark
// -- no re-render, no theme prop threading through the Recharts tree. Values themselves come from
// the dataviz skill's validated reference palette (see references/palette.md); this file just
// names the roles each chart wrapper uses instead of repeating var(...) strings everywhere.
//
// Categorical slots 1/2 (blue/aqua) validated via scripts/validate_palette.js for both modes
// (light: CVD deutan ΔE 73.6, WARN on aqua contrast -- mitigated by always pairing a visible
// legend + direct value labels, never color alone; dark: all PASS). Status colors are the fixed,
// never-themed four-step scale -- reserved for severity-coded marks (consumption/utilization),
// never reused as "series N".

export const VIZ_SERIES_1 = "var(--viz-series-1)"; // blue
export const VIZ_SERIES_2 = "var(--viz-series-2)"; // aqua
export const VIZ_TRACK = "var(--viz-track)";
export const VIZ_INK_SECONDARY = "var(--viz-ink-secondary)";
export const VIZ_INK_MUTED = "var(--viz-ink-muted)";

export const VIZ_STATUS = {
  good: "var(--viz-status-good)",
  warning: "var(--viz-status-warning)",
  serious: "var(--viz-status-serious)",
  critical: "var(--viz-status-critical)",
} as const;

// Maps this app's existing severity/utilization tiers onto the fixed status scale, so a chart
// mark that means "how bad is this" always wears status tokens (never categorical) per the
// dataviz skill's collision rule.
export const CONSUMPTION_STATUS_COLOR: Record<"ok" | "warn" | "high" | "over", string> = {
  ok: VIZ_STATUS.good,
  warn: VIZ_STATUS.warning,
  high: VIZ_STATUS.serious,
  over: VIZ_STATUS.critical,
};

export const UTILIZATION_STATUS_COLOR: Record<
  "available" | "partial" | "full" | "overallocated",
  string
> = {
  available: VIZ_STATUS.good,
  partial: VIZ_SERIES_1,
  full: VIZ_STATUS.warning,
  overallocated: VIZ_STATUS.critical,
};

// Shared Recharts tooltip styling so every chart's hover box looks the same and stays legible in
// both modes (uses text/border tokens from the app's own theme, not the viz palette -- tooltip
// chrome is UI, not data).
export const TOOLTIP_CONTENT_STYLE: CSSProperties = {
  background: "var(--popover)",
  color: "var(--popover-foreground)",
  border: "1px solid var(--border)",
  borderRadius: "var(--radius-md)",
  fontSize: "0.75rem",
  padding: "0.5rem 0.75rem",
};

export const TOOLTIP_LABEL_STYLE: CSSProperties = {
  color: "var(--popover-foreground)",
  fontWeight: 500,
  marginBottom: "0.25rem",
};
