import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { expectNoA11yViolations } from "@/test/a11y";
import { address } from "@/test/fake-navigation";
import { json, page, problem, renderWithProviders, stubApi } from "@/test/stub-api";
import { LedgerCategoryPage } from "./ledger-category-page";
import { ARBITRO, COMUNE, ledgerRoutes, PALLONI } from "./ledger-fixtures";

const auth = vi.hoisted(() => ({ permissions: [] as string[] }));
vi.mock("@/features/auth/auth-provider", () => ({
  useAuth: () => ({ status: "authenticated", me: { permissions: auth.permissions, roles: ["ADMIN"] } }),
}));
vi.mock("next/navigation", async () => (await import("@/test/fake-navigation")).fakeNavigation);

const lastQuery = (api: ReturnType<typeof stubApi>, path: string) => api.calls.filter((call) => call.path === path).at(-1)?.query;
const year = new Date().getFullYear();
const ATTREZZATURA = "Attrezzatura%20sportiva";

beforeEach(() => {
  auth.permissions = ["ledger:read", "ledger:write"];
  address.open(`/altro/uscite/${ATTREZZATURA}`);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("LedgerCategoryPage, uscite", () => {
  it("shows the totals of the category and its expenses, each with its supplier, amount and where it comes from", async () => {
    const api = stubApi(ledgerRoutes());
    const { container } = renderWithProviders(<LedgerCategoryPage kind="EXPENSE" category={ATTREZZATURA} />);
    expect(await screen.findByRole("heading", { level: 1, name: "Attrezzatura sportiva" })).toBeInTheDocument();

    const tiles = await screen.findByRole("region", { name: "Rendiconto della categoria" });
    expect(within(tiles).getByText("Spese del periodo").parentElement?.parentElement).toHaveTextContent(/€\s760.*2 spese/);
    expect(within(tiles).getByText("Registrate qui").parentElement?.parentElement).toHaveTextContent(/€\s760/);
    expect(within(tiles).getByText("Da altre sezioni").parentElement?.parentElement).toHaveTextContent(/€\s0/);
    expect(within(tiles).getByText("Spesa media").parentElement?.parentElement).toHaveTextContent(/€\s380/);

    const list = await screen.findByRole("list", { name: "Spese" });
    const [palloni, reti] = within(list).getAllByRole("listitem") as [HTMLElement, HTMLElement];
    expect(palloni).toHaveTextContent("Palloni da gara");
    expect(palloni).toHaveTextContent("Attrezzatura sportiva · Volley Shop Emilia");
    expect(palloni).toHaveTextContent("18 set 2026");
    expect(palloni).toHaveTextContent(/−\s€\s640/);
    expect(within(palloni).getByText("Registrata qui")).toBeInTheDocument();
    expect(reti).toHaveTextContent(/−\s€\s120/);

    // everything asks for the same category and the same days
    for (const path of ["/ledger/summary", "/ledger/entries"]) {
      const query = lastQuery(api, path);
      expect(query?.get("kind")).toBe("EXPENSE");
      expect(query?.get("category")).toBe("Attrezzatura sportiva");
      expect(query?.get("from")).toBe(`${year}-01-01`);
      expect(query?.get("to")).toBe(`${year}-12-31`);
    }
    expect(lastQuery(api, "/ledger/entries")?.get("limit")).toBe("12");
    // a category that no section feeds has nothing to point at
    expect(screen.queryByText(/Una parte nasce da/)).not.toBeInTheDocument();
    await expectNoA11yViolations(container);
  }, 20_000);

  it("goes back to all the expenses with the same period", async () => {
    address.open(`/altro/uscite/${ATTREZZATURA}?dal=2026-09-01&al=2026-10-31`);
    const api = stubApi(ledgerRoutes());
    renderWithProviders(<LedgerCategoryPage kind="EXPENSE" category={ATTREZZATURA} />);
    await screen.findByRole("list", { name: "Spese" });
    expect(screen.getByRole("link", { name: "Tutte le uscite" })).toHaveAttribute("href", "/altro/uscite?dal=2026-09-01&al=2026-10-31");
    expect(lastQuery(api, "/ledger/entries")?.get("from")).toBe("2026-09-01");
    expect(lastQuery(api, "/ledger/entries")?.get("to")).toBe("2026-10-31");
    expect(screen.getByRole("heading", { level: 1 }).parentElement).toHaveTextContent("1 set – 31 ott 2026");
  });

  it("changes the period of the category with the same control, and keeps the category in the address", async () => {
    const api = stubApi(ledgerRoutes());
    renderWithProviders(<LedgerCategoryPage kind="EXPENSE" category={ATTREZZATURA} />);
    await screen.findByRole("list", { name: "Spese" });
    await userEvent.click(screen.getByRole("button", { name: "Periodo precedente" }));

    await waitFor(() => expect(lastQuery(api, "/ledger/entries")?.get("from")).toBe(`${year - 1}-01-01`));
    expect(lastQuery(api, "/ledger/summary")?.get("from")).toBe(`${year - 1}-01-01`);
    expect(address.href).toBe(`/altro/uscite/${ATTREZZATURA}?dal=${year - 1}-01-01&al=${year - 1}-12-31`);
    expect(screen.getByRole("link", { name: "Tutte le uscite" })).toHaveAttribute("href", `/altro/uscite?dal=${year - 1}-01-01&al=${year - 1}-12-31`);
    await userEvent.click(screen.getByRole("button", { name: "Azzera filtri" }));
    await waitFor(() => expect(lastQuery(api, "/ledger/entries")?.get("from")).toBe(`${year}-01-01`));
    expect(address.href).toBe(`/altro/uscite/${ATTREZZATURA}`);
  });

  it("searches and filters by origin inside the category", async () => {
    const api = stubApi(ledgerRoutes());
    renderWithProviders(<LedgerCategoryPage kind="EXPENSE" category={ATTREZZATURA} />);
    await screen.findByRole("list", { name: "Spese" });

    await userEvent.type(screen.getByLabelText("Cerca una spesa"), "palloni");
    await waitFor(() => expect(lastQuery(api, "/ledger/entries")?.get("q")).toBe("palloni"));
    await userEvent.selectOptions(screen.getByLabelText("Filtra per origine"), "MANUAL");
    await waitFor(() => expect(lastQuery(api, "/ledger/entries")?.get("origin")).toBe("MANUAL"));
    expect(lastQuery(api, "/ledger/entries")?.get("category")).toBe("Attrezzatura sportiva");
  });

  it("registers an expense in this category: the category is already filled in", async () => {
    const api = stubApi({ ...ledgerRoutes(), "POST /ledger/entries": () => json(201, PALLONI) });
    renderWithProviders(<LedgerCategoryPage kind="EXPENSE" category={ATTREZZATURA} />);
    await userEvent.click(await screen.findByRole("button", { name: "Nuova spesa" }));
    const dialog = await screen.findByRole("dialog", { name: "Nuova spesa" });
    expect(within(dialog).getByLabelText(/Categoria/)).toHaveValue("Attrezzatura sportiva");

    await userEvent.type(within(dialog).getByLabelText(/Nome della spesa/), "Nastro");
    await userEvent.type(within(dialog).getByLabelText(/Importo in euro/), "5");
    await userEvent.click(within(dialog).getByRole("button", { name: "Registra la spesa" }));
    await screen.findByText("Spesa registrata");
    expect(api.calls.find((call) => call.method === "POST")?.body).toMatchObject({ kind: "EXPENSE", category: "Attrezzatura sportiva", description: "Nastro", amountCents: 500 });
    // the totals above are read again with the list
    await waitFor(() => expect(api.count("GET /ledger/summary")).toBeGreaterThan(1));
  });

  it("opens an expense on the same page to change it, without sending the kind, and clears the supplier with null", async () => {
    const api = stubApi({ ...ledgerRoutes(), "GET /attachments": () => json(200, { data: [] }), "PATCH /ledger/entries/l-palloni": () => json(200, PALLONI) });
    renderWithProviders(<LedgerCategoryPage kind="EXPENSE" category={ATTREZZATURA} />);
    const [palloni] = within(await screen.findByRole("list", { name: "Spese" })).getAllByRole("listitem") as [HTMLElement];
    // the card is the way in: no menu, no Modifica
    expect(within(palloni).getAllByRole("button").map((button) => button.textContent)).toEqual(["Palloni da gara"]);
    await userEvent.click(within(palloni).getByRole("button", { name: "Palloni da gara" }));
    const dialog = await screen.findByRole("dialog", { name: "Palloni da gara" });
    expect(within(dialog).getByLabelText(/Fornitore/)).toHaveValue("Volley Shop Emilia");
    expect(within(dialog).getByRole("heading", { name: "Allegati" })).toBeInTheDocument();

    await userEvent.clear(within(dialog).getByLabelText(/Fornitore/));
    await userEvent.click(within(dialog).getByRole("button", { name: "Salva le modifiche" }));
    await screen.findByText("Spesa aggiornata");
    const body = api.calls.find((call) => call.method === "PATCH")?.body;
    expect(body).toMatchObject({ description: "Palloni da gara", supplier: null, amountCents: 64000 });
    expect(body).not.toHaveProperty("kind");
  });

  it("tells where an expense that another section owns comes from, with the way there, and does not let it change", async () => {
    address.open("/altro/uscite/Arbitri");
    stubApi({ ...ledgerRoutes(), "GET /ledger/entries": () => json(200, page([ARBITRO])) });
    renderWithProviders(<LedgerCategoryPage kind="EXPENSE" category="Arbitri" />);

    // the page of the category says that the referees feed it, and leads to them
    const note = await screen.findByText("Una parte nasce da Arbitri");
    expect(within(note.closest("[role='status']") as HTMLElement).getByRole("link", { name: "Vai a Arbitri" })).toHaveAttribute("href", "/altro/arbitri");

    const [arbitro] = within(await screen.findByRole("list", { name: "Spese" })).getAllByRole("listitem") as [HTMLElement];
    expect(within(arbitro).getByText("Arbitro")).toBeInTheDocument();
    expect(within(arbitro).queryByText("Registrata qui")).not.toBeInTheDocument();
    await userEvent.click(within(arbitro).getByRole("button", { name: /Roberto Cattaneo/ }));
    const dialog = await screen.findByRole("dialog", { name: /Roberto Cattaneo/ });
    expect(within(dialog).getByText("Registrata da Arbitri")).toBeInTheDocument();
    expect(within(dialog).getByText(/si cambia dalla designazione/)).toBeInTheDocument();
    expect(within(dialog).getByRole("link", { name: "Vai a Arbitri" })).toHaveAttribute("href", "/altro/arbitri");
    expect(within(dialog).getByLabelText(/Importo in euro/)).toBeDisabled();
    for (const name of ["Salva le modifiche", "Elimina"]) expect(within(dialog).queryByRole("button", { name })).not.toBeInTheDocument();
  });

  it("opens on a name that has capitals, spaces and accents in the address", async () => {
    address.open("/altro/uscite/Iscrizioni%20e%20affiliazioni%20%C3%A0");
    const api = stubApi(ledgerRoutes());
    renderWithProviders(<LedgerCategoryPage kind="EXPENSE" category="Iscrizioni%20e%20affiliazioni%20%C3%A0" />);
    expect(await screen.findByRole("heading", { level: 1, name: "Iscrizioni e affiliazioni à" })).toBeInTheDocument();
    expect(lastQuery(api, "/ledger/summary")?.get("category")).toBe("Iscrizioni e affiliazioni à");
  });

  it("does not break on an address that cannot be decoded", async () => {
    const api = stubApi(ledgerRoutes());
    renderWithProviders(<LedgerCategoryPage kind="EXPENSE" category="100%" />);
    expect(await screen.findByRole("heading", { level: 1, name: "100%" })).toBeInTheDocument();
    expect(lastQuery(api, "/ledger/summary")?.get("category")).toBe("100%");
  });

  it("explains a category without expenses in the period, and a failed list can be reloaded", async () => {
    let attempts = 0;
    stubApi({ ...ledgerRoutes(), "GET /ledger/entries": () => (++attempts === 1 ? problem(500, "internal") : json(200, page([]))) });
    renderWithProviders(<LedgerCategoryPage kind="EXPENSE" category={ATTREZZATURA} />);
    expect(await screen.findByText(/Il servizio non è disponibile/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Riprova" }));
    expect(await screen.findByRole("heading", { name: "Nessuna spesa in questo periodo" })).toBeInTheDocument();
  });

  it("does not offer to register expenses without the write permission, and opens them to read only", async () => {
    auth.permissions = ["ledger:read"];
    stubApi(ledgerRoutes());
    renderWithProviders(<LedgerCategoryPage kind="EXPENSE" category={ATTREZZATURA} />);
    await screen.findByRole("list", { name: "Spese" });
    expect(screen.queryByRole("button", { name: "Nuova spesa" })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Palloni da gara" }));
    const dialog = await screen.findByRole("dialog", { name: "Palloni da gara" });
    expect(within(dialog).getByLabelText(/Fornitore/)).toBeDisabled();
    expect(within(dialog).queryByRole("button", { name: "Salva le modifiche" })).not.toBeInTheDocument();
  });
});

describe("LedgerCategoryPage, entrate", () => {
  it("shows the sponsors that produced the income, says they come from Sponsor and leads there", async () => {
    address.open("/altro/entrate/Sponsor");
    const api = stubApi(ledgerRoutes());
    renderWithProviders(<LedgerCategoryPage kind="INCOME" category="Sponsor" />);
    expect(await screen.findByRole("heading", { level: 1, name: "Sponsor" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Tutte le entrate" })).toHaveAttribute("href", "/altro/entrate");

    const note = await screen.findByText("Una parte nasce da Sponsor");
    expect(within(note.closest("[role='status']") as HTMLElement).getByRole("link", { name: "Vai a Sponsor" })).toHaveAttribute("href", "/altro/sponsor");

    const tiles = await screen.findByRole("region", { name: "Rendiconto della categoria" });
    expect(within(tiles).getByText("Entrate del periodo").parentElement?.parentElement).toHaveTextContent(/€\s1\.?500.*1 entrata/);
    expect(within(tiles).getByText("Da altre sezioni").parentElement?.parentElement).toHaveTextContent(/€\s1\.?500/);
    const list = await screen.findByRole("list", { name: "Entrate" });
    const [ottica] = within(list).getAllByRole("listitem") as [HTMLElement];
    expect(ottica).toHaveTextContent("Ottica Rossi");
    expect(ottica).toHaveTextContent(/\+\s€\s1\.?500/);
    expect(within(ottica).getByText("Sponsor", { selector: "span" })).toBeInTheDocument();
    expect(lastQuery(api, "/ledger/entries")?.get("kind")).toBe("INCOME");
  });

  it("opens an income born from a sponsor in read only, with the way to the sponsor", async () => {
    address.open("/altro/entrate/Sponsor");
    stubApi(ledgerRoutes());
    renderWithProviders(<LedgerCategoryPage kind="INCOME" category="Sponsor" />);
    await userEvent.click(await screen.findByRole("button", { name: "Ottica Rossi" }));
    const dialog = await screen.findByRole("dialog", { name: "Ottica Rossi" });
    expect(within(dialog).getByText("Registrata da Sponsor")).toBeInTheDocument();
    expect(within(dialog).getByText(/per cambiarla apri lo sponsor/)).toBeInTheDocument();
    expect(within(dialog).getByRole("link", { name: "Vai a Sponsor" })).toHaveAttribute("href", "/altro/sponsor");
    expect(within(dialog).getByLabelText(/Importo in euro/)).toBeDisabled();
  });

  it("registers an income written by hand in this category, and a category no section feeds has no note", async () => {
    address.open("/altro/entrate/Contributi");
    const api = stubApi({ ...ledgerRoutes(), "POST /ledger/entries": () => json(201, COMUNE) });
    renderWithProviders(<LedgerCategoryPage kind="INCOME" category="Contributi" />);
    expect(screen.queryByText(/Una parte nasce da/)).not.toBeInTheDocument();
    await userEvent.click(await screen.findByRole("button", { name: "Nuova entrata" }));
    const dialog = await screen.findByRole("dialog", { name: "Nuova entrata" });
    expect(within(dialog).getByLabelText(/Categoria/)).toHaveValue("Contributi");
    await userEvent.type(within(dialog).getByLabelText(/Nome dell'entrata/), "Contributo della Regione");
    await userEvent.type(within(dialog).getByLabelText(/Importo in euro/), "500");
    await userEvent.click(within(dialog).getByRole("button", { name: "Registra l'entrata" }));
    await screen.findByText("Entrata registrata");
    expect(api.calls.find((call) => call.method === "POST")?.body).toMatchObject({ kind: "INCOME", category: "Contributi", amountCents: 50000 });
  });
});
