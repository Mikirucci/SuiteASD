"use client";

import { CalendarX, Check, X } from "lucide-react";
import { Button, Chip, DataBoundary, Dialog, DialogContent, EmptyState } from "@/components/ui";
import { useMemberAttendance } from "./api";
import { formatDayTitle, formatPercent, formatTime } from "./format";
import type { MemberRef } from "./types";

function PresenceChip({ present }: { present: boolean }) {
  return present ? (
    <Chip tone="success" icon={<Check strokeWidth={3} />}>
      Presente
    </Chip>
  ) : (
    <Chip tone="danger" icon={<X strokeWidth={3} />}>
      Assente
    </Chip>
  );
}

function History({ memberId }: { memberId: string }) {
  const history = useMemberAttendance(memberId);
  const rows = history.rows ?? [];
  return (
    <DataBoundary
      isLoading={history.isLoading}
      error={history.error}
      onRetry={history.refetch}
      loadingLabel="Caricamento dello storico"
      skeletonRows={3}
      isEmpty={rows.length === 0}
      empty={
        <EmptyState
          icon={CalendarX}
          title="Nessuna presenza registrata"
          description="Quando l'allenatore segna le presenze, lo storico compare qui."
        />
      }
    >
      <div className="flex flex-col gap-3">
        {history.summary ? (
          <p className="text-sm text-fg-muted">
            Presenza <span className="font-bold text-fg">{formatPercent(history.summary.percentage)}</span> · {history.summary.present} su{" "}
            {history.summary.total} allenamenti
          </p>
        ) : null}
        <ul aria-label="Storico degli allenamenti" className="flex flex-col divide-y divide-line">
          {rows.map((row) => (
            <li key={row.eventId} className="flex items-center justify-between gap-3 py-2">
              <div className="min-w-0">
                <p className="break-words text-sm font-semibold text-fg">{row.title}</p>
                <p className="text-xs text-fg-muted">
                  {formatDayTitle(new Date(row.startsAt))} · {formatTime(row.startsAt)}
                </p>
              </div>
              <PresenceChip present={row.present} />
            </li>
          ))}
        </ul>
        {history.hasNextPage ? (
          <Button variant="secondary" loading={history.isFetchingNextPage} onClick={history.fetchNextPage}>
            Mostra altri allenamenti
          </Button>
        ) : null}
      </div>
    </DataBoundary>
  );
}

export interface MemberAttendanceDialogProps {
  member: MemberRef | null;
  onClose: () => void;
}

/** Attendance history of one athlete with her presence percentage. */
export function MemberAttendanceDialog({ member, onClose }: MemberAttendanceDialogProps) {
  if (!member) return null;
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent title={`${member.firstName} ${member.lastName}`} description="Presenze agli allenamenti, dal più recente.">
        <History memberId={member.id} />
      </DialogContent>
    </Dialog>
  );
}
