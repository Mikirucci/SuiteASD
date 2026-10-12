"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useForm, type Path } from "react-hook-form";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/toast";
import { describeError, useApiMutation } from "@/lib/api";
import { applyFieldErrors } from "@/lib/field-errors";
import { memberName, parseRating, ratingToInput } from "./rating";
import { evaluationFormSchema, type EvaluationFormValues } from "./schemas";
import type { Evaluation, MatchStats, ReportCardEntry } from "./types";

const FORM_ID = "evaluation-form";
const FIELDS: readonly string[] = ["rating", "notes", "attackPoints", "aces", "blocks", "receptions", "errors"];

function defaultValues({ evaluation, stats }: ReportCardEntry): EvaluationFormValues {
  const value = (count: number | undefined) => (count === undefined ? "" : String(count));
  return {
    rating: evaluation ? ratingToInput(evaluation.rating) : "",
    notes: evaluation?.notes ?? "",
    attackPoints: value(stats?.attackPoints),
    aces: value(stats?.aces),
    blocks: value(stats?.blocks),
    receptions: value(stats?.receptions),
    errors: value(stats?.errors),
  };
}

const toCount = (value: string) => (value.trim() === "" ? 0 : Number(value));

function hasAnyStat(values: EvaluationFormValues): boolean {
  return [values.attackPoints, values.aces, values.blocks, values.receptions, values.errors].some(
    (value) => value.trim() !== "",
  );
}

export interface EvaluationDialogProps {
  matchId: string;
  /** The player being rated; null keeps the dialog closed. */
  entry: ReportCardEntry | null;
  onOpenChange: (open: boolean) => void;
}

function EvaluationForm({
  matchId,
  entry,
  onDone,
  onPending,
}: {
  matchId: string;
  entry: ReportCardEntry;
  onDone: () => void;
  onPending: (pending: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [formError, setFormError] = useState<string | null>(null);
  const memberId = entry.member.id;
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<EvaluationFormValues>({
    resolver: zodResolver(evaluationFormSchema),
    defaultValues: defaultValues(entry),
  });

  const save = useApiMutation(
    async ({ rating, values }: { rating: number; values: EvaluationFormValues }, client) => {
      await client.put<Evaluation>(`/matches/${matchId}/evaluations/${memberId}`, {
        rating,
        notes: values.notes.trim() === "" ? null : values.notes.trim(),
      });
      // Statistics are optional: skip them when nothing was typed and none existed
      if (hasAnyStat(values) || entry.stats) {
        await client.put<MatchStats>(`/matches/${matchId}/stats/${memberId}`, {
          attackPoints: toCount(values.attackPoints),
          aces: toCount(values.aces),
          blocks: toCount(values.blocks),
          receptions: toCount(values.receptions),
          errors: toCount(values.errors),
        });
      }
    },
    {
      onSuccess: async () => {
        await Promise.all(
          ["report-cards", "member-summary", "member-history", "evaluation-summaries"].map((key) =>
            queryClient.invalidateQueries({ queryKey: [key] }),
          ),
        );
        toast({ title: "Pagella salvata", description: "Resta in bozza finché non la pubblichi.", tone: "success" });
        onDone();
      },
    },
  );

  const pending = save.isPending;
  useEffect(() => {
    onPending(pending);
  }, [pending, onPending]);

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    const rating = parseRating(values.rating);
    if (rating === null) return;
    try {
      await save.mutateAsync({ rating, values });
    } catch (error) {
      applyFieldErrors(error, setError, (path) =>
        FIELDS.includes(path) ? (path as Path<EvaluationFormValues>) : null,
      );
      setFormError(describeError(error));
    }
  });

  const stat = (name: "attackPoints" | "aces" | "blocks" | "receptions" | "errors", label: string) => (
    <Input
      label={label}
      type="number"
      inputMode="numeric"
      min={0}
      max={500}
      error={errors[name]?.message}
      {...register(name)}
    />
  );

  return (
    <form id={FORM_ID} onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
      {formError ? <Alert tone="danger">{formError}</Alert> : null}
      <Input
        label="Voto"
        inputMode="decimal"
        autoComplete="off"
        required
        hint="Da 1 a 10, anche con il decimale: 8,5."
        error={errors.rating?.message}
        {...register("rating")}
      />
      <Textarea
        label="Note dell'allenatore"
        rows={3}
        hint="Le legge la giocatrice quando pubblichi la pagella."
        error={errors.notes?.message}
        {...register("notes")}
      />
      <fieldset className="flex flex-col gap-3">
        <legend className="mb-1 text-sm font-bold text-fg">Statistiche della gara (facoltative)</legend>
        <div className="grid grid-cols-2 gap-3">
          {stat("attackPoints", "Attacchi vincenti")}
          {stat("aces", "Ace")}
          {stat("blocks", "Muri")}
          {stat("receptions", "Ricezioni")}
          {stat("errors", "Errori")}
        </div>
      </fieldset>
    </form>
  );
}

/** Rating, notes and statistics of one player in one match. Saving keeps the report card in draft. */
export function EvaluationDialog({ matchId, entry, onOpenChange }: EvaluationDialogProps) {
  const [pending, setPending] = useState(false);
  if (!entry) return null;
  const name = memberName(entry.member);
  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent
        title={entry.evaluation ? "Modifica la pagella" : "Assegna il voto"}
        description={name}
        footer={
          <>
            <DialogClose asChild>
              <Button variant="secondary">Annulla</Button>
            </DialogClose>
            <Button type="submit" form={FORM_ID} loading={pending}>
              Salva pagella
            </Button>
          </>
        }
      >
        <EvaluationForm matchId={matchId} entry={entry} onDone={() => onOpenChange(false)} onPending={setPending} />
      </DialogContent>
    </Dialog>
  );
}
