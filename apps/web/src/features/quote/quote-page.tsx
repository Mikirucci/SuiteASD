"use client";

import { SectionHeading } from "@/components/ui";
import { FeesPanel } from "./fees-panel";
import { PaymentsOverview } from "./payments-overview";
import { useQuoteAccess } from "./use-quote-access";

function describeAudience({ canSeeAll, isGuardian }: { canSeeAll: boolean; isGuardian: boolean }): string {
  if (canSeeAll) return "Un piano per volta: apri una card per vedere chi ha pagato, chi è in attesa e chi è scaduto.";
  return isGuardian
    ? "Le quote dei tuoi figli e le ricevute dei pagamenti già registrati."
    : "Le tue quote e le ricevute dei pagamenti già registrati.";
}

/** Module 03: the payments of the society grouped by plan for staff, the own fees with receipts for athletes and guardians. */
export function QuotePage() {
  const access = useQuoteAccess();

  return (
    <div className="flex flex-col gap-8">
      <SectionHeading
        as="h1"
        index={3}
        label="Pagamenti"
        title="Incassi chiari, piano per piano."
        highlight="piano per piano."
        description={describeAudience(access)}
      />
      {access.canSeeAll ? <PaymentsOverview /> : <FeesPanel />}
    </div>
  );
}
