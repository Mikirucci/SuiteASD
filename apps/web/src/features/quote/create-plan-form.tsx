"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useQueryClient } from "@tanstack/react-query";
import { Save } from "lucide-react";
import { useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { Alert, Button, Checkbox, DialogClose, Input, Select, useToast } from "@/components/ui";
import { ApiError, describeError, useApiMutation } from "@/lib/api";
import { toDayKey } from "@/lib/dates";
import { addMonthsToDay, KIND_OPTIONS } from "./format";
import { createPlanSchema, MAX_INSTALLMENTS, toCreatePlanBody, type CreatePlanValues } from "./schemas";
import type { CreateFeePlanBody, FeePlan, TeamOption } from "./types";

export const CREATE_FORM_ID = "create-fee-plan-form";

const FIELD_OF_API_PATH: Record<string, "name" | "kind" | "amount"> = { name: "name", kind: "kind", amountCents: "amount" };

const isInstallmentCount = (raw: string): boolean => /^\d+$/.test(raw.trim()) && Number(raw) >= 1 && Number(raw) <= MAX_INSTALLMENTS;

export function CreatePlanForm({ teams, onDone }: { teams: readonly TeamOption[]; onDone: () => void }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    setError,
    setValue,
    getValues,
    control,
    formState: { errors, isSubmitting, isSubmitted },
  } = useForm<CreatePlanValues>({
    resolver: zodResolver(createPlanSchema),
    defaultValues: {
      name: "",
      kind: "MONTHLY",
      amount: "",
      allTeams: true,
      teamIds: [],
      installments: "1",
      dueDates: [toDayKey(new Date())],
    },
  });
  const allTeams = useWatch({ control, name: "allTeams" });
  const teamIds = useWatch({ control, name: "teamIds" });
  const dueDates = useWatch({ control, name: "dueDates" });
  const revalidate = { shouldValidate: isSubmitted, shouldDirty: true } as const;

  const save = useApiMutation((body: CreateFeePlanBody, client) => client.post<FeePlan>("/fee-plans", body), {
    // The plan creates its fees: every list that shows fees or plans has to reload
    onSuccess: () =>
      Promise.all(
        [["fee-plans"], ["fees"], ["fees-summary"]].map((queryKey) => queryClient.invalidateQueries({ queryKey })),
      ),
  });

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      const saved = await save.mutateAsync(toCreatePlanBody(values));
      toast({ title: "Piano creato", description: `${saved.name}: le quote sono già pronte.`, tone: "success" });
      onDone();
    } catch (error) {
      if (error instanceof ApiError) {
        for (const fieldError of error.fieldErrors) {
          const field = FIELD_OF_API_PATH[fieldError.path.split(".")[0] ?? ""];
          if (field) setError(field, { message: "Valore non valido" });
        }
      }
      setFormError(describeError(error));
    }
  });

  // The dates follow the count: the ones already chosen stay, new ones continue month by month from the first.
  const resizeDates = (raw: string) => {
    if (!isInstallmentCount(raw)) return;
    const current = getValues("dueDates");
    const first = current[0] ?? toDayKey(new Date());
    setValue(
      "dueDates",
      Array.from({ length: Number(raw) }, (_, index) => current[index] ?? addMonthsToDay(first, index)),
      revalidate,
    );
  };

  const changeDate = (index: number, day: string) => {
    const next = getValues("dueDates").map((current, position) => (position === index ? day : current));
    // Moving the first date moves the following ones too, still one month apart
    const valid = /^\d{4}-\d{2}-\d{2}$/.test(day);
    setValue("dueDates", index === 0 && valid ? next.map((_, position) => addMonthsToDay(day, position)) : next, revalidate);
  };

  const toggleAllTeams = (checked: boolean) => {
    setValue("allTeams", checked, revalidate);
    if (checked) setValue("teamIds", [], revalidate);
  };

  const toggleTeam = (teamId: string, checked: boolean) => {
    setValue("teamIds", checked ? [...teamIds, teamId] : teamIds.filter((id) => id !== teamId), revalidate);
    if (checked) setValue("allTeams", false, revalidate);
  };

  const countField = register("installments");
  const dateError = (index: number): string | undefined => errors.dueDates?.[index]?.message;

  return (
    <>
      <form id={CREATE_FORM_ID} onSubmit={onSubmit} noValidate className="flex flex-col gap-5">
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
            label="Importo di ogni pagamento, in euro"
            required
            inputMode="decimal"
            autoComplete="off"
            hint="Per ogni tesserato, per esempio 60 o 60,50."
            error={errors.amount?.message}
            {...register("amount")}
          />
        </div>

        <fieldset className="flex flex-col gap-1">
          <legend className="mb-1 text-sm font-bold text-fg">Squadre</legend>
          <p className="text-sm text-fg-muted">Scegline quante vuoi: il piano vale per i tesserati attivi delle squadre scelte.</p>
          <Checkbox label="Tutte le squadre" checked={allTeams} onChange={(event) => toggleAllTeams(event.target.checked)} />
          {teams.length > 0 ? (
            <ul aria-label="Squadre" className="flex max-h-44 flex-col overflow-y-auto rounded-md border border-line px-3 py-1">
              {teams.map((team) => (
                <li key={team.id}>
                  <Checkbox label={team.name} checked={teamIds.includes(team.id)} onChange={(event) => toggleTeam(team.id, event.target.checked)} />
                </li>
              ))}
            </ul>
          ) : null}
          {errors.teamIds?.message ? (
            <p role="alert" className="text-sm font-semibold text-danger">
              {errors.teamIds.message}
            </p>
          ) : null}
        </fieldset>

        <Input
          label="Quante volte si paga"
          required
          inputMode="numeric"
          autoComplete="off"
          hint="1 per un pagamento unico, per esempio le divise; 3 per pagare in tre volte."
          error={errors.installments?.message}
          {...countField}
          onChange={(event) => {
            void countField.onChange(event);
            resizeDates(event.target.value);
          }}
        />

        <fieldset className="flex flex-col gap-3">
          <legend className="mb-1 text-sm font-bold text-fg">{dueDates.length === 1 ? "Scadenza" : "Scadenze"}</legend>
          {dueDates.length > 1 ? (
            <p className="text-sm text-fg-muted">Seguono mese per mese dalla prima; puoi cambiarle una per una.</p>
          ) : null}
          <div className="grid gap-4 sm:grid-cols-2">
            {dueDates.map((day, index) => (
              <Input
                // The position is the identity of a payment: dates are edited in place, never reordered
                key={index}
                label={dueDates.length === 1 ? "Data di scadenza" : `${index + 1}° pagamento`}
                type="date"
                required
                value={day}
                error={dateError(index)}
                onChange={(event) => changeDate(index, event.target.value)}
              />
            ))}
          </div>
        </fieldset>

        <p className="text-sm text-fg-muted">Creando il piano le quote vengono generate subito per ogni tesserato attivo e ogni scadenza.</p>
      </form>
      <div className="sticky bottom-0 mt-6 flex flex-col-reverse gap-2 bg-surface pt-3 sm:flex-row sm:justify-end">
        <DialogClose asChild>
          <Button variant="ghost">Annulla</Button>
        </DialogClose>
        <Button type="submit" form={CREATE_FORM_ID} leftIcon={<Save />} loading={isSubmitting}>
          Crea il piano
        </Button>
      </div>
    </>
  );
}
