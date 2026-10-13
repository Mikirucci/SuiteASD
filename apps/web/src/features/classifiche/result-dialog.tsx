"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useQueryClient, type UseMutationResult } from "@tanstack/react-query";
import { useState } from "react";
import { useForm, useWatch, type Path } from "react-hook-form";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogClose, DialogContent } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { describeError, useApiMutation, type ApiError } from "@/lib/api";
import { applyFieldErrors } from "@/lib/field-errors";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { fromLocalInput, matchTitle, toLocalInput } from "./format";
import { MAX_SETS, setTarget } from "./match-result";
import { resultFormSchema, type ResultFormValues } from "./schemas";
import type { Match, MatchResultBody } from "./types";

const FORM_ID = "result-form";

type SaveResult = UseMutationResult<Match, ApiError, MatchResultBody>;

function defaultValues(match: Match): ResultFormValues {
  const sets = Array.from({ length: MAX_SETS }, (_, index) => {
    const score = match.setScores?.[index];
    return { home: score ? String(score[0]) : "", away: score ? String(score[1]) : "" };
  });
  return {
    homeSets: match.homeSets === null ? "" : String(match.homeSets),
    awaySets: match.awaySets === null ? "" : String(match.awaySets),
    detailed: match.setScores !== null,
    sets,
    playedAt: toLocalInput(match.playedAt),
  };
}

function toBody(values: ResultFormValues): MatchResultBody {
  const homeSets = Number(values.homeSets);
  const awaySets = Number(values.awaySets);
  const body: MatchResultBody = { homeSets, awaySets };
  if (values.detailed) {
    body.setScores = values.sets.slice(0, homeSets + awaySets).map((set): [number, number] => [Number(set.home), Number(set.away)]);
  }
  const playedAt = fromLocalInput(values.playedAt);
  if (playedAt) body.playedAt = playedAt;
  return body;
}

function resolveApiPath(apiPath: string): Path<ResultFormValues> | null {
  if (apiPath === "homeSets" || apiPath === "awaySets") return apiPath;
  if (apiPath === "setScores") return "detailed";
  const set = /^setScores\.(\d+)$/.exec(apiPath)?.[1];
  return set !== undefined && Number(set) < MAX_SETS ? `sets.${Number(set)}.home` : null;
}

function ResultForm({ match, save, onDone }: { match: Match; save: SaveResult; onDone: () => void }) {
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    setError,
    control,
    formState: { errors },
  } = useForm<ResultFormValues>({ resolver: zodResolver(resultFormSchema), defaultValues: defaultValues(match) });

  const [homeSets, awaySets, detailed] = useWatch({ control, name: ["homeSets", "awaySets", "detailed"] });
  const totalSets = /^[0-3]$/.test(homeSets) && /^[0-3]$/.test(awaySets) ? Number(homeSets) + Number(awaySets) : 0;
  const visibleSets = Math.min(totalSets, MAX_SETS);

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      await save.mutateAsync(toBody(values));
      onDone();
    } catch (error) {
      if (!applyFieldErrors(error, setError, resolveApiPath)) setFormError(describeError(error));
      else setFormError("Il risultato non è coerente. Controlla i campi evidenziati.");
    }
  });

  return (
    <form id={FORM_ID} onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
      {formError ? <Alert tone="danger">{formError}</Alert> : null}
      <div className="grid grid-cols-2 gap-3">
        <Input
          label={`Set vinti da ${match.homeTeam.name}`}
          type="number"
          inputMode="numeric"
          min={0}
          max={3}
          required
          error={errors.homeSets?.message}
          {...register("homeSets")}
        />
        <Input
          label={`Set vinti da ${match.awayTeam.name}`}
          type="number"
          inputMode="numeric"
          min={0}
          max={3}
          required
          error={errors.awaySets?.message}
          {...register("awaySets")}
        />
      </div>
      <Checkbox
        label="Inserisci il punteggio set per set"
        hint="Facoltativo: serve per i quozienti punti negli spareggi."
        error={errors.detailed?.message}
        {...register("detailed")}
      />
      {detailed ? (
        visibleSets === 0 ? (
          <p className="text-sm text-fg-muted">Inserisci prima i set vinti da ciascuna squadra.</p>
        ) : (
          <div className="flex flex-col gap-3">
            {Array.from({ length: visibleSets }, (_, index) => {
              const message = errors.sets?.[index]?.home?.message ?? errors.sets?.[index]?.away?.message;
              return (
                <fieldset key={index} className="flex flex-col gap-2">
                  <legend className="text-sm font-semibold text-fg">
                    Set {index + 1}{" "}
                    <span className="font-normal text-fg-muted">(si gioca a {setTarget(index, totalSets)})</span>
                  </legend>
                  <div className="grid grid-cols-2 gap-3">
                    <Input
                      label={`Set ${index + 1}, punti di ${match.homeTeam.name}`}
                      hideLabel
                      type="number"
                      inputMode="numeric"
                      min={0}
                      max={99}
                      aria-invalid={message ? true : undefined}
                      {...register(`sets.${index}.home`)}
                    />
                    <Input
                      label={`Set ${index + 1}, punti di ${match.awayTeam.name}`}
                      hideLabel
                      type="number"
                      inputMode="numeric"
                      min={0}
                      max={99}
                      aria-invalid={message ? true : undefined}
                      {...register(`sets.${index}.away`)}
                    />
                  </div>
                  {message ? (
                    <p role="alert" className="text-xs font-medium text-danger">
                      {message}
                    </p>
                  ) : null}
                </fieldset>
              );
            })}
          </div>
        )
      ) : null}
      <Input
        label="Data e ora della partita"
        type="datetime-local"
        hint="Se la lasci vuota resta quella prevista."
        error={errors.playedAt?.message}
        {...register("playedAt")}
      />
    </form>
  );
}

export interface ResultDialogProps {
  match: Match | null;
  onOpenChange: (open: boolean) => void;
}

/** Enter or correct the result of a match; for a played match it also offers to remove the result. */
export function ResultDialog({ match, onOpenChange }: ResultDialogProps) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [confirmingRemoval, setConfirmingRemoval] = useState(false);
  const [removalError, setRemovalError] = useState<string | null>(null);

  const refreshCompetitionData = async () => {
    await queryClient.invalidateQueries({ queryKey: ["standings"] });
    await queryClient.invalidateQueries({ queryKey: ["matches"] });
    await queryClient.invalidateQueries({ queryKey: ["groups"] });
  };

  const save = useApiMutation((body: MatchResultBody, client) => client.put<Match>(`/matches/${match?.id ?? ""}/result`, body), {
    onSuccess: async () => {
      await refreshCompetitionData();
      toast({ title: "Risultato salvato", description: "La classifica è stata ricalcolata.", tone: "success" });
    },
  });

  const remove = useApiMutation((id: string, client) => client.delete<Match>(`/matches/${id}/result`), {
    onSuccess: async () => {
      await refreshCompetitionData();
      toast({ title: "Risultato cancellato", description: "La partita è tornata in programma.", tone: "success" });
      setConfirmingRemoval(false);
      onOpenChange(false);
    },
  });

  if (!match) return null;
  const hasResult = match.status === "PLAYED";

  return (
    <>
      <Dialog
        open
        onOpenChange={(open) => {
          if (!open) onOpenChange(false);
        }}
      >
        <DialogContent
          title={hasResult ? "Correggi il risultato" : "Inserisci il risultato"}
          description={matchTitle(match)}
          footer={
            <>
              {hasResult ? (
                <Button
                  variant="ghost"
                  className="text-danger sm:mr-auto"
                  onClick={() => {
                    setRemovalError(null);
                    setConfirmingRemoval(true);
                  }}
                >
                  Cancella risultato
                </Button>
              ) : null}
              <DialogClose asChild>
                <Button variant="secondary">Annulla</Button>
              </DialogClose>
              <Button type="submit" form={FORM_ID} loading={save.isPending}>
                Salva risultato
              </Button>
            </>
          }
        >
          <ResultForm match={match} save={save} onDone={() => onOpenChange(false)} />
        </DialogContent>
      </Dialog>
      <ConfirmDialog
        open={confirmingRemoval}
        onOpenChange={setConfirmingRemoval}
        title="Cancellare il risultato?"
        description={`La partita ${matchTitle(match)} torna in programma e la classifica si ricalcola senza questo risultato.`}
        confirmLabel="Cancella risultato"
        loading={remove.isPending}
        error={removalError}
        onConfirm={() => {
          setRemovalError(null);
          remove.mutate(match.id, { onError: (error) => setRemovalError(describeError(error)) });
        }}
      />
    </>
  );
}
