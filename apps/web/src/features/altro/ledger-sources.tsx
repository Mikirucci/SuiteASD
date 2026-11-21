import Link from "next/link";
import { Alert, ButtonLink } from "@/components/ui";
import type { LedgerKind, LedgerSource } from "./types";

export interface SourceInfo {
  /** The word on the badge of an entry: where it comes from. */
  label: string;
  /** The section that owns the entries of this origin, and where it is. */
  section: string;
  href: string;
  /** Why the entry cannot be changed here. */
  note: string;
}

/** The sections that feed the ledger. Their entries are born, changed and removed there, never in Entrate or Uscite. */
export const SOURCES: Readonly<Record<LedgerSource, SourceInfo>> = {
  PAYMENT: { label: "Pagamento", section: "Pagamenti", href: "/quote", note: "Nasce dal pagamento di una quota: per cambiarlo apri Pagamenti." },
  SPONSOR: { label: "Sponsor", section: "Sponsor", href: "/altro/sponsor", note: "Nasce dal contratto di uno sponsor: per cambiarla apri lo sponsor." },
  VENUE: { label: "Palestra", section: "Palestre", href: "/altro/palestre", note: "È il costo di una palestra: si cambia dalla palestra." },
  KIT: { label: "Divisa", section: "Divise", href: "/altro/divise", note: "È il costo di una divisa: si cambia dalla divisa." },
  TRIP: { label: "Trasferta", section: "Trasferte", href: "/altro/trasferte", note: "È il costo di una trasferta: si cambia dalla trasferta." },
  REFEREE: { label: "Arbitro", section: "Arbitri", href: "/altro/arbitri", note: "È il compenso di un arbitro: si cambia dalla designazione." },
};

/** The origins each kind of movement can have, in the order they are listed. */
export const SOURCES_OF_KIND: Readonly<Record<LedgerKind, readonly LedgerSource[]>> = {
  INCOME: ["PAYMENT", "SPONSOR"],
  EXPENSE: ["VENUE", "KIT", "TRIP", "REFEREE"],
};

/** The usual category of each origin (the backend ledger links): an entry of this category is mostly born there. */
const SOURCE_OF_CATEGORY: Readonly<Record<string, LedgerSource>> = {
  quote: "PAYMENT",
  sponsor: "SPONSOR",
  palestre: "VENUE",
  divise: "KIT",
  trasferte: "TRIP",
  arbitri: "REFEREE",
};

export function sourceOfCategory(category: string): LedgerSource | null {
  return SOURCE_OF_CATEGORY[category.trim().toLocaleLowerCase("it-IT")] ?? null;
}

/** The note in the detail of an entry that another section owns: why it is not editable and the way to the place where it is. */
export function SourceAlert({ source }: { source: LedgerSource }) {
  const info = SOURCES[source];
  return (
    <Alert tone="info" title={`Registrata da ${info.section}`} className="mb-4">
      <p>
        {info.note}{" "}
        <Link href={info.href} className="font-semibold underline underline-offset-2">
          Vai a {info.section}
        </Link>
      </p>
    </Alert>
  );
}

/** On the page of a category that a section feeds: which entries come from it, and the way to it. */
export function CategorySourceNote({ source }: { source: LedgerSource }) {
  const info = SOURCES[source];
  return (
    <Alert tone="info" title={`Una parte nasce da ${info.section}`}>
      <p>
        Le voci con l&apos;etichetta {info.label} arrivano da {info.section} e si cambiano lì; quelle registrate qui le gestisci in questa pagina.
      </p>
      <ButtonLink href={info.href} variant="secondary" size="sm" className="mt-3">
        Vai a {info.section}
      </ButtonLink>
    </Alert>
  );
}
