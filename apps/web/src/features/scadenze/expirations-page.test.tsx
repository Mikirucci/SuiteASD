import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ADMIN_PERMISSIONS,
  ATHLETE_PERMISSIONS,
  CERTIFICATE_TYPE,
  FORM_TYPE,
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

const REPORT = {
  data: [{ documentTypeId: "type-MEDICAL_CERTIFICATE", validPeople: 12, expiringPeople: 3, expiredPeople: 1, missingPeople: 2 }],
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
    "GET /document-types": () => page([CERTIFICATE_TYPE, FORM_TYPE]),
    "GET /document-types/report": () => ({ body: REPORT }),
  });
}

describe("ExpirationsPage for staff: the document types", () => {
  it("shows the totals and one card per document type with the three previews", async () => {
    standardApi();
    const { container } = renderScreen(<ExpirationsPage />);

    const report = await screen.findByRole("region", { name: "Rendiconto dei documenti" });
    expect(within(report).getByText("In regola").parentElement?.parentElement).toHaveTextContent("12 documenti");
    expect(within(report).getByText("In scadenza").parentElement?.parentElement).toHaveTextContent("3 documenti");
    expect(within(report).getByText("Scaduti").parentElement?.parentElement).toHaveTextContent("1 documento");
    expect(within(report).getByText("Mancanti").parentElement?.parentElement).toHaveTextContent("2 documenti");

    const cards = within(await screen.findByRole("list", { name: "Documenti" })).getAllByRole("listitem");
    expect(cards).toHaveLength(2);
    const [certificate, form] = cards as [HTMLElement, HTMLElement];
    expect(within(certificate).getByRole("link", { name: "Certificato medico" })).toHaveAttribute("href", "/scadenze/type-MEDICAL_CERTIFICATE");
    expect(certificate).toHaveTextContent("Con scadenza · Richiesto a tutti · valido 365 giorni");
    expect(within(certificate).getByText("persone in regola").previousElementSibling).toHaveTextContent("12");
    expect(within(certificate).getByText("persone con il documento in scadenza").previousElementSibling).toHaveTextContent("3");
    // expired and missing share the red preview
    expect(within(certificate).getByText("persone con il documento scaduto o mancante").previousElementSibling).toHaveTextContent("3");
    expect(within(form).getByText("persone in regola").previousElementSibling).toHaveTextContent("0");
    await expectNoA11yViolations(container);
  });

  it("has no filters and no long lists of documents on the main page", async () => {
    standardApi();
    renderScreen(<ExpirationsPage />);
    await screen.findByRole("list", { name: "Documenti" });
    expect(screen.queryByRole("group", { name: "Filtra per squadra" })).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Tipo di documento")).not.toBeInTheDocument();
    expect(screen.queryByRole("list", { name: "Documenti già scaduti" })).not.toBeInTheDocument();
    expect(screen.queryByRole("list", { name: "Scadenze di ottobre 2026" })).not.toBeInTheDocument();
  });

  it("keeps the timeline with the nearest expiry selected, and shows the card of the avatar you pick", async () => {
    standardApi();
    renderScreen(<ExpirationsPage />);
    const timeline = await screen.findByRole("list", { name: "Scadenze dei documenti nei prossimi mesi" });
    expect(within(timeline).getAllByRole("listitem")).toHaveLength(2);
    expect(screen.getByText(/Giulia Rossi · Certificato medico/).parentElement).toHaveTextContent("— Scade tra 5 giorni");

    await userEvent.click(screen.getByRole("button", { name: /Sara Conti, scade il 27 novembre 2026/ }));
    expect(screen.getByText(/Sara Conti · Certificato medico/).parentElement).toHaveTextContent("— Scade tra 15 giorni");
    expect(screen.getByText("Automatico")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Apri la scheda" })).toHaveAttribute("href", "/tesserati/m-sara");
    expect(screen.getByRole("link", { name: "Automazioni" })).toHaveAttribute("href", "/automazioni");
  });

  it("explains that an expired certificate makes the athlete not callable", async () => {
    standardApi();
    renderScreen(<ExpirationsPage />);
    expect(await screen.findByText("Certificato scaduto, atleta non convocabile")).toBeInTheDocument();
  });

  it("shows the cards even when nothing is about to expire", async () => {
    standardApi({ ...EXPIRATIONS, months: [{ month: "2026-10", items: [] }], overdue: [] });
    renderScreen(<ExpirationsPage />);
    expect(await screen.findByRole("list", { name: "Documenti" })).toBeInTheDocument();
    expect(screen.queryByRole("list", { name: "Scadenze dei documenti nei prossimi mesi" })).not.toBeInTheDocument();
  });

  it("keeps the cards when only the previews cannot be loaded", async () => {
    mockApi({
      "GET /documents/expirations": () => ({ body: EXPIRATIONS }),
      "GET /document-types": () => page([CERTIFICATE_TYPE]),
      "GET /document-types/report": () => problem(500, "internal_error"),
    });
    renderScreen(<ExpirationsPage />);
    expect(await screen.findByRole("link", { name: "Certificato medico" })).toBeInTheDocument();
    expect(await screen.findByText("Anteprima non disponibile")).toBeInTheDocument();
  });

  it("keeps the cards and offers a retry when only the timeline cannot be loaded", async () => {
    let attempts = 0;
    mockApi({
      "GET /documents/expirations": () => {
        attempts += 1;
        return attempts === 1 ? problem(500, "internal_error") : { body: EXPIRATIONS };
      },
      "GET /document-types": () => page([CERTIFICATE_TYPE]),
      "GET /document-types/report": () => ({ body: REPORT }),
    });
    renderScreen(<ExpirationsPage />);
    expect(await screen.findByRole("link", { name: "Certificato medico" })).toBeInTheDocument();
    const alert = await screen.findByRole("alert");
    expect(within(alert).getByText("Scadenze non disponibili")).toBeInTheDocument();
    await userEvent.click(within(alert).getByRole("button", { name: "Riprova" }));
    expect(await screen.findByRole("list", { name: "Scadenze dei documenti nei prossimi mesi" })).toBeInTheDocument();
  });

  it("shows an error with a retry button when the document types cannot be loaded", async () => {
    let attempts = 0;
    mockApi({
      "GET /documents/expirations": () => ({ body: EXPIRATIONS }),
      "GET /document-types": () => {
        attempts += 1;
        return attempts === 1 ? problem(500, "internal_error") : page([CERTIFICATE_TYPE]);
      },
      "GET /document-types/report": () => ({ body: REPORT }),
    });
    renderScreen(<ExpirationsPage />);
    const alert = await screen.findByRole("alert");
    await userEvent.click(within(alert).getByRole("button", { name: "Riprova" }));
    expect(await screen.findByRole("link", { name: "Certificato medico" })).toBeInTheDocument();
  });
});

describe("ExpirationsPage for an athlete or a guardian", () => {
  beforeEach(() => {
    mocks.permissions = ATHLETE_PERMISSIONS;
  });

  it("shows a loading state, then only their own expiries by month, with the expired ones apart", async () => {
    const api = standardApi();
    renderScreen(<ExpirationsPage />);
    expect(screen.getByRole("status", { name: "Caricamento delle scadenze" })).toBeInTheDocument();

    const overdue = await screen.findByRole("list", { name: "Documenti già scaduti" });
    expect(within(overdue).getByText("Anna Ferri")).toBeInTheDocument();
    expect(within(overdue).getByText("Scaduto da 22 giorni")).toBeInTheDocument();

    const october = screen.getByRole("list", { name: "Scadenze di ottobre 2026" });
    expect(within(october).getByText("Giulia Rossi")).toBeInTheDocument();
    expect(within(october).getByRole("link")).toHaveAttribute("href", "/tesserati/m-giulia");
    expect(screen.getByRole("heading", { name: /novembre 2026/i })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: /dicembre 2026/i })).not.toBeInTheDocument();

    expect(screen.getByText(/dei tuoi figli/)).toBeInTheDocument();
    expect(screen.queryByRole("list", { name: "Documenti" })).not.toBeInTheDocument();
    expect(screen.queryByRole("group", { name: "Filtra per squadra" })).not.toBeInTheDocument();
    expect(api.calls.some((call) => call.path.startsWith("/document-types"))).toBe(false);
  });

  it("says so when there is nothing expiring", async () => {
    standardApi({ ...EXPIRATIONS, months: [{ month: "2026-10", items: [] }], overdue: [] });
    renderScreen(<ExpirationsPage />);
    expect(await screen.findByRole("heading", { name: "Nessuna scadenza in vista" })).toBeInTheDocument();
  });

  it("shows an error with a retry button", async () => {
    let attempts = 0;
    mockApi({
      "GET /documents/expirations": () => {
        attempts += 1;
        return attempts === 1 ? problem(500, "internal_error") : { body: EXPIRATIONS };
      },
    });
    renderScreen(<ExpirationsPage />);
    const alert = await screen.findByRole("alert");
    await userEvent.click(within(alert).getByRole("button", { name: "Riprova" }));
    expect(await screen.findByText("Anna Ferri")).toBeInTheDocument();
  });

  it("has no detectable accessibility violations", async () => {
    standardApi();
    const { container } = renderScreen(<ExpirationsPage />);
    await screen.findByRole("list", { name: "Documenti già scaduti" });
    await expectNoA11yViolations(container);
  });
});
