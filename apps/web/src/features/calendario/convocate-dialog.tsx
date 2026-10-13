"use client";

import { UserPlus, Users } from "lucide-react";
import { useState } from "react";
import { Alert, Button, Checkbox, Chip, DataBoundary, Dialog, DialogClose, DialogContent, EmptyState, Textarea, useToast } from "@/components/ui";
import { useApiMutation } from "@/lib/api";
import { useEventConvocations, useInvalidateCalendar, useTeamRoster } from "./api";
import { describeCalendarError, pluralize } from "./format";
import type { CalendarEvent, EventConvocations, RosterMember } from "./types";

const MAX_REASON = 300;

function hasExpiredCertificate(member: RosterMember): boolean {
  return member.documents.some((document) => document.key === "MEDICAL_CERTIFICATE" && document.status === "EXPIRED");
}

interface ConvocateFormProps {
  event: CalendarEvent;
  teamId: string;
  canOverride: boolean;
  onDone: () => void;
}

function ConvocateForm({ event, teamId, canOverride, onDone }: ConvocateFormProps) {
  const { toast } = useToast();
  const invalidate = useInvalidateCalendar();
  const roster = useTeamRoster(teamId);
  const convocations = useEventConvocations(event.id);
  const rows = convocations.data?.data ?? [];
  const takenMemberIds = new Set(rows.map((row) => row.member.id));
  // Declined athletes free their slot, as on the server
  const freeSlots = Math.max(0, (convocations.data?.summary.capacity ?? event.convocations.capacity) - rows.filter((row) => row.status !== "DECLINED").length);
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [reason, setReason] = useState("");

  const athletes = [...(roster.data ?? [])].sort((a, b) => a.lastName.localeCompare(b.lastName, "it") || a.firstName.localeCompare(b.firstName, "it"));
  const isSelectable = (member: RosterMember) => !takenMemberIds.has(member.id) && (canOverride || !hasExpiredCertificate(member));
  const needsReason = athletes.some((member) => selected.has(member.id) && hasExpiredCertificate(member));
  const tooMany = selected.size > freeSlots;
  const canSubmit = selected.size > 0 && !tooMany && (!needsReason || reason.trim() !== "");

  const save = useApiMutation(
    (memberIds: string[], client) =>
      client.post<EventConvocations>(`/events/${event.id}/convocations`, {
        memberIds,
        ...(needsReason ? { override: { reason: reason.trim() } } : {}),
      }),
    {
      onSuccess: async (_result, memberIds) => {
        await invalidate();
        toast({
          title: pluralize(memberIds.length, "convocazione creata", "convocazioni create"),
          description: "Ora inviale: partono comunque in automatico prima della gara.",
          tone: "success",
        });
        onDone();
      },
    },
  );

  const toggle = (id: string, checked: boolean) =>
    setSelected((current) => {
      const next = new Set(current);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  const selectAll = () => setSelected(new Set(athletes.filter(isSelectable).map((member) => member.id)));

  return (
    <div className="flex flex-col gap-4">
      {save.error ? <Alert tone="danger">{describeCalendarError(save.error)}</Alert> : null}
      <DataBoundary
        isLoading={roster.isLoading || convocations.isLoading}
        error={roster.error ?? convocations.error}
        onRetry={() => {
          void roster.refetch();
          void convocations.refetch();
        }}
        loadingLabel="Caricamento degli atleti"
        isEmpty={athletes.length === 0}
        empty={
          <EmptyState
            icon={Users}
            title="Nessun atleta attivo"
            description="Aggiungi gli atleti alla squadra dai tesserati: poi potrai convocarli qui."
          />
        }
      >
        <fieldset className="flex flex-col gap-1">
          <legend className="mb-2 text-sm font-semibold text-fg">Scegli chi convocare</legend>
          {athletes.map((member) => {
            const taken = takenMemberIds.has(member.id);
            const expired = hasExpiredCertificate(member);
            return (
              <Checkbox
                key={member.id}
                checked={selected.has(member.id)}
                disabled={!isSelectable(member)}
                onChange={(change) => toggle(member.id, change.target.checked)}
                label={
                  <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="font-semibold">
                      {member.firstName} {member.lastName}
                    </span>
                    {member.fieldRole ? <span className="text-fg-muted">{member.fieldRole}</span> : null}
                    {taken ? <Chip tone="neutral">Già in elenco</Chip> : null}
                    {expired ? <Chip tone="danger">Certificato scaduto</Chip> : null}
                  </span>
                }
              />
            );
          })}
        </fieldset>
        <p className="text-sm text-fg-muted" aria-live="polite">
          Scelti: {selected.size} · Posti liberi: {freeSlots}
        </p>
        {tooMany ? <Alert tone="danger">Hai scelto più atleti dei posti liberi. Togli qualcuno o aumenta i posti dall&apos;evento.</Alert> : null}
        {needsReason ? (
          <Textarea
            label="Motivo della deroga"
            required
            rows={2}
            maxLength={MAX_REASON}
            hint="Hai scelto atleti con il certificato medico scaduto: la deroga viene registrata."
            value={reason}
            onChange={(change) => setReason(change.target.value)}
          />
        ) : null}
      </DataBoundary>
      <div className="mt-2 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button variant="secondary" onClick={selectAll} disabled={athletes.filter(isSelectable).length === 0}>
          Scegli tutti
        </Button>
        <DialogClose asChild>
          <Button variant="ghost">Annulla</Button>
        </DialogClose>
        <Button leftIcon={<UserPlus />} disabled={!canSubmit} loading={save.isPending} onClick={() => save.mutate([...selected])}>
          Convoca
        </Button>
      </div>
    </div>
  );
}

export interface ConvocateDialogProps extends Omit<ConvocateFormProps, "event" | "teamId"> {
  event: CalendarEvent | null;
  onClose: () => void;
}

export function ConvocateDialog({ event, onClose, ...form }: ConvocateDialogProps) {
  if (!event?.team) return null;
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent title="Convoca gli atleti" description={`${event.title} · squadra ${event.team.name}`}>
        <ConvocateForm event={event} teamId={event.team.id} {...form} />
      </DialogContent>
    </Dialog>
  );
}
