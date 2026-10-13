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

export interface ConvocationGridProps {
  convocations: readonly Convocation[];
  /** Slots of the event not yet taken (declined athletes free theirs). */
  freeSlots: number;
  /** Set only when the user may remove athletes (staff, before the event starts). */
  onRemove?: (convocation: Convocation) => void;
  removingId?: string | null;
}

/** The squad of the event: one avatar per convocated athlete, a green check once she confirmed, dashed circles for free slots. */
export function ConvocationGrid({ convocations, freeSlots, onRemove, removingId }: ConvocationGridProps) {
  return (
    <div className="flex flex-col gap-3">
      <ul aria-label="Convocati" className="grid grid-cols-3 gap-x-3 gap-y-4">
        {convocations.map((convocation) => {
          const name = fullNameOf(convocation.member);
          return (
            <li key={convocation.id} className="flex min-w-0 flex-col items-center gap-1 text-center">
              <Avatar name={name} size="lg" decorative confirmed={convocation.status === "CONFIRMED"} />
              <p className="w-full break-words text-xs font-bold text-fg">{name}</p>
              <ConvocationStatusLabel status={convocation.status} />
              {convocation.status === "DECLINED" && convocation.declineReason ? (
                <p className="w-full break-words text-xs text-fg-muted">{convocation.declineReason}</p>
              ) : null}
              {convocation.overrideReason ? (
                <p className="w-full break-words text-xs text-fg-muted">Deroga: {convocation.overrideReason}</p>
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
            </li>
          );
        })}
        {Array.from({ length: freeSlots }, (_, index) => (
          <li key={`free-${index}`} aria-hidden="true" className="flex justify-center">
            <span className="size-12 rounded-full border-2 border-dashed border-line-control" />
          </li>
        ))}
      </ul>
      <p className="text-sm text-fg-muted">{freeSlots === 1 ? "1 posto libero" : `${freeSlots} posti liberi`}</p>
    </div>
  );
}
