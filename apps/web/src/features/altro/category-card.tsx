import { ChevronRight } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/cn";
import { dayToDate, formatEuro, pluralize } from "@/lib/format";
import { CategoryTile } from "./category-tile";
import { formatRange } from "./spese-period";
import type { LedgerSummary } from "./types";

export interface CategoryCardProps {
  group: LedgerSummary["categories"][number];
  /** The page of the category, with the period of this page. */
  href: string;
  /** True while the pointer is on this category's slice of the chart: the card lifts as if it were hovered. */
  active: boolean;
  onHover: (category: string | null) => void;
}

/** All the expenses of a category in the period as one card: what it holds, the days it covers and the total. The card opens the category. */
export function CategoryCard({ group, href, active, onHover }: CategoryCardProps) {
  return (
    <li
      onPointerEnter={() => onHover(group.category)}
      onPointerLeave={() => onHover(null)}
      onFocus={() => onHover(group.category)}
      onBlur={() => onHover(null)}
      className={cn(
        "group relative flex flex-col gap-4 rounded-lg bg-surface p-4 shadow-soft transition-[box-shadow,transform] duration-200 ease-soft focus-within:ring-2 focus-within:ring-primary hover:-translate-y-0.5 hover:shadow-raised sm:p-5",
        active && "-translate-y-0.5 shadow-raised",
      )}
    >
      <div className="flex items-start gap-3">
        <CategoryTile category={group.category} className="transition-transform duration-200 ease-soft group-hover:scale-110" />
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <h3 className="min-w-0 break-words text-base font-bold tracking-title text-fg">
            <Link href={href} className="after:absolute after:inset-0 after:rounded-lg focus-visible:outline-none">
              {group.category}
            </Link>
          </h3>
          {group.names.length > 0 ? <p className="line-clamp-2 break-words text-sm text-fg-muted">{group.names.join(", ")}</p> : null}
        </div>
      </div>
      <p className="text-sm text-fg-muted">{formatRange({ from: dayToDate(group.firstOn), to: dayToDate(group.lastOn) })}</p>
      <div className="mt-auto flex items-center justify-between gap-3 border-t border-line pt-4">
        <p className="flex flex-wrap items-baseline gap-x-3">
          <span className="text-base font-extrabold text-fg">− {formatEuro(group.totalCents)}</span>
          <span className="text-sm text-fg-muted">{pluralize(group.count, "spesa", "spese")}</span>
        </p>
        <ChevronRight aria-hidden="true" className="size-5 shrink-0 text-fg-muted transition-transform duration-200 ease-soft group-hover:translate-x-1" />
      </div>
    </li>
  );
}
