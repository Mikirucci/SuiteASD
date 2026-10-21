import { CalendarDays, Pencil, Trash2, Users } from "lucide-react";
import Link from "next/link";
import { IconButton, Skeleton } from "@/components/ui";
import type { Team } from "@/features/tesserati/types";
import { cn } from "@/lib/cn";
import type { WeekLoadState } from "./api";
import { genderLabelOf, toneOfGender } from "./team-format";

function WeekLoad({ week, teamId }: { week: WeekLoadState; teamId: string }) {
  if (week.status === "unavailable") return null;
  if (week.status === "pending") return <Skeleton className="h-5 w-3/4" />;
  const count = week.byTeam.get(teamId) ?? 0;
  return (
    <p className={cn("flex min-w-0 items-center gap-2 text-sm", count > 0 ? "text-fg" : "text-fg-muted")}>
      <CalendarDays aria-hidden="true" className={cn("size-4 shrink-0", count > 0 && "text-brand-700")} />
      <span className="min-w-0 truncate">
        <span className={cn("font-bold", count > 0 && "text-brand-700")}>{count}</span>{" "}
        {count === 1 ? "impegno" : "impegni"} questa settimana
      </span>
    </p>
  );
}

export interface TeamCardProps {
  team: Team;
  week: WeekLoadState;
  onEdit?: () => void;
  onDelete?: () => void;
}

/**
 * One team, always the same three bands so that every card has the same size: the name, how many members and of
 * which gender, how many commitments this week. The name is the link to the team page and its box stretches over
 * the whole card, so the card is the main target; edit and delete are small buttons stacked above it. A stripe on
 * the left carries the colour of the gender.
 */
export function TeamCard({ team, week, onEdit, onDelete }: TeamCardProps) {
  const tone = toneOfGender(team.gender);
  const gender = genderLabelOf(team);
  return (
    <div className="relative flex h-full flex-col gap-4 overflow-hidden rounded-lg bg-surface p-4 pl-5 shadow-soft transition-[box-shadow,transform] duration-200 ease-soft hover:-translate-y-0.5 hover:shadow-raised sm:p-5 sm:pl-6">
      <span aria-hidden="true" className={cn("absolute inset-y-0 left-0 w-1.5", tone.tile)} />
      <div className="flex min-h-9 items-center gap-2">
        <h2 className="min-w-0 flex-1 truncate text-lg font-bold tracking-title text-fg" title={team.name}>
          <Link
            href={`/squadre/${team.id}`}
            className="rounded-sm after:absolute after:inset-0 after:rounded-lg focus-visible:outline-none focus-visible:after:outline-2 focus-visible:after:outline-focus"
          >
            {team.name}
          </Link>
        </h2>
        {onEdit || onDelete ? (
          <div className="relative -mr-2 flex shrink-0">
            {onEdit ? <IconButton size="sm" icon={<Pencil />} aria-label={`Modifica ${team.name}`} onClick={onEdit} /> : null}
            {onDelete ? (
              <IconButton size="sm" icon={<Trash2 />} aria-label={`Elimina ${team.name}`} onClick={onDelete} />
            ) : null}
          </div>
        ) : null}
      </div>

      <div className="flex min-h-8 items-center justify-between gap-3">
        <p className="flex items-baseline gap-2">
          <Users aria-hidden="true" className="size-4 self-center text-fg-muted" />
          <span className="text-2xl font-extrabold tracking-title text-fg">{team.membersCount}</span>{" "}
          <span className="text-sm text-fg-muted">{team.membersCount === 1 ? "tesserato" : "tesserati"}</span>
        </p>
        {gender ? <span className={cn("rounded-full px-2.5 py-1 text-xs font-bold", tone.chip)}>{gender}</span> : null}
      </div>

      <div className="mt-auto flex min-h-9 items-center border-t border-line pt-3">
        <WeekLoad week={week} teamId={team.id} />
      </div>
    </div>
  );
}
