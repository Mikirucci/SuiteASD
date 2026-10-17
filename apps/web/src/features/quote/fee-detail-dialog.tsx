"use client";

import { HandCoins } from "lucide-react";
import { useState, type ReactNode } from "react";
import { Alert, AutoChip, Button, Dialog, DialogContent } from "@/components/ui";
import { useApiQuery } from "@/lib/api";
import { FeeStatusChip } from "./fee-row";
import { formatDateTime, formatDay, formatEuro } from "@/lib/format";
import { claimNote, METHOD_LABELS } from "./format";
import { ReceiptActions } from "./receipt-actions";
import type { Fee } from "./types";

function Detail({ label, children }: { label: string; children: ReactNode }) {
  return (
    <>
      <dt className="text-fg-muted">{label}</dt>
      <dd className="min-w-0 break-words font-medium text-fg">{children}</dd>
    </>
  );
}

function reminderText(fee: Fee): string {
  if (fee.reminderCount === 0) return "Nessuno ancora";
  const last = fee.lastReminderAt ? `, ultimo il ${formatDateTime(fee.lastReminderAt)}` : "";
  return `${fee.reminderCount}${last}`;
}

/**
 * What the secretariat reads right after registering a payment. The receipt is only said to be sent when the fee
 * confirms it (`sentAt`): the answer of the payment itself is a snapshot taken before the notification goes out.
 */
function describeOutcome(fee: Fee): string {
  if (!fee.receipt) return "Pagamento registrato. Nessuna ricevuta emessa per questo pagamento.";
  const issued = `Pagamento registrato. Ricevuta n. ${fee.receipt.code} emessa`;
  return fee.receipt.sentAt ? `${issued} e inviata a ${fee.memberName} e all'amministrazione.` : `${issued}.`;
}

export interface FeeDetailDialogProps {
  fee: Fee | null;
  onClose: () => void;
  /** Set only for users who may register payments. */
  onPay?: (fee: Fee) => void;
  /** Who reads the card: it shapes the wording of a reported payment. */
  viewer?: "payer" | "secretariat";
  /** The card opens right after a payment was registered: it states the outcome, with the receipt and its delivery. */
  justPaid?: boolean;
}

/** Fee card: amounts, dates, who paid and the numbered receipt, which can be looked at or downloaded as a PDF. */
export function FeeDetailDialog({ fee, onClose, onPay, viewer = "payer", justPaid = false }: FeeDetailDialogProps) {
  const [receiptError, setReceiptError] = useState<string | null>(null);
  // The answer of `pay` cannot know whether the receipt went out: read the fee again to find out
  const fresh = useApiQuery<Fee>(["fees", "detail", fee?.id ?? ""], fee ? `/fees/${fee.id}` : "/fees", {
    enabled: justPaid && fee !== null,
  });

  if (!fee) return null;
  const current = justPaid ? (fresh.data ?? fee) : fee;
  const settled = current.status === "PAID";
  const canPay = onPay !== undefined && (current.status === "PENDING" || current.status === "OVERDUE");
  const note = claimNote(current, viewer);

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        title={current.memberName}
        description={`${current.description} · ${formatEuro(current.amountCents)}`}
        footer={
          <>
            {current.receipt ? (
              <ReceiptActions feeId={current.id} receipt={current.receipt} variant="card" onError={setReceiptError} />
            ) : null}
            {canPay ? (
              <Button leftIcon={<HandCoins />} onClick={() => onPay(current)}>
                Registra pagamento
              </Button>
            ) : null}
          </>
        }
      >
        <div className="flex flex-col gap-4">
          {justPaid && settled ? <Alert tone="success">{describeOutcome(current)}</Alert> : null}
          {receiptError ? <Alert tone="danger">{receiptError}</Alert> : null}
          <dl className="grid grid-cols-[minmax(0,6.5rem)_minmax(0,1fr)] items-center gap-x-4 gap-y-3 text-sm">
            <Detail label="Stato">
              <FeeStatusChip fee={current} />
            </Detail>
            <Detail label="Scadenza">{formatDay(current.dueDate)}</Detail>
            {current.teams.length > 0 ? <Detail label="Squadra">{current.teams.map((team) => team.name).join(", ")}</Detail> : null}
            {note ? <Detail label="Segnalazione">{note}</Detail> : null}
            {settled && current.paidAt ? <Detail label="Pagata il">{formatDateTime(current.paidAt)}</Detail> : null}
            {settled && current.method ? <Detail label="Metodo">{METHOD_LABELS[current.method]}</Detail> : null}
            {settled && current.payerName ? <Detail label="Pagante">{current.payerName}</Detail> : null}
            {settled && current.reference ? <Detail label="Riferimento">{current.reference}</Detail> : null}
            {current.receipt ? (
              <Detail label="Ricevuta">
                <span className="flex flex-wrap items-center gap-2">
                  n. {current.receipt.code}
                  <AutoChip>Emessa in automatico</AutoChip>
                </span>
              </Detail>
            ) : null}
            {current.receipt?.sentAt ? <Detail label="Ricevuta inviata">{formatDateTime(current.receipt.sentAt)}</Detail> : null}
            {!settled && current.status !== "CANCELLED" ? (
              <Detail label="Promemoria">
                <span className="flex flex-wrap items-center gap-2">
                  {reminderText(current)}
                  <AutoChip />
                </span>
              </Detail>
            ) : null}
          </dl>
        </div>
      </DialogContent>
    </Dialog>
  );
}
