import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { tokens } from "@/lib/api";
import { expectNoA11yViolations } from "@/test/a11y";
import { QuotePage } from "./quote-page";
import { json, page, problem, renderWithProviders, stubApi, type RecordedCall } from "@/test/stub-api";
import {
  ATHLETE_PERMISSIONS,
  CLAIMED_FEE,
  PAID_FEE,
  PENDING_FEE,
  PLAN,
  PLAN_REPORT,
  SECOND_PLAN,
  STAFF_PERMISSIONS,
  SUMMARY,
  TEAMS,
} from "./test-support";

const auth = vi.hoisted(() => ({ permissions: [] as string[], roles: [] as string[] }));
vi.mock("@/features/auth/auth-provider", () => ({
  useAuth: () => ({ status: "authenticated", me: { permissions: auth.permissions, roles: auth.roles } }),
}));

function staffRoutes(extra: Parameters<typeof stubApi>[0] = {}) {
  return {
    "GET /fees": () => json(200, page([])),
    "GET /fees/summary": () => json(200, SUMMARY),
    "GET /fee-plans": () => json(200, page([PLAN, SECOND_PLAN])),
    "GET /fee-plans/report": () => json(200, PLAN_REPORT),
    "GET /teams": () => json(200, page(TEAMS)),
    ...extra,
  };
}

beforeEach(() => {
  auth.permissions = STAFF_PERMISSIONS;
  auth.roles = ["SEGRETERIA"];
});

afterEach(() => {
  vi.unstubAllGlobals();
  tokens.clear();
});

describe("QuotePage for the secretariat: the plans overview", () => {
  it("shows the report on top and one card per plan with the three previews", async () => {
    stubApi(staffRoutes());
    const { container } = renderWithProviders(<QuotePage />);

    expect(await screen.findByRole("heading", { level: 1, name: /Incassi chiari, piano per piano\./ })).toBeInTheDocument();
    const report = await screen.findByRole("region", { name: "Rendiconto" });
    expect(within(report).getByText("Incassato").parentElement?.parentElement).toHaveTextContent(/€\s240/);
    expect(within(report).getByText("Da incassare").parentElement?.parentElement).toHaveTextContent(/€\s120/);
    // the figures say what they are: no counts of fees, no overdue note under them
    expect(report).not.toHaveTextContent(/quot[ae] pagat|di cui|scaduti|in attesa, nessuna/);
    expect(within(report).getByText("Per piano")).toBeInTheDocument();
    expect(within(report).getByText("Quota novembre")).toBeInTheDocument();
    expect(report).toHaveTextContent(/Incassato\s€\s60 · Da incassare\s€\s120/);
    expect(within(report).queryByText("Iscrizione 2026")).not.toBeInTheDocument();

    const cards = within(await screen.findByRole("list", { name: "Piani" })).getAllByRole("listitem");
    expect(cards).toHaveLength(2);
    const [monthly, enrollment] = cards as [HTMLElement, HTMLElement];
    expect(within(monthly).getByRole("link", { name: "Quota novembre" })).toHaveAttribute("href", "/quote/p-nov");
    expect(within(monthly).queryByText("Non attivo")).not.toBeInTheDocument();
    expect(monthly).toHaveTextContent(/Pagamento unico di €\s60 · Tutte le squadre/);
    expect(within(monthly).getByRole("progressbar", { name: "Incassato del piano Quota novembre" })).toHaveAttribute(
      "aria-valuetext",
      expect.stringMatching(/€\s60 su €\s180/),
    );
    expect(within(monthly).getByText("persone in regola").previousElementSibling).toHaveTextContent("1");
    expect(within(monthly).getByText("persone in attesa").previousElementSibling).toHaveTextContent("1");
    expect(within(monthly).getByText("persone con quote scadute").previousElementSibling).toHaveTextContent("1");

    expect(within(enrollment).getByRole("link", { name: "Iscrizione 2026" })).toHaveAttribute("href", "/quote/p-iscr");
    expect(within(enrollment).getByText("Non attivo")).toBeInTheDocument();
    expect(enrollment).toHaveTextContent(/3 pagamenti da €\s150 · U16/);
    expect(within(enrollment).getByText("Nessuna quota in questo piano")).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it("has no reminders card, no automations link, no list of names and no filters on the main page", async () => {
    stubApi(staffRoutes());
    renderWithProviders(<QuotePage />);
    await screen.findByRole("list", { name: "Piani" });

    expect(screen.queryByText("Promemoria inviati")).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Gestisci le automazioni" })).not.toBeInTheDocument();
    expect(screen.queryByRole("list", { name: "Quote" })).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Squadra")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Cerca un tesserato")).not.toBeInTheDocument();
    expect(screen.queryByRole("group", { name: "Filtra per stato" })).not.toBeInTheDocument();
    expect(screen.queryByRole("tab")).not.toBeInTheDocument();
  });

  it("explains what a plan is when there are none, and creates the first one with its fees", async () => {
    const api = stubApi(
      staffRoutes({
        "GET /fee-plans": () => json(200, page([])),
        "GET /fee-plans/report": () => json(200, { data: [] }),
        "POST /fee-plans": () => json(201, { ...PLAN, id: "p-new", name: "Quota dicembre" }),
      }),
    );
    renderWithProviders(<QuotePage />);
    expect(await screen.findByRole("heading", { name: "Nessun piano ancora" })).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Nuovo piano" }));
    const dialog = await screen.findByRole("dialog", { name: "Nuovo piano quota" });
    await userEvent.click(within(dialog).getByRole("button", { name: "Crea il piano" }));
    expect(await within(dialog).findByText("Inserisci il nome del piano")).toBeInTheDocument();
    expect(api.count("POST /fee-plans")).toBe(0);

    await userEvent.type(within(dialog).getByLabelText(/Nome del piano/), "Quota dicembre");
    await userEvent.type(within(dialog).getByLabelText(/Importo di ogni pagamento/), "60,50");
    await userEvent.clear(within(dialog).getByLabelText(/Data di scadenza/));
    await userEvent.type(within(dialog).getByLabelText(/Data di scadenza/), "2026-12-10");
    await userEvent.click(within(dialog).getByRole("button", { name: "Crea il piano" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(api.calls.find((call) => call.method === "POST")?.body).toEqual({
      name: "Quota dicembre",
      kind: "MONTHLY",
      amountCents: 6050,
      teamIds: [],
      dueDates: ["2026-12-10"],
    });
    expect(await screen.findByText("Piano creato")).toBeInTheDocument();
    // the new plan comes with its fees: plans, fees and the totals are read again
    await waitFor(() => expect(api.count("GET /fee-plans")).toBe(2));
    await waitFor(() => expect(api.count("GET /fees/summary")).toBeGreaterThan(1));
  });

  it("shows an error with a retry button, then the plans", async () => {
    let attempts = 0;
    stubApi(staffRoutes({ "GET /fee-plans": () => (++attempts === 1 ? problem(500, "internal") : json(200, page([PLAN]))) }));
    renderWithProviders(<QuotePage />);
    expect(await screen.findByText("Il servizio non è disponibile al momento. Riprova tra poco.")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Riprova" }));
    expect(await screen.findByRole("link", { name: "Quota novembre" })).toBeInTheDocument();
  });

  it("keeps the cards when only the previews cannot be loaded", async () => {
    stubApi(staffRoutes({ "GET /fee-plans/report": () => problem(500, "internal") }));
    renderWithProviders(<QuotePage />);
    expect(await screen.findByRole("link", { name: "Quota novembre" })).toBeInTheDocument();
    expect((await screen.findAllByText("Anteprima non disponibile")).length).toBe(2);
  });

  it("does not offer to create plans without the write permission", async () => {
    auth.permissions = ["payments:read"];
    stubApi(staffRoutes());
    renderWithProviders(<QuotePage />);
    await screen.findByRole("list", { name: "Piani" });
    expect(screen.queryByRole("button", { name: "Nuovo piano" })).not.toBeInTheDocument();
  });
});

describe("QuotePage for the secretariat: payments reported by the payer", () => {
  const CLAIMED_ROUTES = () =>
    staffRoutes({
      "GET /fees": (call: RecordedCall) => json(200, page(call.query.get("claimed") === "true" ? [CLAIMED_FEE] : [])),
    });

  it("announces how many fees were reported and lists them in a dialog with the register action", async () => {
    stubApi(CLAIMED_ROUTES());
    renderWithProviders(<QuotePage />);

    expect(await screen.findByText("1 quota segnalata dal pagante.")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Mostra le segnalate" }));
    const dialog = await screen.findByRole("dialog", { name: "Pagamenti segnalati" });
    const row = (await within(dialog).findByText("Segnalato dal pagante il 8 nov 2026")).closest("li") as HTMLElement;
    expect(within(row).getByText("In attesa")).toBeInTheDocument();

    await userEvent.click(within(row).getByRole("button", { name: "Registra pagamento: Sara Conti, Quota novembre" }));
    expect(await screen.findByRole("dialog", { name: "Registra pagamento" })).toHaveAccessibleDescription(/Sara Conti/);
  });

  it("shows no banner when nobody reported a payment", async () => {
    stubApi(staffRoutes());
    renderWithProviders(<QuotePage />);
    await screen.findByRole("list", { name: "Piani" });
    expect(screen.queryByText(/segnalat[ae] dal pagante[.]/)).not.toBeInTheDocument();
  });

  it("has no accessibility violations with the banner and the dialog open", async () => {
    stubApi(CLAIMED_ROUTES());
    renderWithProviders(<QuotePage />);
    await userEvent.click(await screen.findByRole("button", { name: "Mostra le segnalate" }));
    const dialog = await screen.findByRole("dialog", { name: "Pagamenti segnalati" });
    await within(dialog).findByText("Segnalato dal pagante il 8 nov 2026");
    await expectNoA11yViolations(document.body);
  });
});

describe("QuotePage for an athlete or a guardian", () => {
  beforeEach(() => {
    auth.permissions = ATHLETE_PERMISSIONS;
    auth.roles = ["GENITORE"];
  });

  it("shows only their own fees, without staff tools or write actions", async () => {
    const api = stubApi({ "GET /fees": () => json(200, page([PAID_FEE, PENDING_FEE])) });
    const { container } = renderWithProviders(<QuotePage />);

    expect(await screen.findByText("Anna Ferri")).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1, name: /Incassi chiari/ })).toBeInTheDocument();
    expect(screen.getByText(/Le quote dei tuoi figli/)).toBeInTheDocument();
    expect(screen.queryByRole("tab")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Squadra")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Cerca un tesserato")).not.toBeInTheDocument();
    expect(screen.queryByText("Incassato")).not.toBeInTheDocument();
    expect(screen.queryByRole("list", { name: "Piani" })).not.toBeInTheDocument();
    expect(api.calls.map((call) => call.path)).toEqual(["/fees"]);

    await userEvent.click(screen.getByRole("button", { name: /^Chiara Neri/ }));
    const dialog = await screen.findByRole("dialog", { name: "Chiara Neri" });
    expect(within(dialog).queryByRole("button", { name: "Registra pagamento" })).not.toBeInTheDocument();
    await userEvent.keyboard("{Escape}");
    await userEvent.click(screen.getByRole("button", { name: /Anna Ferri/ }));
    expect(await screen.findByRole("button", { name: "Scarica ricevuta" })).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it("filters their fees by status through the API and offers to show them all again", async () => {
    const api = stubApi({
      "GET /fees": (call) => json(200, page(call.query.get("status") === "PAID" ? [] : [PAID_FEE, PENDING_FEE])),
    });
    renderWithProviders(<QuotePage />);
    await screen.findByText("Anna Ferri");
    await userEvent.click(screen.getByRole("button", { name: "Pagato" }));
    expect(await screen.findByRole("heading", { name: "Nessuna quota con questo stato" })).toBeInTheDocument();
    expect(api.calls.some((call) => call.query.get("status") === "PAID")).toBe(true);
    await userEvent.click(screen.getByRole("button", { name: "Mostra tutte le quote" }));
    expect(await screen.findByText("Anna Ferri")).toBeInTheDocument();
  });

  it("loads the next page with the cursor", async () => {
    const api = stubApi({
      "GET /fees": (call) => (call.query.get("cursor") === "c1" ? json(200, page([PENDING_FEE])) : json(200, page([PAID_FEE], "c1"))),
    });
    renderWithProviders(<QuotePage />);
    await screen.findByText("Anna Ferri");
    expect(screen.queryByText("Chiara Neri")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Mostra altre quote" }));
    expect(await screen.findByText("Chiara Neri")).toBeInTheDocument();
    expect(api.calls.filter((call) => call.path === "/fees").at(-1)?.query.get("cursor")).toBe("c1");
    expect(screen.queryByRole("button", { name: "Mostra altre quote" })).not.toBeInTheDocument();
  });

  it("shows an error with a retry button, then the list", async () => {
    let attempts = 0;
    stubApi({ "GET /fees": () => (++attempts === 1 ? problem(500, "internal") : json(200, page([PAID_FEE]))) });
    renderWithProviders(<QuotePage />);
    await userEvent.click(await screen.findByRole("button", { name: "Riprova" }));
    expect(await screen.findByText("Anna Ferri")).toBeInTheDocument();
  });

  it("says what to expect when there are no fees", async () => {
    stubApi({ "GET /fees": () => json(200, page([])) });
    renderWithProviders(<QuotePage />);
    expect(await screen.findByRole("heading", { name: "Nessuna quota da mostrare" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Nuovo piano" })).not.toBeInTheDocument();
  });
});

describe("QuotePage: receipts for the payer", () => {
  it("offers the receipt of a paid fee, and none on an unpaid fee", async () => {
    auth.permissions = ATHLETE_PERMISSIONS;
    auth.roles = ["ATLETA"];
    stubApi({ "GET /fees": () => json(200, page([PAID_FEE, PENDING_FEE])) });
    renderWithProviders(<QuotePage />);
    expect(await screen.findByRole("button", { name: "Vedi ricevuta n. 0147" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Scarica ricevuta n. 0147" })).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /ricevuta n\./ })).toHaveLength(2);
  });

  it("downloads the receipt from the row", async () => {
    auth.permissions = ATHLETE_PERMISSIONS;
    auth.roles = ["ATLETA"];
    tokens.setTokens({ accessToken: "access-1", refreshToken: "refresh-1" });
    URL.createObjectURL = () => "blob:ricevuta";
    URL.revokeObjectURL = vi.fn();
    stubApi({
      "GET /fees": () => json(200, page([PAID_FEE])),
      "GET /fees/f-paid/receipt": () => new Response("%PDF-1.4", { status: 200, headers: { "content-type": "application/pdf" } }),
    });
    const saved: string[] = [];
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
      saved.push(this.download);
    });
    renderWithProviders(<QuotePage />);
    await userEvent.click(await screen.findByRole("button", { name: "Scarica ricevuta n. 0147" }));
    await waitFor(() => expect(saved).toEqual(["ricevuta-0147.pdf"]));
    click.mockRestore();
  });
});
