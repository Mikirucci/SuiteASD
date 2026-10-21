"use client";

import { FileCheck, FileWarning, LayoutGrid, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { StatTile } from "@/components/ui/stat-tile";
import { useMemberSummary } from "./api";

/** Top of the page: how many members and teams there are and whether any document is missing, computed live by the API. */
export function MembersSummary() {
  const summary = useMemberSummary(true);

  if (summary.isPending) {
    return (
      <div aria-hidden="true" className="grid gap-3 sm:grid-cols-3">
        {[0, 1, 2].map((index) => (
          <Skeleton key={index} className="h-28 rounded-lg" />
        ))}
      </div>
    );
  }

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
    <div role="group" aria-label="Riepilogo" className="grid gap-3 sm:grid-cols-3">
      <StatTile label="Tesserati" value={tesserati} icon={Users} note={tesserati === 1 ? "persona in elenco" : "persone in elenco"} />
      <StatTile label="Squadre" value={squadre} icon={LayoutGrid} note={squadre === 1 ? "squadra della società" : "squadre della società"} />
      <StatTile
        label="Documenti"
        value={documentiMancanti}
        tone={complete ? "success" : "danger"}
        icon={complete ? FileCheck : FileWarning}
        note={complete ? "Nessun documento mancante" : documentiMancanti === 1 ? "documento mancante" : "documenti mancanti"}
      />
    </div>
  );
}
