import type { Fee, FeePlan, FeesSummary, TeamOption } from "./types";

/** Fixtures of the quote feature tests. The network stub and the provider wrapper live in src/test/stub-api. */

export const STAFF_PERMISSIONS = ["payments:read", "payments:write", "receipts:read", "automations:read", "teams:read"];
export const ATHLETE_PERMISSIONS = ["payments:readOwn", "teams:read"];

export function makeFee(overrides: Partial<Fee> = {}): Fee {
  return {
    id: "f-pending",
    memberId: "m-neri",
    memberName: "Chiara Neri",
    teams: [{ id: "t-u16", name: "U16" }],
    feePlanId: "p-nov",
    description: "Quota novembre",
    amountCents: 6000,
    currency: "EUR",
    dueDate: "2026-11-10",
    status: "PENDING",
    paidAt: null,
    method: null,
    payerName: null,
    payerEmail: null,
    reference: null,
    reminderCount: 0,
    lastReminderAt: null,
    receipt: null,
    createdAt: "2026-10-01T08:00:00.000Z",
    updatedAt: "2026-10-01T08:00:00.000Z",
    ...overrides,
  };
}

export const PAID_FEE = makeFee({
  id: "f-paid",
  memberId: "m-ferri",
  memberName: "Anna Ferri",
  teams: [{ id: "t-u18", name: "U18" }],
  status: "PAID",
  paidAt: "2026-11-05T10:00:00.000Z",
  method: "CASH",
  payerName: "Paolo Ferri",
  receipt: { id: "r147", number: 147, code: "0147", issuedAt: "2026-11-05T10:00:00.000Z" },
});
export const PENDING_FEE = makeFee();
export const OVERDUE_FEE = makeFee({
  id: "f-overdue",
  memberId: "m-bianchi",
  memberName: "Marta Bianchi",
  teams: [{ id: "t-u18", name: "U18" }],
  status: "OVERDUE",
  dueDate: "2026-10-10",
  reminderCount: 2,
  lastReminderAt: "2026-10-20T08:00:00.000Z",
});

export const SUMMARY: FeesSummary = {
  incassatoCents: 24000,
  daIncassareCents: 12000,
  scadutoCents: 6000,
  promemoriaInviati: 4,
  paidCount: 4,
  pendingCount: 1,
  overdueCount: 1,
};

export const TEAMS: TeamOption[] = [
  { id: "t-u16", name: "U16", category: "U16" },
  { id: "t-u18", name: "U18", category: "U18" },
];

export const PLAN: FeePlan = {
  id: "p-nov",
  name: "Quota novembre",
  kind: "MONTHLY",
  amountCents: 6000,
  currency: "EUR",
  teamId: null,
  seasonId: null,
  installments: null,
  dueDay: 10,
  isActive: true,
  createdAt: "2026-10-01T08:00:00.000Z",
  updatedAt: "2026-10-01T08:00:00.000Z",
};
