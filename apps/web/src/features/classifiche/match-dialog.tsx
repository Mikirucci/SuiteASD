"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useForm, type Path } from "react-hook-form";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { useToast } from "@/components/ui/toast";
import { describeError, useApiMutation } from "@/lib/api";
import { applyFieldErrors } from "@/lib/field-errors";
import { useAllPages } from "@/lib/use-all-pages";
import { fromLocalInput, toLocalInput } from "./format";
import { matchFormSchema, type MatchFormValues } from "./schemas";
import type { GroupTeam, Match } from "./types";

const FORM_ID = "match-form";

const STATUS_OPTIONS = [
  { value: "SCHEDULED", label: "In programma" },
  { value: "POSTPONED", label: "Rinviata" },
  { value: "CANCELLED", label: "Annullata" },
];

function defaultValues(match: Match | undefined): MatchFormValues {
  return {
    round: match?.round ? String(match.round) : "",
    homeTeamId: match?.homeTeam.id ?? "",
    awayTeamId: match?.awayTeam.id ?? "",
    playedAt: toLocalInput(match?.playedAt ?? null),
    status: match && match.status !== "PLAYED" ? match.status : "SCHEDULED",
  };
}

const FIELD_NAMES: readonly string[] = ["round", "homeTeamId", "awayTeamId", "playedAt", "status"];

function resolveApiPath(apiPath: string): Path<MatchFormValues> | null {
  return FIELD_NAMES.includes(apiPath) ? (apiPath as Path<MatchFormValues>) : null;
}

interface MatchFormProps {
  competitionId: string;
  groupId: string;
  match: Match | undefined;
  teams: GroupTeam[];
  onDone: () => void;
  onPendingChange: (pending: boolean) => void;
}

function MatchForm({ competitionId, groupId, match, teams, onDone, onPendingChange }: MatchFormProps) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<MatchFormValues>({ resolver: zodResolver(matchFormSchema), defaultValues: defaultValues(match) });

  const save = useApiMutation(
    (values: MatchFormValues, client) => {
      const common = { homeTeamId: values.homeTeamId, awayTeamId: values.awayTeamId };
      if (!match) {
        return client.post<Match>(`/competitions/${competitionId}/groups/${groupId}/matches`, {
          ...common,
          ...(values.round ? { round: Number(values.round) } : {}),
          ...(values.playedAt ? { playedAt: fromLocalInput(values.playedAt) } : {}),
        });
      }
      return client.patch<Match>(`/matches/${match.id}`, {
        ...common,
        round: values.round ? Number(values.round) : null,
        playedAt: values.playedAt ? fromLocalInput(values.playedAt) : null,
        ...(match.status === "PLAYED" ? {} : { status: values.status }),
      });
    },
    {
      onSuccess: async () => {
        await queryClient.invalidateQueries({ queryKey: ["matches"] });
        await queryClient.invalidateQueries({ queryKey: ["standings"] });
        await queryClient.invalidateQueries({ queryKey: ["groups"] });
        toast({ title: match ? "Partita aggiornata" : "Partita aggiunta", tone: "success" });
        onDone();
      },
    },
  );
  const pending = save.isPending;
  useEffect(() => {
    onPendingChange(pending);
  }, [pending, onPendingChange]);

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      await save.mutateAsync(values);
    } catch (error) {
      applyFieldErrors(error, setError, resolveApiPath);
      setFormError(describeError(error));
    }
  });

  const options = teams.map((team) => ({ value: team.id, label: team.name }));
  return (
    <form id={FORM_ID} onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
      {formError ? <Alert tone="danger">{formError}</Alert> : null}
      <Select
        label="Squadra di casa"
        placeholder="Scegli la squadra"
        options={options}
        required
        error={errors.homeTeamId?.message}
        {...register("homeTeamId")}
      />
      <Select
        label="Squadra ospite"
        placeholder="Scegli la squadra"
        options={options}
        required
        error={errors.awayTeamId?.message}
        {...register("awayTeamId")}
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <Input
          label="Giornata"
          type="number"
          inputMode="numeric"
          min={1}
          max={200}
          hint="Facoltativa."
          error={errors.round?.message}
          {...register("round")}
        />
        <Input label="Data e ora" type="datetime-local" error={errors.playedAt?.message} {...register("playedAt")} />
      </div>
      {match && match.status !== "PLAYED" ? (
        <Select label="Stato" options={STATUS_OPTIONS} error={errors.status?.message} {...register("status")} />
      ) : null}
    </form>
  );
}

export interface MatchDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  competitionId: string;
  groupId: string;
  /** Omit to schedule a new match. */
  match?: Match;
}

export function MatchDialog({ open, onOpenChange, competitionId, groupId, match }: MatchDialogProps) {
  const teams = useAllPages<GroupTeam>(
    ["group-teams", groupId],
    open ? `/competitions/${competitionId}/groups/${groupId}/teams` : null,
  );
  const [pending, setPending] = useState(false);
  const enoughTeams = (teams.data?.length ?? 0) >= 2;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title={match ? "Modifica la partita" : "Aggiungi una partita"}
        description="Scegli le due squadre del girone, la giornata e la data."
        footer={
          <>
            <DialogClose asChild>
              <Button variant="secondary">Annulla</Button>
            </DialogClose>
            <Button type="submit" form={FORM_ID} loading={pending} disabled={!enoughTeams}>
              {match ? "Salva modifiche" : "Aggiungi partita"}
            </Button>
          </>
        }
      >
        {teams.isLoading ? (
          <p role="status" className="text-sm text-fg-muted">
            Caricamento delle squadre del girone
          </p>
        ) : teams.error ? (
          <Alert tone="danger">{describeError(teams.error)}</Alert>
        ) : !enoughTeams ? (
          <Alert tone="info">Servono almeno due squadre nel girone. Aggiungile dalla scheda Gestione.</Alert>
        ) : (
          <MatchForm
            competitionId={competitionId}
            groupId={groupId}
            match={match}
            teams={teams.data ?? []}
            onDone={() => onOpenChange(false)}
            onPendingChange={setPending}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
