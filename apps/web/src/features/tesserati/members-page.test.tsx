import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { expectNoA11yViolations } from "@/test/a11y";
import { MembersPage } from "./members-page";
import {
  ADMIN_PERMISSIONS,
  ANNA_FERRI,
  ATHLETE_PERMISSIONS,
  GIULIA_ROSSI,
  PRIVACY_INDICATOR,
  SARA_CONTI,
  TEAMS,
  indicator,
  member,
  meWith,
  mockApi,
  page,
  problem,
  renderScreen,
} from "./test-support";

const mocks = vi.hoisted(() => ({ permissions: [] as string[], push: vi.fn<(url: string) => void>() }));

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: mocks.push }), usePathname: () => "/tesserati" }));
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

const SUMMARY = { tesserati: 118, squadre: 6, documentiMancanti: 0 };

beforeEach(() => {
  mocks.permissions = ADMIN_PERMISSIONS;
  mocks.push.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function standardApi() {
  return mockApi({
    "GET /members": () => page([SARA_CONTI, GIULIA_ROSSI, ANNA_FERRI]),
    "GET /members/summary": () => ({ body: SUMMARY }),
    "GET /teams": () => page(TEAMS),
  });
}

describe("MembersPage", () => {
  it("shows a loading state, then members with team badges and how many documents are missing", async () => {
    standardApi();
    renderScreen(<MembersPage />);
    expect(screen.getByRole("status", { name: "Caricamento dei tesserati" })).toBeInTheDocument();

    const list = await screen.findByRole("list", { name: "Tesserati" });
    const rows = within(list).getAllByRole("listitem");
    expect(rows).toHaveLength(3);
    const sara = within(rows[0] as HTMLElement);
    expect(sara.getByRole("link")).toHaveAttribute("href", "/tesserati/m-sara");
    expect(sara.getByText("U16")).toBeInTheDocument();
    expect(sara.getByText("1 in scadenza")).toBeInTheDocument();
    expect(sara.queryByText("In regola")).not.toBeInTheDocument();
    expect(within(rows[1] as HTMLElement).getByText("In regola")).toBeInTheDocument();
    const anna = within(rows[2] as HTMLElement);
    expect(anna.getByText("1 documento mancante")).toBeInTheDocument();
    expect(anna.getByText(/Certificato medico/, { selector: ".sr-only" })).toBeInTheDocument();
  });

  it("counts the missing and the expired documents together, with the names in the title", async () => {
    const mixed = member({
      id: "m-mix",
      firstName: "Marta",
      lastName: "Neri",
      documents: [
        indicator({ key: "MEDICAL_CERTIFICATE", name: "Certificato medico", status: "EXPIRED" }),
        indicator({ key: "MEMBERSHIP_FORM", name: "Modulo iscrizione", status: "MISSING", documentId: null }),
        PRIVACY_INDICATOR,
      ],
      documentStatus: "MISSING",
    });
    mockApi({ "GET /members": () => page([mixed]), "GET /members/summary": () => ({ body: SUMMARY }), "GET /teams": () => page(TEAMS) });
    renderScreen(<MembersPage />);
    const chip = await screen.findByText("2 documenti mancanti");
    expect(chip.closest("[title]")).toHaveAttribute("title", "Mancanti o scaduti: Certificato medico, Modulo iscrizione");
  });

  it("shows the live summary bar", async () => {
    standardApi();
    renderScreen(<MembersPage />);
    expect(await screen.findByLabelText("Riepilogo")).toHaveTextContent(
      "118 tesserati · 6 squadre · 0 documenti mancanti",
    );
  });

  it("builds the team pills from the existing teams and filters by the chosen one", async () => {
    const { calls } = standardApi();
    renderScreen(<MembersPage />);
    const filter = await screen.findByRole("group", { name: "Filtra per squadra" });
    expect(
      within(filter)
        .getAllByRole("button")
        .map((button) => button.textContent),
    ).toEqual(["Tutte", "U16", "Serie D", "Senza squadra"]);
    expect(within(filter).getByRole("button", { name: "Tutte" })).toHaveAttribute("aria-pressed", "true");

    await userEvent.click(within(filter).getByRole("button", { name: "U16" }));
    await waitFor(() =>
      expect(calls.some((call) => call.path === "/members" && call.query.get("teamId") === "t16")).toBe(true),
    );
    expect(within(filter).getByRole("button", { name: "U16" })).toHaveAttribute("aria-pressed", "true");
  });

  it("lists the members without a team through the last pill", async () => {
    const { calls } = standardApi();
    renderScreen(<MembersPage />);
    const filter = await screen.findByRole("group", { name: "Filtra per squadra" });
    await userEvent.click(within(filter).getByRole("button", { name: "Senza squadra" }));
    await waitFor(() =>
      expect(
        calls.some((call) => call.path === "/members" && call.query.get("noTeam") === "true" && call.query.get("teamId") === null),
      ).toBe(true),
    );
  });

  it("filters by document state, gender, field role and year of birth from the extra filters", async () => {
    const { calls } = standardApi();
    renderScreen(<MembersPage />);
    await screen.findByRole("list", { name: "Tesserati" });
    const toggle = screen.getByRole("button", { name: "Più filtri" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    await userEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");

    await userEvent.selectOptions(screen.getByRole("combobox", { name: "Stato documenti" }), "MISSING");
    await userEvent.selectOptions(screen.getByRole("combobox", { name: "Genere" }), "FEMALE");
    await userEvent.type(screen.getByRole("textbox", { name: "Ruolo in campo" }), "Libero");
    await userEvent.type(screen.getByRole("textbox", { name: "Anno di nascita" }), "20a09");

    await waitFor(() => {
      const last = calls.filter((call) => call.path === "/members").at(-1);
      expect(last?.query.get("documentStatus")).toBe("MISSING");
      expect(last?.query.get("gender")).toBe("FEMALE");
      expect(last?.query.get("fieldRole")).toBe("Libero");
      expect(last?.query.get("birthYear")).toBe("2009");
    });
    expect(screen.getByRole("button", { name: "Più filtri (4)" })).toBeInTheDocument();
  });

  it("does not filter by a year that is still being typed", async () => {
    const { calls } = standardApi();
    renderScreen(<MembersPage />);
    await screen.findByRole("list", { name: "Tesserati" });
    await userEvent.click(screen.getByRole("button", { name: "Più filtri" }));
    await userEvent.type(screen.getByRole("textbox", { name: "Anno di nascita" }), "200");
    await new Promise((resolve) => setTimeout(resolve, 400));
    expect(calls.filter((call) => call.path === "/members").every((call) => call.query.get("birthYear") === null)).toBe(true);
  });

  it("clears every filter, the extra ones included", async () => {
    mockApi({
      "GET /members": (request) => (request.query.get("documentStatus") ? page([]) : page([SARA_CONTI])),
      "GET /members/summary": () => ({ body: SUMMARY }),
      "GET /teams": () => page(TEAMS),
    });
    renderScreen(<MembersPage />);
    await screen.findByText("Sara Conti");
    await userEvent.click(screen.getByRole("button", { name: "Più filtri" }));
    await userEvent.selectOptions(screen.getByRole("combobox", { name: "Stato documenti" }), "OK");
    await userEvent.click(await screen.findByRole("button", { name: "Azzera i filtri" }));
    expect(await screen.findByText("Sara Conti")).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Stato documenti" })).toHaveValue("");
  });

  it("searches after a short pause", async () => {
    const { calls } = standardApi();
    renderScreen(<MembersPage />);
    await screen.findByRole("list", { name: "Tesserati" });
    await userEvent.type(screen.getByRole("searchbox", { name: "Cerca tesserato" }), "sara");
    await waitFor(() =>
      expect(calls.some((call) => call.path === "/members" && call.query.get("q") === "sara")).toBe(true),
    );
  });

  it("loads more members with the cursor", async () => {
    const cursors: Array<string | null> = [];
    mockApi({
      "GET /members": (request) => {
        cursors.push(request.query.get("cursor"));
        return request.query.get("cursor") ? page([ANNA_FERRI]) : page([SARA_CONTI], "next-1");
      },
      "GET /members/summary": () => ({ body: SUMMARY }),
      "GET /teams": () => page(TEAMS),
    });
    renderScreen(<MembersPage />);
    await screen.findByText("Sara Conti");
    await userEvent.click(screen.getByRole("button", { name: "Carica altri" }));
    expect(await screen.findByText("Anna Ferri")).toBeInTheDocument();
    expect(screen.getByText("Sara Conti")).toBeInTheDocument();
    expect(cursors).toEqual([null, "next-1"]);
    expect(screen.queryByRole("button", { name: "Carica altri" })).not.toBeInTheDocument();
  });

  it("explains how to add the first member when the roster is empty", async () => {
    mockApi({
      "GET /members": () => page([]),
      "GET /members/summary": () => ({ body: { ...SUMMARY, tesserati: 0 } }),
      "GET /teams": () => page([]),
    });
    renderScreen(<MembersPage />);
    expect(await screen.findByRole("heading", { name: "Nessun tesserato" })).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Nuovo tesserato" }).length).toBeGreaterThan(0);
  });

  it("offers to clear the filters when a search finds nobody", async () => {
    mockApi({
      "GET /members": (request) => (request.query.get("q") ? page([]) : page([SARA_CONTI])),
      "GET /members/summary": () => ({ body: SUMMARY }),
      "GET /teams": () => page(TEAMS),
    });
    renderScreen(<MembersPage />);
    await screen.findByText("Sara Conti");
    await userEvent.type(screen.getByRole("searchbox", { name: "Cerca tesserato" }), "zzz");
    expect(await screen.findByRole("heading", { name: "Nessun tesserato trovato" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Azzera i filtri" }));
    expect(await screen.findByText("Sara Conti")).toBeInTheDocument();
  });

  it("shows an error with a retry button that loads the list again", async () => {
    let attempts = 0;
    mockApi({
      "GET /members": () => {
        attempts += 1;
        return attempts === 1 ? problem(500, "internal_error") : page([SARA_CONTI]);
      },
      "GET /members/summary": () => ({ body: SUMMARY }),
      "GET /teams": () => page(TEAMS),
    });
    renderScreen(<MembersPage />);
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Il servizio non è disponibile al momento");
    await userEvent.click(within(alert).getByRole("button", { name: "Riprova" }));
    expect(await screen.findByText("Sara Conti")).toBeInTheDocument();
  });

  it("downloads the CSV export with the current filters", async () => {
    URL.createObjectURL = () => "blob:test";
    URL.revokeObjectURL = () => undefined;
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
    const { calls } = mockApi({
      "GET /members": () => page([SARA_CONTI]),
      "GET /members/summary": () => ({ body: SUMMARY }),
      "GET /teams": () => page(TEAMS),
      "GET /members/export": () => ({ body: "nome;cognome", headers: { "content-type": "text/csv" } }),
    });
    renderScreen(<MembersPage />);
    await screen.findByText("Sara Conti");
    await userEvent.click(screen.getByRole("button", { name: "Esporta CSV" }));
    await waitFor(() => expect(calls.some((call) => call.path === "/members/export")).toBe(true));
    await waitFor(() => expect(click).toHaveBeenCalledTimes(1));
  });

  it("shows only their own data to an athlete: no search, actions or summary", async () => {
    mocks.permissions = ATHLETE_PERMISSIONS;
    const { calls } = mockApi({ "GET /members": () => page([SARA_CONTI]), "GET /teams": () => page(TEAMS) });
    renderScreen(<MembersPage />);
    expect(await screen.findByText("Sara Conti")).toBeInTheDocument();
    expect(screen.queryByRole("searchbox")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Nuovo tesserato" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Importa CSV" })).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Riepilogo")).not.toBeInTheDocument();
    expect(calls.some((call) => call.path === "/members/summary")).toBe(false);
    expect(screen.getByText(/i tuoi dati e quelli dei tuoi figli/)).toBeInTheDocument();
  });

  it("has no detectable accessibility violations", async () => {
    standardApi();
    const { container } = renderScreen(<MembersPage />);
    await screen.findByRole("list", { name: "Tesserati" });
    await screen.findByLabelText("Riepilogo");
    await expectNoA11yViolations(container);
  });
});
