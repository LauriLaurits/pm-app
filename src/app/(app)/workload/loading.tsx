import { Skeleton } from "@/components/ui/skeleton";

export default function WorkloadLoading() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-8 w-40" />
      <div className="flex flex-wrap gap-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-6 w-24" />
        ))}
      </div>
      <div className="space-y-2">
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </div>
    </div>
  );
}
