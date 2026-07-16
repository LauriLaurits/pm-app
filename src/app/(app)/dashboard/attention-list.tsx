import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { AttentionItem } from "./types";

// One shared shape for every "needs attention" list on the dashboard -- each row links to the
// screen where the viewer can actually act (project detail, credentials tab, person detail).
export function AttentionList({
  title,
  emptyMessage,
  items,
}: {
  title: string;
  emptyMessage: string;
  items: AttentionItem[];
}) {
  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle className="text-sm">{title}</CardTitle>
        <CardDescription>{items.length} {items.length === 1 ? "item" : "items"}</CardDescription>
      </CardHeader>
      <CardContent>
        {items.length === 0 ? (
          <p className="py-2 text-sm text-muted-foreground">{emptyMessage}</p>
        ) : (
          <ul className="-mx-2">
            {items.map((item) => (
              <li key={item.id}>
                <Link
                  href={item.href}
                  className="flex items-center justify-between gap-2 rounded-lg px-2 py-2 text-sm transition-colors hover:bg-accent focus-visible:bg-accent focus-visible:outline-none"
                >
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{item.primary}</span>
                    {item.secondary && (
                      <span className="block truncate text-xs text-muted-foreground">
                        {item.secondary}
                      </span>
                    )}
                  </span>
                  {item.badgeLabel && (
                    <Badge variant="outline" className={item.badgeClassName}>
                      {item.badgeLabel}
                    </Badge>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
