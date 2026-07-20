import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";

/** Prev/Next pager over the same URL-param convention as the filters -- `page` is 1-based and the
 * only param this component itself owns; every other filter param is preserved as-is via
 * `baseQuery` (the current search string with `page` stripped out). */
export function ActivityPagination({
  page,
  hasMore,
  baseQuery,
}: {
  page: number;
  hasMore: boolean;
  baseQuery: string;
}) {
  if (page === 1 && !hasMore) return null;

  function hrefFor(target: number) {
    const params = new URLSearchParams(baseQuery);
    if (target > 1) params.set("page", String(target));
    const qs = params.toString();
    return qs ? `/activity?${qs}` : "/activity";
  }

  return (
    <div className="flex items-center justify-between">
      <span className="text-sm text-muted-foreground">Page {page}</span>
      <div className="flex gap-2">
        {page > 1 ? (
          <Button variant="outline" size="sm" render={<Link href={hrefFor(page - 1)} />}>
            <ChevronLeftIcon /> Newer
          </Button>
        ) : (
          <Button variant="outline" size="sm" disabled>
            <ChevronLeftIcon /> Newer
          </Button>
        )}
        {hasMore ? (
          <Button variant="outline" size="sm" render={<Link href={hrefFor(page + 1)} />}>
            Older <ChevronRightIcon />
          </Button>
        ) : (
          <Button variant="outline" size="sm" disabled>
            Older <ChevronRightIcon />
          </Button>
        )}
      </div>
    </div>
  );
}
