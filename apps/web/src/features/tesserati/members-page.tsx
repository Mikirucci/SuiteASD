"use client";

import { Download, Search, SearchX, SlidersHorizontal, Upload, UserPlus, Users } from "lucide-react";
import { useMemo, useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { DataList } from "@/components/ui/data-list";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { PillFilter } from "@/components/ui/pill-filter";
import { Select } from "@/components/ui/select";
import { SectionHeading } from "@/components/ui/section-heading";
import { useToast } from "@/components/ui/toast";
import { describeError } from "@/lib/api";
import { useExportMembers, useMembersList, useTeams } from "./api";
import { teamLabel } from "./document-format";
import { ImportDialog } from "./import-dialog";
import { MemberFormDialog } from "./member-form-dialog";
import { MemberRow } from "./member-row";
import { MembersSummaryBar } from "./members-summary-bar";
import { EMPTY_MEMBERS_FILTERS, type MemberGender, type MembersFilters, type OverallDocumentStatus } from "./types";
import { usePermission } from "@/hooks/use-permission";
import { useDebouncedValue } from "@/hooks/use-debounced-value";

const ALL_TEAMS = "";
/** Pill value for the members who are in no team yet. */
const NO_TEAM = "__none__";

const DOCUMENT_OPTIONS = [
  { value: "MISSING", label: "Con documenti mancanti" },
  { value: "EXPIRING", label: "Con documenti in scadenza" },
  { value: "OK", label: "In regola" },
] as const;

const GENDER_OPTIONS = [
  { value: "FEMALE", label: "Femmine" },
  { value: "MALE", label: "Maschi" },
] as const;

const BIRTH_YEAR = /^\d{4}$/;

/** Module 01: the roster with team filters, search, document indicators and a live summary. */
export function MembersPage() {
  const { toast } = useToast();
  const canWrite = usePermission("members:write");
  const canReadAll = usePermission("members:read");
  const [search, setSearch] = useState("");
  const [teamChoice, setTeamChoice] = useState(ALL_TEAMS);
  const [documentStatus, setDocumentStatus] = useState<OverallDocumentStatus | "">("");
  const [gender, setGender] = useState<MemberGender | "">("");
  const [fieldRole, setFieldRole] = useState("");
  const [birthYear, setBirthYear] = useState("");
  const [moreOpen, setMoreOpen] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const q = useDebouncedValue(search.trim());
  const role = useDebouncedValue(fieldRole.trim());
  const filters = useMemo<MembersFilters>(
    () => ({
      ...EMPTY_MEMBERS_FILTERS,
      q,
      teamId: teamChoice === NO_TEAM ? "" : teamChoice,
      noTeam: teamChoice === NO_TEAM,
      documentStatus,
      gender,
      fieldRole: role,
      // A partial year is not a filter yet
      birthYear: BIRTH_YEAR.test(birthYear) ? birthYear : "",
    }),
    [q, teamChoice, documentStatus, gender, role, birthYear],
  );

  const list = useMembersList(filters);
  const teams = useTeams();
  const exporter = useExportMembers();

  const members = useMemo(() => list.data?.pages.flatMap((page) => page.data), [list.data]);
  const teamList = useMemo(() => teams.data?.data ?? [], [teams.data]);
  const teamOptions = useMemo(
    () => [
      { value: ALL_TEAMS, label: "Tutte" },
      ...teamList.map((team) => ({ value: team.id, label: teamLabel(team) })),
      { value: NO_TEAM, label: "Senza squadra" },
    ],
    [teamList],
  );
  const extraFilters = [documentStatus, gender, fieldRole.trim(), birthYear].filter((value) => value !== "").length;
  const hasFilters = q !== "" || teamChoice !== ALL_TEAMS || extraFilters > 0;

  function resetFilters() {
    setSearch("");
    setTeamChoice(ALL_TEAMS);
    setDocumentStatus("");
    setGender("");
    setFieldRole("");
    setBirthYear("");
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
      description="Prova con un altro nome o cambia i filtri."
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
            <PillFilter label="Filtra per squadra" options={teamOptions} value={teamChoice} onChange={setTeamChoice} />
          ) : null}
          <div className="flex flex-col gap-3">
            <div>
              <Button
                variant="secondary"
                leftIcon={<SlidersHorizontal />}
                aria-expanded={moreOpen}
                aria-controls="members-more-filters"
                onClick={() => setMoreOpen((open) => !open)}
              >
                {extraFilters > 0 ? `Più filtri (${extraFilters})` : "Più filtri"}
              </Button>
            </div>
            {moreOpen ? (
              <div id="members-more-filters" className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <Select
                  label="Stato documenti"
                  placeholder="Tutti"
                  options={DOCUMENT_OPTIONS}
                  value={documentStatus}
                  onChange={(event) => setDocumentStatus(event.target.value as OverallDocumentStatus | "")}
                />
                <Select
                  label="Genere"
                  placeholder="Tutti"
                  options={GENDER_OPTIONS}
                  value={gender}
                  onChange={(event) => setGender(event.target.value as MemberGender | "")}
                />
                <Input
                  label="Ruolo in campo"
                  placeholder="Ad esempio Libero"
                  maxLength={40}
                  value={fieldRole}
                  onChange={(event) => setFieldRole(event.target.value)}
                />
                <Input
                  label="Anno di nascita"
                  inputMode="numeric"
                  placeholder="Ad esempio 2009"
                  maxLength={4}
                  value={birthYear}
                  onChange={(event) => setBirthYear(event.target.value.replace(/\D/g, ""))}
                />
              </div>
            ) : null}
          </div>
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
