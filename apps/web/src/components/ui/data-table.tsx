import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { DataBoundary, type DataBoundaryProps } from "./data-boundary";

export interface DataTableColumn<T> {
  key: string;
  header: string;
  cell: (row: T) => ReactNode;
  align?: "left" | "right";
}

export interface DataTableProps<T> extends Pick<DataBoundaryProps, "isLoading" | "error" | "onRetry" | "skeletonRows" | "loadingLabel"> {
  rows: readonly T[] | undefined;
  columns: readonly DataTableColumn<T>[];
  getKey: (row: T) => string;
  /** Accessible name of the table. */
  label: string;
  empty: ReactNode;
  className?: string;
}

/**
 * Real table from the `md` breakpoint up; on small screens every row becomes a stacked card
 * with "header: value" lines. Explicit ARIA roles keep the table semantics when CSS changes the display.
 */
export function DataTable<T>({ rows, columns, getKey, label, empty, className, ...state }: DataTableProps<T>) {
  return (
    <DataBoundary {...state} isEmpty={!rows || rows.length === 0} empty={empty}>
      <div className={cn("md:overflow-hidden md:rounded-lg md:bg-surface md:shadow-soft", className)}>
        <table role="table" aria-label={label} className="w-full text-left text-sm">
          <thead role="rowgroup" className="max-md:sr-only">
            <tr role="row" className="border-b border-line bg-ink-50">
              {columns.map((column) => (
                <th
                  key={column.key}
                  role="columnheader"
                  scope="col"
                  className={cn("px-4 py-3 text-xs font-bold uppercase tracking-label text-fg-muted", column.align === "right" && "text-right")}
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
                className="max-md:block max-md:rounded-lg max-md:bg-surface max-md:p-4 max-md:shadow-soft md:border-b md:border-line md:last:border-b-0"
              >
                {columns.map((column) => (
                  <td
                    key={column.key}
                    role="cell"
                    className={cn(
                      "max-md:flex max-md:items-center max-md:justify-between max-md:gap-4 max-md:py-1.5 md:px-4 md:py-3",
                      column.align === "right" && "md:text-right",
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
