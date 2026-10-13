"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useQueryClient } from "@tanstack/react-query";
import { Save } from "lucide-react";
import { useState } from "react";
import { useForm, type Path } from "react-hook-form";
import { Alert, Button, Dialog, DialogClose, DialogContent, Input, Textarea, useToast } from "@/components/ui";
import { useApiMutation } from "@/lib/api";
import { applyFieldErrors } from "@/lib/field-errors";
import { describeRefereeError } from "./messages";
import { refereeFormSchema, toRefereeBody, type RefereeFormValues } from "./schemas";
import type { Referee } from "./types";

const FORM_ID = "referee-form";

const FIELDS: readonly Path<RefereeFormValues>[] = ["firstName", "lastName", "email", "phone", "qualification", "notes"];

export type RefereeDialogState = { mode: "create" } | { mode: "edit"; referee: Referee };

function defaultsOf(state: RefereeDialogState): RefereeFormValues {
  if (state.mode === "create") return { firstName: "", lastName: "", email: "", phone: "", qualification: "", notes: "" };
  const { referee } = state;
  return {
    firstName: referee.firstName,
    lastName: referee.lastName,
    email: referee.email ?? "",
    phone: referee.phone ?? "",
    qualification: referee.qualification ?? "",
    notes: referee.notes ?? "",
  };
}

function RefereeForm({ state, onDone }: { state: RefereeDialogState; onDone: () => void }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<RefereeFormValues>({ resolver: zodResolver(refereeFormSchema), defaultValues: defaultsOf(state) });

  const save = useApiMutation(
    (values: RefereeFormValues, client) =>
      state.mode === "create"
        ? client.post<Referee>("/referees", toRefereeBody(values, "create"))
        : client.patch<Referee>(`/referees/${state.referee.id}`, toRefereeBody(values, "update")),
    { onSuccess: () => queryClient.invalidateQueries({ queryKey: ["referees"] }) },
  );

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      await save.mutateAsync(values);
      toast({ title: state.mode === "create" ? "Arbitro aggiunto" : "Arbitro aggiornato", description: `${values.firstName} ${values.lastName}`, tone: "success" });
      onDone();
    } catch (error) {
      const marked = applyFieldErrors(error, setError, (path) => FIELDS.find((field) => field === path.split(".").pop()) ?? null);
      setFormError(marked ? "Controlla i campi evidenziati." : describeRefereeError(error));
    }
  });

  return (
    <>
      <form id={FORM_ID} onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
        {formError ? <Alert tone="danger">{formError}</Alert> : null}
        <div className="grid gap-4 sm:grid-cols-2">
          <Input label="Nome" required autoComplete="off" error={errors.firstName?.message} {...register("firstName")} />
          <Input label="Cognome" required autoComplete="off" error={errors.lastName?.message} {...register("lastName")} />
        </div>
        <Input
          label="Qualifica"
          hint="Per esempio: arbitro regionale."
          autoComplete="off"
          error={errors.qualification?.message}
          {...register("qualification")}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <Input label="Email" type="email" autoComplete="off" error={errors.email?.message} {...register("email")} />
          <Input label="Telefono" type="tel" autoComplete="off" error={errors.phone?.message} {...register("phone")} />
        </div>
        <Textarea label="Note" rows={3} error={errors.notes?.message} {...register("notes")} />
      </form>
      <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <DialogClose asChild>
          <Button variant="ghost">Annulla</Button>
        </DialogClose>
        <Button type="submit" form={FORM_ID} leftIcon={<Save />} loading={isSubmitting}>
          {state.mode === "create" ? "Aggiungi l'arbitro" : "Salva le modifiche"}
        </Button>
      </div>
    </>
  );
}

export interface RefereeDialogProps {
  state: RefereeDialogState | null;
  onClose: () => void;
}

export function RefereeDialog({ state, onClose }: RefereeDialogProps) {
  if (!state) return null;
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        title={state.mode === "create" ? "Nuovo arbitro" : "Modifica l'arbitro"}
        description="Nome e contatti servono per le designazioni e per sapere a chi rimborsare."
      >
        <RefereeForm key={state.mode === "edit" ? state.referee.id : "new"} state={state} onDone={onClose} />
      </DialogContent>
    </Dialog>
  );
}
