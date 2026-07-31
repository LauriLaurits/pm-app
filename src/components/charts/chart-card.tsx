import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

// Plain layout shell shared by every dashboard chart -- not "use client" itself (Recharts only
// needs the client boundary at the actual chart component, passed in as `children`), so this can
// wrap either a client chart or a server-rendered empty state without forcing the whole card to
// hydrate. `action` is an optional header-right slot (a "View all" link, a segmented toggle) --
// same discretion: a plain link can be rendered straight from a server call site, while a
// stateful toggle brings its own "use client" wrapper (see reports/hours-over-time-card.tsx).
export function ChartCard({
  title,
  description,
  action,
  children,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
        {action && <CardAction>{action}</CardAction>}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

// Rendered instead of a chart when the underlying rows are empty -- never render Recharts with a
// zero/empty dataset (reads as "everything is zero" rather than "nothing to show").
export function ChartEmptyState({ message = "Nothing to show yet." }: { message?: string }) {
  return (
    <div className="flex h-[220px] items-center justify-center text-sm text-muted-foreground">
      {message}
    </div>
  );
}
