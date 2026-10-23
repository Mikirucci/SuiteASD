import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ADMIN_PERMISSIONS,
  CERTIFICATE_TYPE,
  FORM_TYPE,
  TEAMS,
  meWith,
  mockApi,
  page,
  problem,
  renderScreen,
  type MockRequest,
} from "@/features/tesserati/test-support";
import { expectNoA11yViolations } from "@/test/a11y";
import { TypeDetailPage } from "./type-detail-page";
import type { TypePeople, TypePerson } from "./types";

vi.mock("next/navigation", () => ({ usePathname: () => "/scadenze/type-MEDICAL_CERTIFICATE" }));
vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: { href: string; children: ReactNode } & Record<string, unknown>) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));
vi.mock("@/features/auth/auth-provider", () => ({
  useAuth: () => ({ me: meWith(ADMIN_PERMISSIONS), status: "authenticated" }),
}));

function person(overrides: Partial<TypePerson> & Pick<TypePerson, "memberId" | "memberName">): TypePerson {
  return {
    teams: [{ id: "t16", name: "U16" }],
    status: "OK",
    documentId: "d-1",
    expiresAt: "2027-06-30",
    daysRemaining: 250,
    hasFile: true,
    ...overrides,
  };
}

/** Ordered by name, as the API returns them. */
const PEOPLE: TypePerson[] = [
  person({ memberId: "m-anna", memberName: "Anna Ferri", status: "EXPIRED", expiresAt: "2026-09-20", daysRemaining: -22 }),
  person({ memberId: "m-bea", memberName: "Bea Neri", status: "MISSING", documentId: null, expiresAt: null, daysRemaining: null, hasFile: false }),
  person({ memberId: "m-giulia", memberName: "Giulia Rossi", teams: [{ id: "td", name: "Serie D" }], status: "EXPIRING", expiresAt: "2026-10-28", daysRemaining: 5 }),
  person({ memberId: "m-luca", memberName: "Luca Blu", status: "MISSING", hasFile: false }),
  person({ memberId: "m-sara", memberName: "Sara Conti" }),
];

const STATS = { validPeople: 1, expiringPeople: 1, expiredPeople: 1, missingPeople: 2 };

function peopleRoute(request: MockRequest): { body: TypePeople } {
  const q = request.query.get("q")?.toLowerCase();
  const teamId = request.query.get("teamId");
  const status = request.query.get("status");
  const people = PEOPLE.filter(
    (candidate) =>
      (!q || candidate.memberName.toLowerCase().includes(q)) &&
      (!teamId || candidate.teams.some((team) => team.id === teamId)) &&
      (!status || candidate.status === status),
  );
  return { body: { stats: STATS, people, pagination: { page: 1, pageSize: 20, total: people.length, totalPages: people.length === 0 ? 0 : 1 } } };
}

/** The API cuts the filtered, ordered list in pages of `pageSize` and counts what matches. */
function pagedRoute(everyone: TypePerson[]) {
  return (request: MockRequest): { body: TypePeople } => {
    const pageNumber = Number(request.query.get("page") ?? 1);
    const pageSize = Number(request.query.get("pageSize") ?? 20);
    const status = request.query.get("status");
    const matching = everyone.filter((candidate) => !status || candidate.status === status);
    const start = (pageNumber - 1) * pageSize;
    return {
      body: {
        stats: STATS,
        people: matching.slice(start, start + pageSize),
        pagination: { page: pageNumber, pageSize, total: matching.length, totalPages: Math.ceil(matching.length / pageSize) },
      },
    };
  };
}

const lastPeopleCall = (calls: { path: string; query: URLSearchParams }[]) => calls.filter((call) => call.path.endsWith("/people")).at(-1);

const MANY: TypePerson[] = Array.from({ length: 45 }, (_, index) =>
  person({
    memberId: `m-${index + 1}`,
    memberName: `Atleta ${String(index + 1).padStart(2, "0")}`,
    status: index % 3 === 0 ? "EXPIRED" : "OK",
  }),
);

function api(extra: Parameters<typeof mockApi>[0] = {}) {
  return mockApi({
    "GET /document-types": () => page([CERTIFICATE_TYPE, FORM_TYPE]),
    "GET /document-types/type-MEDICAL_CERTIFICATE/people": peopleRoute,
    "GET /document-types/type-MEMBERSHIP_FORM/people": () => ({ body: { stats: { ...STATS, expiringPeople: 0, expiredPeople: 0 }, people: [PEOPLE[4]!], pagination: { page: 1, pageSize: 20, total: 1, totalPages: 1 } } }),
    "GET /teams": () => page(TEAMS),
    ...extra,
  });
}

beforeEach(() => {
  vi.unstubAllGlobals();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("TypeDetailPage", () => {
  it("shows the report of the document type and every person with the state of their document", async () => {
    api();
    const { container } = renderScreen(<TypeDetailPage id="type-MEDICAL_CERTIFICATE" />);

    expect(await screen.findByRole("heading", { level: 1, name: "Certificato medico" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Tutte le scadenze" })).toHaveAttribute("href", "/scadenze");

    const report = screen.getByRole("region", { name: "Rendiconto del documento" });
    expect(within(report).getByText("In regola").parentElement?.parentElement).toHaveTextContent("1 persona");
    expect(within(report).getByText("In scadenza").parentElement?.parentElement).toHaveTextContent("1 persona");
    expect(within(report).getByText("Scaduti").parentElement?.parentElement).toHaveTextContent("1 persona");
    expect(within(report).getByText("Mancanti").parentElement?.parentElement).toHaveTextContent("2 persone");

    const people = within(screen.getByRole("list", { name: "Persone del documento" })).getAllByRole("listitem");
    expect(people.map((item) => within(item).getByText(/^[A-Z][a-z]+ [A-Z][a-z]+$/).textContent)).toEqual([
      "Anna Ferri",
      "Bea Neri",
      "Giulia Rossi",
      "Luca Blu",
      "Sara Conti",
    ]);
    expect(within(people[0]!).getByRole("link")).toHaveAttribute("href", "/tesserati/m-anna");
    expect(people[0]).toHaveTextContent("Scaduto il 20 settembre 2026 · da 22 giorni");
    expect(within(people[0]!).getByText("Scaduto")).toBeInTheDocument();
    expect(people[1]).toHaveTextContent("Non ancora consegnato");
    expect(within(people[1]!).getByText("Mancante")).toBeInTheDocument();
    expect(people[2]).toHaveTextContent("Scade il 28 ottobre 2026 · scade tra 5 giorni");
    expect(within(people[2]!).getByText("In scadenza")).toBeInTheDocument();
    expect(people[3]).toHaveTextContent("File non ancora caricato");
    expect(within(people[4]!).getByText("In regola")).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it("searches and filters inside the document through the API, leaving the report untouched", async () => {
    const { calls } = api();
    renderScreen(<TypeDetailPage id="type-MEDICAL_CERTIFICATE" />);
    await screen.findByText("Anna Ferri");

    await userEvent.click(screen.getByRole("button", { name: "In scadenza" }));
    await waitFor(() => expect(calls.some((call) => call.query.get("status") === "EXPIRING")).toBe(true));
    await waitFor(() => expect(screen.queryByText("Anna Ferri")).not.toBeInTheDocument());
    expect(screen.getByText("Giulia Rossi")).toBeInTheDocument();
    expect(within(screen.getByRole("region", { name: "Rendiconto del documento" })).getByText("Mancanti").parentElement?.parentElement).toHaveTextContent("2 persone");

    await userEvent.click(screen.getByRole("button", { name: "Tutti" }));
    await userEvent.selectOptions(screen.getByLabelText("Squadra"), "td");
    await waitFor(() => expect(calls.some((call) => call.query.get("teamId") === "td")).toBe(true));
    await waitFor(() => expect(screen.queryByText("Sara Conti")).not.toBeInTheDocument());

    await userEvent.type(screen.getByLabelText("Cerca un tesserato"), "zzz");
    expect(await screen.findByRole("heading", { name: "Nessuno con questi filtri" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Azzera i filtri" }));
    expect(await screen.findByText("Anna Ferri")).toBeInTheDocument();
    expect(screen.getByText("Sara Conti")).toBeInTheDocument();
  });

  describe("pages of people", () => {
    const manyApi = () => api({ "GET /document-types/type-MEDICAL_CERTIFICATE/people": pagedRoute(MANY) });
    const items = () => within(screen.getByRole("list", { name: "Persone del documento" })).getAllByRole("listitem");

    it("shows twenty people at a time with where the reader is, and walks through the pages", async () => {
      const { calls } = manyApi();
      renderScreen(<TypeDetailPage id="type-MEDICAL_CERTIFICATE" />);
      await screen.findByText("Atleta 01");
      expect(items()).toHaveLength(20);
      const pages = screen.getByRole("navigation", { name: "Pagine delle persone" });
      expect(pages).toHaveTextContent("1-20 di 45");
      expect(pages).toHaveTextContent("Pagina 1 di 3");
      expect(within(pages).getByRole("button", { name: "Precedente" })).toBeDisabled();
      expect(lastPeopleCall(calls)?.query.get("pageSize")).toBe("20");

      await userEvent.click(within(pages).getByRole("button", { name: "Successiva" }));
      expect(await screen.findByText("Atleta 21")).toBeInTheDocument();
      expect(screen.queryByText("Atleta 01")).not.toBeInTheDocument();
      expect(pages).toHaveTextContent("21-40 di 45");
      expect(lastPeopleCall(calls)?.query.get("page")).toBe("2");

      await userEvent.click(within(pages).getByRole("button", { name: "Successiva" }));
      expect(await screen.findByText("Atleta 45")).toBeInTheDocument();
      expect(items()).toHaveLength(5);
      expect(pages).toHaveTextContent("41-45 di 45");
      expect(within(pages).getByRole("button", { name: "Successiva" })).toBeDisabled();

      await userEvent.click(within(pages).getByRole("button", { name: "Precedente" }));
      expect(await screen.findByText("Atleta 21")).toBeInTheDocument();
    });

    it("starts again from the first page when the search or a filter changes", async () => {
      const { calls } = manyApi();
      renderScreen(<TypeDetailPage id="type-MEDICAL_CERTIFICATE" />);
      await screen.findByText("Atleta 01");
      await userEvent.click(within(screen.getByRole("navigation", { name: "Pagine delle persone" })).getByRole("button", { name: "Successiva" }));
      await screen.findByText("Atleta 21");

      await userEvent.click(screen.getByRole("button", { name: "Scaduto" }));
      await waitFor(() => expect(lastPeopleCall(calls)?.query.get("status")).toBe("EXPIRED"));
      expect(lastPeopleCall(calls)?.query.get("page")).toBe("1");
      expect(await screen.findByText("Atleta 01")).toBeInTheDocument();
    });

    it("has no page controls when everybody fits on one page", async () => {
      api();
      renderScreen(<TypeDetailPage id="type-MEDICAL_CERTIFICATE" />);
      await screen.findByText("Anna Ferri");
      expect(screen.queryByRole("navigation", { name: "Pagine delle persone" })).not.toBeInTheDocument();
    });
  });

  it("leaves out the expiry figures and filters for a document without expiry", async () => {
    api();
    renderScreen(<TypeDetailPage id="type-MEMBERSHIP_FORM" />);
    expect(await screen.findByRole("heading", { level: 1, name: "Modulo iscrizione" })).toBeInTheDocument();
    const report = screen.getByRole("region", { name: "Rendiconto del documento" });
    expect(within(report).getByText("In regola")).toBeInTheDocument();
    expect(within(report).getByText("Mancanti")).toBeInTheDocument();
    expect(within(report).queryByText("In scadenza")).not.toBeInTheDocument();
    expect(within(report).queryByText("Scaduti")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "In scadenza" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Scaduto" })).not.toBeInTheDocument();
  });

  it("explains when nobody has this document yet", async () => {
    api({
      "GET /document-types/type-MEDICAL_CERTIFICATE/people": () => ({
        body: { stats: { validPeople: 0, expiringPeople: 0, expiredPeople: 0, missingPeople: 0 }, people: [], pagination: { page: 1, pageSize: 20, total: 0, totalPages: 0 } },
      }),
    });
    renderScreen(<TypeDetailPage id="type-MEDICAL_CERTIFICATE" />);
    expect(await screen.findByRole("heading", { name: "Nessuno per questo documento" })).toBeInTheDocument();
    expect(screen.queryByLabelText("Cerca un tesserato")).not.toBeInTheDocument();
  });

  it("says when the document type does not exist", async () => {
    api();
    renderScreen(<TypeDetailPage id="type-ALTRO" />);
    expect(await screen.findByRole("heading", { name: "Documento non trovato" })).toBeInTheDocument();
  });

  it("shows an error with a retry button when the people cannot be loaded", async () => {
    let attempts = 0;
    api({
      "GET /document-types/type-MEDICAL_CERTIFICATE/people": (request) => {
        attempts += 1;
        return attempts === 1 ? problem(500, "internal_error") : peopleRoute(request);
      },
    });
    renderScreen(<TypeDetailPage id="type-MEDICAL_CERTIFICATE" />);
    await userEvent.click(await screen.findByRole("button", { name: "Riprova" }));
    expect(await screen.findByText("Anna Ferri")).toBeInTheDocument();
  });
});
