"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useQueryClient } from "@tanstack/react-query";
import { Save } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { Alert, Button, Dialog, DialogClose, DialogContent, Input, Select, useToast } from "@/components/ui";
import { formatMatchDate } from "@/features/classifiche/format";
import { ScopePicker } from "@/features/classifiche/scope-picker";
import { useCompetitionScope, type CompetitionScope } from "@/features/classifiche/use-competition-scope";
import type { Match } from "@/features/classifiche/types";
import { useApiMutation } from "@/lib/api";
import { applyFieldErrors } from "@/lib/field-errors";
import { useAllPages } from "@/lib/use-all-pages";
import { refereeName } from "./format";
import { describeRefereeError } from "./messages";
import { assignmentFormSchema, toCreateAssignmentBody, type AssignmentFormValues } from "./schemas";
import type { Assignment, Referee } from "./types";

const FORM_ID = "assignment-form";

function matchLabel(match: Match): string {
  const round = match.round === null ? "" : `G${match.round} · `;
  const date = match.playedAt ? ` · ${formatMatchDate(match.playedAt)}` : "";
  return `${round}${match.homeTeam.name} - ${match.awayTeam.name}${date}`;
}

interface AssignmentFormProps {
  referees: readonly Referee[];
  onDone: () => void;
}

function AssignmentForm({ referees, onDone }: AssignmentFormProps) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    setError,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<AssignmentFormValues>({
    resolver: zodResolver(assignmentFormSchema),
    defaultValues: { refereeId: "", matchId: "", fee: "" },
  });

  const scope = useCompetitionScope();
  const { competition, group } = scope;
  const matches = useAllPages<Match>(
    ["matches", competition?.id, group?.id],
    competition && group ? `/competitions/${competition.id}/groups/${group.id}/matches` : null,
  );

  // The chosen match belongs to the previous group once the season, championship or group change
  const resetMatch = () => setValue("matchId", "");
  const scopeThatResets: CompetitionScope = {
    ...scope,
    selectSeason: (id) => {
      scope.selectSeason(id);
      resetMatch();
    },
    selectCompetition: (id) => {
      scope.selectCompetition(id);
      resetMatch();
    },
    selectGroup: (id) => {
      scope.selectGroup(id);
      resetMatch();
    },
  };

  const save = useApiMutation(
    (values: AssignmentFormValues, client) => client.post<Assignment>("/referee-assignments", toCreateAssignmentBody(values)),
    {
      onSuccess: async () => {
        await Promise.all(["referee-assignments", "referees"].map((key) => queryClient.invalidateQueries({ queryKey: [key] })));
      },
    },
  );

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      const saved = await save.mutateAsync(values);
      toast({ title: "Designazione salvata", description: `${saved.refereeName}: ${saved.match.homeTeam} - ${saved.match.awayTeam}`, tone: "success" });
      onDone();
    } catch (error) {
      const marked = applyFieldErrors(error, setError, (path) => (path.split(".").pop() === "feeCents" ? "fee" : null));
      setFormError(marked ? "Controlla i campi evidenziati." : describeRefereeError(error));
    }
  });

  const matchOptions = (matches.data ?? []).map((match) => ({ value: match.id, label: matchLabel(match) }));
  const hasMatches = matchOptions.length > 0;

  return (
    <>
      <form id={FORM_ID} onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
        {formError ? <Alert tone="danger">{formError}</Alert> : null}
        <Select
          label="Arbitro"
          required
          placeholder="Scegli l'arbitro"
          options={referees.map((referee) => ({ value: referee.id, label: refereeName(referee) }))}
          error={errors.refereeId?.message}
          {...register("refereeId")}
        />
        <fieldset className="flex flex-col gap-3">
          <legend className="mb-1 text-sm font-bold text-fg">Partita da arbitrare</legend>
          <ScopePicker scope={scopeThatResets} />
          <Select
            label="Partita"
            required
            placeholder={matches.isLoading ? "Caricamento delle partite" : hasMatches ? "Scegli la partita" : "Nessuna partita in questo girone"}
            options={matchOptions}
            disabled={!hasMatches}
            hint={matches.error ? "Le partite non sono disponibili al momento." : undefined}
            error={errors.matchId?.message}
            {...register("matchId")}
          />
        </fieldset>
        <Input
          label="Compenso in euro"
          inputMode="decimal"
          autoComplete="off"
          hint="Facoltativo, per esempio 25 o 25,50. Serve a tenere il conto dei rimborsi."
          error={errors.fee?.message}
          {...register("fee")}
        />
      </form>
      <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <DialogClose asChild>
          <Button variant="ghost">Annulla</Button>
        </DialogClose>
        <Button type="submit" form={FORM_ID} leftIcon={<Save />} loading={isSubmitting}>
          Salva la designazione
        </Button>
      </div>
    </>
  );
}

export interface AssignmentDialogProps {
  open: boolean;
  referees: readonly Referee[];
  onClose: () => void;
}

/** Designates a referee for a match picked through season, championship and group. */
export function AssignmentDialog({ open, referees, onClose }: AssignmentDialogProps) {
  if (!open) return null;
  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent title="Nuova designazione" description="Scegli l'arbitro e la partita che dirigerà.">
        <AssignmentForm referees={referees} onDone={onClose} />
      </DialogContent>
    </Dialog>
  );
}
