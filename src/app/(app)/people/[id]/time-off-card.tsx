import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { humanize } from "../types";
import { formatPeriod } from "./types";
import type { TimeOffRow } from "./types";

export function TimeOffCard({ timeOff }: { timeOff: TimeOffRow[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Time off</CardTitle>
      </CardHeader>
      <CardContent>
        {timeOff.length === 0 ? (
          <p className="text-sm text-muted-foreground">No time off recorded.</p>
        ) : (
          <div className="space-y-2">
            {timeOff.map((t) => (
              <div key={t.id} className="flex items-center justify-between gap-3 text-sm">
                <div>
                  <div>{formatPeriod(t.starts_on, t.ends_on)}</div>
                  {t.note && <div className="text-xs text-muted-foreground">{t.note}</div>}
                </div>
                <Badge variant="outline">{humanize(t.type)}</Badge>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
