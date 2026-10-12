"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useForm, type Path } from "react-hook-form";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/components/ui/toast";
import { describeError, useApiMutation } from "@/lib/api";
import { applyFieldErrors } from "@/lib/field-errors";
import { fromLocalInput, toDateInput } from "./format";
import { seasonFormSchema, type SeasonFormValues } from "./schemas";
import type { Season } from "./types";

const FORM_ID = "season-form";
const FIELDS: readonly string[] = ["name", "startsOn", "endsOn", "isCurrent"];

export interface SeasonDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Omit to create a season. */
  season?: Season;
}

export function SeasonDialog({ open, onOpenChange, season }: SeasonDialogProps) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<SeasonFormValues>({
    resolver: zodResolver(seasonFormSchema),
    defaultValues: {
      name: season?.name ?? "",
      startsOn: season ? toDateInput(season.startsOn) : "",
      endsOn: season ? toDateInput(season.endsOn) : "",
      isCurrent: season?.isCurrent ?? false,
    },
  });

  const mutation = useApiMutation(
    (values: SeasonFormValues, client) => {
      const body = {
        name: values.name,
        startsOn: fromLocalInput(`${values.startsOn}T00:00`),
        endsOn: fromLocalInput(`${values.endsOn}T00:00`),
        isCurrent: values.isCurrent,
      };
      return season ? client.patch<Season>(`/seasons/${season.id}`, body) : client.post<Season>("/seasons", body);
    },
    {
      onSuccess: async () => {
        await Promise.all(
          ["seasons", "competitions"].map((key) => queryClient.invalidateQueries({ queryKey: [key] })),
        );
        toast({ title: season ? "Stagione aggiornata" : "Stagione creata", tone: "success" });
        onOpenChange(false);
      },
    },
  );

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      await mutation.mutateAsync(values);
    } catch (error) {
      applyFieldErrors(error, setError, (path) => (FIELDS.includes(path) ? (path as Path<SeasonFormValues>) : null));
      setFormError(describeError(error));
    }
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title={season ? "Modifica la stagione" : "Nuova stagione"}
        description="Ogni campionato e ogni torneo appartiene a una stagione."
        footer={
          <>
            <DialogClose asChild>
              <Button variant="secondary">Annulla</Button>
            </DialogClose>
            <Button type="submit" form={FORM_ID} loading={mutation.isPending}>
              {season ? "Salva modifiche" : "Crea stagione"}
            </Button>
          </>
        }
      >
        <form id={FORM_ID} onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
          {formError ? <Alert tone="danger">{formError}</Alert> : null}
          <Input label="Nome" required hint="Per esempio 2026/27." error={errors.name?.message} {...register("name")} />
          <div className="grid gap-4 sm:grid-cols-2">
            <Input label="Inizio" type="date" required error={errors.startsOn?.message} {...register("startsOn")} />
            <Input label="Fine" type="date" required error={errors.endsOn?.message} {...register("endsOn")} />
          </div>
          <Switch
            label="Stagione in corso"
            hint="Le altre stagioni smettono di essere quella in corso."
            {...register("isCurrent")}
          />
        </form>
      </DialogContent>
    </Dialog>
  );
}
