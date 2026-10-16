"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useQueryClient } from "@tanstack/react-query";
import { Save } from "lucide-react";
import { useState } from "react";
import { useForm, type Path } from "react-hook-form";
import { Alert, Button, Dialog, DialogClose, DialogContent, Input, Select, Switch, useToast } from "@/components/ui";
import { ApiError, describeError, useApiMutation } from "@/lib/api";
import { centsToInput } from "@/lib/format";
import { KIND_OPTIONS } from "./format";
import { planSchema, toPlanBody, type PlanValues } from "./schemas";
import type { FeePlan, FeePlanBody, TeamOption } from "./types";

const FORM_ID = "fee-plan-form";

const FIELD_OF_API_PATH: Record<string, Path<PlanValues>> = {
  name: "name",
  kind: "kind",
  amountCents: "amount",
  teamId: "teamId",
  installments: "installments",
  dueDay: "dueDay",
};

export type PlanDialogState = { mode: "create" } | { mode: "edit"; plan: FeePlan };

function defaultsOf(state: PlanDialogState): PlanValues {
  if (state.mode === "create") {
    return { name: "", kind: "MONTHLY", amount: "", teamId: "", installments: "", dueDay: "", isActive: true };
  }
  const { plan } = state;
  return {
    name: plan.name,
    kind: plan.kind,
    amount: centsToInput(plan.amountCents),
    teamId: plan.teamId ?? "",
    installments: plan.installments === null ? "" : String(plan.installments),
    dueDay: plan.dueDay === null ? "" : String(plan.dueDay),
    isActive: plan.isActive,
  };
}

interface PlanFormProps {
  state: PlanDialogState;
  teams: readonly TeamOption[];
  onDone: () => void;
}

function PlanForm({ state, teams, onDone }: PlanFormProps) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<PlanValues>({ resolver: zodResolver(planSchema), defaultValues: defaultsOf(state) });

  const save = useApiMutation(
    (body: FeePlanBody, client) =>
      state.mode === "create"
        ? client.post<FeePlan>("/fee-plans", body)
        : client.patch<FeePlan>(`/fee-plans/${state.plan.id}`, body),
    { onSuccess: () => queryClient.invalidateQueries({ queryKey: ["fee-plans"] }) },
  );

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      const saved = await save.mutateAsync(toPlanBody(values, state.mode === "create" ? "create" : "update"));
      toast({ title: state.mode === "create" ? "Piano creato" : "Piano aggiornato", description: saved.name, tone: "success" });
      onDone();
    } catch (error) {
      if (error instanceof ApiError) {
        for (const fieldError of error.fieldErrors) {
          const field = FIELD_OF_API_PATH[fieldError.path.split(".").pop() ?? ""];
          if (field) setError(field, { message: "Valore non valido" });
        }
      }
      setFormError(describeError(error));
    }
  });

  const teamOptions = [{ value: "", label: "Tutte le squadre" }, ...teams.map((team) => ({ value: team.id, label: team.name }))];

  return (
    <>
      <form id={FORM_ID} onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
        {formError ? <Alert tone="danger">{formError}</Alert> : null}
        <Input
          label="Nome del piano"
          required
          hint="Diventa la descrizione delle quote, per esempio: Quota novembre."
          error={errors.name?.message}
          {...register("name")}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <Select label="Tipo" options={KIND_OPTIONS} error={errors.kind?.message} {...register("kind")} />
          <Input
            label="Importo in euro"
            required
            inputMode="decimal"
            autoComplete="off"
            hint="Per ogni tesserato, per esempio 60 o 60,50."
            error={errors.amount?.message}
            {...register("amount")}
          />
        </div>
        <Select
          label="Squadra"
          options={teamOptions}
          hint="Con “Tutte le squadre” il piano vale per ogni tesserato attivo."
          error={errors.teamId?.message}
          {...register("teamId")}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            label="Numero di rate"
            inputMode="numeric"
            hint="Facoltativo, da 1 a 36."
            error={errors.installments?.message}
            {...register("installments")}
          />
          <Input
            label="Giorno di scadenza"
            inputMode="numeric"
            hint="Facoltativo, del mese, da 1 a 28."
            error={errors.dueDay?.message}
            {...register("dueDay")}
          />
        </div>
        <Switch label="Piano attivo" hint="Solo un piano attivo può generare nuove quote." {...register("isActive")} />
      </form>
      <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <DialogClose asChild>
          <Button variant="ghost">Annulla</Button>
        </DialogClose>
        <Button type="submit" form={FORM_ID} leftIcon={<Save />} loading={isSubmitting}>
          {state.mode === "create" ? "Crea il piano" : "Salva le modifiche"}
        </Button>
      </div>
    </>
  );
}

export interface PlanFormDialogProps {
  state: PlanDialogState | null;
  teams: readonly TeamOption[];
  onClose: () => void;
}

export function PlanFormDialog({ state, teams, onClose }: PlanFormDialogProps) {
  if (!state) return null;
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        title={state.mode === "create" ? "Nuovo piano quota" : "Modifica il piano"}
        description={
          state.mode === "create"
            ? "Definisci importo e squadra, poi genera le quote per i tesserati."
            : "Le quote già generate non cambiano."
        }
      >
        <PlanForm key={state.mode === "edit" ? state.plan.id : "new"} state={state} teams={teams} onDone={onClose} />
      </DialogContent>
    </Dialog>
  );
}
