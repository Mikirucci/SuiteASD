"use client";

import { useQueryClient } from "@tanstack/react-query";
import { Paperclip, Pencil, Plus, Search, Trash2, Users } from "lucide-react";
import { useState } from "react";
import {
  Avatar,
  Button,
  Chip,
  ConfirmDialog,
  DataList,
  EmptyState,
  IconButton,
  Input,
  LoadMore,
  useToast,
} from "@/components/ui";
import { AttachmentsDialog, type AttachmentsTarget } from "@/features/attachments/attachments-dialog";
import { pluralize } from "@/lib/format";
import { useCursorQuery } from "@/lib/use-cursor-query";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { useApiMutation } from "@/lib/api";
import { refereeName } from "./format";
import { describeRefereeError } from "./messages";
import { RefereeDialog, type RefereeDialogState } from "./referee-dialog";
import type { Referee } from "./types";

const PAGE_SIZE = 25;

function RefereeRow({ referee, canWrite, onEdit, onDelete, onAttachments }: {
  referee: Referee;
  canWrite: boolean;
  onEdit: (referee: Referee) => void;
  onDelete: (referee: Referee) => void;
  onAttachments: (referee: Referee) => void;
}) {
  const name = refereeName(referee);
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-3 sm:px-4">
      <Avatar name={name} decorative />
      <div className="min-w-0 flex-1 basis-40">
        <p className="break-words text-sm font-bold text-fg">{name}</p>
        <p className="break-words text-xs text-fg-muted">{referee.qualification ?? "Qualifica non indicata"}</p>
        {referee.email || referee.phone ? (
          <p className="break-words text-xs text-fg-muted">
            {referee.email ? (
              <a href={`mailto:${referee.email}`} className="underline underline-offset-2 hover:text-fg">
                {referee.email}
              </a>
            ) : null}
            {referee.email && referee.phone ? " · " : null}
            {referee.phone ? (
              <a href={`tel:${referee.phone}`} className="underline underline-offset-2 hover:text-fg">
                {referee.phone}
              </a>
            ) : null}
          </p>
        ) : null}
      </div>
      <div className="flex items-center gap-1">
        <Chip>{pluralize(referee.assignmentsCount, "designazione", "designazioni")}</Chip>
        {canWrite ? (
          <>
            <IconButton aria-label={`Allegati di ${name}`} icon={<Paperclip />} onClick={() => onAttachments(referee)} />
            <IconButton aria-label={`Modifica ${name}`} icon={<Pencil />} onClick={() => onEdit(referee)} />
            <IconButton aria-label={`Elimina ${name}`} icon={<Trash2 />} onClick={() => onDelete(referee)} />
          </>
        ) : null}
      </div>
    </div>
  );
}

/** Roster of the referees: search by name, add, edit and remove (only when they have no designations). */
export function RefereesPanel({ canWrite }: { canWrite: boolean }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const q = useDebouncedValue(search.trim());
  const [editor, setEditor] = useState<RefereeDialogState | null>(null);
  const [deleting, setDeleting] = useState<Referee | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [attachments, setAttachments] = useState<AttachmentsTarget | null>(null);

  const referees = useCursorQuery<Referee>(["referees", "list", { q }], "/referees", { q: q || undefined, limit: PAGE_SIZE });

  const remove = useApiMutation((id: string, client) => client.delete<undefined>(`/referees/${id}`), {
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["referees"] });
      toast({ title: "Arbitro eliminato", tone: "success" });
      setDeleting(null);
    },
  });

  const addButton = canWrite ? (
    <Button leftIcon={<Plus />} onClick={() => setEditor({ mode: "create" })}>
      Nuovo arbitro
    </Button>
  ) : null;

  const empty = q ? (
    <EmptyState
      icon={Search}
      title="Nessun arbitro con questo nome"
      description="Controlla l'ortografia o togli la ricerca."
      action={
        <Button variant="secondary" onClick={() => setSearch("")}>
          Azzera la ricerca
        </Button>
      }
    />
  ) : (
    <EmptyState
      icon={Users}
      title="Nessun arbitro ancora"
      description={canWrite ? "Aggiungi gli arbitri che dirigono le vostre partite per poterli designare." : "Gli arbitri aggiunti dalla società compaiono qui."}
      action={addButton}
    />
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <Input
          className="w-full sm:w-80"
          label="Cerca un arbitro"
          type="search"
          leadingIcon={<Search />}
          placeholder="Nome o cognome"
          autoComplete="off"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        {referees.items && referees.items.length > 0 ? addButton : null}
      </div>

      <DataList
        label="Arbitri"
        items={referees.items}
        getKey={(referee) => referee.id}
        renderItem={(referee) => (
          <RefereeRow
            referee={referee}
            canWrite={canWrite}
            onEdit={(target) => setEditor({ mode: "edit", referee: target })}
            onAttachments={(target) =>
              setAttachments({ entityType: "REFEREE", entityId: target.id, recordName: refereeName(target) })
            }
            onDelete={(target) => {
              setDeleteError(null);
              setDeleting(target);
            }}
          />
        )}
        isLoading={referees.isLoading}
        error={referees.error}
        onRetry={referees.refetch}
        loadingLabel="Caricamento degli arbitri"
        empty={empty}
      />
      <LoadMore list={referees} noun="Arbitri" moreLabel="Mostra altri arbitri" />

      {canWrite ? (
        <>
          <RefereeDialog state={editor} onClose={() => setEditor(null)} />
          <AttachmentsDialog target={attachments} onClose={() => setAttachments(null)} />
          <ConfirmDialog
            open={deleting !== null}
            onOpenChange={(open) => !open && setDeleting(null)}
            title="Eliminare l'arbitro?"
            description={deleting ? `${refereeName(deleting)} esce dall'elenco. Si può eliminare solo se non ha designazioni.` : ""}
            confirmLabel="Elimina"
            loading={remove.isPending}
            error={deleteError}
            onConfirm={() => {
              if (!deleting) return;
              setDeleteError(null);
              remove.mutate(deleting.id, { onError: (error) => setDeleteError(describeRefereeError(error)) });
            }}
          />
        </>
      ) : null}
    </div>
  );
}
