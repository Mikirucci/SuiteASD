"use client";

import { AlertTriangle, ArrowLeft, Check, Clock, FileX, Search } from "lucide-react";
import Link from "next/link";
import { useRef, useState } from "react";
import { Button, EmptyState, ErrorState, Input, Pagination, PillFilter, SectionHeading, Select, Skeleton, StatTile, type PillOption } from "@/components/ui";
import { useDocumentTypes, useTeams } from "@/features/tesserati/api";
import { teamLabel } from "@/features/tesserati/document-format";
import type { DocumentStatus, DocumentType } from "@/features/tesserati/types";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { ApiError, describeError } from "@/lib/api";
import { pluralWord } from "@/lib/format";
import { PEOPLE_PAGE_SIZE, useTypePeople } from "./api";
import { TypePersonCard } from "./type-person-card";
import type { TypePeopleFilters, TypeStats } from "./types";

const STATUS_VALUES: readonly DocumentStatus[] = ["OK", "EXPIRING", "EXPIRED", "MISSING"];

const ALL_STATUSES: PillOption = { value: "", label: "Tutti" };

function statusOptions(requiresExpiry: boolean): readonly PillOption[] {
  return requiresExpiry
    ? [ALL_STATUSES, { value: "OK", label: "In regola" }, { value: "EXPIRING", label: "In scadenza" }, { value: "EXPIRED", label: "Scaduto" }, { value: "MISSING", label: "Mancante" }]
    : [ALL_STATUSES, { value: "OK", label: "In regola" }, { value: "MISSING", label: "Mancante" }];
}

function isStatus(value: string): value is DocumentStatus {
  return STATUS_VALUES.some((status) => status === value);
}

function isNotFound(error: unknown): boolean {
  return error instanceof ApiError && error.status === 404;
}

function BackLink() {
  return (
    <Link
      href="/scadenze"
      className="touch-target -ml-2 inline-flex w-fit items-center gap-2 rounded-md px-2 text-sm font-semibold text-fg-muted transition-colors hover:text-fg"
    >
      <ArrowLeft aria-hidden="true" className="size-4" />
      Tutte le scadenze
    </Link>
  );
}

function DetailSkeleton() {
  return (
    <div role="status" aria-busy="true" aria-label="Caricamento del documento" className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-8 w-1/2" />
      </div>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[0, 1, 2, 3].map((index) => (
          <Skeleton key={index} className="h-28 rounded-lg" />
        ))}
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {[0, 1, 2].map((index) => (
          <Skeleton key={index} className="h-28 rounded-lg" />
        ))}
      </div>
    </div>
  );
}

/** How the people of the type stand: the four states side by side, expiry ones only for types that expire. */
function TypeReport({ stats, requiresExpiry }: { stats: TypeStats; requiresExpiry: boolean }) {
  const people = (count: number) => pluralWord(count, "persona", "persone");
  return (
    <section aria-label="Rendiconto del documento" className={requiresExpiry ? "grid grid-cols-2 gap-4 lg:grid-cols-4" : "grid grid-cols-2 gap-4"}>
      <StatTile label="In regola" tone="success" icon={Check} value={stats.validPeople} unit={people(stats.validPeople)} />
      {requiresExpiry ? (
        <StatTile label="In scadenza" tone="warning" icon={Clock} value={stats.expiringPeople} unit={people(stats.expiringPeople)} />
      ) : null}
      {requiresExpiry ? (
        <StatTile label="Scaduti" tone="danger" icon={AlertTriangle} value={stats.expiredPeople} unit={people(stats.expiredPeople)} />
      ) : null}
      <StatTile label="Mancanti" tone="danger" icon={FileX} value={stats.missingPeople} unit={people(stats.missingPeople)} />
    </section>
  );
}

function TypePeopleSection({ type }: { type: DocumentType }) {
  const [search, setSearch] = useState("");
  const [teamId, setTeamId] = useState("");
  const [status, setStatus] = useState<DocumentStatus | "">("");
  const [page, setPage] = useState(1);
  const listTop = useRef<HTMLElement>(null);
  const q = useDebouncedValue(search.trim());
  const filters: TypePeopleFilters = { q, teamId, status, page };
  const people = useTypePeople(type.id, filters);
  const teams = useTeams();

  const hasFilters = search.trim() !== "" || teamId !== "" || status !== "";
  // Any change of the search or of a filter starts again from the first page
  const resetFilters = () => {
    setSearch("");
    setTeamId("");
    setStatus("");
    setPage(1);
  };
  const goToPage = (next: number) => {
    setPage(next);
    listTop.current?.scrollIntoView?.({ block: "start" });
  };
  const teamOptions = [{ value: "", label: "Tutte le squadre" }, ...(teams.data?.data ?? []).map((team) => ({ value: team.id, label: teamLabel(team) }))];

  if (people.isLoading) return <DetailSkeleton />;
  if (people.error || !people.data) {
    return (
      <ErrorState
        title={isNotFound(people.error) ? "Documento non trovato" : "Documento non disponibile"}
        message={describeError(people.error)}
        onRetry={isNotFound(people.error) ? undefined : () => void people.refetch()}
      />
    );
  }

  const { stats, people: list, pagination } = people.data;
  const nobody = stats.validPeople + stats.expiringPeople + stats.expiredPeople + stats.missingPeople === 0;
  const description = [type.requiresExpiry ? "Con scadenza" : "Senza scadenza", type.isRequired ? "richiesto a tutti i tesserati" : "facoltativo"].join(", ");

  return (
    <>
      <SectionHeading as="h1" label="Documento" title={type.name} description={`${description}.`} />
      <TypeReport stats={stats} requiresExpiry={type.requiresExpiry} />

      <section ref={listTop} aria-labelledby="people-heading" className="flex scroll-mt-4 flex-col gap-4">
        <h2 id="people-heading" className="text-lg font-bold tracking-title text-fg">
          Persone
        </h2>
        {nobody && !hasFilters ? (
          <EmptyState icon={FileX} title="Nessuno per questo documento" description="Quando un tesserato consegna questo documento compare qui con la sua scadenza." />
        ) : (
          <>
            <div className="flex flex-col gap-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <Input
                  label="Cerca un tesserato"
                  type="search"
                  leadingIcon={<Search />}
                  placeholder="Nome o cognome"
                  autoComplete="off"
                  value={search}
                  onChange={(event) => {
                    setSearch(event.target.value);
                    setPage(1);
                  }}
                />
                <Select
                  label="Squadra"
                  options={teamOptions}
                  value={teamId}
                  onChange={(event) => {
                    setTeamId(event.target.value);
                    setPage(1);
                  }}
                />
              </div>
              <PillFilter
                label="Filtra per situazione"
                options={statusOptions(type.requiresExpiry)}
                value={status}
                onChange={(value) => {
                  setStatus(isStatus(value) ? value : "");
                  setPage(1);
                }}
              />
            </div>
            {list.length === 0 && pagination.total === 0 ? (
              <EmptyState
                icon={Search}
                title="Nessuno con questi filtri"
                description="Prova con un'altra situazione o un'altra squadra, oppure togli la ricerca."
                action={
                  <Button variant="secondary" onClick={resetFilters}>
                    Azzera i filtri
                  </Button>
                }
              />
            ) : (
              <>
                <ul aria-label="Persone del documento" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                  {list.map((person) => (
                    <TypePersonCard key={person.memberId} person={person} />
                  ))}
                </ul>
                <Pagination
                  label="Pagine delle persone"
                  page={pagination.page}
                  totalPages={pagination.totalPages}
                  total={pagination.total}
                  pageSize={PEOPLE_PAGE_SIZE}
                  onPageChange={goToPage}
                />
              </>
            )}
          </>
        )}
      </section>
    </>
  );
}

/** One document type: the report of its people and the people themselves, with search and filters that only apply here. */
export function TypeDetailPage({ id }: { id: string }) {
  const types = useDocumentTypes();
  const type = types.data?.data.find((candidate) => candidate.id === id);
  return (
    <div className="flex flex-col gap-6">
      <BackLink />
      {types.isLoading ? <DetailSkeleton /> : null}
      {types.error ? <ErrorState title="Documento non disponibile" message={describeError(types.error)} onRetry={() => void types.refetch()} /> : null}
      {types.data && !type ? <ErrorState title="Documento non trovato" message="Potrebbe essere stato eliminato." /> : null}
      {type ? <TypePeopleSection type={type} /> : null}
    </div>
  );
}
