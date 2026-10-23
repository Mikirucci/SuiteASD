import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/cn";
import { Button } from "./button";

export interface PaginationProps {
  /** 1-based number of the page on screen. */
  page: number;
  totalPages: number;
  /** Results over every page. */
  total: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  /** Names the control for assistive tech when a screen has more than one list. */
  label?: string;
  className?: string;
}

/**
 * Previous / next with where the reader is ("21-40 di 87"). It stays out of the way when everything fits on one page.
 * The range is announced politely so a screen reader hears the new page without losing its place.
 */
export function Pagination({ page, totalPages, total, pageSize, onPageChange, label = "Paginazione", className }: PaginationProps) {
  // One page and nothing to go back to: no controls. A page past the end (the list shrank) still offers the way back.
  if (totalPages <= 1 && page <= 1) return null;
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);
  return (
    <nav aria-label={label} className={cn("flex flex-col gap-3 border-t border-line pt-4 sm:flex-row sm:items-center sm:justify-between", className)}>
      <p aria-live="polite" className="text-sm text-fg-muted">
        {from <= total ? `${from}-${to} di ${total}` : `${total} in tutto`}
      </p>
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 sm:flex-nowrap sm:justify-end">
        <Button variant="secondary" size="sm" leftIcon={<ChevronLeft />} disabled={page <= 1} onClick={() => onPageChange(page - 1)}>
          Precedente
        </Button>
        {/* On a narrow screen the position sits on its own line above the two buttons */}
        <span className="order-first basis-full text-center text-sm font-semibold text-fg sm:order-none sm:basis-auto">
          Pagina {page} di {Math.max(totalPages, 1)}
        </span>
        <Button variant="secondary" size="sm" rightIcon={<ChevronRight />} disabled={page >= totalPages} onClick={() => onPageChange(page + 1)}>
          Successiva
        </Button>
      </div>
    </nav>
  );
}
