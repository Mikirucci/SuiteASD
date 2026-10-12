"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent } from "@/components/ui/dialog";
import { Select } from "@/components/ui/select";
import { useToast } from "@/components/ui/toast";
import { describeError, useApiMutation } from "@/lib/api";
import { useAllPages } from "@/lib/use-all-pages";
import { ownTeamFormSchema, type OwnTeamFormValues } from "./schemas";
import type { GroupTeam, OwnTeam } from "./types";

const FORM_ID = "own-team-form";

export interface OwnTeamDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  competitionId: string;
  groupId: string;
  /** Teams already in the group: they cannot be added twice. */
  present: readonly GroupTeam[];
}

/** Adds one of the society's own teams to a group (opponents are added by name instead). */
export function OwnTeamDialog({ open, onOpenChange, competitionId, groupId, present }: OwnTeamDialogProps) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const teams = useAllPages<OwnTeam>(["teams", "all"], open ? "/teams" : null);
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<OwnTeamFormValues>({ resolver: zodResolver(ownTeamFormSchema), defaultValues: { teamId: "" } });

  const taken = new Set(present.map((team) => team.teamId));
  const options = (teams.data ?? [])
    .filter((team) => !taken.has(team.id))
    .map((team) => ({ value: team.id, label: team.category ? `${team.name} (${team.category})` : team.name }));

  const mutation = useApiMutation(
    (values: OwnTeamFormValues, client) =>
      client.post<GroupTeam>(`/competitions/${competitionId}/groups/${groupId}/teams`, { teamId: values.teamId }),
    {
      onSuccess: async () => {
        await Promise.all(
          ["groups", "group-teams", "standings"].map((key) => queryClient.invalidateQueries({ queryKey: [key] })),
        );
        toast({ title: "Squadra aggiunta al girone", tone: "success" });
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title="Aggiungi una nostra squadra"
        description="La squadra comparirà in classifica evidenziata."
        footer={
          <>
            <DialogClose asChild>
              <Button variant="secondary">Annulla</Button>
            </DialogClose>
            <Button type="submit" form={FORM_ID} loading={mutation.isPending} disabled={options.length === 0}>
              Aggiungi al girone
            </Button>
          </>
        }
      >
        {teams.isLoading ? (
          <p role="status" className="text-sm text-fg-muted">
            Caricamento delle squadre
          </p>
        ) : teams.error ? (
          <Alert tone="danger">{describeError(teams.error)}</Alert>
        ) : options.length === 0 ? (
          <Alert tone="info">Tutte le squadre della società sono già in questo girone, oppure non ne hai ancora create.</Alert>
        ) : (
          <form id={FORM_ID} onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
            {formError ? <Alert tone="danger">{formError}</Alert> : null}
            <Select
              label="Squadra"
              placeholder="Scegli la squadra"
              options={options}
              required
              error={errors.teamId?.message}
              {...register("teamId")}
            />
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
