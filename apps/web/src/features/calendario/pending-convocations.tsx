"use client";

import { BellRing } from "lucide-react";
import { CardHeader, DataBoundary } from "@/components/ui";
import { usePendingConvocations } from "./api";
import { ConvocationAnswer } from "./convocation-answer";
import { pluralize } from "./format";

/** Athletes and guardians: the convocations waiting for an answer, with the two buttons to answer right there. */
export function PendingConvocations() {
  const pending = usePendingConvocations(true);
  const items = pending.data ?? [];
  return (
    <section aria-labelledby="pending-convocations">
      <CardHeader
        as="h2"
        title={<span id="pending-convocations">Da confermare</span>}
        description={
          items.length > 0
            ? `${pluralize(items.length, "convocazione aspetta", "convocazioni aspettano")} la tua risposta.`
            : undefined
        }
      />
      <DataBoundary
        isLoading={pending.isLoading}
        error={pending.error}
        onRetry={() => void pending.refetch()}
        loadingLabel="Caricamento delle convocazioni"
        skeletonRows={1}
        isEmpty={items.length === 0}
        empty={
          <p className="flex items-center gap-2 rounded-lg bg-surface p-4 text-sm text-fg-muted shadow-soft">
            <BellRing aria-hidden="true" className="size-4 shrink-0" />
            Nessuna convocazione da confermare. Quando ne arriva una, la trovi qui.
          </p>
        }
      >
        <ul className="flex flex-col gap-3">
          {items.map((convocation) => (
            <li key={convocation.id} className="rounded-lg bg-surface p-4 shadow-soft">
              <ConvocationAnswer convocation={convocation} showEvent />
            </li>
          ))}
        </ul>
      </DataBoundary>
    </section>
  );
}
