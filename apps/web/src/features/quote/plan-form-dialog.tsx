"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useQueryClient } from "@tanstack/react-query";
import { Save } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { Alert, Button, Dialog, DialogClose, DialogContent, Input, Select, Switch, useToast } from "@/components/ui";
import { ApiError, describeError, useApiMutation } from "@/lib/api";
import { CreatePlanForm } from "./create-plan-form";
import { KIND_OPTIONS } from "./format";
import { editPlanSchema, type EditPlanValues } from "./schemas";
import type { FeePlan, TeamOption, UpdateFeePlanBody } from "./types";

const EDIT_FORM_ID = "edit-fee-plan-form";

export type PlanDialogState = { mode: "create" } | { mode: "edit"; plan: FeePlan };

function EditPlanForm({ plan, onDone }: { plan: FeePlan; onDone: () => void }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<EditPlanValues>({
    resolver: zodResolver(editPlanSchema),
    defaultValues: { name: plan.name, kind: plan.kind, isActive: plan.isActive },
  });

  const save = useApiMutation((body: UpdateFeePlanBody, client) => client.patch<FeePlan>(`/fee-plans/${plan.id}`, body), {
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["fee-plans"] }),
  });

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      const saved = await save.mutateAsync(values);
      toast({ title: "Piano aggiornato", description: saved.name, tone: "success" });
      onDone();
    } catch (error) {
      if (error instanceof ApiError && error.fieldErrors.some((fieldError) => fieldError.path.endsWith("name"))) {
        setError("name", { message: "Valore non valido" });
      }
      setFormError(describeError(error));
    }
  });

  return (
    <>
      <form id={EDIT_FORM_ID} onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
        {formError ? <Alert tone="danger">{formError}</Alert> : null}
        <Input label="Nome del piano" required error={errors.name?.message} {...register("name")} />
        <Select label="Tipo" options={KIND_OPTIONS} error={errors.kind?.message} {...register("kind")} />
        <Switch label="Piano attivo" hint="Un piano non attivo resta consultabile ma non è più in uso." {...register("isActive")} />
      </form>
      <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <DialogClose asChild>
          <Button variant="ghost">Annulla</Button>
        </DialogClose>
        <Button type="submit" form={EDIT_FORM_ID} leftIcon={<Save />} loading={isSubmitting}>
          Salva le modifiche
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
            ? "Scegli squadre, importo e quante volte si paga: le quote nascono insieme al piano."
            : "Importo, squadre e scadenze restano quelli con cui sono state create le quote."
        }
        className={state.mode === "create" ? "max-w-xl" : undefined}
      >
        {state.mode === "create" ? (
          <CreatePlanForm teams={teams} onDone={onClose} />
        ) : (
          <EditPlanForm key={state.plan.id} plan={state.plan} onDone={onClose} />
        )}
      </DialogContent>
    </Dialog>
  );
}
