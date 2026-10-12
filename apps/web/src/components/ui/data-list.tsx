import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { DataBoundary, type DataBoundaryProps } from "./data-boundary";

export interface DataListProps<T> extends Pick<DataBoundaryProps, "isLoading" | "error" | "onRetry" | "skeletonRows" | "loadingLabel"> {
  items: readonly T[] | undefined;
  getKey: (item: T) => string;
  renderItem: (item: T) => ReactNode;
  /** Accessible name of the list. */
  label: string;
  empty: ReactNode;
  className?: string;
}

/** Stack of white row cards (the video's list style) with loading, error and empty states built in. */
export function DataList<T>({ items, getKey, renderItem, label, empty, className, ...state }: DataListProps<T>) {
  return (
    <DataBoundary {...state} isEmpty={!items || items.length === 0} empty={empty}>
      <ul aria-label={label} className={cn("flex flex-col gap-2", className)}>
        {items?.map((item) => (
          <li key={getKey(item)} className="rounded-lg bg-surface shadow-soft">
            {renderItem(item)}
          </li>
        ))}
      </ul>
    </DataBoundary>
  );
}

export interface DataListRowProps {
  leading?: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  trailing?: ReactNode;
  className?: string;
}

/** Standard row layout: leading visual, two text lines, trailing status. Truncates long names. */
export function DataListRow({ leading, title, subtitle, trailing, className }: DataListRowProps) {
  return (
    <div className={cn("flex min-h-14 items-center gap-3 px-3 py-2 sm:px-4", className)}>
      {leading}
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-bold text-fg">{title}</div>
        {subtitle ? <div className="truncate text-xs text-fg-muted">{subtitle}</div> : null}
      </div>
      {trailing ? <div className="flex shrink-0 items-center gap-2">{trailing}</div> : null}
    </div>
  );
}
