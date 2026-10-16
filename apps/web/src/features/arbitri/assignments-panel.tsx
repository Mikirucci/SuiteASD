"use client";

import { useQueryClient } from "@tanstack/react-query";
import { Check, ClipboardList, Clock, Pencil, Plus, Search, Trash2 } from "lucide-react";
import { useState } from "react";
import {
  Button,
  Chip,
  ConfirmDialog,
  DataList,
  EmptyState,
  IconButton,
  LoadMore,
  PillFilter,
  type PillOption,
  Select,
  useToast,
} from "@/components/ui";
import { formatMatchDate } from "@/features/classifiche/format";
import { formatDateTime, formatEuro } from "@/lib/format";
import { useCursorQuery } from "@/lib/use-cursor-query";
import { useApiMutation } from "@/lib/api";
import { AssignmentDialog } from "./assignment-dialog";
import { FeeDialog } from "./fee-dialog";
import { describeRefereeError } from "./messages";
import type { Assignment, Referee } from "./types";

const PAGE_SIZE = 25;

const REIMBURSED_OPTIONS: readonly PillOption[] = [
  { value: "all", label: "Tutte" },
  { value: "false", label: "Da rimborsare" },
  { value: "true", label: "Rimborsate" },
];

function matchTitle(assignment: Assignment): string {
  return `${assignment.match.homeTeam} - ${assignment.match.awayTeam}`;
}

function refundChip(assignment: Assignment) {
  if (assignment.feeCents === null) return <Chip>Nessun compenso</Chip>;
  if (assignment.reimbursedAt) {
    return (
      <Chip tone="success" icon={<Check strokeWidth={3} />}>
        Rimborsato il {formatDateTime(assignment.reimbursedAt)}
      </Chip>
    );
  }
  return (
    <Chip tone="warning" icon={<Clock />}>
      Da rimborsare
    </Chip>
  );
}

interface AssignmentRowProps {
  assignment: Assignment;
  canWrite: boolean;
  onFee: (assignment: Assignment) => void;
  onDelete: (assignment: Assignment) => void;
  onReimburse: (assignment: Assignment, reimbursed: boolean) => void;
  busy: boolean;
}

function AssignmentRow({ assignment, canWrite, onFee, onDelete, onReimburse, busy }: AssignmentRowProps) {
  const { match } = assignment;
  const title = matchTitle(assignment);
  const where = [match.competitionName, match.groupName, match.round === null ? null : `giornata ${match.round}`].filter(Boolean).join(", ");
  return (
    <div className="flex flex-col gap-3 p-3 sm:p-4">
      <div className="flex flex-col gap-1">
        <p className="break-words text-sm font-bold text-fg">{title}</p>
        <p className="break-words text-xs text-fg-muted">
          {where}
          {match.date ? ` · ${formatMatchDate(match.date)}` : ""}
        </p>
        <p className="text-sm text-fg">
          Arbitro: <span className="font-semibold">{assignment.refereeName}</span>
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {assignment.feeCents !== null ? <span className="text-base font-extrabold tabular-nums text-fg">{formatEuro(assignment.feeCents)}</span> : null}
        {refundChip(assignment)}
      </div>
      {canWrite ? (
        <div className="flex flex-wrap items-center gap-1 border-t border-line pt-3">
          {assignment.feeCents !== null ? (
            <Button variant="soft" loading={busy} onClick={() => onReimburse(assignment, assignment.reimbursedAt === null)}>
              {assignment.reimbursedAt === null ? "Segna come rimborsato" : "Annulla il rimborso"}
            </Button>
          ) : null}
          <IconButton aria-label={`Modifica il compenso, ${title}`} icon={<Pencil />} onClick={() => onFee(assignment)} />
          <IconButton aria-label={`Elimina la designazione, ${title}`} icon={<Trash2 />} onClick={() => onDelete(assignment)} />
        </div>
      ) : null}
    </div>
  );
}

export interface AssignmentsPanelProps {
  canWrite: boolean;
  referees: readonly Referee[];
  refereesFailed: boolean;
}

/** Designations (who referees which match) with the fee and whether it has been paid back. */
export function AssignmentsPanel({ canWrite, referees, refereesFailed }: AssignmentsPanelProps) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [reimbursed, setReimbursed] = useState("all");
  const [refereeId, setRefereeId] = useState("");
  const [creating, setCreating] = useState(false);
  const [feeFor, setFeeFor] = useState<Assignment | null>(null);
  const [deleting, setDeleting] = useState<Assignment | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const assignments = useCursorQuery<Assignment>(
    ["referee-assignments", { reimbursed, refereeId }],
    "/referee-assignments",
    { reimbursed: reimbursed === "all" ? undefined : reimbursed, refereeId: refereeId || undefined, limit: PAGE_SIZE },
  );

  const refresh = () => Promise.all(["referee-assignments", "referees"].map((key) => queryClient.invalidateQueries({ queryKey: [key] })));

  const reimburse = useApiMutation(
    ({ id, reimbursedAt }: { id: string; reimbursedAt: string | null }, client) =>
      client.patch<Assignment>(`/referee-assignments/${id}`, { reimbursedAt }),
    {
      onSuccess: async (saved) => {
        await refresh();
        toast({ title: saved.reimbursedAt ? "Rimborso registrato" : "Rimborso annullato", description: saved.refereeName, tone: "success" });
      },
      onError: (error) => toast({ title: "Non è stato possibile aggiornare il rimborso", description: describeRefereeError(error), tone: "danger" }),
    },
  );

  const remove = useApiMutation((id: string, client) => client.delete<undefined>(`/referee-assignments/${id}`), {
    onSuccess: async () => {
      await refresh();
      toast({ title: "Designazione eliminata", tone: "success" });
      setDeleting(null);
    },
  });

  const hasFilters = reimbursed !== "all" || refereeId !== "";
  const newButton = canWrite ? (
    <Button leftIcon={<Plus />} onClick={() => setCreating(true)}>
      Nuova designazione
    </Button>
  ) : null;

  const empty = hasFilters ? (
    <EmptyState
      icon={Search}
      title="Nessuna designazione con questi filtri"
      description="Prova con un altro stato o un altro arbitro."
      action={
        <Button
          variant="secondary"
          onClick={() => {
            setReimbursed("all");
            setRefereeId("");
          }}
        >
          Azzera i filtri
        </Button>
      }
    />
  ) : (
    <EmptyState
      icon={ClipboardList}
      title="Nessuna designazione ancora"
      description={canWrite ? "Designa un arbitro per una partita: compenso e rimborso restano qui." : "Le designazioni registrate dalla società compaiono qui."}
      action={newButton}
    />
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3">
        <PillFilter label="Filtra per rimborso" options={REIMBURSED_OPTIONS} value={reimbursed} onChange={setReimbursed} />
        <div className="flex flex-wrap items-end justify-between gap-3">
          <Select
            className="w-full sm:w-72"
            label="Arbitro"
            options={[{ value: "", label: "Tutti gli arbitri" }, ...referees.map((referee) => ({ value: referee.id, label: `${referee.firstName} ${referee.lastName}` }))]}
            value={refereeId}
            onChange={(event) => setRefereeId(event.target.value)}
            hint={refereesFailed ? "Gli arbitri non sono disponibili al momento." : undefined}
          />
          {assignments.items && assignments.items.length > 0 ? newButton : null}
        </div>
      </div>

      <DataList
        label="Designazioni"
        items={assignments.items}
        getKey={(assignment) => assignment.id}
        renderItem={(assignment) => (
          <AssignmentRow
            assignment={assignment}
            canWrite={canWrite}
            busy={reimburse.isPending && reimburse.variables?.id === assignment.id}
            onFee={setFeeFor}
            onDelete={(target) => {
              setDeleteError(null);
              setDeleting(target);
            }}
            onReimburse={(target, value) =>
              reimburse.mutate({ id: target.id, reimbursedAt: value ? new Date().toISOString() : null })
            }
          />
        )}
        isLoading={assignments.isLoading}
        error={assignments.error}
        onRetry={assignments.refetch}
        loadingLabel="Caricamento delle designazioni"
        empty={empty}
      />
      <LoadMore list={assignments} noun="Designazioni" moreLabel="Mostra altre designazioni" />

      {canWrite ? (
        <>
          <AssignmentDialog open={creating} referees={referees} onClose={() => setCreating(false)} />
          <FeeDialog assignment={feeFor} onClose={() => setFeeFor(null)} />
          <ConfirmDialog
            open={deleting !== null}
            onOpenChange={(open) => !open && setDeleting(null)}
            title="Eliminare la designazione?"
            description={deleting ? `${deleting.refereeName} non risulta più designato per ${matchTitle(deleting)}.` : ""}
            confirmLabel="Elimina"
            loading={remove.isPending}
            error={deleteError}
            onConfirm={() => {
              if (!deleting) return;
              setDeleteError(null);
              remove.mutate(deleting.id, { onError: (error) => setDeleteError(describeRefereeError(error)) });
            }}
          />
        </>
      ) : null}
    </div>
  );
}
