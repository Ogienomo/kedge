import { Skeleton } from "@kedge/ui";

export default function Loading() {
  return (
    <div className="mx-auto grid max-w-5xl gap-6" aria-busy="true" aria-label="Loading">
      <div className="grid gap-2">
        <Skeleton className="h-7 w-56" />
        <Skeleton className="h-4 w-40" />
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <Skeleton className="h-28" />
        <Skeleton className="h-28" />
        <Skeleton className="h-28" />
      </div>
    </div>
  );
}
