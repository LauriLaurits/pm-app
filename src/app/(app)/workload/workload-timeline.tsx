import Link from "next/link";
import { PersonAvatar } from "@/components/person-avatar";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { utilizationBadgeClasses, utilizationCellClasses } from "@/lib/workload";
import { formatWeekLabel, type PersonTimelineRow, type WeekCell } from "./types";

const PERSON_COL = "260px";
const WEEK_COL = "minmax(56px, 1fr)";

export function WorkloadTimeline({
  rows,
  weekStarts,
}: {
  rows: PersonTimelineRow[];
  weekStarts: string[];
}) {
  return (
    <div className="overflow-x-auto rounded-xl border">
      <div
        className="grid min-w-max"
        style={{ gridTemplateColumns: `${PERSON_COL} repeat(${weekStarts.length}, ${WEEK_COL})` }}
      >
        <div className="sticky left-0 z-20 border-b bg-muted/50 px-3 py-2 text-xs font-medium text-muted-foreground">
          Person
        </div>
        {weekStarts.map((weekStart) => (
          <div
            key={weekStart}
            className="border-b border-l px-1 py-2 text-center text-xs font-medium text-muted-foreground"
          >
            {formatWeekLabel(weekStart)}
          </div>
        ))}

        {rows.map((row, i) => (
          <PersonRowCells key={row.id} row={row} striped={i % 2 === 1} />
        ))}
      </div>
    </div>
  );
}

function PersonRowCells({ row, striped }: { row: PersonTimelineRow; striped: boolean }) {
  const rowBg = striped ? "bg-muted/20" : "bg-background";
  return (
    <>
      <div
        className={cn(
          "sticky left-0 z-10 flex items-center gap-2 border-b px-3 py-2",
          rowBg
        )}
      >
        <PersonAvatar name={row.full_name} avatarUrl={row.avatar_url} className="size-8" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <Link href={`/people/${row.id}`} className="truncate text-sm font-medium hover:underline">
              {row.full_name}
            </Link>
            {row.on_vacation_now && (
              <span
                title="On vacation now"
                aria-label="On vacation now"
                className="size-1.5 shrink-0 rounded-full bg-sky-400 dark:bg-sky-300"
              />
            )}
          </div>
          <div className="truncate text-xs text-muted-foreground">{row.role_title ?? "—"}</div>
        </div>
        <Badge
          variant="outline"
          className={cn("shrink-0", utilizationBadgeClasses(row.current_allocation_pct ?? 0))}
        >
          {row.current_allocation_pct ?? 0}%
        </Badge>
      </div>
      {row.weeks.map((week) => (
        <WorkloadCell key={week.weekStart} week={week} rowBg={rowBg} />
      ))}
    </>
  );
}

function WorkloadCell({ week, rowBg }: { week: WeekCell; rowBg: string }) {
  const label = week.pct > 0 ? `${Math.round(week.pct)}%` : week.onVacation ? "•" : "";
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <div className={cn("flex h-11 items-center justify-center border-b border-l p-1", rowBg)}>
            <span
              className={cn(
                "flex size-full items-center justify-center rounded-md text-[11px] font-semibold text-foreground/80",
                utilizationCellClasses(week.pct),
                week.onVacation && "ring-2 ring-inset ring-sky-400 dark:ring-sky-300"
              )}
            >
              {label}
            </span>
          </div>
        }
      />
      <TooltipContent>
        <div className="space-y-1 text-left">
          <p className="font-semibold">
            {Math.round(week.pct)}% allocated{week.onVacation ? " · on vacation" : ""}
          </p>
          {week.projects.length > 0 && (
            <ul className="space-y-0.5">
              {week.projects.map((p, i) => (
                <li key={i}>
                  {p.name} — {Math.round(p.pct)}%
                </li>
              ))}
            </ul>
          )}
        </div>
      </TooltipContent>
    </Tooltip>
  );
}
