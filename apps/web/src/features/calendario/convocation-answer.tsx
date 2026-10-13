"use client";

import { Check, X } from "lucide-react";
import { useState } from "react";
import { Alert, Avatar, Button, Textarea, useToast } from "@/components/ui";
import { useApiMutation } from "@/lib/api";
import { useInvalidateCalendar } from "./api";
import { ConvocationStatusLabel, fullNameOf } from "./convocation-grid";
import { describeCalendarError, formatShortDateTime } from "./format";
import type { Convocation, RespondBody } from "./types";

const MAX_REASON = 300;

export interface ConvocationAnswerProps {
  convocation: Convocation;
  /** Names the event too: for lists that mix several events. */
  showEvent?: boolean;
}

/** An athlete or a guardian confirms or declines (with an optional reason) a convocation. */
export function ConvocationAnswer({ convocation, showEvent }: ConvocationAnswerProps) {
  const { toast } = useToast();
  const invalidate = useInvalidateCalendar();
  const [declining, setDeclining] = useState(false);
  const [reason, setReason] = useState("");
  const name = fullNameOf(convocation.member);

  const respond = useApiMutation(
    (body: RespondBody, client) => client.put<Convocation>(`/convocations/${convocation.id}/response`, body),
    {
      onSuccess: async (saved) => {
        await invalidate();
        setDeclining(false);
        setReason("");
        toast({
          title: saved.status === "CONFIRMED" ? "Presenza confermata" : "Risposta registrata",
          description:
            saved.status === "CONFIRMED"
              ? `${name}: presenza confermata per ${saved.event.title}.`
              : `${name}: rinuncia per ${saved.event.title}.`,
          tone: "success",
        });
      },
    },
  );

  const confirm = () => respond.mutate({ status: "CONFIRMED" });
  const decline = () => respond.mutate(reason.trim() ? { status: "DECLINED", reason: reason.trim() } : { status: "DECLINED" });

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-start gap-3">
        <Avatar name={name} decorative confirmed={convocation.status === "CONFIRMED"} />
        <div className="min-w-0 flex-1">
          <p className="break-words text-sm font-bold text-fg">{name}</p>
          {showEvent ? (
            <p className="break-words text-xs text-fg-muted">
              {convocation.event.title} · {formatShortDateTime(convocation.event.startsAt)}
            </p>
          ) : null}
          <ConvocationStatusLabel status={convocation.status} />
          {convocation.status === "DECLINED" && convocation.declineReason ? (
            <p className="break-words text-xs text-fg-muted">Motivo: {convocation.declineReason}</p>
          ) : null}
        </div>
      </div>
      {respond.error ? <Alert tone="danger">{describeCalendarError(respond.error)}</Alert> : null}
      {declining ? (
        <div className="flex flex-col gap-3">
          <Textarea
            label="Motivo (facoltativo)"
            rows={2}
            maxLength={MAX_REASON}
            hint="Lo vede l'allenatore."
            value={reason}
            onChange={(event) => setReason(event.target.value)}
          />
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button variant="ghost" onClick={() => setDeclining(false)}>
              Indietro
            </Button>
            <Button variant="danger" loading={respond.isPending} onClick={decline}>
              Conferma che non ci sono
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-2 sm:flex-row">
          {convocation.status !== "CONFIRMED" ? (
            <Button
              leftIcon={<Check />}
              aria-label={`Confermo la presenza di ${name}`}
              loading={respond.isPending}
              onClick={confirm}
            >
              Confermo la presenza
            </Button>
          ) : null}
          {convocation.status !== "DECLINED" ? (
            <Button variant="secondary" leftIcon={<X />} aria-label={`Non ci sono: ${name}`} onClick={() => setDeclining(true)}>
              Non ci sono
            </Button>
          ) : null}
        </div>
      )}
    </div>
  );
}
