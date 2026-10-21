import type { Page, Route } from "@playwright/test";

/** Network-level mock of the backend for the quote module spec: auth, teams, fee plans and fees with payment registration. */

const CORS = {
  "access-control-allow-origin": "http://localhost:3000",
  "access-control-allow-headers": "authorization,content-type,idempotency-key",
  "access-control-allow-methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS",
  "access-control-expose-headers": "content-disposition",
};

const STAFF_PERMISSIONS = ["payments:read", "payments:write", "receipts:read", "teams:read"];
const ATHLETE_PERMISSIONS = ["payments:readOwn", "teams:read"];

interface MockFee {
  id: string;
  memberId: string;
  memberName: string;
  teams: Array<{ id: string; name: string }>;
  feePlanId: string | null;
  description: string;
  amountCents: number;
  currency: string;
  dueDate: string;
  status: "PENDING" | "PAID" | "OVERDUE" | "CANCELLED";
  paidAt: string | null;
  method: string | null;
  payerName: string | null;
  payerEmail: string | null;
  reference: string | null;
  reminderCount: number;
  lastReminderAt: string | null;
  claimedAt: string | null;
  receipt: { id: string; number: number; code: string; issuedAt: string; sentAt: string | null } | null;
  createdAt: string;
  updatedAt: string;
}

function fee(id: string, memberName: string, team: [string, string], status: MockFee["status"], dueDate: string, extra: Partial<MockFee> = {}): MockFee {
  return {
    id,
    memberId: `m-${id}`,
    memberName,
    teams: [{ id: team[0], name: team[1] }],
    feePlanId: "p-nov",
    description: "Quota novembre",
    amountCents: 6000,
    currency: "EUR",
    dueDate,
    status,
    paidAt: null,
    method: null,
    payerName: null,
    payerEmail: null,
    reference: null,
    reminderCount: 0,
    lastReminderAt: null,
    claimedAt: null,
    receipt: null,
    createdAt: "2026-10-01T08:00:00.000Z",
    updatedAt: "2026-10-01T08:00:00.000Z",
    ...extra,
  };
}

function initialFees(): MockFee[] {
  return [
    fee("f1", "Anna Ferri", ["t-u18", "U18"], "PAID", "2026-10-10", {
      paidAt: "2026-10-05T10:00:00.000Z",
      method: "CASH",
      payerName: "Paolo Ferri",
      receipt: { id: "r146", number: 146, code: "0146", issuedAt: "2026-10-05T10:00:00.000Z", sentAt: "2026-10-05T10:00:05.000Z" },
    }),
    fee("f2", "Chiara Neri", ["t-u16", "U16"], "PENDING", "2099-11-10"),
    fee("f3", "Marta Bianchi", ["t-u18", "U18"], "OVERDUE", "2026-10-10", { reminderCount: 2, lastReminderAt: "2026-10-20T08:00:00.000Z" }),
    fee("f4", "Sara Conti", ["t-u16", "U16"], "PENDING", "2099-11-10"),
  ];
}

const PLANS = [
  {
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
  },
];

const TEAMS = [
  { id: "t-u16", name: "U16", category: "U16" },
  { id: "t-u18", name: "U18", category: "U18" },
];

export interface QuoteApiState {
  /** "METHOD /path" of every request served. */
  calls: string[];
  /** Idempotency-Key header of every payment request. */
  paymentKeys: string[];
  fees: MockFee[];
}

export type QuoteRole = "staff" | "athlete";

function pageOf<T>(data: T[]) {
  return { data, page: { nextCursor: null, hasMore: false } };
}

async function respond(route: Route, status: number, body?: unknown, headers: Record<string, string> = {}): Promise<void> {
  await route.fulfill({
    status,
    headers: { ...CORS, "content-type": status >= 400 ? "application/problem+json" : "application/json", ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

function summaryOf(fees: MockFee[]) {
  const sum = (status: MockFee["status"]) => fees.filter((item) => item.status === status).reduce((total, item) => total + item.amountCents, 0);
  const count = (status: MockFee["status"]) => fees.filter((item) => item.status === status).length;
  return {
    incassatoCents: sum("PAID"),
    daIncassareCents: sum("PENDING") + sum("OVERDUE"),
    scadutoCents: sum("OVERDUE"),
    promemoriaInviati: fees.reduce((total, item) => total + item.reminderCount, 0),
    paidCount: count("PAID"),
    pendingCount: count("PENDING"),
    overdueCount: count("OVERDUE"),
  };
}

/** Where each person stands in the plan: late if any fee is late, waiting if something is left to pay, settled otherwise. */
function planPeople(fees: MockFee[], query: URLSearchParams) {
  const byMember = new Map<string, MockFee[]>();
  for (const item of fees.filter((candidate) => candidate.feePlanId === "p-nov" && candidate.status !== "CANCELLED")) {
    byMember.set(item.memberId, [...(byMember.get(item.memberId) ?? []), item]);
  }
  const everyone = [...byMember.values()]
    .map((own) => {
      const unpaid = own.filter((item) => item.status === "PENDING" || item.status === "OVERDUE");
      const status = unpaid.some((item) => item.status === "OVERDUE") ? "OVERDUE" : unpaid.length > 0 ? "PENDING" : "PAID";
      return {
        memberId: own[0]!.memberId,
        memberName: own[0]!.memberName,
        teams: own[0]!.teams,
        totalDueCents: unpaid.reduce((total, item) => total + item.amountCents, 0),
        allPlansDueCents: fees
          .filter((item) => item.memberId === own[0]!.memberId && (item.status === "PENDING" || item.status === "OVERDUE"))
          .reduce((total, item) => total + item.amountCents, 0),
        paidCents: own.filter((item) => item.status === "PAID").reduce((total, item) => total + item.amountCents, 0),
        status,
        feesCount: own.length,
        nextDueDate: unpaid.map((item) => item.dueDate).sort()[0] ?? null,
      };
    })
    .sort((a, b) => a.memberName.localeCompare(b.memberName, "it"));
  const count = (status: string) => everyone.filter((person) => person.status === status).length;
  const sum = (status: MockFee["status"]) => fees.filter((item) => item.feePlanId === "p-nov" && item.status === status).reduce((total, item) => total + item.amountCents, 0);
  const stats = {
    incassatoCents: sum("PAID"),
    daIncassareCents: sum("PENDING") + sum("OVERDUE"),
    scadutoCents: sum("OVERDUE"),
    paidPeople: count("PAID"),
    pendingPeople: count("PENDING"),
    overduePeople: count("OVERDUE"),
  };
  const search = query.get("q")?.toLowerCase();
  const team = query.get("teamId");
  const status = query.get("status");
  const people = everyone.filter(
    (person) =>
      (!search || person.memberName.toLowerCase().includes(search)) &&
      (!team || person.teams.some((entry) => entry.id === team)) &&
      (!status || person.status === status),
  );
  return { stats, people };
}

/** Signs the user in (stored refresh token) and serves the quote endpoints for a staff member or an athlete. */
export async function mockQuoteApi(page: Page, role: QuoteRole = "staff"): Promise<QuoteApiState> {
  const staff = role === "staff";
  const state: QuoteApiState = { calls: [], paymentKeys: [], fees: initialFees() };
  let nextReceipt = 147;

  const session = {
    accessToken: "access-token-1",
    refreshToken: "refresh-token-1",
    tokenType: "Bearer",
    expiresIn: 900,
    user: { id: "u1", email: "segreteria@aquilevolley.it", firstName: "Elisa", lastName: "Gallo" },
    society: { id: "s1", name: "Aquile Volley" },
    roles: [staff ? "SEGRETERIA" : "GENITORE"],
  };
  const me = {
    user: { ...session.user, phone: null },
    society: { ...session.society, slug: "aquile-volley" },
    roles: session.roles,
    permissions: staff ? STAFF_PERMISSIONS : ATHLETE_PERMISSIONS,
    societies: [{ ...session.society, roles: session.roles }],
    member: null,
    children: [],
  };

  await page.addInitScript(() => {
    window.localStorage.setItem("suiteasd.refreshToken", "refresh-token-1");
  });

  await page.route("**/api/v1/**", async (route) => {
    const request = route.request();
    if (request.method() === "OPTIONS") {
      await route.fulfill({ status: 204, headers: CORS });
      return;
    }
    const url = new URL(request.url());
    const path = url.pathname.replace(/^\/api\/v1/, "");
    const key = `${request.method()} ${path}`;
    state.calls.push(key);
    const query = url.searchParams;

    if (key === "POST /auth/refresh") return respond(route, 200, session);
    if (key === "GET /me") return respond(route, 200, me);
    if (key === "GET /teams") return respond(route, 200, pageOf(TEAMS));
    if (key === "GET /fee-plans") return respond(route, 200, pageOf(PLANS));
    if (key === "GET /fee-plans/report") return respond(route, 200, { data: [{ feePlanId: "p-nov", ...planPeople(state.fees, query).stats }] });
    if (key === "GET /fee-plans/p-nov") return respond(route, 200, PLANS[0]);
    if (key === "GET /fee-plans/p-nov/people") return respond(route, 200, planPeople(state.fees, query));
    if (key === "POST /fee-plans") {
      const body = request.postDataJSON() as Record<string, unknown>;
      return respond(route, 201, { ...PLANS[0], ...body, id: "p-new" });
    }

    if (key === "GET /fees" || key === "GET /fees/summary") {
      const status = query.get("status");
      const team = query.get("teamId");
      const search = query.get("q")?.toLowerCase();
      const scoped = state.fees.filter(
        (item) =>
          (!team || item.teams.some((entry) => entry.id === team)) &&
          (!search || item.memberName.toLowerCase().includes(search)) &&
          (staff || item.memberName === "Chiara Neri" || item.memberName === "Anna Ferri"),
      );
      if (key === "GET /fees/summary") return respond(route, 200, summaryOf(scoped));
      return respond(route, 200, pageOf(scoped.filter((item) => !status || item.status === status)));
    }

    const pay = /^\/fees\/([^/]+)\/pay$/.exec(path);
    if (request.method() === "POST" && pay) {
      state.paymentKeys.push(request.headers()["idempotency-key"] ?? "");
      const target = state.fees.find((item) => item.id === pay[1]);
      if (!target) return respond(route, 404, { type: "about:blank", title: "Not Found", status: 404, code: "not_found" });
      const body = request.postDataJSON() as { method: string; payerName?: string; reference?: string };
      const number = nextReceipt;
      nextReceipt += 1;
      Object.assign(target, {
        status: "PAID",
        paidAt: new Date().toISOString(),
        method: body.method,
        payerName: body.payerName ?? target.memberName,
        reference: body.reference ?? null,
        receipt: { id: `r${number}`, number, code: String(number).padStart(4, "0"), issuedAt: new Date().toISOString(), sentAt: null },
      });
      return respond(route, 200, target);
    }

    const receipt = /^\/fees\/([^/]+)\/receipt$/.exec(path);
    if (request.method() === "GET" && receipt) {
      const target = state.fees.find((item) => item.id === receipt[1]);
      if (!target?.receipt || request.headers().authorization !== "Bearer access-token-1") {
        return respond(route, 404, { type: "about:blank", title: "Not Found", status: 404, code: "not_found" });
      }
      return route.fulfill({
        status: 200,
        headers: {
          ...CORS,
          "content-type": "application/pdf",
          "content-disposition": `attachment; filename="ricevuta-${target.receipt.code}.pdf"`,
        },
        body: "%PDF-1.4\n%%EOF",
      });
    }

    return respond(route, 404, { type: "about:blank", title: "Not Found", status: 404, code: "not_found" });
  });

  return state;
}
