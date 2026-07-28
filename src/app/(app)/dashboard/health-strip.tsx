import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DERIVED_HEALTH_LABEL } from "@/lib/health";

// Three tinted blocks (emerald/orange/red) instead of a neutral strip with colored dots -- the
// tile's own background carries the health signal so it reads at a glance, same idea as the KPI
// tiles' pastel icon chips.
const SEGMENT_TINT = {
  healthy: "bg-emerald-500/10 hover:bg-emerald-500/15",
  warning: "bg-orange-500/10 hover:bg-orange-500/15",
  critical: "bg-red-500/10 hover:bg-red-500/15",
} as const;

const SEGMENT_TEXT = {
  healthy: "text-emerald-600 dark:text-emerald-400",
  warning: "text-orange-600 dark:text-orange-400",
  critical: "text-red-600 dark:text-red-400",
} as const;

export function HealthStrip({
  healthy,
  warning,
  critical,
}: {
  healthy: number;
  warning: number;
  critical: number;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Portfolio health</CardTitle>
        <CardAction>
          <Button variant="outline" size="sm" render={<Link href="/projects" />}>
            View health report
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent className="grid gap-4 md:grid-cols-3">
        <HealthSegment href="/projects?health=healthy" count={healthy} label={DERIVED_HEALTH_LABEL.healthy} level="healthy" />
        <HealthSegment href="/projects?health=warning" count={warning} label={DERIVED_HEALTH_LABEL.warning} level="warning" />
        <HealthSegment href="/projects?health=critical" count={critical} label={DERIVED_HEALTH_LABEL.critical} level="critical" />
      </CardContent>
    </Card>
  );
}

function HealthSegment({
  href,
  count,
  label,
  level,
}: {
  href: string;
  count: number;
  label: string;
  level: keyof typeof SEGMENT_TINT;
}) {
  return (
    <Link
      href={href}
      className={`flex flex-col items-center justify-center gap-1 rounded-lg p-4 text-center transition-colors focus-visible:outline-2 focus-visible:outline-ring ${SEGMENT_TINT[level]}`}
    >
      <div className={`text-2xl font-semibold tabular-nums ${SEGMENT_TEXT[level]}`}>{count}</div>
      <div className="text-sm text-muted-foreground">{label}</div>
    </Link>
  );
}
