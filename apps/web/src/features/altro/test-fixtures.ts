import type { Kit, LedgerEntry, LedgerReport, Sponsor, StaffMember, Trip, Venue } from "./types";

/** Realistic demo data shared by the unit tests of the secondary modules. */

const STAMPS = { createdAt: "2026-10-01T08:00:00.000Z", updatedAt: "2026-10-01T08:00:00.000Z" };

export const WRITE_PERMISSIONS = ["venues:write", "trips:write", "kits:write", "sponsors:write", "ledger:write", "staff:write"];

export const PALAZZETTO: Venue = {
  id: "v-palazzetto",
  name: "Palazzetto dello Sport",
  address: "Via dello Sport 12",
  city: "Bergamo",
  capacity: 400,
  availability: "Martedì e giovedì 18:00-21:00",
  notes: null,
  costCents: 45000,
  costDate: "2026-11-02",
  ...STAMPS,
};

export const SCUOLA: Venue = {
  id: "v-scuola",
  name: "Palestra Scuola Media",
  address: null,
  city: "Seriate",
  capacity: null,
  availability: null,
  notes: "Chiavi in segreteria",
  costCents: null,
  costDate: null,
  ...STAMPS,
};

export const TRASFERTA: Trip = {
  id: "t-delfini",
  eventId: null,
  destination: "Palasport Delfini, Verona",
  departAt: "2026-11-14T13:30:00.000Z",
  returnAt: "2026-11-14T22:00:00.000Z",
  transport: "MINIBUS",
  seats: 9,
  costCents: 12000,
  status: "CONFIRMED",
  notes: null,
  ...STAMPS,
};

export const MAGLIA: Kit = {
  id: "k-maglia",
  item: "Maglia gara",
  size: "S",
  number: 7,
  condition: "Nuova",
  memberId: "m-rossi",
  member: { id: "m-rossi", firstName: "Giulia", lastName: "Rossi" },
  assignedAt: "2026-11-03T09:00:00.000Z",
  notes: null,
  costCents: 2500,
  costDate: "2026-10-20",
  ...STAMPS,
};

export const TUTA: Kit = {
  id: "k-tuta",
  item: "Tuta",
  size: "M",
  number: null,
  condition: null,
  memberId: null,
  member: null,
  assignedAt: null,
  notes: null,
  costCents: null,
  costDate: null,
  ...STAMPS,
};

export const PANIFICIO: Sponsor = {
  id: "s-panificio",
  name: "Panificio Rizzi",
  contactName: "Elena Rizzi",
  email: "elena@panificiorizzi.it",
  phone: "035 123456",
  amountCents: 150000,
  contractStart: "2026-09-01",
  contractEnd: "2027-08-31",
  status: "ACTIVE",
  notes: null,
  ...STAMPS,
};

export const ALLENATORE: StaffMember = {
  id: "st-villa",
  firstName: "Marco",
  lastName: "Villa",
  email: "marco.villa@aquilevolley.it",
  phone: null,
  role: "COACH",
  qualifications: "Allenatore 2° grado FIPAV",
  notes: null,
  userId: null,
  ...STAMPS,
};

export const QUOTE_NOVEMBRE: LedgerEntry = {
  id: "l-quote",
  kind: "INCOME",
  category: "Quote",
  description: "Quota novembre di Anna Ferri",
  amountCents: 6000,
  occurredOn: "2026-11-05",
  sponsorId: null,
  supplier: null,
  notes: null,
  paymentId: "pay-1",
  source: "PAYMENT",
  ...STAMPS,
};

export const AFFITTO: LedgerEntry = {
  id: "l-affitto",
  kind: "EXPENSE",
  category: "Affitto palestra",
  description: null,
  amountCents: 45000,
  occurredOn: "2026-11-02",
  sponsorId: null,
  supplier: null,
  notes: null,
  paymentId: null,
  source: null,
  ...STAMPS,
};

export const REPORT: LedgerReport = {
  year: 2026,
  totals: { incomeCents: 6000, expenseCents: 45000, balanceCents: -39000 },
  months: Array.from({ length: 12 }, (_, index) => ({
    month: `2026-${String(index + 1).padStart(2, "0")}`,
    incomeCents: index === 10 ? 6000 : 0,
    expenseCents: index === 10 ? 45000 : 0,
    balanceCents: index === 10 ? -39000 : 0,
  })),
  categories: [
    { kind: "INCOME", category: "Quote", totalCents: 6000 },
    { kind: "EXPENSE", category: "Affitto palestra", totalCents: 45000 },
  ],
};

/** What GET /reports/accounting/summary answers for the demo year. */
export const REPORT_SUMMARY = {
  period: { from: "2026-01-01", to: "2026-12-31" },
  sections: [
    { section: "LEDGER", records: 12, amountCents: -39000 },
    { section: "FEES", records: 8, amountCents: 24000 },
    { section: "SPONSORS", records: 0, amountCents: 0 },
    { section: "TRIPS", records: 1, amountCents: 12050 },
    { section: "REFEREES", records: 3, amountCents: 12000 },
  ],
};
