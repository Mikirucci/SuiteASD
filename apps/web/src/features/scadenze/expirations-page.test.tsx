import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ADMIN_PERMISSIONS,
  ATHLETE_PERMISSIONS,
  CERTIFICATE_TYPE,
  TEAMS,
  meWith,
  mockApi,
  page,
  problem,
  renderScreen,
} from "@/features/tesserati/test-support";
import { expectNoA11yViolations } from "@/test/a11y";
import { ExpirationsPage } from "./expirations-page";
import type { ExpirationItem, Expirations } from "./types";

const mocks = vi.hoisted(() => ({ permissions: [] as string[] }));

vi.mock("next/navigation", () => ({ usePathname: () => "/scadenze" }));
vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: { href: string; children: ReactNode } & Record<string, unknown>) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));
vi.mock("@/features/auth/auth-provider", () => ({
  useAuth: () => ({ me: meWith(mocks.permissions), status: "authenticated" }),
}));

function item(
  overrides: Partial<ExpirationItem> & Pick<ExpirationItem, "documentId" | "firstName" | "lastName">,
): ExpirationItem {
  return {
    memberId: `m-${overrides.firstName.toLowerCase()}`,
    teams: ["U16"],
    documentType: { id: "type-MEDICAL_CERTIFICATE", key: "MEDICAL_CERTIFICATE", name: "Certificato medico" },
    expiresAt: "2026-11-27",
    daysRemaining: 15,
    status: "EXPIRING",
    ...overrides,
  };
}

const GIULIA = item({
  documentId: "d-giulia",
  firstName: "Giulia",
  lastName: "Rossi",
  teams: ["Serie D"],
  expiresAt: "2026-10-28",
  daysRemaining: 5,
});
const SARA = item({ documentId: "d-sara", firstName: "Sara", lastName: "Conti" });
const ANNA = item({
  documentId: "d-anna",
  firstName: "Anna",
  lastName: "Ferri",
  expiresAt: "2026-09-20",
  daysRemaining: -22,
  status: "EXPIRED",
});

const EXPIRATIONS: Expirations = {
  from: "2026-10-01",
  to: "2027-03-31",
  months: [
    { month: "2026-10", items: [GIULIA] },
    { month: "2026-11", items: [SARA] },
    { month: "2026-12", items: [] },
  ],
  overdue: [ANNA],
};

beforeEach(() => {
  mocks.permissions = ADMIN_PERMISSIONS;
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function standardApi(data: Expirations = EXPIRATIONS) {
  return mockApi({
    "GET /documents/expirations": () => ({ body: data }),
    "GET /teams": () => page(TEAMS),
    "GET /document-types": () => page([CERTIFICATE_TYPE]),
  });
}

describe("ExpirationsPage", () => {
  it("shows a loading state, then the timeline with the nearest expiry selected", async () => {
    standardApi();
    renderScreen(<ExpirationsPage />);
    expect(screen.getByRole("status", { name: "Caricamento delle scadenze" })).toBeInTheDocument();

    const timeline = await screen.findByRole("list", { name: "Scadenze dei documenti nei prossimi mesi" });
    expect(within(timeline).getAllByRole("listitem")).toHaveLength(2);
    expect(screen.getByText(/Giulia Rossi · Certificato medico/).parentElement).toHaveTextContent(
      "— Scade tra 5 giorni",
    );
  });

  it("shows the detail card of the avatar you pick, with the automatic badge", async () => {
    standardApi();
    renderScreen(<ExpirationsPage />);
    await userEvent.click(await screen.findByRole("button", { name: /Sara Conti, scade il 27 novembre 2026/ }));

    expect(screen.getByText(/Sara Conti · Certificato medico/).parentElement).toHaveTextContent(
      "— Scade tra 15 giorni",
    );
    expect(screen.getByText("Automatico")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Apri la scheda" })).toHaveAttribute("href", "/tesserati/m-sara");
    expect(screen.getByRole("link", { name: "Automazioni" })).toHaveAttribute("href", "/automazioni");
  });

  it("lists documents by month, with the already expired ones apart", async () => {
    standardApi();
    renderScreen(<ExpirationsPage />);
    await screen.findByRole("list", { name: "Scadenze dei documenti nei prossimi mesi" });

    const overdue = screen.getByRole("list", { name: "Documenti già scaduti" });
    expect(within(overdue).getByText("Anna Ferri")).toBeInTheDocument();
    expect(within(overdue).getByText("Scaduto da 22 giorni")).toBeInTheDocument();

    const october = screen.getByRole("list", { name: "Scadenze di ottobre 2026" });
    expect(within(october).getByText("Giulia Rossi")).toBeInTheDocument();
    expect(within(october).getByRole("link")).toHaveAttribute("href", "/tesserati/m-giulia");
    expect(screen.getByRole("heading", { name: /novembre 2026/i })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: /dicembre 2026/i })).not.toBeInTheDocument();
  });

  it("explains that an expired certificate makes the athlete not callable", async () => {
    standardApi();
    renderScreen(<ExpirationsPage />);
    expect(await screen.findByText("Certificato scaduto, atleta non convocabile")).toBeInTheDocument();
  });

  it("filters by team using the existing teams", async () => {
    const { calls } = standardApi();
    renderScreen(<ExpirationsPage />);
    const filter = await screen.findByRole("group", { name: "Filtra per squadra" });
    await userEvent.click(within(filter).getByRole("button", { name: "Serie D" }));
    await waitFor(() => expect(calls.some((call) => call.query.get("teamId") === "td")).toBe(true));
    expect(calls[0]?.query.get("months")).toBe("6");
  });

  it("says so when there is nothing expiring", async () => {
    standardApi({ ...EXPIRATIONS, months: [{ month: "2026-10", items: [] }], overdue: [] });
    renderScreen(<ExpirationsPage />);
    expect(await screen.findByRole("heading", { name: "Nessuna scadenza in vista" })).toBeInTheDocument();
    expect(screen.queryByRole("list", { name: "Scadenze dei documenti nei prossimi mesi" })).not.toBeInTheDocument();
  });

  it("shows an error with a retry button", async () => {
    let attempts = 0;
    mockApi({
      "GET /documents/expirations": () => {
        attempts += 1;
        return attempts === 1 ? problem(500, "internal_error") : { body: EXPIRATIONS };
      },
      "GET /teams": () => page(TEAMS),
      "GET /document-types": () => page([CERTIFICATE_TYPE]),
    });
    renderScreen(<ExpirationsPage />);
    const alert = await screen.findByRole("alert");
    await userEvent.click(within(alert).getByRole("button", { name: "Riprova" }));
    expect(await screen.findByText("Anna Ferri")).toBeInTheDocument();
  });

  it("shows an athlete only their own expiries, without filters", async () => {
    mocks.permissions = ATHLETE_PERMISSIONS;
    standardApi({ ...EXPIRATIONS, months: [{ month: "2026-11", items: [SARA] }], overdue: [] });
    renderScreen(<ExpirationsPage />);
    expect(await screen.findByRole("list", { name: "Scadenze dei documenti nei prossimi mesi" })).toBeInTheDocument();
    expect(screen.queryByRole("group", { name: "Filtra per squadra" })).not.toBeInTheDocument();
    expect(screen.getByText(/dei tuoi figli/)).toBeInTheDocument();
  });

  it("has no detectable accessibility violations", async () => {
    standardApi();
    const { container } = renderScreen(<ExpirationsPage />);
    await screen.findByRole("list", { name: "Scadenze dei documenti nei prossimi mesi" });
    await expectNoA11yViolations(container);
  });
});
