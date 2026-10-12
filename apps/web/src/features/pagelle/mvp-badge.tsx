import { Star } from "lucide-react";
import { cn } from "@/lib/cn";

/** Gold badge of the best player of the match. The star and the word carry the meaning, gold only decorates. */
export function MvpBadge({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-gold-100 px-2.5 py-1 text-xs font-bold text-gold-800 ring-1 ring-inset ring-gold-400",
        className,
      )}
    >
      <Star aria-hidden="true" className="size-3.5 fill-gold-500 text-gold-500" />
      MVP
    </span>
  );
}
