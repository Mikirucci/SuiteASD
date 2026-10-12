"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { useToast } from "@/components/ui/toast";
import { describeError, useApiMutation } from "@/lib/api";
import { TIEBREAKER_LABELS } from "./format";
import { competitionFormSchema, type CompetitionFormValues } from "./schemas";
import type { Competition, PointsRules, Tiebreaker } from "./types";

const FORM_ID = "competition-form";

const DEFAULT_RULES: PointsRules = { "3-0": [3, 0], "3-1": [3, 0], "3-2": [2, 1] };
const DEFAULT_TIEBREAKERS: Tiebreaker[] = ["WINS", "SET_RATIO", "POINT_RATIO"];

const KIND_OPTIONS = [
  { value: "LEAGUE", label: "Campionato" },
  { value: "TOURNAMENT", label: "Torneo" },
];
const TIEBREAKER_OPTIONS = (Object.keys(TIEBREAKER_LABELS) as Tiebreaker[]).map((value) => ({
  value,
  label: TIEBREAKER_LABELS[value].charAt(0).toUpperCase() + TIEBREAKER_LABELS[value].slice(1),
}));

function defaultValues(competition: Competition | undefined): CompetitionFormValues {
  const rules = competition?.pointsRules ?? DEFAULT_RULES;
  const order = competition?.tiebreakers ?? DEFAULT_TIEBREAKERS;
  return {
    name: competition?.name ?? "",
    kind: competition?.kind ?? "LEAGUE",
    win30: String(rules["3-0"][0]),
    lose30: String(rules["3-0"][1]),
    win31: String(rules["3-1"][0]),
    lose31: String(rules["3-1"][1]),
    win32: String(rules["3-2"][0]),
    lose32: String(rules["3-2"][1]),
    tiebreaker1: order[0] ?? "",
    tiebreaker2: order[1] ?? "",
    tiebreaker3: order[2] ?? "",
  };
}

function toBody(values: CompetitionFormValues) {
  const pair = (win: string, lose: string): [number, number] => [Number(win), Number(lose)];
  return {
    name: values.name,
    kind: values.kind,
    pointsRules: {
      "3-0": pair(values.win30, values.lose30),
      "3-1": pair(values.win31, values.lose31),
      "3-2": pair(values.win32, values.lose32),
    },
    tiebreakers: [values.tiebreaker1, values.tiebreaker2, values.tiebreaker3].filter(
      (rule): rule is Tiebreaker => rule !== "",
    ),
  };
}

export interface CompetitionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  seasonId: string;
  /** Omit to create a competition. */
  competition?: Competition;
}

/** Championship or tournament with its volleyball scoring rules (points per final score) and tiebreakers. */
export function CompetitionDialog({ open, onOpenChange, seasonId, competition }: CompetitionDialogProps) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<CompetitionFormValues>({ resolver: zodResolver(competitionFormSchema), defaultValues: defaultValues(competition) });

  const mutation = useApiMutation(
    (values: CompetitionFormValues, client) => {
      const body = toBody(values);
      return competition
        ? client.patch<Competition>(`/competitions/${competition.id}`, body)
        : client.post<Competition>("/competitions", { ...body, seasonId });
    },
    {
      onSuccess: async () => {
        await Promise.all(
          ["competitions", "standings"].map((key) => queryClient.invalidateQueries({ queryKey: [key] })),
        );
        toast({ title: competition ? "Competizione aggiornata" : "Competizione creata", tone: "success" });
        onOpenChange(false);
      },
    },
  );

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      await mutation.mutateAsync(values);
    } catch (error) {
      setFormError(describeError(error));
    }
  });

  const scoreRow = (score: string, win: "win30" | "win31" | "win32", lose: "lose30" | "lose31" | "lose32") => (
    <div className="grid grid-cols-2 gap-3">
      <Input
        label={`Punti a chi vince ${score}`}
        type="number"
        inputMode="numeric"
        min={0}
        max={9}
        error={errors[win]?.message}
        {...register(win)}
      />
      <Input
        label={`Punti a chi perde ${score}`}
        type="number"
        inputMode="numeric"
        min={0}
        max={9}
        error={errors[lose]?.message}
        {...register(lose)}
      />
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title={competition ? "Modifica campionato o torneo" : "Nuovo campionato o torneo"}
        description="La classifica segue subito le regole che imposti qui."
        footer={
          <>
            <DialogClose asChild>
              <Button variant="secondary">Annulla</Button>
            </DialogClose>
            <Button type="submit" form={FORM_ID} loading={mutation.isPending}>
              {competition ? "Salva modifiche" : "Crea"}
            </Button>
          </>
        }
      >
        <form id={FORM_ID} onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
          {formError ? <Alert tone="danger">{formError}</Alert> : null}
          <Input label="Nome" required error={errors.name?.message} {...register("name")} />
          <Select label="Tipo" options={KIND_OPTIONS} {...register("kind")} />
          <fieldset className="flex flex-col gap-3">
            <legend className="mb-1 text-sm font-bold text-fg">Punti in classifica</legend>
            {scoreRow("3-0", "win30", "lose30")}
            {scoreRow("3-1", "win31", "lose31")}
            {scoreRow("3-2", "win32", "lose32")}
          </fieldset>
          <fieldset className="flex flex-col gap-3">
            <legend className="mb-1 text-sm font-bold text-fg">Spareggi a pari punti</legend>
            <Select label="Primo criterio" placeholder="Nessuno" options={TIEBREAKER_OPTIONS} error={errors.tiebreaker1?.message} {...register("tiebreaker1")} />
            <Select label="Secondo criterio" placeholder="Nessuno" options={TIEBREAKER_OPTIONS} {...register("tiebreaker2")} />
            <Select label="Terzo criterio" placeholder="Nessuno" options={TIEBREAKER_OPTIONS} {...register("tiebreaker3")} />
          </fieldset>
        </form>
      </DialogContent>
    </Dialog>
  );
}
