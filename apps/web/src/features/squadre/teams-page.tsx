"use client";

import { Pencil, Plus, Trash2, UsersRound } from "lucide-react";
import { useState } from "react";
import { Button, Chip, ConfirmDialog, DataList, EmptyState, LoadMore, SectionHeading, useToast } from "@/components/ui";
import type { Team } from "@/features/tesserati/types";
import { usePermission } from "@/hooks/use-permission";
import { ApiError, describeError } from "@/lib/api";
import { pluralize } from "@/lib/format";
import { useDeleteTeam, useTeamsPage } from "./api";
import { TeamFormDialog } from "./team-form-dialog";
import { TEAM_GENDER_LABEL, isTeamGender } from "./team-schema";

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

function detailLines(team: Team): string[] {
  return [
    isTeamGender(team.gender) ? TEAM_GENDER_LABEL[team.gender] : null,
    pluralize(team.membersCount, "tesserato", "tesserati"),
    team.description,
  ].filter((line): line is string => Boolean(line));
}

interface TeamRowProps {
  team: Team;
  onEdit?: () => void;
  onDelete?: () => void;
}

function TeamRow({ team, onEdit, onDelete }: TeamRowProps) {
  const lines = detailLines(team);
  return (
    <div className="flex flex-col gap-3 p-4">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className="break-words text-sm font-bold text-fg">{team.name}</p>
          {lines.map((line) => (
            <p key={line} className="break-words text-sm text-fg-muted">
              {line}
            </p>
          ))}
        </div>
        {team.category && team.category !== team.name ? <Chip tone="brand">{team.category}</Chip> : null}
      </div>
      {onEdit || onDelete ? (
        <div className="flex flex-wrap gap-2">
          {onEdit ? (
            <Button variant="secondary" leftIcon={<Pencil />} aria-label={`Modifica ${team.name}`} onClick={onEdit}>
              Modifica
            </Button>
          ) : null}
          {onDelete ? (
            <Button variant="ghost" leftIcon={<Trash2 />} aria-label={`Elimina ${team.name}`} onClick={onDelete}>
              Elimina
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

/** The teams of the society: list, create, edit, delete. */
export function TeamsPage() {
  const { toast } = useToast();
  const canWrite = usePermission("teams:write");
  const list = useTeamsPage();
  const remove = useDeleteTeam();
  const [formOpen, setFormOpen] = useState(false);
  // Kept after the dialog closes so that its closing animation does not flash the "new team" form
  const [editing, setEditing] = useState<Team | undefined>(undefined);
  const [deleting, setDeleting] = useState<Team | null>(null);

  function openForm(team?: Team) {
    setEditing(team);
    setFormOpen(true);
  }

  function confirmDelete() {
    if (!deleting) return;
    remove.mutate(deleting.id, {
      onSuccess: () => {
        toast({ title: "Squadra eliminata", description: deleting.name, tone: "success" });
        setDeleting(null);
      },
    });
  }

  const newButton = canWrite ? (
    <Button leftIcon={<Plus />} onClick={() => openForm()}>
      Nuova squadra
    </Button>
  ) : undefined;

  return (
    <div className="flex flex-col gap-6">
      <SectionHeading
        as="h1"
        label="Squadre"
        title="Le squadre della società."
        highlight="squadre"
        description="Crea le squadre, poi aggiungi i tesserati o manda il link d'iscrizione: gli atleti entrano nella squadra giusta da soli."
      />

      {list.items && list.items.length > 0 ? <div>{newButton}</div> : null}

      <DataList
        label="Squadre"
        items={list.items}
        getKey={(team) => team.id}
        renderItem={(team) => (
          <TeamRow
            team={team}
            onEdit={canWrite ? () => openForm(team) : undefined}
            onDelete={
              canWrite
                ? () => {
                    remove.reset();
                    setDeleting(team);
                  }
                : undefined
            }
          />
        )}
        isLoading={list.isLoading}
        error={list.error}
        onRetry={list.refetch}
        loadingLabel="Caricamento delle squadre"
        skeletonRows={4}
        empty={
          <EmptyState
            icon={UsersRound}
            title="Nessuna squadra ancora"
            description={
              canWrite
                ? "Crea la prima squadra: poi potrai assegnarle i tesserati e pianificare le partite."
                : "La segreteria non ha ancora creato le squadre."
            }
            action={newButton}
          />
        }
      />
      <LoadMore list={list} noun="Squadre" moreLabel="Carica altre squadre" />

      {canWrite ? (
        <>
          <TeamFormDialog open={formOpen} onOpenChange={setFormOpen} team={editing} />
          <ConfirmDialog
            open={deleting !== null}
            onOpenChange={(open) => !open && setDeleting(null)}
            title={deleting ? `Eliminare ${deleting.name}?` : ""}
            description={deleting ? deleteWarning(deleting) : ""}
            confirmLabel="Elimina"
            loading={remove.isPending}
            error={remove.error ? describeDeleteError(remove.error) : null}
            onConfirm={confirmDelete}
          />
        </>
      ) : null}
    </div>
  );
}
