import { CalendarDays, Trophy } from "lucide-react";
import { Chip } from "@/components/ui/chip";
import { DataList, DataListRow } from "@/components/ui/data-list";
import { EmptyState } from "@/components/ui/empty-state";
import { formatMatchDate } from "@/features/classifiche/format";
import { sortEvents, sortResults } from "./ordering";
import { StatSection } from "./stat-section";
import type { EventType, LatestResult, UpcomingEvent } from "./types";

const EVENT_LABELS: Record<EventType, string> = {
  MATCH: "Partita",
  TRAINING: "Allenamento",
  TOURNAMENT: "Torneo",
  MEETING: "Riunione",
};

export function UpcomingEventsSection({ events }: { events: readonly UpcomingEvent[] }) {
  return (
    <StatSection title="Prossimi eventi" hint="Gli eventi in programma, dal più vicino. A destra il tipo di evento.">
      <DataList
        label="Prossimi eventi"
        items={sortEvents(events)}
        getKey={(event) => event.id}
        empty={<EmptyState as="h3" icon={CalendarDays} title="Nessun evento in programma" description="Gli eventi inseriti nel calendario compaiono qui." />}
        renderItem={(event) => (
          <DataListRow
            title={event.title}
            subtitle={[formatMatchDate(event.startsAt), event.teamName].filter(Boolean).join(" · ")}
            trailing={<Chip>{EVENT_LABELS[event.type]}</Chip>}
          />
        )}
      />
    </StatSection>
  );
}

export function LatestResultsSection({ results }: { results: readonly LatestResult[] }) {
  return (
    <StatSection title="Ultimi risultati" hint="Le partite giocate dalle vostre squadre, dalla più recente. A destra i set vinti da casa e ospiti.">
      <DataList
        label="Ultimi risultati"
        items={sortResults(results)}
        getKey={(result) => result.matchId}
        empty={<EmptyState as="h3" icon={Trophy} title="Nessun risultato ancora" description="I risultati inseriti nelle classifiche compaiono qui." />}
        renderItem={(result) => (
          <DataListRow
            title={`${result.homeTeam} - ${result.awayTeam}`}
            subtitle={[result.competitionName, result.playedAt ? formatMatchDate(result.playedAt) : null].filter(Boolean).join(" · ")}
            trailing={
              <span className="text-lg font-extrabold tabular-nums text-fg">
                <span className="sr-only">Risultato </span>
                {result.homeSets}-{result.awaySets}
              </span>
            }
          />
        )}
      />
    </StatSection>
  );
}
