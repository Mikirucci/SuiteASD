"use client";

import { AlertTriangle, CalendarCheck, Check, Clock, FileX } from "lucide-react";
import { useMemo, useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Card } from "@/components/ui/card";
import { DataBoundary } from "@/components/ui/data-boundary";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { SectionHeading } from "@/components/ui/section-heading";
import { Skeleton } from "@/components/ui/skeleton";
import { StatTile } from "@/components/ui/stat-tile";
import { Timeline, type TimelineItem } from "@/components/ui/timeline";
import { useDocumentTypes } from "@/features/tesserati/api";
import { parseDateOnly } from "@/features/tesserati/document-format";
import { usePermission } from "@/hooks/use-permission";
import { describeError } from "@/lib/api";
import { pluralize } from "@/lib/format";
import { TIMELINE_MONTHS, useExpirations, useTypeReport } from "./api";
import { ExpirationDetail } from "./expiration-detail";
import { ExpirationList } from "./expiration-list";
import { TypeCard, type TypeCardStats } from "./type-card";
import type { ExpirationFilters, ExpirationItem, TypeReportEntry } from "./types";

const NO_FILTERS: ExpirationFilters = { teamId: "", documentTypeId: "" };
const monthFormat = new Intl.DateTimeFormat("it-IT", { month: "long", year: "numeric" });

function monthTitle(month: string): string {
  return monthFormat.format(parseDateOnly(`${month}-01`));
}

function fullNameOf(item: ExpirationItem): string {
  return `${item.firstName} ${item.lastName}`;
}

/** The nearest expiry still to come, or the first one: what the detail card shows before any choice. */
function defaultSelection(items: readonly ExpirationItem[]): ExpirationItem | undefined {
  const upcoming = items.filter((item) => item.daysRemaining >= 0);
  const pool = upcoming.length > 0 ? upcoming : items;
  return pool.reduce<ExpirationItem | undefined>(
    (best, item) => (!best || item.daysRemaining < best.daysRemaining ? item : best),
    undefined,
  );
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

/** The next expiries on the timeline with the card of the selected one: compact, whatever the number of documents. */
function UpcomingTimeline() {
  const expirations = useExpirations(NO_FILTERS);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const data = expirations.data;
  const upcoming = useMemo(() => data?.months.flatMap((month) => month.items) ?? [], [data]);
  const timelineItems = useMemo<TimelineItem[]>(
    () => upcoming.map((item) => ({ id: item.documentId, name: fullNameOf(item), date: parseDateOnly(item.expiresAt) })),
    [upcoming],
  );
  const selected = upcoming.find((item) => item.documentId === selectedId) ?? defaultSelection(upcoming);
  // Nothing about to expire: the cards above already say everything, so the timeline stays out of the way
  if (data && upcoming.length === 0) return null;
  return (
    <section aria-labelledby="timeline-heading" className="flex flex-col gap-4">
      <h2 id="timeline-heading" className="text-lg font-bold tracking-title text-fg">
        Prossime scadenze
      </h2>
      {expirations.isPending ? (
        <Skeleton role="status" aria-busy="true" aria-label="Caricamento delle prossime scadenze" className="h-44 rounded-lg" />
      ) : null}
      {!data && expirations.error ? (
        <ErrorState title="Scadenze non disponibili" message={describeError(expirations.error)} onRetry={() => void expirations.refetch()} />
      ) : null}
      {data ? (
        <Card className="flex flex-col gap-6">
          <Timeline
            start={parseDateOnly(data.from)}
            months={TIMELINE_MONTHS}
            items={timelineItems}
            selectedId={selected?.documentId}
            onSelect={setSelectedId}
            label="Scadenze dei documenti nei prossimi mesi"
          />
          {selected ? <ExpirationDetail item={selected} /> : null}
        </Card>
      ) : null}
    </section>
  );
}

/** Documents of the society for staff: the totals, one card per document type, then the timeline of what expires next. */
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
  const documents = (count: number) => pluralize(count, "documento", "documenti");

  return (
    <div className="flex flex-col gap-8">
      {report.data ? (
        <section aria-label="Rendiconto dei documenti" className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <StatTile label="In regola" tone="success" icon={Check} value={total((entry) => entry.validPeople)} note={documents(total((entry) => entry.validPeople))} />
          <StatTile label="In scadenza" tone="warning" icon={Clock} value={total((entry) => entry.expiringPeople)} note={documents(total((entry) => entry.expiringPeople))} />
          <StatTile label="Scaduti" tone="danger" icon={AlertTriangle} value={total((entry) => entry.expiredPeople)} note={documents(total((entry) => entry.expiredPeople))} />
          <StatTile label="Mancanti" tone="danger" icon={FileX} value={total((entry) => entry.missingPeople)} note={documents(total((entry) => entry.missingPeople))} />
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
      <UpcomingTimeline />
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
