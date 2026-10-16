import { cn } from "@/lib/cn";

const MAX_SHOWN = 99;

/** Text of the badge: the exact count up to 99, then "99+". */
export function badgeText(count: number): string {
  return count > MAX_SHOWN ? `${MAX_SHOWN}+` : String(count);
}

/** Counter pill on a navigation item. It follows the item label in the DOM, so the link's name reads "Notifiche 3 da leggere"
 * (visible text first, as WCAG 2.5.3 requires) without any aria-label. */
export function NavBadge({ count, className }: { count: number; className?: string }) {
  if (count <= 0) return null;
  return (
    <span
      className={cn(
        "inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-xs font-bold leading-none text-white",
        className,
      )}
    >
      {badgeText(count)}{" "}
      <span className="sr-only">da leggere</span>
    </span>
  );
}
