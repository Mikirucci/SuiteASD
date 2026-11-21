"use client";

import { AlertTriangle, CalendarCheck, Check, Clock, FileX } from "lucide-react";
import { useMemo } from "react";
import { Alert } from "@/components/ui/alert";
import { DataBoundary } from "@/components/ui/data-boundary";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { SectionHeading } from "@/components/ui/section-heading";
import { Skeleton } from "@/components/ui/skeleton";
import { StatTile } from "@/components/ui/stat-tile";
import { useDocumentTypes } from "@/features/tesserati/api";
import { parseDateOnly } from "@/features/tesserati/document-format";
import { usePermission } from "@/hooks/use-permission";
import { describeError } from "@/lib/api";
import { pluralWord } from "@/lib/format";
import { useExpirations, useTypeReport } from "./api";
import { ExpirationList } from "./expiration-list";
import { TypeCard, type TypeCardStats } from "./type-card";
import type { ExpirationFilters, TypeReportEntry } from "./types";

const NO_FILTERS: ExpirationFilters = { teamId: "", documentTypeId: "" };
const monthFormat = new Intl.DateTimeFormat("it-IT", { month: "long", year: "numeric" });

function monthTitle(month: string): string {
  return monthFormat.format(parseDateOnly(`${month}-01`));
}

function PageSkeleton() {
  return (
    <div role="status" aria-busy="true" aria-label="Caricamento delle scadenze" className="flex flex-col gap-6">
      <Skeleton className="h-44 rounded-lg" />
      <Skeleton className="h-16 rounded-lg" />
      <Skeleton className="h-16 rounded-lg" />
    </div>
  );
}

const NOT_CONVOCABLE_NOTICE = (
  <Alert tone="info" title="Certificato scaduto, atleta non convocabile">
    Chi ha il certificato medico scaduto viene segnalato e non può essere convocato. Solo l&apos;amministratore può
    autorizzare un&apos;eccezione, che resta registrata.
  </Alert>
);

/** Documents of the society for staff: the totals, then one card per document type. */
function DocumentsOverview() {
  const types = useDocumentTypes();
  const report = useTypeReport();
  const entries = new Map((report.data?.data ?? []).map((entry) => [entry.documentTypeId, entry]));
  const total = (pick: (entry: TypeReportEntry) => number) => (report.data?.data ?? []).reduce((sum, entry) => sum + pick(entry), 0);
  const statsOf = (typeId: string): TypeCardStats => {
    if (report.isLoading) return { state: "loading" };
    if (report.error) return { state: "error" };
    return entries.get(typeId) ?? { validPeople: 0, expiringPeople: 0, expiredPeople: 0, missingPeople: 0 };
  };
  const documents = (count: number) => pluralWord(count, "documento", "documenti");

  return (
    <div className="flex flex-col gap-8">
      {report.data ? (
        <section aria-label="Rendiconto dei documenti" className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <StatTile label="In regola" tone="success" icon={Check} value={total((entry) => entry.validPeople)} unit={documents(total((entry) => entry.validPeople))} />
          <StatTile label="In scadenza" tone="warning" icon={Clock} value={total((entry) => entry.expiringPeople)} unit={documents(total((entry) => entry.expiringPeople))} />
          <StatTile label="Scaduti" tone="danger" icon={AlertTriangle} value={total((entry) => entry.expiredPeople)} unit={documents(total((entry) => entry.expiredPeople))} />
          <StatTile label="Mancanti" tone="danger" icon={FileX} value={total((entry) => entry.missingPeople)} unit={documents(total((entry) => entry.missingPeople))} />
        </section>
      ) : null}

      <section aria-labelledby="types-heading" className="flex flex-col gap-4">
        <h2 id="types-heading" className="text-lg font-bold tracking-title text-fg">
          Documenti
        </h2>
        {types.isLoading ? <PageSkeleton /> : null}
        {types.error ? <ErrorState title="Documenti non disponibili" message={describeError(types.error)} onRetry={() => void types.refetch()} /> : null}
        {types.data && types.data.data.length === 0 ? (
          <EmptyState icon={CalendarCheck} title="Nessun tipo di documento" description="I tipi di documento della società compaiono qui, ognuno con chi è in regola e chi no." />
        ) : null}
        {types.data && types.data.data.length > 0 ? (
          <ul aria-label="Documenti" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {types.data.data.map((type) => (
              <TypeCard key={type.id} type={type} stats={statsOf(type.id)} />
            ))}
          </ul>
        ) : null}
      </section>

      {NOT_CONVOCABLE_NOTICE}
    </div>
  );
}

/** Documents of the athlete (or of the children of a guardian): what is about to expire, month by month. */
function OwnExpirations() {
  const expirations = useExpirations(NO_FILTERS);
  const data = expirations.data;
  const upcoming = useMemo(() => data?.months.flatMap((month) => month.items) ?? [], [data]);
  const monthsWithItems = useMemo(() => data?.months.filter((month) => month.items.length > 0) ?? [], [data]);
  const overdue = data?.overdue ?? [];

  return (
    <DataBoundary
      isLoading={expirations.isPending}
      error={data ? null : expirations.error}
      onRetry={() => void expirations.refetch()}
      isEmpty={upcoming.length === 0 && overdue.length === 0}
      skeleton={<PageSkeleton />}
      empty={
        <EmptyState
          icon={CalendarCheck}
          title="Nessuna scadenza in vista"
          description="Quando un certificato o un documento sta per scadere, lo trovi qui."
        />
      }
    >
      <div className="flex flex-col gap-8">
        {NOT_CONVOCABLE_NOTICE}

        {overdue.length > 0 ? (
          <section aria-labelledby="scaduti" className="flex flex-col gap-3">
            <h2 id="scaduti" className="text-base font-bold tracking-title text-danger">
              Già scaduti <span className="font-semibold text-fg-muted">· {overdue.length}</span>
            </h2>
            <ExpirationList label="Documenti già scaduti" items={overdue} />
          </section>
        ) : null}

        {monthsWithItems.map((month) => (
          <section key={month.month} aria-labelledby={`mese-${month.month}`} className="flex flex-col gap-3">
            <h2 id={`mese-${month.month}`} className="text-base font-bold capitalize tracking-title text-fg">
              {monthTitle(month.month)} <span className="font-semibold text-fg-muted">· {month.items.length}</span>
            </h2>
            <ExpirationList label={`Scadenze di ${monthTitle(month.month)}`} items={month.items} />
          </section>
        ))}
      </div>
    </DataBoundary>
  );
}

/** Module 02: for staff the document types as cards (people inside), for athletes and guardians their own expiries. */
export function ExpirationsPage() {
  const canReadAll = usePermission("documents:read");
  return (
    <div className="flex flex-col gap-6">
      <SectionHeading
        as="h1"
        index={2}
        label="Certificati e scadenze"
        title="Scadenze sotto controllo. In automatico."
        highlight="In automatico."
        description={
          canReadAll
            ? "Un documento per volta: apri una card per vedere chi è in regola, chi sta per scadere e chi è in ritardo."
            : "Le scadenze dei tuoi documenti e di quelli dei tuoi figli."
        }
      />
      {canReadAll ? <DocumentsOverview /> : <OwnExpirations />}
    </div>
  );
}
