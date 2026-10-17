"use client";

import { useQueries } from "@tanstack/react-query";
import { Ban, CalendarDays, Check, ChevronRight, Clock, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Chip, DataTable, EmptyState, ErrorState, type DataTableColumn } from "@/components/ui";
import { EventStatusChip } from "@/features/calendario/event-card";
import { EVENT_TYPE_LABELS, formatWeekdayTime } from "@/features/calendario/format";
import type { MemberDetail } from "@/features/tesserati/types";
import { api, describeError } from "@/lib/api";
import { cn } from "@/lib/cn";
import { useHomeEvents, useMyUpcomingConvocations } from "./api";
import { AppointmentDialog } from "./personal-home-appointment-dialog";
import {
  answerState,
  buildAppointmentRows,
  homeWindow,
  splitByWeek,
  type AnswerState,
  type AppointmentRow,
  type SubjectProfile,
} from "./personal-home-model";
import type { Subject } from "./subjects";

const WEEK_LABEL = "Appuntamenti di questa settimana";
const LATER_LABEL = "Appuntamenti dopo questa settimana";
const LOADING_LABEL = "Caricamento degli appuntamenti";

/** Teams and certificate of every person the user looks after, from the same member records the squares read. */
function useSubjectProfiles(subjects: readonly Subject[]): { profiles: SubjectProfile[]; isLoading: boolean } {
  const members = useQueries({
    queries: subjects.map((subject) => ({
      queryKey: ["members", "detail", subject.memberId],
      queryFn: ({ signal }: { signal: AbortSignal }) => api.get<MemberDetail>(`/members/${subject.memberId}`, { signal }),
    })),
  });
  return {
    isLoading: members.some((query) => query.isLoading),
    profiles: subjects.map((subject, index) => {
      const detail = members[index]?.data;
      return {
        subject,
        teamIds: new Set((detail?.teams ?? []).map((team) => team.id)),
        certificateExpired: (detail?.documents ?? []).some((indicator) => indicator.key === "MEDICAL_CERTIFICATE" && indicator.status === "EXPIRED"),
      };
    }),
  };
}

function AnswerChip({ state }: { state: AnswerState }) {
  switch (state) {
    case "confirmed":
      return (
        <Chip tone="success" icon={<Check strokeWidth={3} />}>
          Confermato
        </Chip>
      );
    case "declined":
      return (
        <Chip tone="danger" icon={<X strokeWidth={3} />}>
          Rifiutato
        </Chip>
      );
    case "pending":
      return (
        <Chip tone="warning" icon={<Clock />}>
          Da rispondere
        </Chip>
      );
    case "missed":
      return (
        <Chip tone="neutral" icon={<Clock />}>
          Senza risposta
        </Chip>
      );
    case "cancelled":
      return (
        <Chip tone="danger" icon={<Ban />}>
          Annullato
        </Chip>
      );
    case "not-convocable":
      return <span className="text-sm text-fg-muted">Non sei convocabile: controlla i documenti</span>;
    case "none":
      return <span className="text-sm text-fg-muted">Nessuna convocazione</span>;
    case "not-needed":
      return <span className="text-sm text-fg-muted">Nessuna risposta richiesta</span>;
  }
}

function buildColumns(showPerson: boolean, now: Date): DataTableColumn<AppointmentRow>[] {
  const columns: DataTableColumn<AppointmentRow>[] = [
    { key: "when", header: "Giorno e ora", cell: (row) => formatWeekdayTime(row.event.startsAt) },
    {
      key: "event",
      header: "Evento",
      cell: (row) => (
        <>
          {/* The row opens on click for the pointer; this button is the way in for the keyboard and screen readers */}
          <button
            type="button"
            data-appointment-key={row.key}
            aria-label={showPerson && row.subject ? `${row.event.title}: ${row.subject.name}` : undefined}
            className={cn("break-words rounded-sm py-1 text-left font-bold text-fg underline-offset-2 hover:underline", row.event.status === "CANCELLED" && "line-through")}
          >
            {row.event.title}
          </button>
          <span className="block break-words text-fg-muted">
            {[EVENT_TYPE_LABELS[row.event.type], row.event.team?.name].filter(Boolean).join(" · ")}
          </span>
          {row.event.status === "POSTPONED" ? <EventStatusChip status="POSTPONED" /> : null}
        </>
      ),
    },
    {
      key: "venue",
      header: "Luogo",
      cell: (row) =>
        row.event.venue ? (
          <span className="break-words">{row.event.venue.name}</span>
        ) : (
          <span className="text-fg-muted">Non indicato</span>
        ),
    },
  ];
  if (showPerson) {
    columns.push({ key: "person", header: "Atleta", cell: (row) => <span className="break-words">{row.subject?.name ?? "Tutti"}</span> });
  }
  columns.push({ key: "answer", header: "La tua risposta", cell: (row) => <AnswerChip state={answerState(row, now)} /> });
  return columns;
}

interface AppointmentsSectionProps {
  id: string;
  title: string;
  label: string;
  rows: readonly AppointmentRow[];
  isLoading: boolean;
  showPerson: boolean;
  emptyTitle: string;
  emptyDescription: string;
  onOpen: (row: AppointmentRow) => void;
  action?: ReactNode;
}

function AppointmentsSection({ id, title, label, rows, isLoading, showPerson, emptyTitle, emptyDescription, onOpen, action }: AppointmentsSectionProps) {
  const columns = buildColumns(showPerson, new Date());
  return (
    <section aria-labelledby={id} className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <h2 id={id} className="text-lg font-bold tracking-title text-fg">
          {title}
        </h2>
        {action}
      </div>
      <DataTable
        rows={rows}
        columns={columns}
        getKey={(row) => row.key}
        label={label}
        isLoading={isLoading}
        loadingLabel={LOADING_LABEL}
        skeletonRows={2}
        onRowClick={onOpen}
        empty={<EmptyState as="h3" icon={CalendarDays} title={emptyTitle} description={emptyDescription} />}
      />
    </section>
  );
}

/**
 * The appointments of the people the user looks after: this week, then the first few after it. A row opens the event,
 * where the answer is given or changed until it starts.
 */
export function PersonalAppointments({ subjects, canRespond }: { subjects: readonly Subject[]; canRespond: boolean }) {
  const window = useMemo(() => homeWindow(new Date()), []);
  const events = useHomeEvents(window);
  const convocations = useMyUpcomingConvocations(canRespond);
  const { profiles, isLoading: profilesLoading } = useSubjectProfiles(subjects);
  const [openKey, setOpenKey] = useState<string | null>(null);
  const lastOpenedKey = useRef<string | null>(null);

  // The dialog has no trigger element, so on close the focus would fall to the page: put it back on the event that was open
  useEffect(() => {
    if (openKey !== null) {
      lastOpenedKey.current = openKey;
      return;
    }
    const key = lastOpenedKey.current;
    lastOpenedKey.current = null;
    if (key !== null) document.querySelector<HTMLButtonElement>(`button[data-appointment-key="${key}"]`)?.focus();
  }, [openKey]);

  const rows = buildAppointmentRows(events.data ?? [], convocations.data ?? [], profiles);
  const { thisWeek, afterWeek } = splitByWeek(rows, window);
  const openRow = rows.find((row) => row.key === openKey) ?? null;
  const isLoading = events.isLoading || convocations.isLoading || profilesLoading;
  const error = events.error ?? convocations.error;
  const showPerson = subjects.length > 1;

  if (error) {
    return (
      <section aria-labelledby="appointments-error" className="flex flex-col gap-3">
        <h2 id="appointments-error" className="text-lg font-bold tracking-title text-fg">
          Appuntamenti
        </h2>
        <ErrorState
          message={describeError(error)}
          onRetry={() => {
            void events.refetch();
            void convocations.refetch();
          }}
        />
      </section>
    );
  }

  return (
    <>
      <div className="flex flex-col gap-8">
        <AppointmentsSection
          id="week-title"
          title="Questa settimana"
          label={WEEK_LABEL}
          rows={thisWeek}
          isLoading={isLoading}
          showPerson={showPerson}
          emptyTitle="Nessun appuntamento questa settimana"
          emptyDescription="Allenamenti e partite della tua squadra compariranno qui appena la società li pubblica."
          onOpen={(row) => setOpenKey(row.key)}
          action={
            <Link
              href="/area-personale/calendario"
              className="inline-flex min-h-11 items-center gap-1 rounded-md px-2 text-sm font-semibold text-primary-fg hover:bg-primary-soft"
            >
              Calendario
              <ChevronRight aria-hidden="true" className="size-4" />
            </Link>
          }
        />
        <AppointmentsSection
          id="later-title"
          title="Dopo questa settimana"
          label={LATER_LABEL}
          rows={afterWeek}
          isLoading={isLoading}
          showPerson={showPerson}
          emptyTitle="Nessun appuntamento nelle prossime settimane"
          emptyDescription="Quando la società ne pubblica di nuovi, i primi compaiono qui."
          onOpen={(row) => setOpenKey(row.key)}
        />
      </div>
      <AppointmentDialog row={openRow} onClose={() => setOpenKey(null)} />
    </>
  );
}
