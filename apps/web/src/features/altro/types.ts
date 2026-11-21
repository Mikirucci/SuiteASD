/** Wire types of the secondary-module endpoints. Source of truth: the backend OpenAPI contract (docs/api/openapi.yaml in the SuiteASD-backend repository). */

/** One weekly time window of a venue: the day (1 Monday ... 7 Sunday) and the hours it can be used. */
export interface VenueSlot {
  weekday: number;
  /** "HH:MM". */
  from: string;
  to: string;
}

/** What the venues page shows on top: GET /venues/summary. */
export interface VenueSummary {
  count: number;
  /** Sum of the capacity of the venues that have one. */
  capacityTotal: number;
  costTotalCents: number;
  /** The part of the cost booked in the current month. */
  costThisMonthCents: number;
  /** Venues with a cost. */
  costedCount: number;
  priciest: { name: string; costCents: number } | null;
  /** Minutes in a week the club can use the venues. */
  weeklyMinutes: number;
  slotsCount: number;
}

export interface Venue {
  id: string;
  name: string;
  address: string | null;
  city: string | null;
  capacity: number | null;
  availability: string | null;
  /** The weekly hours, by day and time. */
  slots: VenueSlot[];
  notes: string | null;
  /** What the venue costs: it is an expense of the balance. */
  costCents: number | null;
  /** Day the cost is booked in the balance, "YYYY-MM-DD". */
  costDate: string | null;
  createdAt: string;
  updatedAt: string;
}

export type TripStatus = "PLANNED" | "CONFIRMED" | "CANCELLED";
export type TripTransport = "CAR" | "MINIBUS" | "OTHER";

export interface Trip {
  id: string;
  eventId: string | null;
  destination: string;
  departAt: string;
  returnAt: string | null;
  transport: TripTransport;
  seats: number | null;
  costCents: number | null;
  status: TripStatus;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Kit {
  id: string;
  item: string;
  size: string | null;
  number: number | null;
  condition: string | null;
  memberId: string | null;
  member: { id: string; firstName: string; lastName: string } | null;
  assignedAt: string | null;
  notes: string | null;
  /** What the piece cost: it is an expense of the balance. */
  costCents: number | null;
  /** Day the cost is booked in the balance, "YYYY-MM-DD". */
  costDate: string | null;
  createdAt: string;
  updatedAt: string;
}

export type SponsorStatus = "ACTIVE" | "EXPIRED" | "PROSPECT";

export interface Sponsor {
  id: string;
  name: string;
  contactName: string | null;
  email: string | null;
  phone: string | null;
  amountCents: number;
  /** Date only, "YYYY-MM-DD". */
  contractStart: string | null;
  contractEnd: string | null;
  status: SponsorStatus;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

/** What the sponsors screen shows on top: GET /sponsors/summary. */
export interface SponsorSummary {
  activeCount: number;
  /** Sum of the contract amounts of the active sponsors. */
  activeCents: number;
  /** Active sponsors whose contract ends within 30 days. */
  expiringCount: number;
  prospectCount: number;
  expiredCount: number;
}

export type StaffRole = "COACH" | "MANAGER" | "OTHER";

export interface StaffMember {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  role: StaffRole;
  qualifications: string | null;
  notes: string | null;
  userId: string | null;
  createdAt: string;
  updatedAt: string;
}

export type LedgerKind = "INCOME" | "EXPENSE";
export type LedgerSource = "PAYMENT" | "SPONSOR" | "VENUE" | "KIT" | "TRIP" | "REFEREE";

export interface LedgerEntry {
  id: string;
  kind: LedgerKind;
  category: string;
  description: string | null;
  amountCents: number;
  /** Date only, "YYYY-MM-DD". */
  occurredOn: string;
  /** Who was paid, or who paid. */
  supplier: string | null;
  notes: string | null;
  /** Who owns the entry when it is not manual: a payment, a sponsor contract, or the cost of a venue, kit, trip or referee. */
  source: LedgerSource | null;
  /** The record that owns the entry, in the section named by `source`. */
  sourceId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface LedgerTotals {
  incomeCents: number;
  expenseCents: number;
  /** Incomes minus expenses: negative when more went out than came in. */
  balanceCents: number;
}

/** Incomes and expenses of a period and how they follow one another: GET /ledger/trend. */
export interface LedgerTrend {
  /** One bucket for each day up to two months, for each month beyond. */
  granularity: "DAY" | "MONTH";
  totals: LedgerTotals;
  /** "YYYY-MM-DD" for a day, "YYYY-MM" for a month; the empty ones included. */
  buckets: Array<LedgerTotals & { key: string }>;
}

/** Totals of the incomes or of the expenses of a period: GET /ledger/summary. */
export interface LedgerSummary {
  totalCents: number;
  count: number;
  /** Entered by hand. */
  manualCents: number;
  /** Born from a payment or from the cost of a venue, kit, trip or referee. */
  linkedCents: number;
  /** The heaviest first. */
  categories: Array<{
    category: string;
    totalCents: number;
    count: number;
    /** Earliest and latest day of its entries, "YYYY-MM-DD". */
    firstOn: string;
    lastOn: string;
    /** Names of its biggest entries. */
    names: string[];
  }>;
}

/** One group per item name: GET /kits/groups. */
export interface KitGroup {
  item: string;
  total: number;
  assigned: number;
  inStock: number;
  totalCostCents: number;
}
