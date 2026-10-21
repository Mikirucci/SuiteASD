import { ChevronRight } from "lucide-react";
import Link from "next/link";
import { Badge, Skeleton } from "@/components/ui";
import type { DocumentType } from "@/features/tesserati/types";
import { TypeCounters } from "./type-counters";
import type { TypeStats } from "./types";

/** What the card can say about the people of its type: the figures, or why it cannot. */
export type TypeCardStats = TypeStats | { state: "loading" | "error" };

function describeType(type: DocumentType): string {
  const parts = [type.requiresExpiry ? "Con scadenza" : "Senza scadenza", type.isRequired ? "Richiesto a tutti" : "Facoltativo"];
  if (type.validityDays !== null) parts.push(`valido ${type.validityDays} giorni`);
  return parts.join(" · ");
}

function Previews({ stats }: { stats: TypeCardStats }) {
  if (!("state" in stats)) return <TypeCounters stats={stats} />;
  if (stats.state === "loading") return <Skeleton aria-hidden="true" className="h-7 w-40" />;
  return <p className="text-sm text-fg-muted">Anteprima non disponibile</p>;
}

/** One document type of the society (certificate, enrolment form, privacy...): terms and the three previews. The whole card opens it. */
export function TypeCard({ type, stats }: { type: DocumentType; stats: TypeCardStats }) {
  return (
    <li className="relative flex flex-col gap-4 rounded-lg bg-surface p-4 shadow-soft transition-[box-shadow,transform] duration-200 ease-soft focus-within:ring-2 focus-within:ring-primary hover:-translate-y-0.5 hover:shadow-raised sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <h3 className="min-w-0 text-base font-bold tracking-title text-fg">
          <Link href={`/scadenze/${type.id}`} className="after:absolute after:inset-0 after:rounded-lg focus-visible:outline-none">
            {type.name}
          </Link>
        </h3>
        {type.isRequired ? <Badge variant="brand">Richiesto</Badge> : <Badge variant="neutral">Facoltativo</Badge>}
      </div>
      <p className="text-sm text-fg-muted">{describeType(type)}</p>
      <div className="mt-auto flex items-center justify-between gap-3 border-t border-line pt-4">
        <Previews stats={stats} />
        <ChevronRight aria-hidden="true" className="size-5 shrink-0 text-fg-muted" />
      </div>
    </li>
  );
}
