"use client";

import { ChevronRight } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { Chip, ProgressBar } from "@/components/ui";
import { useAuth } from "@/features/auth/auth-provider";
import type { AutomationDashboard } from "@/features/automazioni/types";
import type { Standings } from "@/features/classifiche/types";
import { useCompetitionScope } from "@/features/classifiche/use-competition-scope";
import { TYPE_INFO } from "@/features/notifiche/catalog";
import type { AppNotification } from "@/features/notifiche/types";
import { useUnreadCount } from "@/hooks/use-unread-count";
import { useApiQuery } from "@/lib/api";
import { pluralize } from "@/lib/format";
import { BlockError, LinesSkeleton } from "./block-states";
import { useHomeAccess } from "./home-queries";
import { resolveOtherSections, type OtherSection } from "./services";

const SHOWN = 3;

function QuietBlock({ title, href, linkLabel, children }: { title: string; href: string; linkLabel: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-3 border-t border-line pt-6">
      <h3 className="text-base font-bold tracking-title text-fg">{title}</h3>
      <div className="flex flex-1 flex-col gap-3">{children}</div>
      <Link
        href={href}
        className="inline-flex min-h-11 w-fit items-center gap-1 rounded-md text-sm font-semibold text-primary-fg hover:underline"
      >
        {linkLabel}
        <ChevronRight aria-hidden="true" className="size-4" />
      </Link>
    </div>
  );
}

function StandingsBlock() {
  const scope = useCompetitionScope();
  const { competition, group } = scope;
  const standings = useApiQuery<Standings>(
    ["standings", competition?.id ?? "", group?.id ?? ""],
    `/competitions/${competition?.id ?? ""}/groups/${group?.id ?? ""}/standings`,
    { enabled: Boolean(competition && group) },
  );
  const loading = scope.seasons.isLoading || scope.competitions.isLoading || scope.groups.isLoading || (Boolean(group) && standings.isLoading);
  const error = scope.seasons.error ?? scope.competitions.error ?? scope.groups.error ?? standings.error;
  const rows = standings.data?.rows ?? [];
  // The top of the table, and our team too when it is further down
  const ours = rows.find((row) => row.isOurTeam);
  const top = rows.slice(0, SHOWN);
  const shown = ours && !top.includes(ours) ? [...top, ours] : top;
  const retry = () => {
    void scope.seasons.refetch();
    void standings.refetch();
  };
  return (
    <QuietBlock title="Classifica" href="/classifiche" linkLabel="Apri le classifiche">
      {loading ? (
        <LinesSkeleton label="Caricamento della classifica" lines={3} />
      ) : error ? (
        <BlockError what="la classifica" onRetry={retry} />
      ) : shown.length === 0 ? (
        <p className="text-sm text-fg-muted">La classifica compare appena ci sono campionato, girone e risultati.</p>
      ) : (
        <>
          {standings.data ? <p className="text-sm text-fg-muted">{standings.data.groupName}</p> : null}
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
        </>
      )}
    </QuietBlock>
  );
}

function NotificationsBlock() {
  const unread = useUnreadCount({ enabled: true });
  const latest = useApiQuery<{ data: AppNotification[] }>(["notifications", "home"], "/notifications", { query: { limit: SHOWN } });
  const count = unread.data?.count ?? 0;
  const items = latest.data?.data ?? [];
  return (
    <QuietBlock title="Notifiche" href="/notifiche" linkLabel="Apri le notifiche">
      {latest.isLoading ? (
        <LinesSkeleton label="Caricamento delle notifiche" lines={3} />
      ) : latest.error ? (
        <BlockError what="le notifiche" onRetry={() => void latest.refetch()} />
      ) : items.length === 0 ? (
        <p className="text-sm text-fg-muted">Qui compaiono pagamenti, scadenze e nuove iscrizioni.</p>
      ) : (
        <>
          <p>
            <Chip tone={count > 0 ? "brand" : "success"}>{count > 0 ? `${pluralize(count, "da leggere", "da leggere")}` : "Tutto letto"}</Chip>
          </p>
          <ul aria-label="Ultime notifiche" className="flex flex-col gap-2">
            {items.map((notification) => {
              const Icon = TYPE_INFO[notification.type].icon;
              return (
                <li key={notification.id} className="flex items-start gap-3">
                  <Icon aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-fg-muted" />
                  <div className="min-w-0">
                    <p className={`break-words text-sm text-fg ${notification.readAt === null ? "font-extrabold" : "font-semibold"}`}>{notification.title}</p>
                    <p className="break-words text-sm text-fg-muted">{notification.body}</p>
                  </div>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </QuietBlock>
  );
}

function AutomationsBlock() {
  const automations = useApiQuery<AutomationDashboard>(["automations"], "/automations");
  const summary = automations.data?.summary;
  return (
    <QuietBlock title="Automazioni" href="/automazioni" linkLabel="Apri le automazioni">
      {automations.isLoading ? (
        <LinesSkeleton label="Caricamento delle automazioni" />
      ) : automations.error ? (
        <BlockError what="le automazioni" onRetry={() => void automations.refetch()} />
      ) : summary ? (
        <>
          <p className="text-sm text-fg-muted">
            {summary.active} su {summary.total} attività gestite in automatico dall&apos;app.
          </p>
          <ProgressBar
            label="Attività gestite dall'app"
            value={summary.active}
            max={Math.max(summary.total, 1)}
            tone="brand"
            valueText={`${summary.active} su ${summary.total} attive`}
          />
        </>
      ) : null}
    </QuietBlock>
  );
}

function OtherSections({ sections }: { sections: readonly OtherSection[] }) {
  return (
    <nav aria-label="Altre sezioni" className="flex flex-col gap-3 border-t border-line pt-6">
      <h3 className="text-base font-bold tracking-title text-fg">Altre sezioni</h3>
      <ul className="grid gap-x-8 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
        {sections.map((section) => (
          <li key={section.id} className="flex flex-col gap-1">
            <p className="text-sm font-semibold text-fg-muted">{section.label}</p>
            <ul className="flex flex-wrap gap-x-1">
              {section.items.map((item) => (
                <li key={item.id}>
                  <Link
                    href={item.href}
                    className="inline-flex min-h-11 items-center gap-2 rounded-md px-2 text-sm font-semibold text-primary-fg hover:bg-primary-soft"
                  >
                    <item.icon aria-hidden="true" className="size-4 shrink-0" />
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
    </nav>
  );
}

/** Level 3 of the home: ranking, latest notifications and automations in a quieter register, then the rest of the menu. */
export function RestSection() {
  const { me } = useAuth();
  const access = useHomeAccess();
  const blocks = [access.competitions, access.notifications, access.automations].filter(Boolean).length;
  const sections = resolveOtherSections(me?.permissions ?? []);
  if (blocks === 0 && sections.length === 0) return null;
  return (
    <section aria-labelledby="home-rest" className="flex flex-col gap-6">
      <h2 id="home-rest" className="text-lg font-extrabold tracking-title text-fg">
        Il resto
      </h2>
      {blocks > 0 ? (
        <div className="grid gap-x-8 gap-y-6 md:grid-cols-2 lg:grid-cols-3">
          {access.competitions ? <StandingsBlock /> : null}
          {access.notifications ? <NotificationsBlock /> : null}
          {access.automations ? <AutomationsBlock /> : null}
        </div>
      ) : null}
      {sections.length > 0 ? <OtherSections sections={sections} /> : null}
    </section>
  );
}
