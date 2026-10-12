import type { HTMLAttributes } from "react";
import { cn } from "@/lib/cn";

/** Placeholder block that keeps the layout stable while data loads. Size it like the real content. */
export function Skeleton({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div aria-hidden="true" className={cn("animate-pulse-soft rounded-md bg-ink-200", className)} {...props} />;
}

/** Skeleton rows shaped like a DataList row (avatar, two text lines, trailing chip). */
export function SkeletonRows({ rows = 4, label = "Caricamento in corso" }: { rows?: number; label?: string }) {
  return (
    <div role="status" aria-busy="true" aria-label={label} className="flex flex-col gap-2">
      {Array.from({ length: rows }, (_, index) => (
        <div key={index} className="flex items-center gap-3 rounded-lg bg-surface p-3 shadow-soft">
          <Skeleton className="size-10 rounded-full" />
          <div className="flex flex-1 flex-col gap-2">
            <Skeleton className="h-3.5 w-1/3" />
            <Skeleton className="h-3 w-1/2" />
          </div>
          <Skeleton className="h-6 w-16 rounded-full" />
        </div>
      ))}
    </div>
  );
}
