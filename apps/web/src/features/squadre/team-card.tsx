import { CalendarDays, Pencil, Trash2 } from "lucide-react";
import Link from "next/link";
import { IconButton, Skeleton } from "@/components/ui";
import type { CalendarEvent } from "@/features/calendario/types";
import type { Team } from "@/features/tesserati/types";
import { UPCOMING_DAYS, type NextEventState } from "./api";
import { formatEventStart, teamMeta } from "./team-format";

function NextEvent({ next, teamId }: { next: NextEventState; teamId: string }) {
  if (next.status === "unavailable") return null;
  if (next.status === "pending") return <Skeleton className="h-5 w-3/4" />;
  const event: CalendarEvent | undefined = next.byTeam.get(teamId);
  return (
    <p className="flex min-w-0 items-center gap-2 text-sm text-fg-muted">
      <CalendarDays aria-hidden="true" className="size-4 shrink-0" />
      {event ? (
        <span className="min-w-0 truncate">
          <span className="font-semibold text-fg">{formatEventStart(event.startsAt)}</span> {event.title}
        </span>
      ) : (
        <span>Nessun evento nei prossimi {UPCOMING_DAYS} giorni</span>
      )}
    </p>
  );
}

export interface TeamCardProps {
  team: Team;
  next: NextEventState;
  onEdit?: () => void;
  onDelete?: () => void;
}

/**
 * One team. The name is the link to the team page and its box stretches over the whole card, so the card is the
 * main target; edit and delete are small buttons stacked above it that do not compete with opening the team.
 */
export function TeamCard({ team, next, onEdit, onDelete }: TeamCardProps) {
  const meta = teamMeta(team);
  return (
    <div className="relative flex h-full flex-col gap-4 rounded-lg bg-surface p-4 shadow-soft transition-shadow duration-200 ease-soft hover:shadow-raised sm:p-6">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="break-words text-lg font-bold tracking-title text-fg">
            <Link
              href={`/squadre/${team.id}`}
              className="rounded-sm after:absolute after:inset-0 after:rounded-lg focus-visible:outline-none focus-visible:after:outline-2 focus-visible:after:outline-focus"
            >
              {team.name}
            </Link>
          </h2>
          {meta ? <p className="mt-1 text-sm text-fg-muted">{meta}</p> : null}
        </div>
        {onEdit || onDelete ? (
          <div className="relative -mr-2 -mt-2 flex shrink-0">
            {onEdit ? (
              <IconButton icon={<Pencil />} aria-label={`Modifica ${team.name}`} onClick={onEdit} />
            ) : null}
            {onDelete ? (
              <IconButton icon={<Trash2 />} aria-label={`Elimina ${team.name}`} onClick={onDelete} />
            ) : null}
          </div>
        ) : null}
      </div>

      <p className="flex items-baseline gap-1.5">
        <span className="text-2xl font-extrabold tracking-title text-fg">{team.membersCount}</span>{" "}
        <span className="text-sm text-fg-muted">{team.membersCount === 1 ? "tesserato" : "tesserati"}</span>
      </p>

      {team.description ? <p className="line-clamp-2 break-words text-sm text-fg-muted">{team.description}</p> : null}

      <div className="mt-auto border-t border-line pt-3">
        <NextEvent next={next} teamId={team.id} />
      </div>
    </div>
  );
}
