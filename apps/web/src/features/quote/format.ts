import type { PaymentStatus } from "@/components/ui";
import type { FeeKind, PaymentMethod, PaymentStatusCode } from "./types";

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
