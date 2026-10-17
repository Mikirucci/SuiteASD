import { Check, Clock, X } from "lucide-react";
import type { ReactNode } from "react";
import { Avatar, Button } from "@/components/ui";
import { cn } from "@/lib/cn";
import type { Convocation, ConvocationStatus } from "./types";

const STATUS_VIEW: Record<ConvocationStatus, { label: string; icon: ReactNode; className: string }> = {
  CONFIRMED: { label: "Confermata", icon: <Check strokeWidth={3} />, className: "text-success" },
  PENDING: { label: "In attesa", icon: <Clock />, className: "text-warning" },
  DECLINED: { label: "Rinuncia", icon: <X strokeWidth={3} />, className: "text-danger" },
};

export function fullNameOf(member: Convocation["member"]): string {
  return `${member.firstName} ${member.lastName}`;
}

export function ConvocationStatusLabel({ status }: { status: ConvocationStatus }) {
  const view = STATUS_VIEW[status];
  return (
    <span className={cn("inline-flex items-center gap-1 text-xs font-bold [&_svg]:size-3.5 [&_svg]:shrink-0", view.className)}>
      <span aria-hidden="true" className="inline-flex">
        {view.icon}
      </span>
      {view.label}
    </span>
  );
}

interface Group {
  status: ConvocationStatus;
  title: string;
  /** Said when nobody is in the group, so an empty group never reads as a missing one. */
  empty: string;
}

/** Order of reading: who is coming, who is not, who still has to say. */
const GROUPS: readonly Group[] = [
  { status: "CONFIRMED", title: "Confermati", empty: "Nessuna conferma ancora." },
  { status: "DECLINED", title: "Rifiutati", empty: "Nessuna rinuncia." },
  { status: "PENDING", title: "Senza risposta", empty: "Hanno risposto tutti." },
];

export interface ConvocationGridProps {
  convocations: readonly Convocation[];
  /** Set only when the user may remove athletes (staff, before the event starts). */
  onRemove?: (convocation: Convocation) => void;
  removingId?: string | null;
  /** Makes the ids of the headings unique when several squads are on the page. */
  idPrefix: string;
}

/** The squad of the event in three groups, each with its count: confirmed, declined (with the reason) and no answer yet. */
export function ConvocationGrid({ convocations, onRemove, removingId, idPrefix }: ConvocationGridProps) {
  return (
    <div className="flex flex-col gap-6">
      {GROUPS.map((group) => {
        const rows = convocations.filter((convocation) => convocation.status === group.status);
        const headingId = `${idPrefix}-${group.status}`;
        const view = STATUS_VIEW[group.status];
        return (
          <section key={group.status} aria-labelledby={headingId} className="flex flex-col gap-3">
            <h4 id={headingId} className={cn("flex items-center gap-1.5 text-sm font-bold", view.className)}>
              <span aria-hidden="true" className="inline-flex [&_svg]:size-4">
                {view.icon}
              </span>
              {group.title} ({rows.length})
            </h4>
            {rows.length === 0 ? (
              <p className="text-sm text-fg-muted">{group.empty}</p>
            ) : (
              <ul aria-label={group.title} className="grid grid-cols-1 gap-x-4 gap-y-3 sm:grid-cols-2">
                {rows.map((convocation) => {
                  const name = fullNameOf(convocation.member);
                  return (
                    <li key={convocation.id} className="flex min-w-0 items-start gap-3">
                      <Avatar name={name} decorative confirmed={convocation.status === "CONFIRMED"} />
                      <div className="min-w-0 flex-1">
                        <p className="break-words text-sm font-bold text-fg">{name}</p>
                        {convocation.status === "DECLINED" && convocation.declineReason ? (
                          <p className="break-words text-xs text-fg-muted">Motivo: {convocation.declineReason}</p>
                        ) : null}
                        {convocation.overrideReason ? (
                          <p className="break-words text-xs text-fg-muted">Deroga: {convocation.overrideReason}</p>
                        ) : null}
                        {onRemove ? (
                          <Button
                            variant="ghost"
                            aria-label={`Rimuovi ${name} dalle convocazioni`}
                            loading={removingId === convocation.id}
                            onClick={() => onRemove(convocation)}
                          >
                            Rimuovi
                          </Button>
                        ) : null}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        );
      })}
    </div>
  );
}
