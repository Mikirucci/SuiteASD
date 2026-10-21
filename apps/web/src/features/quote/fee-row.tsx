"use client";

import { Ban, Banknote, BellRing, HandCoins, Hourglass } from "lucide-react";
import { Avatar, Button, Chip, PaymentChip, useToast } from "@/components/ui";
import { formatDateTime, formatDayShort, formatEuro } from "@/lib/format";
import { canBeClaimed, chipStatusOf, claimNote } from "./format";
import { ReceiptActions } from "./receipt-actions";
import type { Fee } from "./types";

/** One line of context under the fee: when it is due, or when and how it was settled. */
export function feeTimeline(fee: Fee): string {
  switch (fee.status) {
    case "PAID": {
      const paid = fee.paidAt ? `Pagata il ${formatDateTime(fee.paidAt)}` : "Pagata";
      return fee.receipt ? `${paid} · Ricevuta n. ${fee.receipt.code}` : paid;
    }
    case "OVERDUE":
      return `Scaduta il ${formatDayShort(fee.dueDate)}`;
    case "CANCELLED":
      return "Annullata";
    case "PENDING":
      return `Da pagare entro il ${formatDayShort(fee.dueDate)}`;
  }
}

export function FeeStatusChip({ fee }: { fee: Fee }) {
  const status = chipStatusOf(fee.status);
  return status ? <PaymentChip status={status} /> : <Chip icon={<Ban />}>Annullata</Chip>;
}

export interface FeeRowProps {
  fee: Fee;
  onOpen: (fee: Fee) => void;
  /** Who reads the list: it shapes the wording of a reported payment. */
  viewer: "payer" | "secretariat";
  /** A guardian with several children: the quick actions name the child, so that each row is told apart. */
  nameMember?: boolean;
  /** Set for a payer who may report "Ho pagato". */
  onClaim?: (fee: Fee) => void;
  /** Set for staff who may register payments: a reported fee gets the main action right in the row. */
  onPay?: (fee: Fee) => void;
}

/** The report of the payer, as a line of text with an icon: colour is never the only signal. */
function ClaimLine({ note, viewer }: { note: string; viewer: FeeRowProps["viewer"] }) {
  const Icon = viewer === "secretariat" ? BellRing : Hourglass;
  return (
    <span className="mt-1 flex items-start gap-1.5 text-xs font-semibold text-primary-fg">
      <Icon aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />
      {note}
    </span>
  );
}

/**
 * Row of the fees list: the whole text area opens the fee card, the quick actions (report a payment, register it,
 * look at the receipt) sit under it as separate buttons.
 */
export function FeeRow({ fee, onOpen, viewer, nameMember = false, onClaim, onPay }: FeeRowProps) {
  const { toast } = useToast();
  const teams = fee.teams.map((team) => team.name).join(", ");
  const note = claimNote(fee, viewer);
  const showClaim = onClaim !== undefined && canBeClaimed(fee);
  const showPay = onPay !== undefined && note !== null;
  const hasActions = showClaim || showPay || fee.receipt !== null;

  return (
    <div className="flex flex-col">
      <button
        type="button"
        onClick={() => onOpen(fee)}
        className="grid min-h-14 w-full grid-cols-[auto_minmax(0,1fr)] items-start gap-x-3 gap-y-2 rounded-lg px-3 py-3 text-left transition-colors duration-150 ease-soft hover:bg-ink-50 active:bg-ink-100 sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:items-center sm:px-4"
      >
        <Avatar name={fee.memberName} decorative />
        <span className="flex min-w-0 flex-col gap-0.5">
          <span className="text-sm font-bold text-fg">{fee.memberName}</span>
          <span className="text-sm text-fg">
            {fee.description} · {formatEuro(fee.amountCents)}
          </span>
          <span className="text-xs text-fg-muted">{teams ? `${teams} · ${feeTimeline(fee)}` : feeTimeline(fee)}</span>
          {note ? <ClaimLine note={note} viewer={viewer} /> : null}
        </span>
        <span className="col-start-2 justify-self-start sm:col-start-3 sm:row-start-1">
          <FeeStatusChip fee={fee} />
        </span>
      </button>
      {hasActions ? (
        <div className="flex flex-wrap items-center gap-2 px-3 pb-3 sm:px-4">
          {showClaim ? (
            <Button
              leftIcon={<Banknote />}
              aria-label={`Ho pagato: ${fee.description}${nameMember ? `, ${fee.memberName}` : ""}`}
              onClick={() => onClaim(fee)}
            >
              Ho pagato
            </Button>
          ) : null}
          {showPay ? (
            <Button
              leftIcon={<HandCoins />}
              aria-label={`Registra pagamento: ${fee.memberName}, ${fee.description}`}
              onClick={() => onPay(fee)}
            >
              Registra pagamento
            </Button>
          ) : null}
          {fee.receipt ? (
            <ReceiptActions
              feeId={fee.id}
              receipt={fee.receipt}
              variant="row"
              onError={(message) => toast({ title: "Download non riuscito", description: message, tone: "danger" })}
            />
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
