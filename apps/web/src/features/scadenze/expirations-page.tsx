"use client";

import { CalendarCheck } from "lucide-react";
import { useMemo, useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Card } from "@/components/ui/card";
import { DataBoundary } from "@/components/ui/data-boundary";
import { EmptyState } from "@/components/ui/empty-state";
import { PillFilter } from "@/components/ui/pill-filter";
import { SectionHeading } from "@/components/ui/section-heading";
import { Select } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Timeline, type TimelineItem } from "@/components/ui/timeline";
import { useDocumentTypes, useTeams } from "@/features/tesserati/api";
import { parseDateOnly, teamLabel } from "@/features/tesserati/document-format";
import { usePermission } from "@/hooks/use-permission";
import { TIMELINE_MONTHS, useExpirations } from "./api";
import { ExpirationDetail } from "./expiration-detail";
import { ExpirationList } from "./expiration-list";
import type { ExpirationItem } from "./types";

const ALL = "";
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

/** Module 02: expiry timeline, detail of the selected document and the lists of documents to renew. */
export function ExpirationsPage() {
  const canReadAll = usePermission("documents:read");
  const [teamId, setTeamId] = useState(ALL);
  const [documentTypeId, setDocumentTypeId] = useState(ALL);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const filters = useMemo(() => ({ teamId, documentTypeId }), [teamId, documentTypeId]);

  const expirations = useExpirations(filters);
  const teams = useTeams();
  const types = useDocumentTypes();

  const data = expirations.data;
  const upcoming = useMemo(() => data?.months.flatMap((month) => month.items) ?? [], [data]);
  const monthsWithItems = useMemo(() => data?.months.filter((month) => month.items.length > 0) ?? [], [data]);
  const overdue = data?.overdue ?? [];
  const timelineItems = useMemo<TimelineItem[]>(
    () =>
      upcoming.map((item) => ({ id: item.documentId, name: fullNameOf(item), date: parseDateOnly(item.expiresAt) })),
    [upcoming],
  );
  const selected = upcoming.find((item) => item.documentId === selectedId) ?? defaultSelection(upcoming);
  const hasFilters = teamId !== ALL || documentTypeId !== ALL;

  const teamOptions = [
    { value: ALL, label: "Tutte" },
    ...(teams.data?.data ?? []).map((team) => ({ value: team.id, label: teamLabel(team) })),
  ];
  const typeOptions = (types.data?.data ?? [])
    .filter((type) => type.requiresExpiry)
    .map((type) => ({ value: type.id, label: type.name }));

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
            ? "Certificati medici e documenti dei prossimi sei mesi, mese per mese."
            : "Le scadenze dei tuoi documenti e di quelli dei tuoi figli."
        }
      />

      {canReadAll ? (
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          {teams.data && teams.data.data.length > 0 ? (
            <PillFilter
              label="Filtra per squadra"
              options={teamOptions}
              value={teamId}
              onChange={setTeamId}
              className="md:flex-1"
            />
          ) : null}
          {typeOptions.length > 1 ? (
            <Select
              label="Tipo di documento"
              placeholder="Tutti i documenti"
              options={typeOptions}
              value={documentTypeId}
              onChange={(event) => setDocumentTypeId(event.target.value)}
              className="md:w-64"
            />
          ) : null}
        </div>
      ) : null}

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
            description={
              hasFilters
                ? "Nessun documento in scadenza per i filtri scelti nei prossimi sei mesi."
                : "Quando un certificato o un documento sta per scadere, lo trovi qui."
            }
          />
        }
      >
        <div className="flex flex-col gap-8">
          {data && upcoming.length > 0 ? (
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

          <Alert tone="info" title="Certificato scaduto, atleta non convocabile">
            Chi ha il certificato medico scaduto viene segnalato e non può essere convocato. Solo l&apos;amministratore
            può autorizzare un&apos;eccezione, che resta registrata.
          </Alert>

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
    </div>
  );
}
