import { Skeleton } from "@/components/ui/skeleton";

export default function ProjectOverviewLoading() {
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      <div className="space-y-4 lg:col-span-2">
        <Skeleton className="h-48 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
      <div className="space-y-4">
        <Skeleton className="h-56 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    </div>
  );
}
