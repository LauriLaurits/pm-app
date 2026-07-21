import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Titled group of fields for a long-ish form -- a soft-tinted card with a colored dot, heading,
 * and one-line "why" description, so a form reads as "step 1, step 2, ..." instead of one
 * anonymous block. Purely presentational: doesn't touch field state, validation, or submission.
 *
 * `tone` picks the section's accent (dot + faint wash); omit for neutral. Used by
 * delegation-form.tsx, grant-form.tsx, project-create-form.tsx and overview-edit-form.tsx so
 * those forms read as one consistent system rather than each inventing its own grouping.
 */
export type FormSectionTone =
  | "neutral" | "blue" | "emerald" | "amber" | "violet" | "teal" | "rose";

const TONE_DOT: Record<FormSectionTone, string> = {
  neutral: "bg-foreground/30",
  blue: "bg-blue-500",
  emerald: "bg-emerald-500",
  amber: "bg-amber-500",
  violet: "bg-violet-500",
  teal: "bg-teal-500",
  rose: "bg-rose-500",
};

const TONE_BG: Record<FormSectionTone, string> = {
  neutral: "bg-muted/30",
  blue: "bg-blue-500/[0.04] dark:bg-blue-500/[0.06]",
  emerald: "bg-emerald-500/[0.04] dark:bg-emerald-500/[0.06]",
  amber: "bg-amber-500/[0.04] dark:bg-amber-500/[0.06]",
  violet: "bg-violet-500/[0.04] dark:bg-violet-500/[0.06]",
  teal: "bg-teal-500/[0.04] dark:bg-teal-500/[0.06]",
  rose: "bg-rose-500/[0.04] dark:bg-rose-500/[0.06]",
};

export function FormSection({
  title,
  description,
  tone = "neutral",
  className,
  children,
}: {
  title: string;
  description?: string;
  tone?: FormSectionTone;
  /** Accepted for call-site compatibility (the old divider design used it); unused now. */
  first?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section className={cn("space-y-3 rounded-xl border p-4", TONE_BG[tone], className)}>
      <div className="space-y-0.5">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <span aria-hidden className={cn("size-2 shrink-0 rounded-full", TONE_DOT[tone])} />
          {title}
        </h3>
        {description && <p className="text-sm text-muted-foreground">{description}</p>}
      </div>
      <div className="space-y-4">{children}</div>
    </section>
  );
}
