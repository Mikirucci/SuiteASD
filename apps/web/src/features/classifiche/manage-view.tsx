"use client";

import { useQueryClient } from "@tanstack/react-query";
import { Layers, Pencil, Plus, Settings2, Trash2, Users } from "lucide-react";
import { useState, type ReactNode } from "react";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button, IconButton } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { DataList, DataListRow } from "@/components/ui/data-list";
import { EmptyState } from "@/components/ui/empty-state";
import { useToast } from "@/components/ui/toast";
import { describeError, useApiMutation } from "@/lib/api";
import { useAllPages } from "@/lib/use-all-pages";
import { CompetitionDialog } from "./competition-dialog";
import { ConfirmDialog } from "./confirm-dialog";
import { formatDay } from "./format";
import { NameDialog } from "./name-dialog";
import { OwnTeamDialog } from "./own-team-dialog";
import { SeasonDialog } from "./season-dialog";
import type { Competition, Group, GroupTeam, Season } from "./types";
import type { CompetitionScope } from "./use-competition-scope";

type Editor =
  | { type: "season"; season?: Season }
  | { type: "competition"; competition?: Competition }
  | { type: "group"; group?: Group }
  | { type: "opponent" }
  | { type: "own-team" }
  | { type: "team-name"; team: GroupTeam };

interface DeleteTarget {
  title: string;
  description: string;
  path: string;
}

const COLLECTIONS = ["seasons", "competitions", "groups", "group-teams", "matches", "standings"];
const KIND_LABEL = { LEAGUE: "Campionato", TOURNAMENT: "Torneo" } as const;

function Section({ title, description, action, children }: { title: string; description: string; action: ReactNode; children: ReactNode }) {
  return (
    <section aria-label={title} className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold tracking-title text-fg">{title}</h2>
          <p className="text-sm text-fg-muted">{description}</p>
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

function RowActions({ name, onEdit, onDelete }: { name: string; onEdit: () => void; onDelete: () => void }) {
  return (
    <>
      <IconButton aria-label={`Modifica ${name}`} icon={<Pencil />} onClick={onEdit} />
      <IconButton aria-label={`Elimina ${name}`} icon={<Trash2 />} onClick={onDelete} />
    </>
  );
}

/** Seasons, championships, groups and group teams: everything a writer needs to set up a competition. */
export function ManageView({ scope }: { scope: CompetitionScope }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { season, competition, group } = scope;
  const [editor, setEditor] = useState<Editor | null>(null);
  const [deleting, setDeleting] = useState<DeleteTarget | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const close = () => setEditor(null);

  const groupTeamsPath = competition && group ? `/competitions/${competition.id}/groups/${group.id}/teams` : null;
  const groupTeams = useAllPages<GroupTeam>(["group-teams", group?.id], groupTeamsPath);

  const remove = useApiMutation((path: string, client) => client.delete<undefined>(path), {
    onSuccess: async () => {
      await Promise.all(COLLECTIONS.map((key) => queryClient.invalidateQueries({ queryKey: [key] })));
      toast({ title: "Eliminato", tone: "success" });
      setDeleting(null);
    },
  });

  const askDelete = (target: DeleteTarget) => {
    setDeleteError(null);
    setDeleting(target);
  };

  return (
    <div className="flex flex-col gap-8">
      <Section
        title="Stagioni"
        description="Ogni campionato e torneo vive dentro una stagione."
        action={
          <Button variant="secondary" leftIcon={<Plus />} onClick={() => setEditor({ type: "season" })}>
            Nuova stagione
          </Button>
        }
      >
        <DataList
          label="Stagioni"
          items={scope.seasons.data}
          isLoading={scope.seasons.isLoading}
          error={scope.seasons.error}
          onRetry={() => void scope.seasons.refetch()}
          getKey={(item) => item.id}
          empty={<EmptyState icon={Settings2} title="Nessuna stagione" description="Crea la prima stagione per iniziare a inserire campionati." />}
          renderItem={(item) => (
            <DataListRow
              title={item.name}
              subtitle={`Dal ${formatDay(item.startsOn)} al ${formatDay(item.endsOn)}`}
              trailing={
                <>
                  {item.isCurrent ? <Chip tone="success">In corso</Chip> : null}
                  <RowActions
                    name={`la stagione ${item.name}`}
                    onEdit={() => setEditor({ type: "season", season: item })}
                    onDelete={() =>
                      askDelete({
                        title: "Eliminare la stagione?",
                        description: `${item.name} si può eliminare solo se non ha campionati né piani quote.`,
                        path: `/seasons/${item.id}`,
                      })
                    }
                  />
                </>
              }
            />
          )}
        />
      </Section>

      {season ? (
        <Section
          title="Campionati e tornei"
          description={`Stagione ${season.name}.`}
          action={
            <Button variant="secondary" leftIcon={<Plus />} onClick={() => setEditor({ type: "competition" })}>
              Nuovo campionato o torneo
            </Button>
          }
        >
          <DataList
            label="Campionati e tornei"
            items={scope.competitions.data}
            isLoading={scope.competitions.isLoading}
            error={scope.competitions.error}
            onRetry={() => void scope.competitions.refetch()}
            getKey={(item) => item.id}
            empty={<EmptyState icon={Layers} title="Nessun campionato in questa stagione" description="Crea un campionato o un torneo, poi aggiungi i gironi." />}
            renderItem={(item) => (
              <DataListRow
                title={item.name}
                subtitle={`${KIND_LABEL[item.kind]}, ${item.groupsCount} ${item.groupsCount === 1 ? "girone" : "gironi"}`}
                trailing={
                  <RowActions
                    name={item.name}
                    onEdit={() => setEditor({ type: "competition", competition: item })}
                    onDelete={() =>
                      askDelete({
                        title: "Eliminare il campionato?",
                        description: `${item.name} si può eliminare solo se non ha partite.`,
                        path: `/competitions/${item.id}`,
                      })
                    }
                  />
                }
              />
            )}
          />
        </Section>
      ) : null}

      {competition ? (
        <Section
          title="Gironi"
          description={competition.name}
          action={
            <Button variant="secondary" leftIcon={<Plus />} onClick={() => setEditor({ type: "group" })}>
              Nuovo girone
            </Button>
          }
        >
          <DataList
            label="Gironi"
            items={scope.groups.data}
            isLoading={scope.groups.isLoading}
            error={scope.groups.error}
            onRetry={() => void scope.groups.refetch()}
            getKey={(item) => item.id}
            empty={<EmptyState icon={Layers} title="Nessun girone" description="Aggiungi un girone: le squadre e le partite stanno lì dentro." />}
            renderItem={(item) => (
              <DataListRow
                title={item.name}
                subtitle={`${item.teamsCount} squadre, ${item.matchesCount} partite`}
                trailing={
                  <RowActions
                    name={`il girone ${item.name}`}
                    onEdit={() => setEditor({ type: "group", group: item })}
                    onDelete={() =>
                      askDelete({
                        title: "Eliminare il girone?",
                        description: `${item.name} si può eliminare solo se non ha partite.`,
                        path: `/competitions/${competition.id}/groups/${item.id}`,
                      })
                    }
                  />
                }
              />
            )}
          />
        </Section>
      ) : null}

      {competition && group ? (
        <Section
          title="Squadre del girone"
          description={`${group.name}: le nostre squadre compaiono evidenziate in classifica.`}
          action={
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" leftIcon={<Plus />} onClick={() => setEditor({ type: "own-team" })}>
                Nostra squadra
              </Button>
              <Button variant="secondary" leftIcon={<Plus />} onClick={() => setEditor({ type: "opponent" })}>
                Squadra avversaria
              </Button>
            </div>
          }
        >
          <DataList
            label={`Squadre di ${group.name}`}
            items={groupTeams.data}
            isLoading={groupTeams.isLoading}
            error={groupTeams.error}
            onRetry={() => void groupTeams.refetch()}
            getKey={(item) => item.id}
            empty={<EmptyState icon={Users} title="Nessuna squadra nel girone" description="Aggiungi le nostre squadre e le avversarie per poter inserire le partite." />}
            renderItem={(item) => (
              <DataListRow
                leading={<Avatar name={item.name} decorative />}
                title={item.name}
                trailing={
                  <>
                    {item.isOurTeam ? <Badge variant="brand">Nostra</Badge> : null}
                    <RowActions
                      name={item.name}
                      onEdit={() => setEditor({ type: "team-name", team: item })}
                      onDelete={() =>
                        askDelete({
                          title: "Togliere la squadra dal girone?",
                          description: `${item.name} si può togliere solo se non ha partite.`,
                          path: `/competitions/${competition.id}/groups/${group.id}/teams/${item.id}`,
                        })
                      }
                    />
                  </>
                }
              />
            )}
          />
        </Section>
      ) : null}

      {editor?.type === "season" ? <SeasonDialog open onOpenChange={close} season={editor.season} /> : null}
      {editor?.type === "competition" && season ? (
        <CompetitionDialog open onOpenChange={close} seasonId={season.id} competition={editor.competition} />
      ) : null}
      {editor?.type === "group" && competition ? (
        <NameDialog
          open
          onOpenChange={close}
          title={editor.group ? "Rinomina il girone" : "Nuovo girone"}
          label="Nome del girone"
          description="Per esempio Girone B."
          initialName={editor.group?.name}
          submitLabel={editor.group ? "Salva nome" : "Crea girone"}
          successMessage={editor.group ? "Girone rinominato" : "Girone creato"}
          save={(name, client) =>
            editor.group
              ? client.patch<Group>(`/competitions/${competition.id}/groups/${editor.group.id}`, { name })
              : client.post<Group>(`/competitions/${competition.id}/groups`, { name })
          }
        />
      ) : null}
      {editor?.type === "opponent" && groupTeamsPath ? (
        <NameDialog
          open
          onOpenChange={close}
          title="Aggiungi una squadra avversaria"
          label="Nome della squadra"
          description="Per esempio Delfini Volley."
          submitLabel="Aggiungi al girone"
          successMessage="Squadra aggiunta al girone"
          save={(name, client) => client.post<GroupTeam>(groupTeamsPath, { name })}
        />
      ) : null}
      {editor?.type === "team-name" && groupTeamsPath ? (
        <NameDialog
          open
          onOpenChange={close}
          title="Rinomina la squadra"
          label="Nome della squadra"
          initialName={editor.team.name}
          submitLabel="Salva nome"
          successMessage="Squadra rinominata"
          save={(name, client) => client.patch<GroupTeam>(`${groupTeamsPath}/${editor.team.id}`, { name })}
        />
      ) : null}
      {editor?.type === "own-team" && competition && group ? (
        <OwnTeamDialog open onOpenChange={close} competitionId={competition.id} groupId={group.id} present={groupTeams.data ?? []} />
      ) : null}

      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        title={deleting?.title ?? ""}
        description={deleting?.description ?? ""}
        confirmLabel="Elimina"
        loading={remove.isPending}
        error={deleteError}
        onConfirm={() => {
          if (!deleting) return;
          setDeleteError(null);
          remove.mutate(deleting.path, { onError: (error) => setDeleteError(describeError(error)) });
        }}
      />
    </div>
  );
}
