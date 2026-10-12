"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { Alert, AutoChip, Button, Card, Skeleton } from "@/components/ui";
import { describeError, useApiQuery } from "@/lib/api";
import { formatEuro, pluralize } from "./format";
import type { FeesSummary } from "./types";
import { useQuoteAccess } from "./use-quote-access";

function Figure({ label, value, note, tone }: { label: string; value: ReactNode; note?: ReactNode; tone?: "success" }) {
  return (
    <div className="flex flex-col gap-1 py-4 first:pt-0 last:pb-0 sm:px-6 sm:py-0 sm:first:pl-0 sm:last:pr-0">
      <dt className="text-xs font-bold uppercase tracking-label text-fg-muted">{label}</dt>
      <dd className={tone === "success" ? "text-2xl font-extrabold tracking-title text-success" : "text-2xl font-extrabold tracking-title text-fg"}>
        {value}
      </dd>
      {note ? <dd className="text-sm text-fg-muted">{note}</dd> : null}
    </div>
  );
}

/** Header of the module: what has been collected, what is missing, how many automatic reminders went out. */
export function FeesSummaryBar({ teamId }: { teamId: string }) {
  const { canSeeAutomations } = useQuoteAccess();
  const summary = useApiQuery<FeesSummary>(["fees-summary", { teamId }], "/fees/summary", { query: { teamId } });

  if (summary.isLoading) {
    return (
      <Card role="status" aria-busy="true" aria-label="Caricamento del riepilogo" className="grid gap-4 sm:grid-cols-3">
        {[0, 1, 2].map((index) => (
          <div key={index} className="flex flex-col gap-2">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-8 w-20" />
          </div>
        ))}
      </Card>
    );
  }

  if (summary.error || !summary.data) {
    return (
      <Alert tone="danger" title="Riepilogo non disponibile">
        <p>{describeError(summary.error)}</p>
        <Button variant="secondary" size="sm" className="mt-3" onClick={() => void summary.refetch()}>
          Riprova
        </Button>
      </Alert>
    );
  }

  const data = summary.data;
  return (
    <Card>
      <dl className="grid divide-y divide-line sm:grid-cols-3 sm:divide-x sm:divide-y-0">
        <Figure
          label="Incassato"
          tone="success"
          value={formatEuro(data.incassatoCents)}
          note={pluralize(data.paidCount, "quota pagata", "quote pagate")}
        />
        <Figure
          label="Da incassare"
          value={formatEuro(data.daIncassareCents)}
          note={
            data.scadutoCents > 0
              ? `di cui ${formatEuro(data.scadutoCents)} scaduti (${pluralize(data.overdueCount, "quota", "quote")})`
              : `${pluralize(data.pendingCount, "quota", "quote")} in attesa, nessuna scaduta`
          }
        />
        <Figure
          label="Promemoria inviati"
          value={data.promemoriaInviati}
          note={
            <span className="flex flex-wrap items-center gap-2">
              <AutoChip />
              {canSeeAutomations ? (
                <Link href="/automazioni" className="inline-flex min-h-11 items-center font-semibold text-primary-fg underline-offset-4 hover:underline">
                  Gestisci le automazioni
                </Link>
              ) : null}
            </span>
          }
        />
      </dl>
    </Card>
  );
}
