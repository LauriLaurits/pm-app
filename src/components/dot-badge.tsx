import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

/** "● Label" soft badge -- one quiet filled chip, the dot carries the state color. The calm
 * alternative to per-state pill colors at table density (Linear/Stripe status language). */
export function DotBadge({
  dotClassName,
  title,
  className,
  children,
}: {
  dotClassName: string;
  title?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <Badge
      variant="outline"
      title={title}
      className={cn("border-transparent bg-muted/70 font-normal text-foreground/80", className)}
    >
      <span aria-hidden className={cn("size-1.5 shrink-0 rounded-full", dotClassName)} />
      {children}
    </Badge>
  );
}
