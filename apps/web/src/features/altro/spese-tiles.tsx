import { Coins, Link2, PencilLine, Scale, Tags } from "lucide-react";
import { StatTile } from "@/components/ui";
import { formatEuro, pluralize } from "@/lib/format";
import type { LedgerSummary } from "./types";

export interface SpeseTilesProps {
  summary: LedgerSummary;
  /** Accessible name of the group of tiles. */
  label: string;
  /** The last tile: how many categories the period has (overview) or what an expense of the category costs on average (a category). */
  last: "categories" | "average";
}

/** What was spent in the period, how much of it was entered here and how much comes from other sections. */
export function SpeseTiles({ summary, label, last }: SpeseTilesProps) {
  return (
    <section aria-label={label} className="grid grid-cols-2 gap-4 lg:grid-cols-4">
      <StatTile
        label="Spese del periodo"
        icon={Coins}
        tone="brand"
        value={formatEuro(summary.totalCents)}
        note={summary.count === 0 ? "Nessuna spesa" : pluralize(summary.count, "spesa", "spese")}
      />
      <StatTile label="Registrate qui" icon={PencilLine} tone="success" value={formatEuro(summary.manualCents)} note="Inserite a mano" />
      <StatTile label="Da altre sezioni" icon={Link2} tone="warning" value={formatEuro(summary.linkedCents)} note="Palestre, divise, trasferte e arbitri" />
      {last === "categories" ? (
        <StatTile label="Categorie" icon={Tags} value={summary.categories.length} note="con almeno una spesa" />
      ) : (
        <StatTile label="Spesa media" icon={Scale} value={formatEuro(summary.count === 0 ? 0 : Math.round(summary.totalCents / summary.count))} note="per ogni spesa" />
      )}
    </section>
  );
}
