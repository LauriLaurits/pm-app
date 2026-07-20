import { Skeleton } from "@/components/ui/skeleton";

export default function CredentialsLoading() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-8 w-40" />
      <Skeleton className="h-4 w-96" />
      <div className="space-y-3">
        <Skeleton className="h-6 w-56" />
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-16 w-full" />
      </div>
    </div>
  );
}
