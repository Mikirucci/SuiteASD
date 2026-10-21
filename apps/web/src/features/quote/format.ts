import type { PaymentStatus } from "@/components/ui";
import { formatDateTime } from "@/lib/format";
import type { Fee, FeeKind, PaymentMethod, PaymentStatusCode } from "./types";

export const METHOD_LABELS: Record<PaymentMethod, string> = {
  CASH: "Contanti",
  BANK_TRANSFER: "Bonifico",
  CARD: "Carta",
};

export const KIND_LABELS: Record<FeeKind, string> = {
  ENROLLMENT: "Iscrizione",
  MONTHLY: "Mensile",
  EXTRA: "Extra",
};

export const METHOD_OPTIONS = (Object.keys(METHOD_LABELS) as PaymentMethod[]).map((value) => ({
  value,
  label: METHOD_LABELS[value],
}));

export const KIND_OPTIONS = (Object.keys(KIND_LABELS) as FeeKind[]).map((value) => ({
  value,
  label: KIND_LABELS[value],
}));

/** Status handled by the PaymentChip, or null for cancelled fees (shown with their own chip). */
export function chipStatusOf(status: PaymentStatusCode): PaymentStatus | null {
  switch (status) {
    case "PAID":
      return "paid";
    case "PENDING":
      return "pending";
    case "OVERDUE":
      return "overdue";
    case "CANCELLED":
      return null;
  }
}

/** A fee still to be collected: the only ones that can be reported ("Ho pagato") or registered as paid. */
export function isUnpaid(fee: Fee): boolean {
  return fee.status === "PENDING" || fee.status === "OVERDUE";
}

/** The payer may report an unpaid fee once. */
export function canBeClaimed(fee: Fee): boolean {
  return isUnpaid(fee) && fee.claimedAt === null;
}

/**
 * What the report means for who reads it. The payer is told the fee is waiting for a check (never "paid");
 * the secretariat is told who reported. Null when there is nothing to say (never reported, or already settled).
 */
export function claimNote(fee: Fee, viewer: "payer" | "secretariat"): string | null {
  if (!isUnpaid(fee) || fee.claimedAt === null) return null;
  const when = formatDateTime(fee.claimedAt);
  return viewer === "secretariat" ? `Segnalato dal pagante il ${when}` : `Segnalato il ${when}: in attesa di verifica`;
}
