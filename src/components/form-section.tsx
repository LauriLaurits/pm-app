import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Titled group of fields for a long-ish form -- a heading + one-line "why" description, with a
 * subtle top divider separating it from the section before it (skipped on the first section via
 * `first`, so the form doesn't open with a stray rule under the dialog header). Purely
 * presentational: doesn't touch field state, validation, or submission -- it just gives a flat
 * stack of <FormField>s a sense of "step 1, step 2, ..." instead of one anonymous block.
 *
 * Used by delegation-form.tsx, grant-form.tsx, project-create-form.tsx and overview-edit-form.tsx
 * so those forms read as one consistent system rather than each inventing its own grouping.
 */
export function FormSection({
  title,
  description,
  first = false,
  className,
  children,
}: {
  title: string;
  description?: string;
  first?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section className={cn("space-y-3", !first && "border-t border-border pt-5", className)}>
      <div className="space-y-0.5">
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        {description && <p className="text-sm text-muted-foreground">{description}</p>}
      </div>
      <div className="space-y-4">{children}</div>
    </section>
  );
}
