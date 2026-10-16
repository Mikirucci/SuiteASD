"use client";

import { Bell, CalendarClock, CalendarDays, Trophy, Users, Wallet, Zap } from "lucide-react";
import { useMemo } from "react";
import { Chip, ProgressBar } from "@/components/ui";
import { EventTypeIcon } from "@/features/calendario/event-card";
import { EVENT_TYPE_LABELS, formatWhen } from "@/features/calendario/format";
import type { CalendarEvent } from "@/features/calendario/types";
import type { Standings } from "@/features/classifiche/types";
import { useCompetitionScope } from "@/features/classifiche/use-competition-scope";
import type { AutomationDashboard } from "@/features/automazioni/types";
import type { AppNotification } from "@/features/notifiche/types";
import { TYPE_INFO } from "@/features/notifiche/catalog";
import type { FeesSummary } from "@/features/quote/types";
import { ExpirationChip } from "@/features/scadenze/expiration-chip";
import { useExpirations } from "@/features/scadenze/api";
import type { ExpirationItem } from "@/features/scadenze/types";
import type { MemberSummary } from "@/features/tesserati/types";
import { useUnreadCount } from "@/hooks/use-unread-count";
import { useApiQuery } from "@/lib/api";
import { formatEuro, pluralize } from "@/lib/format";
import { Figure, PreviewCard } from "./preview-card";

const DAY_MS = 86_400_000;
const EXPIRING_WINDOW_DAYS = 30;
const SHOWN = 3;

export function MembersPreview() {
  const summary = useApiQuery<MemberSummary>(["members", "summary"], "/members/summary");
  const data = summary.data;
  return (
    <PreviewCard
      title="Tesserati"
      icon={Users}
      tone="blue"
      href="/tesserati"
      linkLabel="Apri i tesserati"
      isLoading={summary.isLoading}
      error={summary.error}
      onRetry={() => void summary.refetch()}
      loadingLabel="Caricamento dei tesserati"
    >
      {data ? (
        <dl className="grid grid-cols-3 gap-3">
          <Figure label="Tesserati" value={data.tesserati} />
          <Figure label="Squadre" value={data.squadre} />
          <Figure label="Doc. mancanti" value={data.documentiMancanti} tone={data.documentiMancanti > 0 ? "danger" : "success"} />
        </dl>
      ) : null}
    </PreviewCard>
  );
}

function ExpirationLine({ item }: { item: ExpirationItem }) {
  return (
    <li className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
      <p className="min-w-0 break-words text-sm text-fg">
        <span className="font-bold">
          {item.firstName} {item.lastName}
        </span>{" "}
        · {item.documentType.name}
      </p>
      <ExpirationChip item={item} />
    </li>
  );
}

export function ExpirationsPreview() {
  const expirations = useExpirations({ teamId: "", documentTypeId: "" });
  const { overdue, soon } = useMemo(() => {
    const all = (expirations.data?.months ?? []).flatMap((month) => month.items);
    return {
      overdue: expirations.data?.overdue ?? [],
      soon: all.filter((item) => item.daysRemaining >= 0 && item.daysRemaining <= EXPIRING_WINDOW_DAYS).sort((a, b) => a.daysRemaining - b.daysRemaining),
    };
  }, [expirations.data]);
  const urgent = [...[...overdue].sort((a, b) => a.daysRemaining - b.daysRemaining), ...soon].slice(0, SHOWN);
  return (
    <PreviewCard
      title="Scadenze"
      icon={CalendarClock}
      tone="orange"
      href="/scadenze"
      linkLabel="Apri le scadenze"
      isLoading={expirations.isLoading}
      error={expirations.error}
      onRetry={() => void expirations.refetch()}
      loadingLabel="Caricamento delle scadenze"
    >
      <div className="flex flex-col gap-4">
        <dl className="grid grid-cols-2 gap-3">
          <Figure label="Scaduti" value={overdue.length} tone={overdue.length > 0 ? "danger" : "success"} />
          <Figure label={`In scadenza (${EXPIRING_WINDOW_DAYS} giorni)`} value={soon.length} tone={soon.length > 0 ? "warning" : "success"} />
        </dl>
        {urgent.length === 0 ? (
          <p className="text-sm text-fg-muted">Nessun documento scade a breve.</p>
        ) : (
          <ul aria-label="Documenti più urgenti" className="flex flex-col gap-2">
            {urgent.map((item) => (
              <ExpirationLine key={item.documentId} item={item} />
            ))}
          </ul>
        )}
      </div>
    </PreviewCard>
  );
}

export function FeesPreview() {
  const summary = useApiQuery<FeesSummary>(["fees-summary", { teamId: "" }], "/fees/summary");
  const data = summary.data;
  return (
    <PreviewCard
      title="Quote"
      icon={Wallet}
      tone="emerald"
      href="/quote"
      linkLabel="Apri le quote"
      isLoading={summary.isLoading}
      error={summary.error}
      onRetry={() => void summary.refetch()}
      loadingLabel="Caricamento delle quote"
    >
      {data ? (
        <div className="flex flex-col gap-3">
          <dl className="grid grid-cols-3 gap-3">
            <Figure label="Incassato" value={formatEuro(data.incassatoCents)} tone="success" />
            <Figure label="Da incassare" value={formatEuro(data.daIncassareCents)} />
            <Figure label="Scaduto" value={formatEuro(data.scadutoCents)} tone={data.scadutoCents > 0 ? "danger" : "success"} />
          </dl>
          <p className="text-sm text-fg-muted">
            {data.overdueCount > 0 ? `${pluralize(data.overdueCount, "quota scaduta", "quote scadute")}. ` : ""}
            {pluralize(data.promemoriaInviati, "promemoria inviato", "promemoria inviati")} in automatico.
          </p>
        </div>
      ) : null}
    </PreviewCard>
  );
}

const UPCOMING_DAYS = 14;

export function EventsPreview() {
  const range = useMemo(() => {
    const from = new Date();
    return { from: from.toISOString(), to: new Date(from.getTime() + UPCOMING_DAYS * DAY_MS).toISOString() };
  }, []);
  const events = useApiQuery<{ data: CalendarEvent[] }>(["events", "home", range.from.slice(0, 13)], "/events", {
    query: { ...range, status: "SCHEDULED", limit: 4 },
  });
  const items = events.data?.data ?? [];
  return (
    <PreviewCard
      title="Calendario"
      icon={CalendarDays}
      tone="violet"
      href="/calendario"
      linkLabel="Apri il calendario"
      isLoading={events.isLoading}
      error={events.error}
      onRetry={() => void events.refetch()}
      loadingLabel="Caricamento del calendario"
    >
      {items.length === 0 ? (
        <p className="text-sm text-fg-muted">Nessun evento nei prossimi {UPCOMING_DAYS} giorni.</p>
      ) : (
        <ul aria-label="Prossimi eventi" className="flex flex-col gap-3">
          {items.map((event) => (
            <li key={event.id} className="flex items-start gap-3">
              <EventTypeIcon type={event.type} className="mt-0.5 text-primary-fg" />
              <div className="min-w-0">
                <p className="break-words text-sm font-bold text-fg">{event.title}</p>
                <p className="break-words text-sm text-fg-muted">
                  {EVENT_TYPE_LABELS[event.type]}
                  {event.team ? ` · ${event.team.name}` : ""} · {formatWhen(event)}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </PreviewCard>
  );
}

export function StandingsPreview() {
  const scope = useCompetitionScope();
  const { competition, group } = scope;
  const standings = useApiQuery<Standings>(
    ["standings", competition?.id ?? "", group?.id ?? ""],
    `/competitions/${competition?.id ?? ""}/groups/${group?.id ?? ""}/standings`,
    { enabled: Boolean(competition && group) },
  );
  const scopeLoading = scope.seasons.isLoading || scope.competitions.isLoading || scope.groups.isLoading;
  const error = scope.seasons.error ?? scope.competitions.error ?? scope.groups.error ?? standings.error;
  const rows = standings.data?.rows ?? [];
  // The top of the table, and our team too when it is further down
  const ours = rows.find((row) => row.isOurTeam);
  const top = rows.slice(0, SHOWN);
  const shown = ours && !top.includes(ours) ? [...top, ours] : top;
  return (
    <PreviewCard
      title="Classifica"
      icon={Trophy}
      tone="amber"
      href="/classifiche"
      linkLabel="Apri le classifiche"
      isLoading={scopeLoading || (Boolean(group) && standings.isLoading)}
      error={error}
      onRetry={() => {
        void scope.seasons.refetch();
        void standings.refetch();
      }}
      loadingLabel="Caricamento della classifica"
    >
      {shown.length === 0 ? (
        <p className="text-sm text-fg-muted">La classifica compare appena ci sono campionato, girone e risultati.</p>
      ) : (
        <div className="flex flex-col gap-2">
          {standings.data ? <p className="text-xs font-bold uppercase tracking-label text-fg-muted">{standings.data.groupName}</p> : null}
          <ol aria-label="Prime posizioni" className="flex flex-col gap-1">
            {shown.map((row) => (
              <li
                key={row.groupTeamId}
                className={`grid grid-cols-[2rem_minmax(0,1fr)_auto] items-center gap-2 rounded-md px-2 py-1.5 ${row.isOurTeam ? "bg-primary-soft" : ""}`}
              >
                <span className="text-sm font-bold tabular-nums text-fg-muted">{row.position}°</span>
                <span className="truncate text-sm font-semibold text-fg">{row.name}</span>
                <span className="text-sm font-extrabold tabular-nums text-fg">
                  {row.points}
                  <span className="sr-only"> punti</span>
                  <span aria-hidden="true"> pt</span>
                </span>
              </li>
            ))}
          </ol>
        </div>
      )}
    </PreviewCard>
  );
}

export function NotificationsPreview() {
  const unread = useUnreadCount({ enabled: true });
  const latest = useApiQuery<{ data: AppNotification[] }>(["notifications", "home"], "/notifications", { query: { limit: SHOWN } });
  const count = unread.data?.count ?? 0;
  const items = latest.data?.data ?? [];
  return (
    <PreviewCard
      title="Notifiche"
      icon={Bell}
      tone="cyan"
      href="/notifiche"
      linkLabel="Apri le notifiche"
      isLoading={latest.isLoading}
      error={latest.error}
      onRetry={() => void latest.refetch()}
      loadingLabel="Caricamento delle notifiche"
    >
      <div className="flex flex-col gap-3">
        <p>
          <Chip tone={count > 0 ? "brand" : "success"}>{count > 0 ? `${pluralize(count, "da leggere", "da leggere")}` : "Tutto letto"}</Chip>
        </p>
        {items.length === 0 ? (
          <p className="text-sm text-fg-muted">Qui compaiono pagamenti, scadenze e nuove iscrizioni.</p>
        ) : (
          <ul aria-label="Ultime notifiche" className="flex flex-col gap-2">
            {items.map((notification) => {
              const Icon = TYPE_INFO[notification.type].icon;
              return (
                <li key={notification.id} className="flex items-start gap-3">
                  <Icon aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-primary-fg" />
                  <div className="min-w-0">
                    <p className={`break-words text-sm text-fg ${notification.readAt === null ? "font-extrabold" : "font-semibold"}`}>{notification.title}</p>
                    <p className="break-words text-sm text-fg-muted">{notification.body}</p>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </PreviewCard>
  );
}

export function AutomationsPreview() {
  const automations = useApiQuery<AutomationDashboard>(["automations"], "/automations");
  const summary = automations.data?.summary;
  return (
    <PreviewCard
      title="Automazioni"
      icon={Zap}
      tone="indigo"
      href="/automazioni"
      linkLabel="Apri le automazioni"
      isLoading={automations.isLoading}
      error={automations.error}
      onRetry={() => void automations.refetch()}
      loadingLabel="Caricamento delle automazioni"
    >
      {summary ? (
        <div className="flex flex-col gap-3">
          <p className="text-2xl font-extrabold tracking-title text-fg">{summary.percentage}%</p>
          <ProgressBar
            label="Attività gestite dall'app"
            value={summary.active}
            max={Math.max(summary.total, 1)}
            tone="gradient"
            valueText={`${summary.active} su ${summary.total} attive`}
          />
          <p className="text-sm text-fg-muted">
            {summary.active} su {summary.total} attività gestite in automatico dall&apos;app.
          </p>
        </div>
      ) : null}
    </PreviewCard>
  );
}
