import { Check, PencilLine } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
import { ProgressRing } from "@/components/ui/progress-ring";
import { cn } from "@/lib/cn";
import { MvpBadge } from "./mvp-badge";
import { memberName } from "./rating";
import { StatBars } from "./stat-bars";
import type { ReportCardEntry, StatLine } from "./types";

export interface ReportCardItemProps {
  entry: ReportCardEntry;
  maxima: StatLine;
  /** Staff see whether a report card is still a draft; players only ever receive published ones. */
  showStatus: boolean;
  onEdit?: (entry: ReportCardEntry) => void;
}

/** Player card: avatar, role, grade ring, MVP badge, coach notes and statistics bars. */
export function ReportCardItem({ entry, maxima, showStatus, onEdit }: ReportCardItemProps) {
  const { member, evaluation, stats } = entry;
  const name = memberName(member);
  return (
    <Card as="li" padding="md" className={cn("flex flex-col gap-4", evaluation?.isMvp && "ring-2 ring-gold-400")}>
      <div className="flex items-start gap-3">
        <Avatar name={name} size="lg" decorative />
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-base font-bold tracking-title text-fg">{name}</h3>
          <p className="text-sm text-fg-muted">{member.fieldRole ?? "Ruolo non indicato"}</p>
          {evaluation?.isMvp || (showStatus && evaluation) ? (
            <div className="mt-2 flex flex-wrap gap-2">
              {evaluation?.isMvp ? <MvpBadge /> : null}
              {showStatus && evaluation ? (
                evaluation.published ? (
                  <Chip tone="success" icon={<Check strokeWidth={3} />}>
                    Pubblicata
                  </Chip>
                ) : (
                  <Chip tone="warning" icon={<PencilLine />}>
                    Bozza
                  </Chip>
                )
              ) : null}
            </div>
          ) : null}
        </div>
        {evaluation ? (
          <ProgressRing value={evaluation.rating} size={64} label={`Voto di ${name}`} />
        ) : (
          <Chip>Senza voto</Chip>
        )}
      </div>
      {evaluation?.notes ? <p className="text-sm text-fg">{evaluation.notes}</p> : null}
      {stats ? <StatBars stats={stats} maxima={maxima} label={`Statistiche di ${name}`} /> : null}
      {onEdit ? (
        <Button
          variant="soft"
          size="sm"
          className="self-start"
          aria-label={evaluation ? `Modifica pagella di ${name}` : `Assegna voto a ${name}`}
          onClick={() => onEdit(entry)}
        >
          {evaluation ? "Modifica pagella" : "Assegna voto"}
        </Button>
      ) : null}
    </Card>
  );
}
