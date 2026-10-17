"use client";

import type { UseQueryResult } from "@tanstack/react-query";
import { CalendarClock, CalendarDays, Users, Wallet, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { useMemo, type ReactNode } from "react";
import { Card } from "@/components/ui";
import { useAuth } from "@/features/auth/auth-provider";
import { formatDayTitle, formatTime } from "@/features/calendario/format";
import { useExpirations } from "@/features/scadenze/api";
import type { ApiError } from "@/lib/api";
import { formatEuro, pluralize } from "@/lib/format";
import { BlockError, LinesSkeleton } from "./block-states";
import { UPCOMING_DAYS, useFeesSummary, useMembersSummary, useUpcomingEvents } from "./home-queries";
import { resolveServices, type ResolvedService, type ServiceId } from "./services";

const EXPIRING_WINDOW_DAYS = 30;

const SERVICE_ICONS: Record<ServiceId, LucideIcon> = {
  persone: Users,
  calendario: CalendarDays,
  quote: Wallet,
  documenti: CalendarClock,
};

/** The key number of a service, the one thing the row is read for, with a line of context under it. */
function Figure({ value, caption, note }: { value: string; caption: string; note?: string }) {
  return (
    <div className="flex flex-col gap-1">
      <p className="text-2xl font-extrabold tracking-title tabular-nums text-fg">{value}</p>
      <p className="text-sm font-semibold text-fg">{caption}</p>
      {note ? <p className="break-words text-sm text-fg-muted">{note}</p> : null}
    </div>
  );
}

/** Loading and error of one figure: the title and the quick links of the row stay usable either way. */
function FigureBoundary<T>({
  query,
  what,
  children,
}: {
  query: UseQueryResult<T, ApiError>;
  what: string;
  children: (data: T) => ReactNode;
}) {
  if (query.isLoading) return <LinesSkeleton label={`Caricamento di ${what}`} />;
  if (query.error) return <BlockError what={what} onRetry={() => void query.refetch()} />;
  return query.data === undefined ? null : <>{children(query.data)}</>;
}

function PeopleFigure() {
  const summary = useMembersSummary(true);
  return (
    <FigureBoundary query={summary} what="i tesserati">
      {(data) => (
        <Figure
          value={String(data.tesserati)}
          caption={data.tesserati === 1 ? "tesserato attivo" : "tesserati attivi"}
          note={`In ${pluralize(data.squadre, "squadra", "squadre")}.`}
        />
      )}
    </FigureBoundary>
  );
}

function CalendarFigure() {
  const events = useUpcomingEvents(true);
  return (
    <FigureBoundary query={events} what="il calendario">
      {(data) => {
        const next = data.data[0];
        const count = `${data.data.length}${data.page.hasMore ? "+" : ""}`;
        return (
          <Figure
            value={count}
            caption={`${data.data.length === 1 && !data.page.hasMore ? "evento" : "eventi"} nei prossimi ${UPCOMING_DAYS} giorni`}
            note={next ? `Il prossimo: ${next.title}, ${formatDayTitle(new Date(next.startsAt))} alle ${formatTime(next.startsAt)}.` : undefined}
          />
        );
      }}
    </FigureBoundary>
  );
}

function FeesFigure() {
  const summary = useFeesSummary(true);
  return (
    <FigureBoundary query={summary} what="le quote">
      {(data) => <Figure value={formatEuro(data.daIncassareCents)} caption="ancora da incassare" note={`${formatEuro(data.incassatoCents)} già incassati.`} />}
    </FigureBoundary>
  );
}

function daysLabel(days: number): string {
  if (days === 0) return "oggi";
  if (days === 1) return "domani";
  return `tra ${days} giorni`;
}

function DocumentsFigure() {
  const expirations = useExpirations({ teamId: "", documentTypeId: "" });
  const soon = useMemo(
    () =>
      (expirations.data?.months ?? [])
        .flatMap((month) => month.items)
        .filter((item) => item.daysRemaining >= 0 && item.daysRemaining <= EXPIRING_WINDOW_DAYS)
        .sort((a, b) => a.daysRemaining - b.daysRemaining),
    [expirations.data],
  );
  const first = soon[0];
  return (
    <FigureBoundary query={expirations} what="le scadenze">
      {() => (
        <Figure
          value={String(soon.length)}
          caption={`${soon.length === 1 ? "documento" : "documenti"} in scadenza entro ${EXPIRING_WINDOW_DAYS} giorni`}
          note={first ? `Il primo: ${first.documentType.name} di ${first.firstName} ${first.lastName}, ${daysLabel(first.daysRemaining)}.` : undefined}
        />
      )}
    </FigureBoundary>
  );
}

const FIGURES: Record<ServiceId, () => ReactNode> = {
  persone: () => <PeopleFigure />,
  calendario: () => <CalendarFigure />,
  quote: () => <FeesFigure />,
  documenti: () => <DocumentsFigure />,
};

function ServiceRow({ service }: { service: ResolvedService }) {
  const { definition, main, links } = service;
  const Icon = SERVICE_ICONS[definition.id];
  return (
    <li className="grid gap-6 px-4 py-6 sm:px-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)_minmax(0,1fr)] lg:items-center lg:gap-8">
      <div className="flex items-start gap-4">
        <span aria-hidden="true" className="flex size-12 shrink-0 items-center justify-center rounded-md bg-primary-soft text-primary-fg">
          <Icon className="size-6" />
        </span>
        <div className="flex min-w-0 flex-col gap-1">
          <h3 className="text-lg font-extrabold tracking-title text-fg">
            <Link href={main.href} className="rounded-xs hover:text-primary-fg">
              {definition.title}
            </Link>
          </h3>
          <p className="text-sm text-fg-muted">{definition.purpose}</p>
        </div>
      </div>
      <div className="min-w-0">{FIGURES[definition.id]()}</div>
      <ul aria-label={`Collegamenti rapidi: ${definition.title}`} className="flex flex-wrap gap-x-1 gap-y-1 lg:flex-col lg:items-start">
        {links.map((link) => (
          <li key={link.id}>
            <Link
              href={link.href}
              className="inline-flex min-h-11 items-center gap-2 rounded-md px-3 text-sm font-semibold text-primary-fg transition-colors duration-150 hover:bg-primary-soft"
            >
              <link.icon aria-hidden="true" className="size-4 shrink-0" />
              {link.label}
            </Link>
          </li>
        ))}
      </ul>
    </li>
  );
}

/** Level 2 of the home: the main services of the club, each with its key number and the way into its pages. */
export function ServicesSection() {
  const { me } = useAuth();
  const services = resolveServices(me?.permissions ?? []);
  if (services.length === 0) return null;
  return (
    <section aria-labelledby="home-services" className="flex flex-col gap-4">
      <h2 id="home-services" className="text-lg font-extrabold tracking-title text-fg">
        I tuoi servizi
      </h2>
      <Card padding="none">
        <ul className="divide-y divide-line">
          {services.map((service) => (
            <ServiceRow key={service.definition.id} service={service} />
          ))}
        </ul>
      </Card>
    </section>
  );
}
