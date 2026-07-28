import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { DERIVED_HEALTH_DOT, DERIVED_HEALTH_LABEL } from "@/lib/health";

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
      <CardContent className="grid gap-4 p-4 md:grid-cols-3">
        <HealthSegment
          href="/projects?health=healthy"
          count={healthy}
          label={DERIVED_HEALTH_LABEL.healthy}
          dotClass={DERIVED_HEALTH_DOT.healthy}
        />
        <HealthSegment
          href="/projects?health=warning"
          count={warning}
          label={DERIVED_HEALTH_LABEL.warning}
          dotClass={DERIVED_HEALTH_DOT.warning}
        />
        <HealthSegment
          href="/projects?health=critical"
          count={critical}
          label={DERIVED_HEALTH_LABEL.critical}
          dotClass={DERIVED_HEALTH_DOT.critical}
        />
      </CardContent>
    </Card>
  );
}

function HealthSegment({
  href,
  count,
  label,
  dotClass,
}: {
  href: string;
  count: number;
  label: string;
  dotClass: string;
}) {
  return (
    <Link
      href={href}
      className="flex flex-col items-center gap-2 rounded-lg p-3 transition-colors hover:bg-accent focus-visible:bg-accent focus-visible:outline-none"
    >
      <div className="text-3xl font-bold text-foreground">{count}</div>
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <span aria-hidden className={`size-2 rounded-full ${dotClass}`} />
        {label}
      </div>
    </Link>
  );
}
