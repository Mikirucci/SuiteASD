import { RotateCw, TriangleAlert } from "lucide-react";
import { Button, Skeleton } from "@/components/ui";

/** Error of one block of the home, in place: the rest of the page keeps working and this part can be retried. */
export function BlockError({ what, onRetry }: { what: string; onRetry: () => void }) {
  return (
    <div role="alert" className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-danger">
      <span className="inline-flex items-center gap-2 font-semibold">
        <TriangleAlert aria-hidden="true" className="size-4 shrink-0" />
        Non riesco a caricare {what}.
      </span>
      <Button variant="ghost" size="sm" leftIcon={<RotateCw />} onClick={onRetry}>
        Riprova
      </Button>
    </div>
  );
}

/** Placeholder lines of the same height as the text they stand for. */
export function LinesSkeleton({ label, lines = 2 }: { label: string; lines?: number }) {
  return (
    <div role="status" aria-busy="true" aria-label={label} className="flex flex-col gap-2">
      {Array.from({ length: lines }, (_, index) => (
        <Skeleton key={index} className={index === 0 ? "h-4 w-2/3" : "h-4 w-1/2"} />
      ))}
    </div>
  );
}
