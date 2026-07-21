import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { consumptionSeverity, formatMoney } from "@/lib/budget";
import { deadlineCountdown } from "@/lib/deadline";
import { progressBasisLabel, type DerivedProgress } from "@/lib/progress";
import { formatDate } from "../types";

export type ProjectBudgetCell = {
  clientAmount: number;
  invoiced: number;
  consumptionPct: number | null;
} | null;

const CONSUMPTION_TONE: Record<ReturnType<typeof consumptionSeverity>, string> = {
  ok: "text-muted-foreground",
  warn: "text-amber-700 dark:text-amber-400",
  high: "text-amber-700 dark:text-amber-400",
  over: "text-red-700 dark:text-red-400",
};

// The "where does it stand right now" strip under the project title. Every cell is labeled and
// interpreted -- progress is derived (not typed), the deadline shows a countdown not just a date,
// budget is spent-of-total (finance only), team is a headcount. Purely presentational.
export function ProjectHeaderStrip({
  progress,
  deadline,
  budget,
  teamCount,
}: {
  progress: DerivedProgress;
  deadline: string | null;
  budget: ProjectBudgetCell;
  teamCount: number;
}) {
  const countdown = deadlineCountdown(deadline);

  const severity = budget ? consumptionSeverity(budget.consumptionPct) : "ok";

  return (
    <Card size="sm">
      <CardContent>
        <div className="grid grid-cols-2 gap-x-6 gap-y-4 md:grid-cols-4">
          <div className="space-y-1.5">
            <div className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Progress</div>
            <div className="flex items-baseline gap-2">
              <span className="text-lg font-semibold tabular-nums">
                {progress.pct === null ? "—" : `${progress.pct}%`}
              </span>
            </div>
            <Progress value={progress.pct ?? 0} />
            <div className="text-xs text-muted-foreground">{progressBasisLabel(progress)}</div>
          </div>

          <Cell
            label="Deadline"
            value={formatDate(deadline)}
            context={countdown.label}
            contextClass={countdown.toneClass}
          />

          {budget && (
            <Cell
              label="Budget"
              value={`${formatMoney(budget.invoiced)} of ${formatMoney(budget.clientAmount)}`}
              context={budget.consumptionPct === null ? "—" : `${budget.consumptionPct.toFixed(0)}% spent`}
              contextClass={CONSUMPTION_TONE[severity]}
            />
          )}

          <Cell
            label="Team"
            value={`${teamCount} ${teamCount === 1 ? "person" : "people"}`}
            context={teamCount === 0 ? "no members yet" : "assigned to this project"}
          />
        </div>
      </CardContent>
    </Card>
  );
}

function Cell({
  label,
  value,
  context,
  contextClass = "text-muted-foreground",
}: {
  label: string;
  value: string;
  context: string;
  contextClass?: string;
}) {
  return (
    <div className="space-y-1.5">
      <div className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{label}</div>
      <div className="text-lg font-semibold">{value}</div>
      <div className={`text-xs ${contextClass}`}>{context}</div>
    </div>
  );
}
