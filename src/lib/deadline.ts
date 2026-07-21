import { daysUntil } from "@/lib/dashboard";

export type DeadlineCountdown = {
  days: number | null;
  /** "in 12 days" / "due today" / "3 days overdue" (long) or "in 12d" / "due today" / "3d overdue" (short) */
  label: string;
  /** Text tone: red overdue, amber within 14 days, muted otherwise. */
  toneClass: string;
};

const OVERDUE_TONE = "text-red-700 dark:text-red-400";
const SOON_TONE = "text-amber-700 dark:text-amber-400";
const NEUTRAL_TONE = "text-muted-foreground";

// One countdown rule for every surface (project header strip, list tables): the same deadline
// must never read differently in two places.
export function deadlineCountdown(
  deadline: string | null,
  style: "long" | "short" = "long"
): DeadlineCountdown {
  if (!deadline) {
    // Short style returns an empty label so list cells can render just the date's own "—"
    // without doubling up dashes; callers show the label only when it's non-empty.
    return { days: null, label: style === "long" ? "No deadline set" : "", toneClass: NEUTRAL_TONE };
  }
  const days = daysUntil(deadline);
  const unit = (n: number) => (style === "short" ? `${n}d` : `${n} ${n === 1 ? "day" : "days"}`);
  const label =
    days < 0 ? `${unit(-days)} overdue` : days === 0 ? "due today" : `in ${unit(days)}`;
  const toneClass = days < 0 ? OVERDUE_TONE : days <= 14 ? SOON_TONE : NEUTRAL_TONE;
  return { days, label, toneClass };
}
