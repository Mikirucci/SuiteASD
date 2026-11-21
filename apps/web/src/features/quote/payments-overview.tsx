"use client";

import { ClipboardList, Plus } from "lucide-react";
import { useState } from "react";
import { Button, EmptyState, ErrorState, Skeleton } from "@/components/ui";
import { describeError } from "@/lib/api";
import { useFeePlans, usePlanReport, useQuoteTeams } from "./api";
import { ClaimedBanner } from "./claimed-banner";
import { ClaimedFeesDialog } from "./claimed-fees-dialog";
import { FeesSummaryBar } from "./fees-summary";
import { PlanCard, type PlanCardStats } from "./plan-card";
import { PlanFormDialog, type PlanDialogState } from "./plan-form-dialog";
import { useQuoteAccess } from "./use-quote-access";

function PlansSkeleton() {
  return (
    <div role="status" aria-busy="true" aria-label="Caricamento dei piani" className="flex flex-col gap-3">
      {[0, 1, 2].map((index) => (
        <Skeleton key={index} className="h-24 rounded-lg" />
      ))}
    </div>
  );
}

/**
 * The payments of the society for staff: the report on top, then one card per plan with the previews of how its
 * people are doing. People, searches and filters live inside each plan.
 */
export function PaymentsOverview() {
  const { canWrite } = useQuoteAccess();
  const plans = useFeePlans();
  const report = usePlanReport();
  const teams = useQuoteTeams();
  const [form, setForm] = useState<PlanDialogState | null>(null);
  const [claimedOpen, setClaimedOpen] = useState(false);

  const stats = new Map((report.data?.data ?? []).map((entry) => [entry.feePlanId, entry]));
  const statsOf = (planId: string): PlanCardStats => {
    if (report.isLoading) return { state: "loading" };
    if (report.error) return { state: "error" };
    return stats.get(planId) ?? { state: "empty" };
  };
  const newPlan = canWrite ? (
    <Button leftIcon={<Plus />} onClick={() => setForm({ mode: "create" })}>
      Nuovo piano
    </Button>
  ) : undefined;

  return (
    <div className="flex flex-col gap-8">
      <FeesSummaryBar plans={plans.items ?? []} report={report.data?.data ?? []} />
      <ClaimedBanner onShow={() => setClaimedOpen(true)} />

      <section aria-labelledby="plans-heading" className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="plans-heading" className="text-lg font-bold tracking-title text-fg">
            Piani
          </h2>
          {plans.items && plans.items.length > 0 ? newPlan : null}
        </div>
        {plans.isLoading ? <PlansSkeleton /> : null}
        {plans.error ? (
          <ErrorState title="Piani non disponibili" message={describeError(plans.error)} onRetry={plans.refetch} />
        ) : null}
        {plans.items && plans.items.length === 0 ? (
          <EmptyState
            icon={ClipboardList}
            title="Nessun piano ancora"
            description="Un piano fissa squadre, importo e quante volte si paga, per esempio “Quota novembre · € 60”. Le quote dei tesserati si creano da sole, anche per chi entra dopo, e le segui qui."
            action={newPlan}
          />
        ) : null}
        {plans.items && plans.items.length > 0 ? (
          <ul aria-label="Piani" className="flex flex-col gap-3">
            {plans.items.map((plan) => (
              <PlanCard key={plan.id} plan={plan} teams={teams.items ?? []} stats={statsOf(plan.id)} />
            ))}
          </ul>
        ) : null}
      </section>

      <PlanFormDialog state={form} teams={teams.items ?? []} onClose={() => setForm(null)} />
      <ClaimedFeesDialog open={claimedOpen} onOpenChange={setClaimedOpen} canWrite={canWrite} />
    </div>
  );
}
