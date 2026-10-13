"use client";

import { Download, Search, SearchX, Upload, UserPlus, Users } from "lucide-react";
import { useMemo, useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { DataList } from "@/components/ui/data-list";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { PillFilter } from "@/components/ui/pill-filter";
import { SectionHeading } from "@/components/ui/section-heading";
import { useToast } from "@/components/ui/toast";
import { describeError } from "@/lib/api";
import { useExportMembers, useMembersList, useTeams } from "./api";
import { teamLabel } from "./document-format";
import { ImportDialog } from "./import-dialog";
import { MemberFormDialog } from "./member-form-dialog";
import { MemberRow } from "./member-row";
import { MembersSummaryBar } from "./members-summary-bar";
import { usePermission } from "./use-permission";
import { useDebouncedValue } from "./use-debounced-value";

const ALL_TEAMS = "";

/** Module 01: the roster with team filters, search, document indicators and a live summary. */
export function MembersPage() {
  const { toast } = useToast();
  const canWrite = usePermission("members:write");
  const canReadAll = usePermission("members:read");
  const [search, setSearch] = useState("");
  const [teamId, setTeamId] = useState(ALL_TEAMS);
  const [formOpen, setFormOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const q = useDebouncedValue(search.trim());
  const filters = useMemo(() => ({ q, teamId }), [q, teamId]);

  const list = useMembersList(filters);
  const teams = useTeams();
  const exporter = useExportMembers();

  const members = useMemo(() => list.data?.pages.flatMap((page) => page.data), [list.data]);
  const teamList = useMemo(() => teams.data?.data ?? [], [teams.data]);
  const teamOptions = useMemo(
    () => [
      { value: ALL_TEAMS, label: "Tutte" },
      ...teamList.map((team) => ({ value: team.id, label: teamLabel(team) })),
    ],
    [teamList],
  );
  const hasFilters = q !== "" || teamId !== ALL_TEAMS;

  function resetFilters() {
    setSearch("");
    setTeamId(ALL_TEAMS);
  }

  function exportCsv() {
    exporter.mutate(filters, {
      onError: (error) =>
        toast({ title: "Esportazione non riuscita", description: describeError(error), tone: "danger" }),
    });
  }

  const empty = hasFilters ? (
    <EmptyState
      icon={SearchX}
      title="Nessun tesserato trovato"
      description="Prova con un altro nome o scegli un'altra squadra."
      action={
        <Button variant="secondary" onClick={resetFilters}>
          Azzera i filtri
        </Button>
      }
    />
  ) : canWrite ? (
    <EmptyState
      icon={Users}
      title="Nessun tesserato"
      description="Aggiungi il primo tesserato oppure importa l'elenco da un file CSV."
      action={
        <div className="flex flex-wrap justify-center gap-2">
          <Button leftIcon={<UserPlus />} onClick={() => setFormOpen(true)}>
            Nuovo tesserato
          </Button>
          <Button variant="secondary" leftIcon={<Upload />} onClick={() => setImportOpen(true)}>
            Importa CSV
          </Button>
        </div>
      }
    />
  ) : (
    <EmptyState
      icon={Users}
      title="Nessun tesserato collegato al tuo account"
      description="Chiedi alla segreteria della società di collegare il tuo profilo."
    />
  );

  return (
    <div className="flex flex-col gap-6">
      <SectionHeading
        as="h1"
        index={1}
        label="Tesserati"
        title="Tutti i tesserati, in ordine."
        highlight="in ordine."
        description={
          canReadAll
            ? "Anagrafiche, documenti e squadre in un'unica scheda."
            : "Qui trovi i tuoi dati e quelli dei tuoi figli, con lo stato dei documenti."
        }
      />

      {canReadAll ? (
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-end">
            <Input
              label="Cerca tesserato"
              hideLabel
              type="search"
              placeholder="Cerca per nome, cognome o codice fiscale"
              leadingIcon={<Search />}
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className="md:flex-1"
            />
            {canWrite ? (
              <div className="flex flex-wrap gap-2">
                <Button leftIcon={<UserPlus />} onClick={() => setFormOpen(true)}>
                  Nuovo tesserato
                </Button>
                <Button variant="secondary" leftIcon={<Upload />} onClick={() => setImportOpen(true)}>
                  Importa CSV
                </Button>
                <Button variant="secondary" leftIcon={<Download />} loading={exporter.isPending} onClick={exportCsv}>
                  Esporta CSV
                </Button>
              </div>
            ) : null}
          </div>
          {teamList.length > 0 ? (
            <PillFilter label="Filtra per squadra" options={teamOptions} value={teamId} onChange={setTeamId} />
          ) : null}
        </div>
      ) : null}

      <DataList
        label="Tesserati"
        items={members}
        getKey={(member) => member.id}
        renderItem={(member) => <MemberRow member={member} />}
        isLoading={list.isPending}
        error={members ? null : list.error}
        onRetry={() => void list.refetch()}
        loadingLabel="Caricamento dei tesserati"
        skeletonRows={6}
        empty={empty}
      />

      {list.isFetchNextPageError ? (
        <Alert tone="danger">Non siamo riusciti a caricare altri tesserati. {describeError(list.error)}</Alert>
      ) : null}
      {list.hasNextPage ? (
        <div className="flex justify-center">
          <Button variant="secondary" loading={list.isFetchingNextPage} onClick={() => void list.fetchNextPage()}>
            Carica altri
          </Button>
        </div>
      ) : null}

      {canReadAll ? <MembersSummaryBar /> : null}

      {canWrite ? (
        <>
          <MemberFormDialog open={formOpen} onOpenChange={setFormOpen} teams={teamList} />
          <ImportDialog open={importOpen} onOpenChange={setImportOpen} />
        </>
      ) : null}
    </div>
  );
}
