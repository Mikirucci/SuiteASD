/** Wire types of the fees API. Keep in sync with apps/api/src/modules/fees/schema.ts. */

export type FeeKind = "ENROLLMENT" | "MONTHLY" | "EXTRA";
export type PaymentMethod = "CASH" | "BANK_TRANSFER" | "CARD";
/** OVERDUE is derived by the server: a pending fee with a past due date. */
export type PaymentStatusCode = "PENDING" | "PAID" | "OVERDUE" | "CANCELLED";

export interface CursorPage<T> {
  data: T[];
  page: { nextCursor: string | null; hasMore: boolean };
}

export interface TeamRef {
  id: string;
  name: string;
}

/** Subset of the team resource used by the team filter. */
export interface TeamOption extends TeamRef {
  category: string | null;
}

export interface Receipt {
  id: string;
  number: number;
  /** Zero-padded number, e.g. "0147". */
  code: string;
  issuedAt: string;
  /** When the receipt notification went out to the payer and the administration; null until then. */
  sentAt: string | null;
}

export interface Fee {
  id: string;
  memberId: string;
  memberName: string;
  teams: TeamRef[];
  feePlanId: string | null;
  description: string;
  amountCents: number;
  currency: string;
  /** Calendar day, "YYYY-MM-DD". */
  dueDate: string;
  status: PaymentStatusCode;
  paidAt: string | null;
  method: PaymentMethod | null;
  payerName: string | null;
  payerEmail: string | null;
  reference: string | null;
  reminderCount: number;
  lastReminderAt: string | null;
  /** When the payer reported "Ho pagato"; null if never. The status stays unchanged until the payment is registered. */
  claimedAt: string | null;
  receipt: Receipt | null;
  createdAt: string;
  updatedAt: string;
}

export interface FeesSummary {
  incassatoCents: number;
  daIncassareCents: number;
  scadutoCents: number;
  promemoriaInviati: number;
  paidCount: number;
  pendingCount: number;
  overdueCount: number;
}

export interface FeePlan {
  id: string;
  name: string;
  kind: FeeKind;
  amountCents: number;
  currency: string;
  teamId: string | null;
  seasonId: string | null;
  installments: number | null;
  dueDay: number | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface PayFeeBody {
  method: PaymentMethod;
  paidAt?: string;
  payerName?: string;
  payerEmail?: string;
  reference?: string;
}

export interface FeePlanBody {
  name: string;
  kind: FeeKind;
  amountCents: number;
  teamId?: string | null;
  installments?: number | null;
  dueDay?: number | null;
  isActive?: boolean;
}

export interface GenerateFeesBody {
  dueDate: string;
  description?: string;
}

export interface GenerateFeesResult {
  created: number;
  skipped: number;
}
