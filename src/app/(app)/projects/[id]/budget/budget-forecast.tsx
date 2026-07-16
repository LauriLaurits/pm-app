import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatMoney } from "@/lib/budget";

// Simple linear forecast-at-completion: if the project is X% done and has invoiced Y so far,
// projecting the current run-rate to 100% progress gives Y / (X/100). Deliberately naive (no
// seasonality/trend) and labeled as such -- this is NOT a re-derivation of margin/cost, just a
// linear projection of the already-gated `invoiced` figure.
export function BudgetForecast({
  invoiced,
  progress,
}: {
  invoiced: number | null;
  progress: number | null;
}) {
  if (invoiced === null) return null;

  const canForecast = progress !== null && progress > 0;
  const forecastTotal = canForecast ? invoiced * (100 / progress) : null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Forecast at completion</CardTitle>
        <CardDescription>
          Simple linear estimate: current spend projected from progress to 100%.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {forecastTotal === null ? (
          <p className="text-sm text-muted-foreground">
            Not enough progress recorded yet to forecast.
          </p>
        ) : (
          <div className="flex flex-wrap items-center gap-6">
            <div>
              <CardDescription>Progress</CardDescription>
              <div className="text-lg font-semibold">{progress}%</div>
            </div>
            <div>
              <CardDescription>Spent so far</CardDescription>
              <div className="text-lg font-semibold">{formatMoney(invoiced)}</div>
            </div>
            <div>
              <CardDescription>Projected total at completion</CardDescription>
              <div className="text-lg font-semibold">{formatMoney(forecastTotal)}</div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
