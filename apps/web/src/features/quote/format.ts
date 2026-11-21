import type { PaymentStatus } from "@/components/ui";
import { toDayKey } from "@/lib/dates";
import { formatDateTime, formatEuro } from "@/lib/format";
import type { Fee, FeeKind, FeePlan, PaymentMethod, PaymentStatusCode, TeamRef } from "./types";

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

/** The same day of the month `months` later; a day the month does not have (the 31st) becomes its last day. */
export function addMonthsToDay(day: string, months: number): string {
  const [year = 0, month = 1, date = 1] = day.split("-").map(Number);
  const target = new Date(year, month - 1 + months, 1);
  const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
  target.setDate(Math.min(date, lastDay));
  return toDayKey(target);
}

/** "A", "A e B", "A, B e C". */
export function joinNames(names: readonly string[]): string {
  if (names.length <= 1) return names.join("");
  return `${names.slice(0, -1).join(", ")} e ${names[names.length - 1]}`;
}

/** Who a plan is billed to: every team, the named teams, or just their number when they would not fit a card. */
export function describeTeams(teamIds: readonly string[], teams: readonly TeamRef[], maxNamed = 2): string {
  if (teamIds.length === 0) return "Tutte le squadre";
  const names = teamIds.map((id) => teams.find((team) => team.id === id)?.name ?? "Una squadra");
  return names.length <= maxNamed ? joinNames(names) : `${names.length} squadre`;
}

/** How a plan is paid: "Pagamento unico di € 60" or "4 pagamenti da € 60". */
export function describeSchedule(plan: Pick<FeePlan, "installments" | "amountCents">): string {
  const amount = formatEuro(plan.amountCents);
  return plan.installments === 1 ? `Pagamento unico di ${amount}` : `${plan.installments} pagamenti da ${amount}`;
}

/** The terms of a plan on one line: how it is paid, who pays. */
export function describePlan(plan: FeePlan, teams: readonly TeamRef[], maxNamed?: number): string {
  return [describeSchedule(plan), describeTeams(plan.teamIds, teams, maxNamed)].join(" · ");
}
