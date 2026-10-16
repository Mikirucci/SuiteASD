"use client";

import { useQueryClient } from "@tanstack/react-query";
import { Megaphone, Plus, Search } from "lucide-react";
import { useState } from "react";
import {
  Button,
  ConfirmDialog,
  DataList,
  EmptyState,
  LoadMore,
  PillFilter,
  type PillOption,
  SectionHeading,
  Select,
  useToast,
} from "@/components/ui";
import { useCursorQuery } from "@/lib/use-cursor-query";
import { usePermission } from "@/hooks/use-permission";
import { describeError, useApiMutation } from "@/lib/api";
import { AnnouncementDialog, type AnnouncementDialogState } from "./announcement-dialog";
import { AnnouncementItem } from "./announcement-item";
import type { Announcement, TeamOption } from "./types";

const PAGE_SIZE = 20;

const STATUS_OPTIONS: readonly PillOption[] = [
  { value: "all", label: "Tutte" },
  { value: "PUBLISHED", label: "Pubblicate" },
  { value: "SCHEDULED", label: "Programmate" },
  { value: "DRAFT", label: "Bozze" },
];

/** Announcements board: the whole society sees what is published, who manages it also sees drafts and scheduled ones. */
export function BachecaPage() {
  const canWrite = usePermission("announcements:write");
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [status, setStatus] = useState("all");
  const [teamId, setTeamId] = useState("");
  const [editor, setEditor] = useState<AnnouncementDialogState | null>(null);
  const [deleting, setDeleting] = useState<Announcement | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const teams = useCursorQuery<TeamOption>(["announcement-teams"], "/teams", { limit: 100 });
  const announcements = useCursorQuery<Announcement>(["announcements", { status, teamId }], "/announcements", {
    status: status === "all" ? undefined : status,
    teamId: teamId || undefined,
    limit: PAGE_SIZE,
  });

  const remove = useApiMutation((id: string, client) => client.delete<undefined>(`/announcements/${id}`), {
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["announcements"] });
      toast({ title: "Comunicazione eliminata", tone: "success" });
      setDeleting(null);
    },
  });

  const hasFilters = status !== "all" || teamId !== "";
  const teamOptions = [{ value: "", label: "Tutte le squadre" }, ...(teams.items ?? []).map((team) => ({ value: team.id, label: team.name }))];
  const newButton = canWrite ? (
    <Button leftIcon={<Plus />} onClick={() => setEditor({ mode: "create" })}>
      Nuova comunicazione
    </Button>
  ) : null;

  const empty = hasFilters ? (
    <EmptyState
      icon={Search}
      title="Nessuna comunicazione con questi filtri"
      description="Prova con un altro stato o un'altra squadra."
      action={
        <Button
          variant="secondary"
          onClick={() => {
            setStatus("all");
            setTeamId("");
          }}
        >
          Azzera i filtri
        </Button>
      }
    />
  ) : (
    <EmptyState
      icon={Megaphone}
      title="Nessuna comunicazione ancora"
      description={
        canWrite
          ? "Scrivi la prima comunicazione: la ricevono tutti, senza gruppi chat sparsi."
          : "Quando la società pubblica una comunicazione la trovi qui."
      }
      action={newButton}
    />
  );

  return (
    <div className="flex flex-col gap-6">
      <SectionHeading
        as="h1"
        label="Bacheca"
        title="Le comunicazioni, in un posto solo."
        highlight="in un posto solo."
        description="Avvisi per tutta la società o per una squadra, al posto delle chat caotiche."
      />

      <div className="flex flex-col gap-3">
        {canWrite ? <PillFilter label="Filtra per stato" options={STATUS_OPTIONS} value={status} onChange={setStatus} /> : null}
        <div className="flex flex-wrap items-end justify-between gap-3">
          <Select
            className="w-full sm:w-72"
            label="Squadra"
            options={teamOptions}
            value={teamId}
            onChange={(event) => setTeamId(event.target.value)}
            hint={teams.error ? "Le squadre non sono disponibili al momento." : undefined}
          />
          {announcements.items && announcements.items.length > 0 ? newButton : null}
        </div>
      </div>

      <section aria-labelledby="announcements-title" className="flex flex-col gap-3">
        <h2 id="announcements-title" className="sr-only">
          Elenco delle comunicazioni
        </h2>
        <DataList
          label="Comunicazioni"
          items={announcements.items}
          getKey={(announcement) => announcement.id}
          renderItem={(announcement) => (
            <AnnouncementItem
              announcement={announcement}
              canWrite={canWrite}
              onEdit={(target) => setEditor({ mode: "edit", announcement: target })}
              onDelete={(target) => {
                setDeleteError(null);
                setDeleting(target);
              }}
            />
          )}
          isLoading={announcements.isLoading}
          error={announcements.error}
          onRetry={announcements.refetch}
          loadingLabel="Caricamento delle comunicazioni"
          empty={empty}
        />
        <LoadMore list={announcements} noun="Comunicazioni" moreLabel="Mostra altre comunicazioni" />
      </section>

      {canWrite ? (
        <>
          <AnnouncementDialog state={editor} teams={teams.items ?? []} onClose={() => setEditor(null)} />
          <ConfirmDialog
            open={deleting !== null}
            onOpenChange={(open) => !open && setDeleting(null)}
            title="Eliminare la comunicazione?"
            description={deleting ? `"${deleting.title}" sparisce dalla bacheca di tutti.` : ""}
            confirmLabel="Elimina"
            loading={remove.isPending}
            error={deleteError}
            onConfirm={() => {
              if (!deleting) return;
              setDeleteError(null);
              remove.mutate(deleting.id, { onError: (error) => setDeleteError(describeError(error)) });
            }}
          />
        </>
      ) : null}
    </div>
  );
}
