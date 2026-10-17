import { Wallet } from "lucide-react";
import { Card } from "@/components/ui/card";
import { AutoChip } from "@/components/ui/chip";
import { EmptyState } from "@/components/ui/empty-state";
import { cn } from "@/lib/cn";
import { formatEuro } from "@/lib/format";
import { StatSection } from "./stat-section";
import type { StatisticsOverview } from "./types";

interface Part {
  label: string;
  cents: number;
  swatch: string;
}

/** Collected, waiting and overdue fees as one bar split in three, with the same numbers written below. */
export function FeesSection({ fees, className }: { fees: StatisticsOverview["fees"]; className?: string }) {
  const total = fees.collectedCents + fees.toCollectCents;
  // "toCollect" already contains the overdue amount: waiting = what is due and not yet late
  const parts: Part[] = [
    { label: "Incassato", cents: fees.collectedCents, swatch: "bg-mint-600" },
    { label: "In attesa", cents: fees.toCollectCents - fees.overdueCents, swatch: "bg-primary" },
    { label: "Scadute", cents: fees.overdueCents, swatch: "bg-red-600" },
  ];
  const summary = parts.map(({ label, cents }) => `${label.toLowerCase()} ${formatEuro(cents)}`).join(", ");

  return (
    <StatSection
      title="Quote"
      hint="La barra divide le quote in incassate, in attesa e scadute. Le scadute sono le prime da sollecitare."
      className={className}
    >
      {total === 0 ? (
        <EmptyState
          as="h3"
          icon={Wallet}
          title="Nessuna quota registrata"
          description="Appena ci sono quote, qui vedi quanto è stato incassato e quanto manca."
          className="flex-1 justify-center"
        />
      ) : (
        <Card className="flex flex-1 flex-col gap-4">
          <div
            role="img"
            aria-label={`Ripartizione delle quote: ${summary}`}
            className="flex h-3 w-full overflow-hidden rounded-full bg-ink-100"
          >
            {parts.map(({ label, cents, swatch }) =>
              cents > 0 ? <div key={label} className={cn("h-full", swatch)} style={{ width: `${(cents / total) * 100}%` }} /> : null,
            )}
          </div>
          <ul aria-label="Dettaglio delle quote" className="flex flex-col gap-2">
            {parts.map(({ label, cents, swatch }) => (
              <li key={label} className="flex items-center gap-3 text-sm">
                <span aria-hidden="true" className={cn("size-3 shrink-0 rounded-sm", swatch)} />
                <span className="min-w-0 flex-1 font-semibold text-fg">{label}</span>
                <span className="font-bold tabular-nums text-fg">{formatEuro(cents)}</span>
              </li>
            ))}
          </ul>
          <dl className="mt-auto flex items-center justify-between gap-3 border-t border-line pt-4 text-sm">
            <dt className="flex min-w-0 flex-wrap items-center gap-2 text-fg-muted">
              <span>Promemoria inviati</span>
              <AutoChip />
            </dt>
            <dd className="font-bold tabular-nums text-fg">{fees.remindersSent}</dd>
          </dl>
        </Card>
      )}
    </StatSection>
  );
}
