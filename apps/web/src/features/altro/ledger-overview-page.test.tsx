import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { expectNoA11yViolations } from "@/test/a11y";
import { address } from "@/test/fake-navigation";
import { json, problem, renderWithProviders, stubApi } from "@/test/stub-api";
import { LedgerOverviewPage } from "./ledger-overview-page";
import { CATEGORIES, COMUNE, EMPTY_SUMMARY, INCOME_CATEGORIES, ledgerRoutes, PALLONI } from "./ledger-fixtures";

const auth = vi.hoisted(() => ({ permissions: [] as string[] }));
vi.mock("@/features/auth/auth-provider", () => ({
  useAuth: () => ({ status: "authenticated", me: { permissions: auth.permissions, roles: ["ADMIN"] } }),
}));
vi.mock("next/navigation", async () => (await import("@/test/fake-navigation")).fakeNavigation);

const year = new Date().getFullYear();
const lastQuery = (api: ReturnType<typeof stubApi>, kind: string) => api.calls.filter((call) => call.path === "/ledger/summary" && call.query.get("kind") === kind).at(-1)?.query;
const categoryCards = async () => within(await screen.findByRole("list", { name: "Categorie" })).getAllByRole("listitem");
const periodGroup = () => screen.getByRole("group", { name: "Periodo" });

beforeEach(() => {
  auth.permissions = ["ledger:read", "ledger:write"];
  address.open("/altro/uscite");
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Uscite", () => {
  it("shows the totals of the year, the sections that feed it and one card per category", async () => {
    const api = stubApi(ledgerRoutes());
    const { container } = renderWithProviders(<LedgerOverviewPage kind="EXPENSE" />);
    expect(await screen.findByRole("heading", { level: 1, name: /Dove vanno i soldi\./ })).toBeInTheDocument();

    const tiles = await screen.findByRole("region", { name: "Rendiconto delle uscite" });
    expect(within(tiles).getByText("Spese del periodo").parentElement?.parentElement).toHaveTextContent(/€\s805.*3 spese/);
    expect(within(tiles).getByText("Registrate qui").parentElement?.parentElement).toHaveTextContent(/€\s760/);
    expect(within(tiles).getByText("Da altre sezioni").parentElement?.parentElement).toHaveTextContent(/€\s45/);
    expect(within(tiles).getByText("Categorie").parentElement?.parentElement).toHaveTextContent("2");

    // the sections that write the costs by themselves, one click away
    const sources = within(screen.getByRole("list", { name: "Sezioni collegate" }));
    expect(sources.getAllByRole("link").map((link) => [link.textContent, link.getAttribute("href")])).toEqual([
      ["Palestre", "/altro/palestre"],
      ["Divise", "/altro/divise"],
      ["Trasferte", "/altro/trasferte"],
      ["Arbitri", "/altro/arbitri"],
    ]);

    const [attrezzatura, arbitri] = (await categoryCards()) as [HTMLElement, HTMLElement];
    expect(attrezzatura).toHaveTextContent("Attrezzatura sportiva");
    expect(attrezzatura).toHaveTextContent("Palloni da gara, Reti da gara");
    expect(attrezzatura).toHaveTextContent("18 set – 2 ott 2026");
    expect(attrezzatura).toHaveTextContent(/−\s€\s760/);
    expect(attrezzatura).toHaveTextContent("2 spese");
    expect(arbitri).toHaveTextContent("14 novembre 2026");
    expect(arbitri).toHaveTextContent("1 spesa");
    // the card opens the page of the category
    expect(within(attrezzatura).getByRole("link", { name: "Attrezzatura sportiva" })).toHaveAttribute("href", "/altro/uscite/Attrezzatura%20sportiva");

    const query = lastQuery(api, "EXPENSE");
    expect(query?.get("from")).toBe(`${year}-01-01`);
    expect(query?.get("to")).toBe(`${year}-12-31`);
    // the single movements are on the pages of the categories, not here
    expect(api.count("GET /ledger/entries")).toBe(0);
    await expectNoA11yViolations(container);
  }, 20_000);

  it("registers an expense with its name, category, supplier and notes, offering the categories in use", async () => {
    const api = stubApi({ ...ledgerRoutes(), "POST /ledger/entries": () => json(201, PALLONI) });
    renderWithProviders(<LedgerOverviewPage kind="EXPENSE" />);
    await userEvent.click(await screen.findByRole("button", { name: "Nuova spesa" }));
    const dialog = await screen.findByRole("dialog", { name: "Nuova spesa" });

    const category = within(dialog).getByLabelText(/Categoria/);
    await waitFor(() => expect(Array.from(document.querySelectorAll("datalist option")).map((option) => option.getAttribute("value"))).toEqual(CATEGORIES));
    await userEvent.type(within(dialog).getByLabelText(/Nome della spesa/), "Nastro e gessetti");
    await userEvent.type(category, "Attrezzatura sportiva");
    await userEvent.clear(within(dialog).getByLabelText(/Data/));
    await userEvent.type(within(dialog).getByLabelText(/Data/), "2026-10-05");
    await userEvent.type(within(dialog).getByLabelText(/Importo in euro/), "18,40");
    await userEvent.type(within(dialog).getByLabelText(/Fornitore/), "Sport Center");
    await userEvent.type(within(dialog).getByLabelText(/Note/), "Scontrino 220");
    await userEvent.click(within(dialog).getByRole("button", { name: "Registra la spesa" }));

    await screen.findByText("Spesa registrata");
    expect(api.calls.find((call) => call.method === "POST")?.body).toEqual({
      kind: "EXPENSE",
      description: "Nastro e gessetti",
      category: "Attrezzatura sportiva",
      amountCents: 1840,
      occurredOn: "2026-10-05",
      supplier: "Sport Center",
      notes: "Scontrino 220",
    });
    // the totals and the cards are read again: the expense is in the balance at once
    await waitFor(() => expect(api.count("GET /ledger/summary")).toBeGreaterThan(1));
  });

  it("asks for a name, a category and an amount, and leaves out the supplier and notes when empty", async () => {
    const api = stubApi({ ...ledgerRoutes(), "POST /ledger/entries": () => json(201, PALLONI) });
    renderWithProviders(<LedgerOverviewPage kind="EXPENSE" />);
    await userEvent.click(await screen.findByRole("button", { name: "Nuova spesa" }));
    const dialog = await screen.findByRole("dialog", { name: "Nuova spesa" });
    await userEvent.click(within(dialog).getByRole("button", { name: "Registra la spesa" }));
    expect(await within(dialog).findByText("Dai un nome alla spesa")).toBeInTheDocument();
    expect(within(dialog).getByText("Scegli o scrivi la categoria")).toBeInTheDocument();
    expect(api.count("POST /ledger/entries")).toBe(0);

    await userEvent.type(within(dialog).getByLabelText(/Nome della spesa/), "Nastro");
    await userEvent.type(within(dialog).getByLabelText(/Categoria/), "Altro");
    await userEvent.type(within(dialog).getByLabelText(/Importo in euro/), "5");
    await userEvent.click(within(dialog).getByRole("button", { name: "Registra la spesa" }));
    await screen.findByText("Spesa registrata");
    const body = api.calls.find((call) => call.method === "POST")?.body;
    expect(body).toMatchObject({ description: "Nastro", category: "Altro", amountCents: 500 });
    expect(body).not.toHaveProperty("supplier");
    expect(body).not.toHaveProperty("notes");
  });

  it("does not offer to register expenses without the write permission", async () => {
    auth.permissions = ["ledger:read"];
    stubApi(ledgerRoutes());
    renderWithProviders(<LedgerOverviewPage kind="EXPENSE" />);
    await categoryCards();
    expect(screen.queryByRole("button", { name: "Nuova spesa" })).not.toBeInTheDocument();
  });

  it("explains a period without expenses and offers the first one", async () => {
    stubApi({ ...ledgerRoutes(), "GET /ledger/summary": () => json(200, EMPTY_SUMMARY) });
    renderWithProviders(<LedgerOverviewPage kind="EXPENSE" />);
    expect(await screen.findByRole("heading", { name: "Nessuna spesa in questo periodo" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Nuova spesa" })).toBeInTheDocument();
    expect(screen.queryByRole("list", { name: "Categorie" })).not.toBeInTheDocument();
  });

  it("shows a loading state, and a failed load can be tried again", async () => {
    let attempts = 0;
    stubApi({ ...ledgerRoutes(), "GET /ledger/summary": () => (++attempts === 1 ? problem(500, "internal") : json(200, EMPTY_SUMMARY)) });
    renderWithProviders(<LedgerOverviewPage kind="EXPENSE" />);
    expect(screen.getByRole("status", { name: "Caricamento delle uscite" })).toBeInTheDocument();
    expect(await screen.findByText("Uscite non disponibili")).toBeInTheDocument();
    // the period stays on screen: it can be changed while the load fails
    expect(periodGroup()).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Riprova" }));
    expect(await screen.findByRole("heading", { name: "Nessuna spesa in questo periodo" })).toBeInTheDocument();
  });
});

describe("Entrate", () => {
  beforeEach(() => {
    address.open("/altro/entrate");
  });

  it("shows where the money comes from: the totals, the sections that feed it and one card per category", async () => {
    const api = stubApi(ledgerRoutes());
    const { container } = renderWithProviders(<LedgerOverviewPage kind="INCOME" />);
    expect(await screen.findByRole("heading", { level: 1, name: /Da dove arrivano i soldi\./ })).toBeInTheDocument();

    const tiles = await screen.findByRole("region", { name: "Rendiconto delle entrate" });
    expect(within(tiles).getByText("Entrate del periodo").parentElement?.parentElement).toHaveTextContent(/€\s2240.*3 entrate/);
    expect(within(tiles).getByText("Registrate qui").parentElement?.parentElement).toHaveTextContent(/€\s500/);
    expect(within(tiles).getByText("Da altre sezioni").parentElement?.parentElement).toHaveTextContent(/€\s1740/);

    const sources = within(screen.getByRole("list", { name: "Sezioni collegate" }));
    expect(sources.getAllByRole("link").map((link) => [link.textContent, link.getAttribute("href")])).toEqual([
      ["Pagamenti", "/quote"],
      ["Sponsor", "/altro/sponsor"],
    ]);

    const cards = await categoryCards();
    expect(cards.map((card) => card.querySelector("h3")?.textContent)).toEqual(["Sponsor", "Contributi", "Quote"]);
    // an income reads with a plus, and a card leads to the entries that produced it
    expect(cards[0]).toHaveTextContent(/\+\s€\s1500/);
    expect(within(cards[0] as HTMLElement).getByRole("link", { name: "Sponsor" })).toHaveAttribute("href", "/altro/entrate/Sponsor");
    expect(cards[0]).toHaveTextContent("1 entrata");
    expect(lastQuery(api, "INCOME")?.get("kind")).toBe("INCOME");
    await expectNoA11yViolations(container);
  }, 20_000);

  it("registers an income and offers the categories of the incomes", async () => {
    const api = stubApi({ ...ledgerRoutes(), "POST /ledger/entries": () => json(201, COMUNE) });
    renderWithProviders(<LedgerOverviewPage kind="INCOME" />);
    await userEvent.click(await screen.findByRole("button", { name: "Nuova entrata" }));
    const dialog = await screen.findByRole("dialog", { name: "Nuova entrata" });
    await waitFor(() => expect(Array.from(document.querySelectorAll("datalist option")).map((option) => option.getAttribute("value"))).toEqual(INCOME_CATEGORIES));
    await userEvent.type(within(dialog).getByLabelText(/Nome dell'entrata/), "Raccolta fondi");
    await userEvent.type(within(dialog).getByLabelText(/Categoria/), "Eventi e raccolte fondi");
    await userEvent.type(within(dialog).getByLabelText(/Importo in euro/), "320");
    await userEvent.click(within(dialog).getByRole("button", { name: "Registra l'entrata" }));
    await screen.findByText("Entrata registrata");
    expect(api.calls.find((call) => call.method === "POST")?.body).toMatchObject({ kind: "INCOME", category: "Eventi e raccolte fondi", amountCents: 32000 });
    await waitFor(() => expect(api.count("GET /ledger/summary")).toBeGreaterThan(1));
  });

  it("explains a period without incomes", async () => {
    stubApi({ ...ledgerRoutes(), "GET /ledger/summary": () => json(200, EMPTY_SUMMARY) });
    renderWithProviders(<LedgerOverviewPage kind="INCOME" />);
    expect(await screen.findByRole("heading", { name: "Nessuna entrata in questo periodo" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Nuova entrata" })).toBeInTheDocument();
  });
});

describe("the period of Entrate and Uscite", () => {
  const openPeriod = async () => {
    await userEvent.click(within(periodGroup()).getByRole("button", { name: String(year) }));
    return screen.findByRole("dialog", { name: "Scegli il periodo" });
  };

  it("starts from the current year, with only the arrows and the period in the middle", async () => {
    stubApi(ledgerRoutes());
    renderWithProviders(<LedgerOverviewPage kind="EXPENSE" />);
    await categoryCards();
    expect(within(periodGroup()).getAllByRole("button").map((button) => button.textContent || button.getAttribute("aria-label"))).toEqual([
      "Periodo precedente",
      String(year),
      "Periodo successivo",
    ]);
    expect(screen.queryByRole("button", { name: "Azzera filtri" })).not.toBeInTheDocument();
  });

  it("goes to the year before with the arrow, writes the period in the address and carries it to the categories", async () => {
    const api = stubApi(ledgerRoutes());
    renderWithProviders(<LedgerOverviewPage kind="EXPENSE" />);
    await categoryCards();
    await userEvent.click(screen.getByRole("button", { name: "Periodo precedente" }));

    await waitFor(() => expect(lastQuery(api, "EXPENSE")?.get("from")).toBe(`${year - 1}-01-01`));
    expect(address.href).toBe(`/altro/uscite?dal=${year - 1}-01-01&al=${year - 1}-12-31`);
    const [first] = await categoryCards();
    expect(within(first as HTMLElement).getByRole("link", { name: "Attrezzatura sportiva" })).toHaveAttribute(
      "href",
      `/altro/uscite/Attrezzatura%20sportiva?dal=${year - 1}-01-01&al=${year - 1}-12-31`,
    );
    await userEvent.click(await screen.findByRole("button", { name: "Azzera filtri" }));
    await waitFor(() => expect(lastQuery(api, "EXPENSE")?.get("from")).toBe(`${year}-01-01`));
    expect(address.href).toBe("/altro/uscite");
  });

  it("opens on the period written in the address, and on the current year when the address is wrong", async () => {
    address.open("/altro/entrate?dal=2026-03-01&al=2026-03-31");
    const api = stubApi(ledgerRoutes());
    const { unmount } = renderWithProviders(<LedgerOverviewPage kind="INCOME" />);
    await categoryCards();
    expect(within(periodGroup()).getByText("Marzo 2026")).toBeInTheDocument();
    expect(lastQuery(api, "INCOME")?.get("from")).toBe("2026-03-01");
    expect(lastQuery(api, "INCOME")?.get("to")).toBe("2026-03-31");
    unmount();

    address.open("/altro/entrate?dal=ieri&al=2026-03-31");
    const wrong = stubApi(ledgerRoutes());
    renderWithProviders(<LedgerOverviewPage kind="INCOME" />);
    await categoryCards();
    expect(lastQuery(wrong, "INCOME")?.get("from")).toBe(`${year}-01-01`);
  });

  it("offers the four ways to choose, and chooses a month", async () => {
    const api = stubApi(ledgerRoutes());
    renderWithProviders(<LedgerOverviewPage kind="EXPENSE" />);
    await categoryCards();
    const dialog = await openPeriod();
    expect(within(dialog).getAllByRole("tab").map((tab) => tab.textContent)).toEqual(["Settimana", "Mese", "Anno", "Intervallo"]);
    await userEvent.click(within(dialog).getByRole("tab", { name: "Mese" }));
    await userEvent.click(within(dialog).getByRole("button", { name: `novembre ${year}` }));
    await waitFor(() => expect(lastQuery(api, "EXPENSE")?.get("from")).toBe(`${year}-11-01`));
    expect(lastQuery(api, "EXPENSE")?.get("to")).toBe(`${year}-11-30`);
    expect(screen.queryByRole("dialog", { name: "Scegli il periodo" })).not.toBeInTheDocument();
  });
});

describe("files attached while registering", () => {
  const fattura = new File(["%PDF-1.4"], "fattura-118.pdf", { type: "application/pdf" });
  const scontrino = new File(["png"], "scontrino.png", { type: "image/png" });

  const fillRequired = async (dialog: HTMLElement) => {
    await userEvent.type(within(dialog).getByLabelText(/Nome della spesa/), "Palloni");
    await userEvent.type(within(dialog).getByLabelText(/Categoria/), "Altro");
    await userEvent.type(within(dialog).getByLabelText(/Importo in euro/), "5");
  };
  const openForm = async () => {
    await userEvent.click(await screen.findByRole("button", { name: "Nuova spesa" }));
    return screen.findByRole("dialog", { name: "Nuova spesa" });
  };

  it("sends every chosen file to the new expense once it is saved, and lets one be taken off first", async () => {
    const api = stubApi({ ...ledgerRoutes(), "POST /ledger/entries": () => json(201, PALLONI), "POST /attachments": () => json(201, {}) });
    renderWithProviders(<LedgerOverviewPage kind="EXPENSE" />);
    const dialog = await openForm();
    await fillRequired(dialog);

    await userEvent.upload(within(dialog).getByLabelText("File da allegare"), [fattura, scontrino]);
    const list = within(dialog).getByRole("list", { name: "File scelti" });
    expect(within(list).getAllByRole("listitem")).toHaveLength(2);
    await userEvent.click(within(list).getByRole("button", { name: "Togli scontrino.png" }));
    await userEvent.upload(within(dialog).getByLabelText("File da allegare"), scontrino);
    expect(api.count("POST /attachments")).toBe(0);

    await userEvent.click(within(dialog).getByRole("button", { name: "Registra la spesa" }));
    await screen.findByText("Spesa registrata");
    const uploads = api.calls.filter((call) => call.path === "/attachments");
    expect(uploads.map((call) => call.query.get("fileName"))).toEqual(["fattura-118.pdf", "scontrino.png"]);
    for (const upload of uploads) {
      expect(upload.query.get("entityType")).toBe("LEDGER_ENTRY");
      expect(upload.query.get("entityId")).toBe(PALLONI.id);
    }
  });

  it("refuses a file of the wrong type and does not list it", async () => {
    const api = stubApi({ ...ledgerRoutes(), "POST /ledger/entries": () => json(201, PALLONI) });
    renderWithProviders(<LedgerOverviewPage kind="EXPENSE" />);
    const dialog = await openForm();
    const word = new File(["x"], "fattura.docx", { type: "application/msword" });
    await userEvent.upload(within(dialog).getByLabelText("File da allegare"), word, { applyAccept: false });
    expect(await within(dialog).findByText(/fattura\.docx: Il file deve essere un PDF/)).toBeInTheDocument();
    expect(within(dialog).queryByRole("list", { name: "File scelti" })).not.toBeInTheDocument();
    expect(api.count("POST /attachments")).toBe(0);
  });

  it("keeps the expense and names the files that could not be attached", async () => {
    const api = stubApi({
      ...ledgerRoutes(),
      "POST /ledger/entries": () => json(201, PALLONI),
      "POST /attachments": (call) => (call.query.get("fileName") === "scontrino.png" ? problem(500, "internal") : json(201, {})),
    });
    renderWithProviders(<LedgerOverviewPage kind="EXPENSE" />);
    const dialog = await openForm();
    await fillRequired(dialog);
    await userEvent.upload(within(dialog).getByLabelText("File da allegare"), [fattura, scontrino]);
    await userEvent.click(within(dialog).getByRole("button", { name: "Registra la spesa" }));

    expect(await screen.findByText(/Non sono stati allegati: scontrino\.png/)).toBeInTheDocument();
    expect(api.count("POST /ledger/entries")).toBe(1);
    expect(screen.queryByRole("dialog", { name: "Nuova spesa" })).not.toBeInTheDocument();
  });
});
