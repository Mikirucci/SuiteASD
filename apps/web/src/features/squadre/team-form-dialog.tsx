"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { Alert, Button, Dialog, DialogClose, DialogContent, Input, Select, Textarea, useToast } from "@/components/ui";
import { applyServerErrors } from "@/features/tesserati/server-errors";
import type { Team } from "@/features/tesserati/types";
import { useCreateTeam, useUpdateTeam } from "./api";
import {
  EMPTY_TEAM_FORM,
  TEAM_FORM_FIELDS,
  TEAM_GENDER_OPTIONS,
  formValuesOf,
  teamFormSchema,
  toCreateBody,
  toUpdateBody,
  type TeamFormValues,
} from "./team-schema";

const FORM_ID = "team-form";

export interface TeamFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Present when editing: the form starts from this team. */
  team?: Team;
}

interface TeamFormProps {
  team?: Team;
  onClose: () => void;
  onBusyChange: (busy: boolean) => void;
}

/** The form itself: mounted only while the dialog is open, so it always starts from the current data. */
function TeamForm({ team, onClose, onBusyChange }: TeamFormProps) {
  const { toast } = useToast();
  const [formError, setFormError] = useState<string | null>(null);
  const create = useCreateTeam();
  const update = useUpdateTeam(team?.id ?? "");
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<TeamFormValues>({
    resolver: zodResolver(teamFormSchema),
    defaultValues: team ? formValuesOf(team) : EMPTY_TEAM_FORM,
  });

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    onBusyChange(true);
    try {
      if (team) {
        await update.mutateAsync(toUpdateBody(values));
        toast({ title: "Modifiche salvate", description: values.name, tone: "success" });
      } else {
        await create.mutateAsync(toCreateBody(values));
        toast({ title: "Squadra creata", description: values.name, tone: "success" });
      }
      onClose();
    } catch (error) {
      setFormError(
        applyServerErrors(error, setError, TEAM_FORM_FIELDS, {
          team_name_taken: { field: "name", message: "Esiste già una squadra con questo nome" },
        }),
      );
    } finally {
      onBusyChange(false);
    }
  });

  return (
    <form id={FORM_ID} onSubmit={onSubmit} noValidate className="flex flex-col gap-4 p-1">
      {formError ? <Alert tone="danger">{formError}</Alert> : null}
      <Input label="Nome" required autoComplete="off" maxLength={80} error={errors.name?.message} {...register("name")} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Input
          label="Categoria"
          hint="Ad esempio U14 o Serie D: compare come etichetta accanto alla squadra."
          autoComplete="off"
          maxLength={40}
          error={errors.category?.message}
          {...register("category")}
        />
        <Select
          label="Genere"
          placeholder="Non indicato"
          options={TEAM_GENDER_OPTIONS}
          error={errors.gender?.message}
          {...register("gender")}
        />
      </div>
      <Textarea
        label="Descrizione"
        rows={3}
        maxLength={500}
        hint="Facoltativa: allenatore, giorni di allenamento, note per i genitori."
        error={errors.description?.message}
        {...register("description")}
      />
    </form>
  );
}

/** Create or edit a team. Server-side errors are mapped back onto the fields. */
export function TeamFormDialog({ open, onOpenChange, team }: TeamFormDialogProps) {
  const [busy, setBusy] = useState(false);
  const editing = Boolean(team);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title={editing ? "Modifica squadra" : "Nuova squadra"}
        description={editing ? "Aggiorna il nome e i dettagli." : "Basta il nome: il resto si completa dopo."}
        footer={
          <>
            <DialogClose asChild>
              <Button variant="secondary">Annulla</Button>
            </DialogClose>
            <Button type="submit" form={FORM_ID} loading={busy}>
              {editing ? "Salva modifiche" : "Crea squadra"}
            </Button>
          </>
        }
      >
        <TeamForm team={team} onClose={() => onOpenChange(false)} onBusyChange={setBusy} />
      </DialogContent>
    </Dialog>
  );
}
