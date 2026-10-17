import { Repeat } from "lucide-react";
import type { ReactNode } from "react";
import type { CalendarEvent } from "./types";

function Detail({ label, children }: { label: string; children: ReactNode }) {
  return (
    <>
      <dt className="text-fg-muted">{label}</dt>
      <dd className="min-w-0 break-words font-medium text-fg">{children}</dd>
    </>
  );
}

/** Team, place, series and notes of an event, as the definition list shared by every dialog that opens an event. */
export function EventFacts({ event }: { event: CalendarEvent }) {
  const isSeries = event.recurrenceRule !== null || event.recurrenceParentId !== null;
  return (
    <dl className="grid grid-cols-[minmax(0,6rem)_minmax(0,1fr)] gap-x-4 gap-y-3 text-sm">
      {event.team ? <Detail label="Squadra">{event.team.name}</Detail> : null}
      {event.venue ? (
        <Detail label="Luogo">
          {event.venue.name}
          {event.venue.address ? <span className="block font-normal text-fg-muted">{event.venue.address}</span> : null}
        </Detail>
      ) : null}
      {isSeries ? (
        <Detail label="Ripetizione">
          <span className="inline-flex items-center gap-1.5">
            <Repeat aria-hidden="true" className="size-4" />
            Allenamento della serie settimanale
          </span>
        </Detail>
      ) : null}
      {event.notes ? <Detail label="Note">{event.notes}</Detail> : null}
    </dl>
  );
}
