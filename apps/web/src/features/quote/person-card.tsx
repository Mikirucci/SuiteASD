import type { ReactNode } from "react";
import { AlertTriangle, Check, Clock } from "lucide-react";
import { Avatar, Chip, type ChipTone } from "@/components/ui";
import { formatDayShort, formatEuro } from "@/lib/format";
import type { PersonPaymentStatus, PlanPerson } from "./types";

const STATUS: Record<PersonPaymentStatus, { tone: ChipTone; label: string; icon: ReactNode }> = {
  PAID: { tone: "success", label: "In regola", icon: <Check strokeWidth={3} /> },
  PENDING: { tone: "warning", label: "In attesa", icon: <Clock /> },
  OVERDUE: { tone: "danger", label: "Scaduta", icon: <AlertTriangle /> },
};

export const PERSON_STATUS_LABELS: Record<PersonPaymentStatus, string> = {
  PAID: STATUS.PAID.label,
  PENDING: STATUS.PENDING.label,
  OVERDUE: STATUS.OVERDUE.label,
};

function nextDueNote(person: PlanPerson): string {
  if (person.nextDueDate === null) return "Tutto pagato";
  return person.status === "OVERDUE" ? `Scaduta il ${formatDayShort(person.nextDueDate)}` : `Entro il ${formatDayShort(person.nextDueDate)}`;
}

/** The share of the total that belongs to this plan, or when it falls due; the badge always speaks about this plan. */
function planNote(person: PlanPerson): string {
  if (person.totalDueCents === 0) return person.allPlansDueCents > 0 ? "Piano in regola" : "Tutto pagato";
  return `${formatEuro(person.totalDueCents)} in questo piano · ${nextDueNote(person).toLowerCase()}`;
}

export interface PersonCardProps {
  person: PlanPerson;
  onOpen: (person: PlanPerson) => void;
}

/** A person of a plan: photo, name, how much is still to pay in total (also 0) and where they stand. */
export function PersonCard({ person, onOpen }: PersonCardProps) {
  const { tone, label, icon } = STATUS[person.status];
  const teams = person.teams.map((team) => team.name).join(", ");
  return (
    <li>
      <button
        type="button"
        onClick={() => onOpen(person)}
        className="flex h-full w-full flex-col gap-3 rounded-lg bg-surface p-4 text-left shadow-soft transition-[box-shadow,transform] duration-200 ease-soft hover:-translate-y-0.5 hover:shadow-raised"
      >
        <span className="flex items-center gap-3">
          <Avatar name={person.memberName} decorative />
          <span className="flex min-w-0 flex-col">
            <span className="truncate text-sm font-bold text-fg">{person.memberName}</span>
            <span className="truncate text-xs text-fg-muted">{teams || "Nessuna squadra"}</span>
          </span>
        </span>
        <span className="mt-auto flex items-end justify-between gap-3">
          <span className="flex flex-col">
            <span className="text-xs font-bold uppercase tracking-label text-fg-muted">Da pagare in totale</span>
            <span className="text-xl font-extrabold tracking-title text-fg">{formatEuro(person.allPlansDueCents)}</span>
            <span className="text-xs text-fg-muted">{planNote(person)}</span>
          </span>
          <Chip tone={tone} icon={icon}>
            {label}
          </Chip>
        </span>
      </button>
    </li>
  );
}
