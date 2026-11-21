import { Coins, HandCoins, Link2, PencilLine, Scale, Tags } from "lucide-react";
import { StatTile } from "@/components/ui";
import { formatEuro, pluralize } from "@/lib/format";
import type { LedgerKind, LedgerSummary } from "./types";

export interface LedgerTilesProps {
  summary: LedgerSummary;
  kind: LedgerKind;
  /** Accessible name of the group of tiles. */
  label: string;
  /** The last tile: how many categories the period has (overview) or what an entry of the category amounts to on average (a category). */
  last: "categories" | "average";
}

const COPY = {
  EXPENSE: {
    total: "Spese del periodo",
    icon: Coins,
    count: (count: number) => pluralize(count, "spesa", "spese"),
    none: "Nessuna spesa",
    linkedLabel: "Da altre sezioni",
    linkedNote: "Palestre, divise, trasferte e arbitri",
    categoriesNote: "con almeno una spesa",
    average: "Spesa media",
    averageNote: "per ogni spesa",
  },
  INCOME: {
    total: "Entrate del periodo",
    icon: HandCoins,
    count: (count: number) => pluralize(count, "entrata", "entrate"),
    none: "Nessuna entrata",
    linkedLabel: "Da altre sezioni",
    linkedNote: "Quote incassate e contratti degli sponsor",
    categoriesNote: "con almeno un'entrata",
    average: "Entrata media",
    averageNote: "per ogni entrata",
  },
} as const;

/** What came in or went out in the period, how much of it was entered here and how much comes from other sections. */
export function LedgerTiles({ summary, kind, label, last }: LedgerTilesProps) {
  const copy = COPY[kind];
  return (
    <section aria-label={label} className="grid grid-cols-2 gap-4 lg:grid-cols-4">
      <StatTile
        label={copy.total}
        icon={copy.icon}
        tone={kind === "INCOME" ? "success" : "brand"}
        value={formatEuro(summary.totalCents)}
        note={summary.count === 0 ? copy.none : copy.count(summary.count)}
      />
      <StatTile label="Registrate qui" icon={PencilLine} tone="success" value={formatEuro(summary.manualCents)} note="Inserite a mano" />
      <StatTile label={copy.linkedLabel} icon={Link2} tone="warning" value={formatEuro(summary.linkedCents)} note={copy.linkedNote} />
      {last === "categories" ? (
        <StatTile label="Categorie" icon={Tags} value={summary.categories.length} note={copy.categoriesNote} />
      ) : (
        <StatTile label={copy.average} icon={Scale} value={formatEuro(summary.count === 0 ? 0 : Math.round(summary.totalCents / summary.count))} note={copy.averageNote} />
      )}
    </section>
  );
}
