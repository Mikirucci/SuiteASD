"use client";

import { CalendarDays, ChevronRight, FileText, Wallet } from "lucide-react";
import Link from "next/link";
import { useQueries } from "@tanstack/react-query";
import { useMemo, type ReactNode } from "react";
import { Card, Chip, DataBoundary, EmptyState, SectionHeading } from "@/components/ui";
import { useAuth } from "@/features/auth/auth-provider";
import { PendingConvocations } from "@/features/calendario/pending-convocations";
import { EventTypeIcon } from "@/features/calendario/event-card";
import { EVENT_TYPE_LABELS, formatWhen } from "@/features/calendario/format";
import type { CalendarEvent } from "@/features/calendario/types";
import { useMember } from "@/features/tesserati/api";
import { DocumentSummary } from "@/features/tesserati/document-summary";
import type { MemberDetail } from "@/features/tesserati/types";
import { api, useApiQuery } from "@/lib/api";
import { formatEuro, pluralize } from "@/lib/format";
import { usePermission } from "@/hooks/use-permission";
import { useFeesToPay } from "./api";
import { usePersonalSubjects, type Subject } from "./subjects";

const UPCOMING_DAYS = 30;
const DAY_MS = 86_400_000;
const UPCOMING_SHOWN = 4;

function OverviewLine({ icon, label, href, hrefLabel, children }: { icon: ReactNode; label: string; href: string; hrefLabel: string; children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 py-3 first:pt-0 last:pb-0">
      <span aria-hidden="true" className="flex size-9 shrink-0 items-center justify-center rounded-md bg-primary-soft text-primary-fg [&_svg]:size-5">
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-bold uppercase tracking-label text-fg-muted">{label}</p>
        <div className="mt-1 flex flex-wrap items-center gap-2">{children}</div>
      </div>
      <Link
        href={href}
        className="inline-flex min-h-11 items-center gap-1 rounded-md px-2 text-sm font-semibold text-primary-fg hover:bg-primary-soft"
        aria-label={`${hrefLabel}: ${label.toLowerCase()}`}
      >
        {hrefLabel}
        <ChevronRight aria-hidden="true" className="size-4" />
      </Link>
    </div>
  );
}

/** What there is to do for one person: documents to hand in and fees to pay, each with its way in. */
function SubjectOverview({ subject, heading }: { subject: Subject; heading: boolean }) {
  const member = useMember(subject.memberId);
  const fees = useFeesToPay(subject.memberId);
  const due = (fees.data?.data ?? []).filter((fee) => fee.status === "PENDING" || fee.status === "OVERDUE");
  const overdue = due.filter((fee) => fee.status === "OVERDUE");
  const dueCents = due.reduce((sum, fee) => sum + fee.amountCents, 0);

  return (
    <Card className="flex flex-col gap-4" as="section" aria-label={heading ? `Riepilogo di ${subject.name}` : "Riepilogo"}>
      {heading ? <h2 className="text-base font-bold tracking-title text-fg">{subject.name}</h2> : null}
      <div className="divide-y divide-line">
        <OverviewLine icon={<FileText />} label="Documenti" href="/area-personale/documenti" hrefLabel="Apri">
          <DataBoundary
            isLoading={member.isLoading}
            error={member.error}
            onRetry={() => void member.refetch()}
            isEmpty={false}
            loadingLabel="Caricamento dei documenti"
            skeletonRows={1}
            empty={null}
          >
            {member.data ? <DocumentSummary indicators={member.data.documents} /> : null}
          </DataBoundary>
        </OverviewLine>
        <OverviewLine icon={<Wallet />} label="Pagamenti" href="/area-personale/pagamenti" hrefLabel="Apri">
          <DataBoundary
            isLoading={fees.isLoading}
            error={fees.error}
            onRetry={() => void fees.refetch()}
            isEmpty={false}
            loadingLabel="Caricamento dei pagamenti"
            skeletonRows={1}
            empty={null}
          >
            {due.length === 0 ? (
              <Chip tone="success">Tutto pagato</Chip>
            ) : (
              <>
                <Chip tone={overdue.length > 0 ? "danger" : "warning"}>
                  {pluralize(due.length, "quota da pagare", "quote da pagare")} · {formatEuro(dueCents)}
                </Chip>
                {overdue.length > 0 ? <Chip tone="danger">{pluralize(overdue.length, "scaduta", "scadute")}</Chip> : null}
              </>
            )}
          </DataBoundary>
        </OverviewLine>
      </div>
    </Card>
  );
}

function useUpcomingEvents() {
  const range = useMemo(() => {
    const from = new Date();
    return { from: from.toISOString(), to: new Date(from.getTime() + UPCOMING_DAYS * DAY_MS).toISOString() };
  }, []);
  return useApiQuery<{ data: CalendarEvent[] }>(["events", "upcoming", range.from.slice(0, 10)], "/events", {
    query: { ...range, status: "SCHEDULED", limit: 100 },
  });
}

/** The next appointments of the teams of the people the user looks after (events of no team count for everybody). */
function UpcomingEvents({ teamIds }: { teamIds: ReadonlySet<string> }) {
  const events = useUpcomingEvents();
  const mine = (events.data?.data ?? []).filter((event) => event.team === null || teamIds.has(event.team.id)).slice(0, UPCOMING_SHOWN);
  return (
    <section aria-labelledby="upcoming-title" className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <h2 id="upcoming-title" className="text-lg font-bold tracking-title text-fg">
          Prossimi appuntamenti
        </h2>
        <Link
          href="/area-personale/calendario"
          className="inline-flex min-h-11 items-center gap-1 rounded-md px-2 text-sm font-semibold text-primary-fg hover:bg-primary-soft"
        >
          Calendario
          <ChevronRight aria-hidden="true" className="size-4" />
        </Link>
      </div>
      <DataBoundary
        isLoading={events.isLoading}
        error={events.error}
        onRetry={() => void events.refetch()}
        isEmpty={mine.length === 0}
        loadingLabel="Caricamento degli appuntamenti"
        skeletonRows={2}
        empty={
          <EmptyState
            icon={CalendarDays}
            title="Nessun appuntamento nei prossimi giorni"
            description="Allenamenti e partite della tua squadra compariranno qui appena la società li pubblica."
          />
        }
      >
        <ul aria-label="Prossimi appuntamenti" className="flex flex-col gap-2">
          {mine.map((event) => (
            <li key={event.id} className="flex items-start gap-3 rounded-lg bg-surface p-4 shadow-soft">
              <EventTypeIcon type={event.type} className="mt-0.5 text-primary-fg" />
              <div className="min-w-0">
                <p className="break-words text-sm font-bold text-fg">{event.title}</p>
                <p className="break-words text-sm text-fg-muted">
                  {EVENT_TYPE_LABELS[event.type]}
                  {event.team ? ` · ${event.team.name}` : ""}
                </p>
                <p className="break-words text-sm text-fg-muted">{formatWhen(event)}</p>
              </div>
            </li>
          ))}
        </ul>
      </DataBoundary>
    </section>
  );
}

/** Home of the personal area: first what needs an answer or a document, then what is coming up. */
export function PersonalHome() {
  const { me } = useAuth();
  const subjects = usePersonalSubjects();
  const canRespond = usePermission("convocations:respond");
  const teamIds = useTeamIds(subjects);
  if (!me) return null;

  return (
    <div className="flex flex-col gap-8">
      <SectionHeading
        as="h1"
        label={me.society.name}
        title={`Ciao ${me.user.firstName}, ecco la tua area.`}
        highlight="la tua area."
        description="Quello che devi fare, in ordine: risposte, documenti e pagamenti. Il resto lo fa l'app."
      />
      {canRespond ? <PendingConvocations /> : null}
      {subjects.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="Nessun tesserato collegato al tuo account"
          description="Chiedi alla segreteria della società di collegare il tuo profilo, oppure iscriviti con il link che ti hanno dato."
        />
      ) : (
        <div className="flex flex-col gap-3">
          {subjects.map((subject) => (
            <SubjectOverview key={subject.memberId} subject={subject} heading={subjects.length > 1} />
          ))}
        </div>
      )}
      <UpcomingEvents teamIds={teamIds} />
    </div>
  );
}

/** Teams of all the people the user looks after, read from their member records (same cache as the overviews). */
function useTeamIds(subjects: readonly Subject[]): ReadonlySet<string> {
  const members = useQueries({
    queries: subjects.map((subject) => ({
      queryKey: ["members", "detail", subject.memberId],
      queryFn: ({ signal }: { signal: AbortSignal }) => api.get<MemberDetail>(`/members/${subject.memberId}`, { signal }),
    })),
  });
  return useMemo(
    () => new Set(members.flatMap((query) => query.data?.teams ?? []).map((team) => team.id)),
    [members],
  );
}
