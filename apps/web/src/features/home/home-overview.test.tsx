import { screen, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DASHBOARD } from "@/features/automazioni/test-fixtures";
import { COMPETITION, GROUP, SEASON, STANDINGS_BEFORE } from "@/features/classifiche/test-fixtures";
import { expectNoA11yViolations } from "@/test/a11y";
import { installFakeApi, pageOf, problem, type FakeRoutes } from "@/test/fake-api";
import { renderWithQuery } from "@/test/render-with-query";
import { HomeOverview } from "./home-overview";

const ADMIN_PERMISSIONS = [
  "members:read",
  "payments:read",
  "events:read",
  "competitions:read",
  "notifications:readOwn",
  "automations:read",
];

const auth = vi.hoisted(() => ({ permissions: [] as string[] }));
vi.mock("@/features/auth/auth-provider", () => ({
  useAuth: () => ({
    status: "authenticated",
    me: {
      user: { firstName: "Paolo", lastName: "Marchetti" },
      society: { name: "Aquile Volley" },
      roles: ["ADMIN"],
      permissions: auth.permissions,
    },
  }),
}));
vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: { href: string; children: ReactNode } & Record<string, unknown>) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

const inDays = (days: number): string => new Date(Date.now() + days * 86_400_000).toISOString();
const dayIn = (days: number): string => inDays(days).slice(0, 10);

const ROUTES: FakeRoutes = {
  "GET /members/summary": { body: { tesserati: 118, squadre: 6, documentiMancanti: 2 } },
  "GET /documents/expirations": {
    body: {
      from: dayIn(-30),
      to: dayIn(150),
      overdue: [
        {
          documentId: "d-old",
          memberId: "m1",
          firstName: "Anna",
          lastName: "Ferri",
          teams: ["U16"],
          documentType: { id: "t", key: "MEDICAL_CERTIFICATE", name: "Certificato medico" },
          expiresAt: dayIn(-3),
          daysRemaining: -3,
          status: "EXPIRED",
        },
      ],
      months: [
        {
          month: dayIn(15).slice(0, 7),
          items: [
            {
              documentId: "d-soon",
              memberId: "m2",
              firstName: "Sara",
              lastName: "Conti",
              teams: ["U16"],
              documentType: { id: "t", key: "MEDICAL_CERTIFICATE", name: "Certificato medico" },
              expiresAt: dayIn(15),
              daysRemaining: 15,
              status: "EXPIRING",
            },
            {
              documentId: "d-far",
              memberId: "m3",
              firstName: "Elisa",
              lastName: "Neri",
              teams: ["U16"],
              documentType: { id: "t", key: "MEDICAL_CERTIFICATE", name: "Certificato medico" },
              expiresAt: dayIn(120),
              daysRemaining: 120,
              status: "OK",
            },
          ],
        },
      ],
    },
  },
  "GET /fees/summary": {
    body: { incassatoCents: 24000, daIncassareCents: 18000, scadutoCents: 6000, promemoriaInviati: 4, paidCount: 4, pendingCount: 2, overdueCount: 1 },
  },
  "GET /events": pageOf([
    {
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
    },
  ]),
  "GET /seasons": pageOf([SEASON]),
  "GET /competitions": pageOf([COMPETITION]),
  "GET /competitions/c1/groups": pageOf([GROUP]),
  "GET /competitions/c1/groups/g1/standings": { body: STANDINGS_BEFORE },
  "GET /notifications/unread-count": { body: { count: 2 } },
  "GET /notifications": pageOf([
    { id: "n1", type: "ADMIN_PAYMENT_RECEIVED", title: "Pagamento ricevuto", body: "Sara Conti · Quota novembre · € 60", readAt: null, createdAt: inDays(-1) },
    { id: "n2", type: "ADMIN_NEW_ENROLMENT", title: "Nuova iscrizione", body: "Giulia Rossi · U16", readAt: inDays(-1), createdAt: inDays(-2) },
  ]),
  "GET /automations": { body: DASHBOARD },
};

beforeEach(() => {
  auth.permissions = ADMIN_PERMISSIONS;
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("HomeOverview", () => {
  it("greets the administrator and previews every service", async () => {
    installFakeApi(ROUTES);
    const { container } = renderWithQuery(<HomeOverview />);
    expect(screen.getByRole("heading", { level: 1, name: "Ciao Paolo, buon lavoro." })).toBeInTheDocument();
    expect(screen.getByText(/Accesso come amministratore/)).toBeInTheDocument();

    const previews = screen.getByRole("list", { name: "Anteprima dei servizi" });
    const section = (name: string) => within(previews).getByRole("region", { name });
    expect(within(section("Tesserati")).getByRole("link", { name: "Apri i tesserati" })).toHaveAttribute("href", "/tesserati");
    expect(await within(section("Tesserati")).findByText("118")).toBeInTheDocument();
    expect(within(section("Tesserati")).getByText("2")).toBeInTheDocument();

    const expirations = section("Scadenze");
    expect(await within(expirations).findByText("Anna Ferri")).toBeInTheDocument();
    expect(within(expirations).getByText("Sara Conti")).toBeInTheDocument();
    // Only what is expired or about to expire: the certificate 120 days away is not urgent
    expect(within(expirations).queryByText("Elisa Neri")).not.toBeInTheDocument();

    const fees = section("Quote");
    expect(await within(fees).findByText("€ 240")).toBeInTheDocument();
    expect(within(fees).getByText("€ 180")).toBeInTheDocument();
    expect(within(fees).getByText(/1 quota scaduta/)).toBeInTheDocument();

    expect(await within(section("Calendario")).findByText("Aquile Volley vs Delfini Volley")).toBeInTheDocument();

    const standings = section("Classifica");
    expect(await within(standings).findByText("Falchi Volley")).toBeInTheDocument();
    // Our team is third: in the top three, highlighted
    expect(within(standings).getByText("Aquile Volley")).toBeInTheDocument();

    const notifications = section("Notifiche");
    expect(await within(notifications).findByText("Pagamento ricevuto")).toBeInTheDocument();
    expect(within(notifications).getByText("2 da leggere")).toBeInTheDocument();

    expect(await within(section("Automazioni")).findByText(`${DASHBOARD.summary.percentage}%`)).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it("links to the services the previews do not cover", () => {
    installFakeApi(ROUTES);
    renderWithQuery(<HomeOverview />);
    const others = screen.getByRole("navigation", { name: "Altre sezioni" });
    expect(within(others).getByRole("link", { name: "Pagelle" })).toHaveAttribute("href", "/pagelle");
    expect(within(others).getByRole("link", { name: "Altro" })).toHaveAttribute("href", "/altro");
  });

  it("lists our team below the top three when it is further down", async () => {
    const rows = STANDINGS_BEFORE.rows.map((row) => ({ ...row, position: row.position === 3 ? 5 : row.position === 5 ? 3 : row.position }));
    const reordered = [...rows].sort((a, b) => a.position - b.position);
    installFakeApi({ ...ROUTES, "GET /competitions/c1/groups/g1/standings": { body: { ...STANDINGS_BEFORE, rows: reordered } } });
    renderWithQuery(<HomeOverview />);
    const standings = await screen.findByRole("list", { name: "Prime posizioni" });
    await within(standings).findByText("Falchi Volley");
    const names = within(standings).getAllByRole("listitem").map((item) => item.textContent);
    expect(names).toHaveLength(4);
    expect(names[3]).toContain("Aquile Volley");
  });

  it("shows only the previews of the services the user may read", () => {
    auth.permissions = ["events:read", "notifications:readOwn"];
    installFakeApi(ROUTES);
    renderWithQuery(<HomeOverview />);
    const previews = screen.getByRole("list", { name: "Anteprima dei servizi" });
    expect(within(previews).getAllByRole("region").map((region) => region.getAttribute("aria-labelledby")).length).toBe(2);
    expect(within(previews).getByRole("region", { name: "Calendario" })).toBeInTheDocument();
    expect(within(previews).getByRole("region", { name: "Notifiche" })).toBeInTheDocument();
    expect(within(previews).queryByRole("region", { name: "Quote" })).not.toBeInTheDocument();
    expect(within(previews).queryByRole("region", { name: "Tesserati" })).not.toBeInTheDocument();
  });

  it("does not ask for the data of previews the user cannot see", () => {
    auth.permissions = ["events:read"];
    const api = installFakeApi(ROUTES);
    renderWithQuery(<HomeOverview />);
    expect(api.labels().some((label) => label.includes("/fees") || label.includes("/members") || label.includes("/automations"))).toBe(false);
  });

  it("keeps working when one service fails, with a retry for that one", async () => {
    let attempts = 0;
    installFakeApi({ ...ROUTES, "GET /fees/summary": () => (++attempts <= 3 ? problem(500, "internal") : { body: { incassatoCents: 1000, daIncassareCents: 0, scadutoCents: 0, promemoriaInviati: 0, paidCount: 1, pendingCount: 0, overdueCount: 0 } }) });
    renderWithQuery(<HomeOverview />);
    const previews = screen.getByRole("list", { name: "Anteprima dei servizi" });
    expect(await within(previews).findByText("118")).toBeInTheDocument();
    const fees = within(previews).getByRole("region", { name: "Quote" });
    expect(await within(fees).findByRole("alert")).toBeInTheDocument();
    // The others are not affected
    expect(within(previews).getByRole("region", { name: "Tesserati" })).toBeInTheDocument();
  });

  it("says so when there is nothing to show yet", async () => {
    installFakeApi({
      ...ROUTES,
      "GET /events": pageOf([]),
      "GET /seasons": pageOf([]),
      "GET /notifications": pageOf([]),
      "GET /documents/expirations": { body: { from: dayIn(-30), to: dayIn(150), overdue: [], months: [] } },
    });
    renderWithQuery(<HomeOverview />);
    expect(await screen.findByText(/Nessun evento nei prossimi 14 giorni/)).toBeInTheDocument();
    expect(await screen.findByText(/La classifica compare appena/)).toBeInTheDocument();
    expect(await screen.findByText(/Nessun documento scade a breve/)).toBeInTheDocument();
    expect(await screen.findByText(/Qui compaiono pagamenti/)).toBeInTheDocument();
  });
});
