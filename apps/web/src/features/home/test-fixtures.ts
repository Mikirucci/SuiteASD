import { DASHBOARD } from "@/features/automazioni/test-fixtures";
import type { CalendarEvent } from "@/features/calendario/types";
import { COMPETITION, GROUP, SEASON, STANDINGS_BEFORE } from "@/features/classifiche/test-fixtures";
import type { FeePlan } from "@/features/quote/types";
import { pageOf, type FakeRoutes } from "@/test/fake-api";
import type { HomeAccess } from "./home-queries";

export const ADMIN_PERMISSIONS = [
  "members:read",
  "teams:read",
  "teams:write",
  "documents:read",
  "payments:read",
  "events:read",
  "convocations:read",
  "competitions:read",
  "notifications:readOwn",
  "automations:read",
  "joinLinks:read",
  "joinLinks:write",
  "ledger:read",
  "invitations:write",
  "attendance:read",
  "staff:read",
  "referees:read",
  "statistics:read",
  "sponsors:read",
  "evaluations:read",
  "venues:read",
  "trips:read",
  "kits:read",
  "announcements:read",
];

export const inDays = (days: number): string => new Date(Date.now() + days * 86_400_000).toISOString();
export const dayIn = (days: number): string => inDays(days).slice(0, 10);

export function event(overrides: Partial<CalendarEvent> = {}): CalendarEvent {
  return {
    id: "ev-1",
    type: "MATCH",
    title: "Aquile Volley vs Delfini Volley",
    startsAt: inDays(3),
    endsAt: null,
    status: "SCHEDULED",
    notes: null,
    team: { id: "td", name: "Serie D" },
    venue: { id: "v", name: "Palazzetto", address: null },
    recurrenceRule: null,
    recurrenceParentId: null,
    convocations: { confirmed: 5, declined: 1, pending: 6, total: 12, capacity: 12 },
    convocationsSentAt: null,
    createdAt: inDays(-10),
    updatedAt: inDays(-10),
    ...overrides,
  };
}

export const TRAINING = event({ id: "ev-2", type: "TRAINING", title: "Allenamento U16", startsAt: inDays(5) });

export const FEE_PLAN: FeePlan = {
  id: "fp-1",
  name: "Mensilità",
  kind: "MONTHLY",
  amountCents: 6000,
  currency: "EUR",
  teamId: null,
  seasonId: null,
  installments: 9,
  dueDay: 10,
  isActive: true,
  createdAt: inDays(-10),
  updatedAt: inDays(-10),
};

const expiration = (documentId: string, firstName: string, lastName: string, daysRemaining: number, status: "EXPIRED" | "EXPIRING" | "OK") => ({
  documentId,
  memberId: `m-${documentId}`,
  firstName,
  lastName,
  teams: ["U16"],
  documentType: { id: "t", key: "MEDICAL_CERTIFICATE", name: "Certificato medico" },
  expiresAt: dayIn(daysRemaining),
  daysRemaining,
  status,
});

/**
 * A busy society: unread enrolments, missing documents, an overdue fee and a match with open convocations.
 * `GET /events` answers by what is asked (next match, the next two weeks, or the "any event" probe).
 */
export const ROUTES: FakeRoutes = {
  "GET /members/summary": { body: { tesserati: 118, squadre: 6, documentiMancanti: 2 } },
  "GET /documents/expirations": {
    body: {
      from: dayIn(-30),
      to: dayIn(150),
      overdue: [expiration("d-old", "Anna", "Ferri", -3, "EXPIRED")],
      months: [
        {
          month: dayIn(15).slice(0, 7),
          items: [expiration("d-soon", "Sara", "Conti", 15, "EXPIRING"), expiration("d-far", "Elisa", "Neri", 120, "OK")],
        },
      ],
    },
  },
  "GET /fees/summary": {
    body: { incassatoCents: 24000, daIncassareCents: 18000, scadutoCents: 6000, promemoriaInviati: 4, paidCount: 4, pendingCount: 2, overdueCount: 1 },
  },
  "GET /fee-plans": pageOf([FEE_PLAN]),
  "GET /events": (request) => {
    if (request.query.get("type") === "MATCH") return pageOf([event()]);
    if (request.query.has("to")) return pageOf([event(), TRAINING]);
    return pageOf([event()]);
  },
  "GET /teams": pageOf([]),
  "GET /join-links": pageOf([]),
  "GET /seasons": pageOf([SEASON]),
  "GET /competitions": pageOf([COMPETITION]),
  "GET /competitions/c1/groups": pageOf([GROUP]),
  "GET /competitions/c1/groups/g1/standings": { body: STANDINGS_BEFORE },
  "GET /notifications/unread-count": { body: { count: 2 } },
  "GET /notifications": (request) => {
    if (request.query.get("type") === "ADMIN_NEW_ENROLMENT") {
      return pageOf([
        { id: "n3", type: "ADMIN_NEW_ENROLMENT", title: "Nuova iscrizione", body: "Giulia Rossi · U16", readAt: null, createdAt: inDays(-1) },
        { id: "n4", type: "ADMIN_NEW_ENROLMENT", title: "Nuova iscrizione", body: "Marco Bianchi · U14", readAt: null, createdAt: inDays(-2) },
      ]);
    }
    return pageOf([
      { id: "n1", type: "ADMIN_PAYMENT_RECEIVED", title: "Pagamento ricevuto", body: "Sara Conti · Quota novembre · € 60", readAt: null, createdAt: inDays(-1) },
      { id: "n2", type: "ADMIN_NEW_ENROLMENT", title: "Nuova iscrizione", body: "Giulia Rossi · U16", readAt: inDays(-1), createdAt: inDays(-2) },
    ]);
  },
  "GET /automations": { body: DASHBOARD },
};

/** Everything in order: nothing to read, nothing overdue, every convocation answered. */
export const QUIET_ROUTES: FakeRoutes = {
  ...ROUTES,
  "GET /members/summary": { body: { tesserati: 118, squadre: 6, documentiMancanti: 0 } },
  "GET /fees/summary": {
    body: { incassatoCents: 24000, daIncassareCents: 18000, scadutoCents: 0, promemoriaInviati: 4, paidCount: 4, pendingCount: 2, overdueCount: 0 },
  },
  "GET /events": (request) => {
    const answered = event({ convocations: { confirmed: 11, declined: 1, pending: 0, total: 12, capacity: 12 } });
    return request.query.get("type") === "MATCH" ? pageOf([answered]) : pageOf([answered, TRAINING]);
  },
  "GET /notifications": pageOf([]),
};

/** The permissions of the administration, as the flags the home reads. */
export const FULL_ACCESS: HomeAccess = {
  members: true,
  documents: true,
  payments: true,
  events: true,
  convocations: true,
  competitions: true,
  notifications: true,
  automations: true,
  enrolments: true,
  setup: true,
  teamsWrite: true,
  joinLinksWrite: true,
};
