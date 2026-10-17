"use client";

import { ConfirmDialog, useToast } from "@/components/ui";
import type { Team } from "@/features/tesserati/types";
import { ApiError, describeError } from "@/lib/api";
import { pluralize } from "@/lib/format";
import { useDeleteTeam } from "./api";

/** What deleting does to the data around a team: the API removes the team from members and keeps the rest. */
export function deleteWarning(team: Team): string {
  const members =
    team.membersCount === 0
      ? "La squadra non ha tesserati."
      : `${pluralize(team.membersCount, "tesserato resta", "tesserati restano")} in società ma ${team.membersCount === 1 ? "esce" : "escono"} dalla squadra.`;
  return `${members} Partite, quote e comunicazioni collegate restano, senza squadra. L'operazione non si può annullare.`;
}

function describeDeleteError(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 409) return "La squadra è usata da altri dati e non si può eliminare.";
    if (error.status === 404) return "La squadra non esiste più. Chiudi questa finestra: l'elenco si aggiorna da solo.";
  }
  return describeError(error);
}

export interface DeleteTeamDialogProps {
  /** The team to delete; the dialog is open while it is set. */
  team: Team | null;
  onClose: () => void;
  onDeleted?: () => void;
}

/** Confirmation to delete a team, shared by the list and the team page. */
export function DeleteTeamDialog({ team, onClose, onDeleted }: DeleteTeamDialogProps) {
  const { toast } = useToast();
  const remove = useDeleteTeam();

  function confirmDelete() {
    if (!team) return;
    remove.mutate(team.id, {
      onSuccess: () => {
        toast({ title: "Squadra eliminata", description: team.name, tone: "success" });
        onClose();
        onDeleted?.();
      },
    });
  }

  return (
    <ConfirmDialog
      open={team !== null}
      onOpenChange={(open) => {
        if (open) return;
        remove.reset();
        onClose();
      }}
      title={team ? `Eliminare ${team.name}?` : ""}
      description={team ? deleteWarning(team) : ""}
      confirmLabel="Elimina"
      loading={remove.isPending}
      error={remove.error ? describeDeleteError(remove.error) : null}
      onConfirm={confirmDelete}
    />
  );
}
