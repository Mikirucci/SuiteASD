import { Ban } from "lucide-react";
import { Avatar, Chip, PaymentChip } from "@/components/ui";
import { formatDateTime, formatDayShort, formatEuro } from "@/lib/format";
import { chipStatusOf } from "./format";
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

/** Row of the fees list: the whole row opens the fee card. */
export function FeeRow({ fee, onOpen }: { fee: Fee; onOpen: (fee: Fee) => void }) {
  const teams = fee.teams.map((team) => team.name).join(", ");
  return (
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
      </span>
      <span className="col-start-2 justify-self-start sm:col-start-3 sm:row-start-1">
        <FeeStatusChip fee={fee} />
      </span>
    </button>
  );
}
