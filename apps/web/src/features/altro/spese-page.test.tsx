import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { expectNoA11yViolations } from "@/test/a11y";
import { json, page, problem, renderWithProviders, stubApi } from "@/test/stub-api";
import { SpesePage } from "./spese-page";
import { AFFITTO, REPORT } from "./test-fixtures";
import type { LedgerEntry, LedgerReport } from "./types";

const auth = vi.hoisted(() => ({ permissions: [] as string[] }));
vi.mock("@/features/auth/auth-provider", () => ({
  useAuth: () => ({ status: "authenticated", me: { permissions: auth.permissions, roles: ["ADMIN"] } }),
}));

const STAMPS = { createdAt: "2026-10-01T08:00:00.000Z", updatedAt: "2026-10-01T08:00:00.000Z" };

const PALLONI: LedgerEntry = {
  id: "l-palloni",
  kind: "EXPENSE",
  category: "Attrezzatura sportiva",
  description: "Palloni da gara",
  supplier: "Volley Shop Emilia",
  notes: "Fattura 118",
  amountCents: 64000,
  occurredOn: "2026-09-18",
  sponsorId: null,
  paymentId: null,
  source: null,
  ...STAMPS,
};

const ARBITRO: LedgerEntry = {
  ...PALLONI,
  id: "l-arbitro",
  category: "Arbitri",
  description: "Roberto Cattaneo · Aquile - Delfini",
  supplier: null,
  notes: null,
  amountCents: 4500,
  occurredOn: "2026-11-14",
  source: "REFEREE",
};

const SPESE_REPORT: LedgerReport = {
  year: 2026,
  totals: { incomeCents: 0, expenseCents: 68500, balanceCents: -68500 },
  months: REPORT.months.map((month) => ({ ...month, incomeCents: 0, expenseCents: month.month === "2026-09" ? 64000 : 0, balanceCents: 0 })),
  categories: [
    { kind: "EXPENSE", category: "Attrezzatura sportiva", totalCents: 64000 },
    { kind: "EXPENSE", category: "Arbitri", totalCents: 4500 },
  ],
};

const CATEGORIES = ["Arbitri", "Assicurazioni", "Attrezzatura sportiva", "Palestre"];

function routes(extra: Parameters<typeof stubApi>[0] = {}) {
  return {
    "GET /ledger/report": () => json(200, SPESE_REPORT),
    "GET /ledger/categories": () => json(200, { data: CATEGORIES }),
    "GET /ledger/entries": () => json(200, page([PALLONI, ARBITRO, AFFITTO])),
    ...extra,
  };
}

beforeEach(() => {
  auth.permissions = ["ledger:read", "ledger:write"];
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("SpesePage", () => {
  it("shows what was spent in the year, the heaviest category and the expenses of the year", async () => {
    const api = stubApi(routes());
    const { container } = renderWithProviders(<SpesePage />);
    expect(await screen.findByRole("heading", { level: 1, name: /Ogni spesa, al suo posto\./ })).toBeInTheDocument();

    const summary = await screen.findByRole("region", { name: /Riepilogo delle spese/ });
    expect(within(summary).getByText(/^Spese 2026/).parentElement?.parentElement).toHaveTextContent(/€\s685/);
    expect(within(summary).getByText("Categoria più pesante").parentElement?.parentElement).toHaveTextContent(/€\s640.*Attrezzatura sportiva/);
    const categories = within(summary).getByRole("region", { name: "Spese per categoria" });
    expect(within(categories).getByRole("progressbar", { name: "Spese per categoria: Arbitri" })).toBeInTheDocument();

    const list = await screen.findByRole("list", { name: "Spese" });
    expect(within(list).getAllByRole("listitem")).toHaveLength(3);
    const query = api.calls.find((call) => call.path === "/ledger/entries")?.query;
    expect(query?.get("kind")).toBe("EXPENSE");
    expect(query?.get("from")).toBe(`${new Date().getFullYear()}-01-01`);
    await expectNoA11yViolations(container);
  });

  it("shows the name, category, supplier and amount of each expense, and which ones follow another section", async () => {
    stubApi(routes());
    renderWithProviders(<SpesePage />);
    const [palloni, arbitro] = within(await screen.findByRole("list", { name: "Spese" })).getAllByRole("listitem") as [HTMLElement, HTMLElement];

    expect(palloni).toHaveTextContent("Palloni da gara");
    expect(palloni).toHaveTextContent("Attrezzatura sportiva · Volley Shop Emilia");
    expect(palloni).toHaveTextContent(/−\s€\s640/);
    expect(within(palloni).queryByText("Arbitro")).not.toBeInTheDocument();
    expect(within(palloni).getByRole("button", { name: /Altre azioni|Azioni/ })).toBeInTheDocument();

    expect(within(arbitro).getByText("Arbitro")).toBeInTheDocument();
    expect(arbitro).toHaveTextContent("Compenso di un arbitro: si modifica dalla designazione.");
    // the cost of a referee is changed on the designation: here only its receipts can be attached
    await userEvent.click(within(arbitro).getByRole("button", { name: /Altre azioni|Azioni/ }));
    expect(await screen.findByRole("menuitem", { name: /Allegati/ })).toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: /Modifica|Elimina/ })).not.toBeInTheDocument();
  });

  it("registers an expense with its name, category, supplier and notes, offering the categories in use", async () => {
    const api = stubApi(routes({ "POST /ledger/entries": () => json(201, PALLONI) }));
    renderWithProviders(<SpesePage />);
    await userEvent.click(await screen.findByRole("button", { name: "Nuova spesa" }));
    const dialog = await screen.findByRole("dialog", { name: "Nuova spesa" });

    const category = within(dialog).getByLabelText(/Categoria/);
    const options = Array.from(document.querySelectorAll(`datalist#${CSS.escape(category.getAttribute("list") ?? "")} option`)).map((option) => option.getAttribute("value"));
    await waitFor(() => expect(Array.from(document.querySelectorAll("datalist option")).map((option) => option.getAttribute("value"))).toEqual(CATEGORIES));
    expect(options).toBeDefined();

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
    // the list, the totals and the categories are read again: the expense is in the balance at once
    await waitFor(() => expect(api.calls.filter((call) => call.path === "/ledger/report").length).toBeGreaterThan(1));
  });

  it("asks for a name, a category and an amount, and leaves out the supplier and notes when empty", async () => {
    const api = stubApi(routes({ "POST /ledger/entries": () => json(201, PALLONI) }));
    renderWithProviders(<SpesePage />);
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

  it("edits an expense without sending the kind, and clears the supplier with null", async () => {
    const api = stubApi(routes({ "PATCH /ledger/entries/l-palloni": () => json(200, PALLONI) }));
    renderWithProviders(<SpesePage />);
    const [palloni] = within(await screen.findByRole("list", { name: "Spese" })).getAllByRole("listitem") as [HTMLElement];
    await userEvent.click(within(palloni).getByRole("button", { name: /Altre azioni|Azioni/ }));
    await userEvent.click(await screen.findByRole("menuitem", { name: /Modifica/ }));
    const dialog = await screen.findByRole("dialog", { name: "Modifica la spesa" });
    expect(within(dialog).getByLabelText(/Nome della spesa/)).toHaveValue("Palloni da gara");
    expect(within(dialog).getByLabelText(/Fornitore/)).toHaveValue("Volley Shop Emilia");

    await userEvent.clear(within(dialog).getByLabelText(/Fornitore/));
    await userEvent.click(within(dialog).getByRole("button", { name: "Salva le modifiche" }));
    await screen.findByText("Spesa aggiornata");
    const body = api.calls.find((call) => call.method === "PATCH")?.body;
    expect(body).toMatchObject({ description: "Palloni da gara", supplier: null, amountCents: 64000 });
    expect(body).not.toHaveProperty("kind");
  });

  it("searches, filters by origin and by category through the API", async () => {
    const api = stubApi(routes());
    renderWithProviders(<SpesePage />);
    await screen.findByRole("list", { name: "Spese" });

    await userEvent.type(screen.getByLabelText("Cerca una spesa"), "palloni");
    await waitFor(() => expect(api.calls.at(-1)?.query.get("q")).toBe("palloni"));

    await userEvent.selectOptions(screen.getByLabelText("Filtra per origine"), "MANUAL");
    await waitFor(() => expect(api.calls.at(-1)?.query.get("origin")).toBe("MANUAL"));

    // only the categories with spending in the year are offered as a filter
    const categoryFilter = screen.getByLabelText("Categoria");
    expect(within(categoryFilter).getAllByRole("option").map((option) => option.textContent)).toEqual([
      "Tutte le categorie",
      "Arbitri",
      "Attrezzatura sportiva",
    ]);
    await userEvent.selectOptions(categoryFilter, "Arbitri");
    await waitFor(() => expect(api.calls.at(-1)?.query.get("category")).toBe("Arbitri"));
  });

  it("explains an empty year, and a failed summary can be reloaded", async () => {
    let attempts = 0;
    stubApi(
      routes({
        "GET /ledger/entries": () => json(200, page([])),
        "GET /ledger/report": () => (++attempts === 1 ? problem(500, "internal") : json(200, SPESE_REPORT)),
      }),
    );
    renderWithProviders(<SpesePage />);
    expect(await screen.findByText("Riepilogo non disponibile")).toBeInTheDocument();
    expect(await screen.findByRole("heading", { name: "Nessuna spesa" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Riprova" }));
    expect(await screen.findByRole("region", { name: /Riepilogo delle spese/ })).toBeInTheDocument();
  });

  it("does not offer to register expenses without the write permission", async () => {
    auth.permissions = ["ledger:read"];
    stubApi(routes());
    renderWithProviders(<SpesePage />);
    await screen.findByRole("list", { name: "Spese" });
    expect(screen.queryByRole("button", { name: "Nuova spesa" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Altre azioni|Azioni/ })).not.toBeInTheDocument();
  });
});
