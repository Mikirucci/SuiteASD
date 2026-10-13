"use client";

import { CircleAlert, CircleCheck } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { useMemberSummary } from "./api";

function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

/** Footer of the list: "118 tesserati · 6 squadre · 0 documenti mancanti", computed live by the API. */
export function MembersSummaryBar() {
  const summary = useMemberSummary(true);

  if (summary.isPending) return <Skeleton aria-hidden="true" className="h-14 rounded-lg" />;

  if (summary.isError) {
    return (
      <div className="flex min-h-14 items-center justify-between gap-3 rounded-lg bg-surface px-4 py-2 text-sm text-fg-muted shadow-soft">
        <span>Il riepilogo non è disponibile.</span>
        <Button variant="ghost" size="sm" onClick={() => void summary.refetch()}>
          Riprova
        </Button>
      </div>
    );
  }

  const { tesserati, squadre, documentiMancanti } = summary.data;
  const complete = documentiMancanti === 0;
  return (
    <div
      role="group"
      aria-label="Riepilogo"
      className="flex min-h-14 flex-wrap items-center gap-x-3 gap-y-1 rounded-lg bg-surface px-4 py-3 text-sm font-semibold text-fg shadow-soft"
    >
      <span>{plural(tesserati, "tesserato", "tesserati")}</span>{" "}
      <span aria-hidden="true" className="text-fg-subtle">
        ·
      </span>{" "}
      <span>{plural(squadre, "squadra", "squadre")}</span>{" "}
      <span aria-hidden="true" className="text-fg-subtle">
        ·
      </span>{" "}
      <span className={cn("inline-flex items-center gap-1.5", complete ? "text-success" : "text-danger")}>
        {complete ? (
          <CircleCheck aria-hidden="true" className="size-4" />
        ) : (
          <CircleAlert aria-hidden="true" className="size-4" />
        )}
        {plural(documentiMancanti, "documento mancante", "documenti mancanti")}
      </span>
    </div>
  );
}
