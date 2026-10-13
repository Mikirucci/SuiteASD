import { Ban, CalendarClock, Dumbbell, Handshake, Trophy, Volleyball, type LucideIcon } from "lucide-react";
import { Card, Chip } from "@/components/ui";
import { cn } from "@/lib/cn";
import { ConvocationProgress } from "./convocation-progress";
import { EVENT_TYPE_LABELS, formatWhen, matchEyebrow } from "./format";
import type { CalendarEvent, EventType, MatchContext } from "./types";

const TYPE_ICONS: Record<EventType, LucideIcon> = {
  MATCH: Volleyball,
  TRAINING: Dumbbell,
  TOURNAMENT: Trophy,
  MEETING: Handshake,
};

export function EventTypeIcon({ type, className }: { type: EventType; className?: string }) {
  const Icon = TYPE_ICONS[type];
  return <Icon aria-hidden="true" className={cn("size-4 shrink-0", className)} />;
}

export function EventStatusChip({ status }: { status: CalendarEvent["status"] }) {
  if (status === "CANCELLED") {
    return (
      <Chip tone="danger" icon={<Ban />}>
        Annullato
      </Chip>
    );
  }
  if (status === "POSTPONED") {
    return (
      <Chip tone="warning" icon={<CalendarClock />}>
        Spostato
      </Chip>
    );
  }
  return null;
}

/** First line of a card: the match position in the league, or the kind of event and its team. */
export function eyebrowOf(event: CalendarEvent, matchContext: MatchContext | undefined): string {
  if (event.type === "MATCH") return matchEyebrow(event, matchContext);
  return [EVENT_TYPE_LABELS[event.type], event.team?.name].filter(Boolean).join(" · ");
}

export interface EventCardProps {
  event: CalendarEvent;
  matchContext?: MatchContext;
  onOpen: (event: CalendarEvent) => void;
}

/** One event of the day. The title is the button that opens the event; its hit area covers the whole card. */
export function EventCard({ event, matchContext, onOpen }: EventCardProps) {
  const isMatch = event.type === "MATCH";
  const cancelled = event.status === "CANCELLED";
  return (
    <Card as="article" interactive className="relative flex flex-col gap-3 p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex min-w-0 items-center gap-2 text-xs font-bold uppercase tracking-label text-primary-fg">
          <EventTypeIcon type={event.type} />
          <span className="min-w-0 break-words">{eyebrowOf(event, matchContext)}</span>
        </p>
        <EventStatusChip status={event.status} />
      </div>
      <h3 className={cn("break-words tracking-title text-fg", isMatch ? "text-xl font-extrabold" : "text-base font-bold", cancelled && "line-through")}>
        <button
          type="button"
          onClick={() => onOpen(event)}
          className="rounded-sm text-left after:absolute after:inset-0 after:rounded-lg after:content-['']"
        >
          {event.title}
        </button>
      </h3>
      <p className="text-sm text-fg-muted">{formatWhen(event)}</p>
      {event.convocations.total > 0 && !cancelled ? (
        <ConvocationProgress summary={event.convocations} label={event.title} />
      ) : null}
    </Card>
  );
}
