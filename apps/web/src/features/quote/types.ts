/** Wire types of the fees API. Keep in sync with the backend OpenAPI contract (docs/api/openapi.yaml in the SuiteASD-backend repository). */

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
}

export interface Fee {
  id: string;
  memberId: string;
  memberName: string;
  teams: TeamRef[];
  feePlanId: string | null;
  description: string;
  amountCents: number;
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
  paidCount: number;
  pendingCount: number;
  overdueCount: number;
}

export interface FeePlan {
  id: string;
  name: string;
  kind: FeeKind;
  amountCents: number;
  /** The teams the plan bills; empty means every active member. */
  teamIds: string[];
  installments: number;
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

/** Creating a plan bills the members right away: one fee for each due date. */
export interface CreateFeePlanBody {
  name: string;
  kind: FeeKind;
  amountCents: number;
  teamIds: string[];
  dueDates: string[];
}

/** Only these change after creation: amount, teams and dates are the ones the fees were generated with. */
export interface UpdateFeePlanBody {
  name?: string;
  kind?: FeeKind;
  isActive?: boolean;
}

export type FeePlanBody = CreateFeePlanBody | UpdateFeePlanBody;

/** Where a person stands in one plan: late if any fee is late, waiting if something is left to pay, settled otherwise. */
export type PersonPaymentStatus = "PAID" | "PENDING" | "OVERDUE";

export interface PlanStats {
  incassatoCents: number;
  daIncassareCents: number;
  scadutoCents: number;
  /** People with nothing left to pay. */
  paidPeople: number;
  /** People with fees to pay, none of them late. */
  pendingPeople: number;
  /** People with at least one late fee. */
  overduePeople: number;
}

/** Row of GET /fee-plans/report: only plans that have at least one fee. */
export interface PlanReportEntry extends PlanStats {
  feePlanId: string;
}

export interface PlanReport {
  data: PlanReportEntry[];
}

export interface PlanPerson {
  memberId: string;
  memberName: string;
  teams: TeamRef[];
  /** What the person still has to pay in the plan; 0 when settled. */
  totalDueCents: number;
  /** What the person still has to pay across every plan of the society; 0 when settled. */
  allPlansDueCents: number;
  paidCents: number;
  status: PersonPaymentStatus;
  feesCount: number;
  /** Earliest due date among the unpaid fees, "YYYY-MM-DD". */
  nextDueDate: string | null;
}

/** GET /fee-plans/:id/people. The stats describe the whole plan whatever the filters; the people are filtered and ordered by name. */
export interface PlanPeople {
  stats: PlanStats;
  people: PlanPerson[];
}
