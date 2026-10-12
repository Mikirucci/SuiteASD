"use client";

import { useState } from "react";
import { SectionHeading, Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui";
import { FeesPanel } from "./fees-panel";
import { PlansPanel } from "./plans-panel";
import { useQuoteAccess } from "./use-quote-access";

type QuoteTab = "quote" | "piani";

function describeAudience({ canSeeAll, isGuardian }: { canSeeAll: boolean; isGuardian: boolean }): string {
  if (canSeeAll) return "Chi ha pagato, chi è in attesa e chi è scaduto. Registra un pagamento e la ricevuta numerata parte da sola.";
  return isGuardian
    ? "Le quote dei tuoi figli e le ricevute dei pagamenti già registrati."
    : "Le tue quote e le ricevute dei pagamenti già registrati.";
}

/** Module 03: fees per member with their status, payment registration with numbered receipts, and fee plans. */
export function QuotePage() {
  const access = useQuoteAccess();
  const [tab, setTab] = useState<QuoteTab>("quote");

  return (
    <div className="flex flex-col gap-8">
      <SectionHeading
        as="h1"
        index={3}
        label="Quote e pagamenti"
        title="Quote incassate, senza rincorrere."
        highlight="senza rincorrere."
        description={describeAudience(access)}
      />
      {access.canSeeAll ? (
        <Tabs value={tab} onValueChange={(value) => setTab(value === "piani" ? "piani" : "quote")}>
          <TabsList aria-label="Sezioni delle quote">
            <TabsTrigger value="quote">Quote</TabsTrigger>
            <TabsTrigger value="piani">Piani quota</TabsTrigger>
          </TabsList>
          <TabsContent value="quote">
            <FeesPanel onOpenPlans={() => setTab("piani")} />
          </TabsContent>
          <TabsContent value="piani">
            <PlansPanel />
          </TabsContent>
        </Tabs>
      ) : (
        <FeesPanel />
      )}
    </div>
  );
}
