import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { DataBoundary, type DataBoundaryProps } from "./data-boundary";

export interface DataTableColumn<T> {
  key: string;
  header: string;
  cell: (row: T) => ReactNode;
  align?: "left" | "right";
  /** Keeps the cell on one line from the `md` breakpoint up (names, chips): the table scrolls instead of wrapping. */
  nowrap?: boolean;
}

export interface DataTableProps<T> extends Pick<DataBoundaryProps, "isLoading" | "error" | "onRetry" | "skeletonRows" | "loadingLabel"> {
  rows: readonly T[] | undefined;
  columns: readonly DataTableColumn<T>[];
  getKey: (row: T) => string;
  /** Accessible name of the table. */
  label: string;
  /**
   * Makes the whole row clickable. The click is a convenience for the pointer: keep a real button inside one cell as the
   * keyboard and screen reader way in (its click bubbles up to the row).
   */
  onRowClick?: (row: T) => void;
  empty: ReactNode;
  /** Lets the table scroll sideways when its columns do not fit, instead of clipping them. */
  scrollX?: boolean;
  className?: string;
}

/**
 * Real table from the `md` breakpoint up; on small screens every row becomes a stacked card
 * with "header: value" lines. Explicit ARIA roles keep the table semantics when CSS changes the display.
 */
export function DataTable<T>({ rows, columns, getKey, label, onRowClick, empty, scrollX, className, ...state }: DataTableProps<T>) {
  return (
    <DataBoundary {...state} isEmpty={!rows || rows.length === 0} empty={empty}>
      <div className={cn(scrollX ? "md:overflow-x-auto" : "md:overflow-hidden", "md:rounded-lg md:bg-surface md:shadow-soft", className)}>
        <table role="table" aria-label={label} className="w-full text-left text-sm">
          <thead role="rowgroup" className="max-md:sr-only">
            <tr role="row" className="border-b border-line bg-ink-50">
              {columns.map((column) => (
                <th
                  key={column.key}
                  role="columnheader"
                  scope="col"
                  className={cn("px-4 py-3 text-xs font-bold uppercase tracking-label text-fg-muted", column.align === "right" && "text-right", column.nowrap && "md:whitespace-nowrap")}
                >
                  {column.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody role="rowgroup" className="max-md:flex max-md:flex-col max-md:gap-2">
            {rows?.map((row) => (
              <tr
                key={getKey(row)}
                role="row"
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                className={cn(
                  "max-md:block max-md:rounded-lg max-md:bg-surface max-md:p-4 max-md:shadow-soft md:border-b md:border-line md:last:border-b-0",
                  onRowClick && "cursor-pointer transition-colors hover:bg-surface-muted",
                )}
              >
                {columns.map((column) => (
                  <td
                    key={column.key}
                    role="cell"
                    className={cn(
                      "max-md:flex max-md:items-center max-md:justify-between max-md:gap-4 max-md:py-1.5 md:px-4 md:py-3",
                      column.align === "right" && "md:text-right",
                      column.nowrap && "md:whitespace-nowrap",
                    )}
                  >
                    <span aria-hidden="true" className="text-xs font-semibold text-fg-muted md:hidden">
                      {column.header}
                    </span>
                    <span className="min-w-0 max-md:text-right">{column.cell(row)}</span>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </DataBoundary>
  );
}
