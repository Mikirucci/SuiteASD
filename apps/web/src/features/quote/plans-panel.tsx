"use client";

import { ClipboardList, Pencil, Plus, Users } from "lucide-react";
import { useState } from "react";
import { Badge, Button, DataList, EmptyState, LoadMore } from "@/components/ui";
import { GenerateFeesDialog } from "./generate-fees-dialog";
import { formatEuro } from "@/lib/format";
import { KIND_LABELS } from "./format";
import { PlanFormDialog, type PlanDialogState } from "./plan-form-dialog";
import type { FeePlan, TeamOption } from "./types";
import { useCursorQuery } from "@/lib/use-cursor-query";
import { useQuoteAccess } from "./use-quote-access";

function planDetails(plan: FeePlan, teamName: string): string {
  const parts = [formatEuro(plan.amountCents), KIND_LABELS[plan.kind], teamName];
  if (plan.installments !== null) parts.push(`${plan.installments} rate`);
  if (plan.dueDay !== null) parts.push(`scade il ${plan.dueDay} del mese`);
  return parts.join(" · ");
}

interface PlanRowProps {
  plan: FeePlan;
  teamName: string;
  canWrite: boolean;
  onEdit: (plan: FeePlan) => void;
  onGenerate: (plan: FeePlan) => void;
}

function PlanRow({ plan, teamName, canWrite, onEdit, onGenerate }: PlanRowProps) {
  return (
    <div className="flex flex-col gap-3 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-bold text-fg">{plan.name}</p>
          <p className="text-sm text-fg-muted">{planDetails(plan, teamName)}</p>
        </div>
        <Badge variant={plan.isActive ? "success" : "neutral"}>{plan.isActive ? "Attivo" : "Non attivo"}</Badge>
      </div>
      {canWrite ? (
        <div className="flex flex-wrap gap-2">
          {plan.isActive ? (
            <Button size="sm" variant="soft" leftIcon={<Users />} onClick={() => onGenerate(plan)}>
              Genera quote
            </Button>
          ) : null}
          <Button size="sm" variant="secondary" leftIcon={<Pencil />} onClick={() => onEdit(plan)}>
            Modifica
          </Button>
        </div>
      ) : null}
    </div>
  );
}

/** Fee plans of the society: list, create, edit, and generate the fees of a plan for its members. */
export function PlansPanel() {
  const { canWrite } = useQuoteAccess();
  const [form, setForm] = useState<PlanDialogState | null>(null);
  const [generating, setGenerating] = useState<FeePlan | null>(null);

  const plans = useCursorQuery<FeePlan>(["fee-plans"], "/fee-plans", { limit: 50 });
  const teams = useCursorQuery<TeamOption>(["quote-teams"], "/teams", { limit: 100 });
  const teamNames = new Map((teams.items ?? []).map((team) => [team.id, team.name]));
  const newPlan = canWrite ? (
    <Button leftIcon={<Plus />} onClick={() => setForm({ mode: "create" })}>
      Nuovo piano
    </Button>
  ) : undefined;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-bold tracking-title text-fg">Piani quota</h2>
        {plans.items && plans.items.length > 0 ? newPlan : null}
      </div>
      <DataList
        label="Piani quota"
        items={plans.items}
        getKey={(plan) => plan.id}
        renderItem={(plan) => (
          <PlanRow
            plan={plan}
            teamName={plan.teamId ? (teamNames.get(plan.teamId) ?? "Una squadra") : "Tutte le squadre"}
            canWrite={canWrite}
            onEdit={(target) => setForm({ mode: "edit", plan: target })}
            onGenerate={setGenerating}
          />
        )}
        isLoading={plans.isLoading}
        error={plans.error}
        onRetry={plans.refetch}
        loadingLabel="Caricamento dei piani quota"
        empty={
          <EmptyState
            icon={ClipboardList}
            title="Nessun piano quota"
            description="Un piano fissa importo e squadra, per esempio “Quota novembre · € 60”. Da lì generi le quote di tutti i tesserati."
            action={newPlan}
          />
        }
      />
      <LoadMore list={plans} noun="Piani" moreLabel="Mostra altri piani" />
      <PlanFormDialog state={form} teams={teams.items ?? []} onClose={() => setForm(null)} />
      <GenerateFeesDialog plan={generating} onClose={() => setGenerating(null)} />
    </div>
  );
}
