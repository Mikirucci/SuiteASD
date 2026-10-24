import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { expectNoA11yViolations } from "@/test/a11y";
import { address } from "@/test/fake-navigation";
import { json, page, problem, renderWithProviders, stubApi } from "@/test/stub-api";
import { ARBITRO, PALLONI, speseRoutes } from "./spese-fixtures";
import { SpeseCategoryPage } from "./spese-category-page";

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
  address.open(`/altro/spese/${ATTREZZATURA}`);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("SpeseCategoryPage", () => {
  it("shows the totals of the category and its expenses, each with its supplier, amount and where it comes from", async () => {
    const api = stubApi(speseRoutes());
    const { container } = renderWithProviders(<SpeseCategoryPage category={ATTREZZATURA} />);
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
    await expectNoA11yViolations(container);
  }, 20_000);

  it("goes back to all the expenses with the same period", async () => {
    address.open(`/altro/spese/${ATTREZZATURA}?dal=2026-09-01&al=2026-10-31`);
    const api = stubApi(speseRoutes());
    renderWithProviders(<SpeseCategoryPage category={ATTREZZATURA} />);
    await screen.findByRole("list", { name: "Spese" });
    expect(screen.getByRole("link", { name: "Tutte le spese" })).toHaveAttribute("href", "/altro/spese?dal=2026-09-01&al=2026-10-31");
    expect(lastQuery(api, "/ledger/entries")?.get("from")).toBe("2026-09-01");
    expect(lastQuery(api, "/ledger/entries")?.get("to")).toBe("2026-10-31");
    expect(screen.getByRole("heading", { level: 1 }).parentElement).toHaveTextContent("1 set – 31 ott 2026");
  });

  it("changes the period of the category with the same control, and keeps the category in the address", async () => {
    const api = stubApi(speseRoutes());
    renderWithProviders(<SpeseCategoryPage category={ATTREZZATURA} />);
    await screen.findByRole("list", { name: "Spese" });
    await userEvent.click(screen.getByRole("button", { name: "Periodo precedente" }));

    await waitFor(() => expect(lastQuery(api, "/ledger/entries")?.get("from")).toBe(`${year - 1}-01-01`));
    expect(lastQuery(api, "/ledger/summary")?.get("from")).toBe(`${year - 1}-01-01`);
    expect(address.href).toBe(`/altro/spese/${ATTREZZATURA}?dal=${year - 1}-01-01&al=${year - 1}-12-31`);
    expect(screen.getByRole("link", { name: "Tutte le spese" })).toHaveAttribute("href", `/altro/spese?dal=${year - 1}-01-01&al=${year - 1}-12-31`);
    await userEvent.click(screen.getByRole("button", { name: "Azzera filtri" }));
    await waitFor(() => expect(lastQuery(api, "/ledger/entries")?.get("from")).toBe(`${year}-01-01`));
    expect(address.href).toBe(`/altro/spese/${ATTREZZATURA}`);
  });

  it("searches and filters by origin inside the category", async () => {
    const api = stubApi(speseRoutes());
    renderWithProviders(<SpeseCategoryPage category={ATTREZZATURA} />);
    await screen.findByRole("list", { name: "Spese" });

    await userEvent.type(screen.getByLabelText("Cerca una spesa"), "palloni");
    await waitFor(() => expect(lastQuery(api, "/ledger/entries")?.get("q")).toBe("palloni"));
    await userEvent.selectOptions(screen.getByLabelText("Filtra per origine"), "MANUAL");
    await waitFor(() => expect(lastQuery(api, "/ledger/entries")?.get("origin")).toBe("MANUAL"));
    expect(lastQuery(api, "/ledger/entries")?.get("category")).toBe("Attrezzatura sportiva");
  });

  it("registers an expense in this category: the category is already filled in", async () => {
    const api = stubApi({ ...speseRoutes(), "POST /ledger/entries": () => json(201, PALLONI) });
    renderWithProviders(<SpeseCategoryPage category={ATTREZZATURA} />);
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

  it("edits an expense without sending the kind, and clears the supplier with null", async () => {
    const api = stubApi({ ...speseRoutes(), "PATCH /ledger/entries/l-palloni": () => json(200, PALLONI) });
    renderWithProviders(<SpeseCategoryPage category={ATTREZZATURA} />);
    const [palloni] = within(await screen.findByRole("list", { name: "Spese" })).getAllByRole("listitem") as [HTMLElement];
    await userEvent.click(within(palloni).getByRole("button", { name: /Altre azioni|Azioni/ }));
    await userEvent.click(await screen.findByRole("menuitem", { name: /Modifica/ }));
    const dialog = await screen.findByRole("dialog", { name: "Modifica la spesa" });
    expect(within(dialog).getByLabelText(/Fornitore/)).toHaveValue("Volley Shop Emilia");

    await userEvent.clear(within(dialog).getByLabelText(/Fornitore/));
    await userEvent.click(within(dialog).getByRole("button", { name: "Salva le modifiche" }));
    await screen.findByText("Spesa aggiornata");
    const body = api.calls.find((call) => call.method === "PATCH")?.body;
    expect(body).toMatchObject({ description: "Palloni da gara", supplier: null, amountCents: 64000 });
    expect(body).not.toHaveProperty("kind");
  });

  it("tells the expenses that follow another section, which can only get attachments", async () => {
    address.open("/altro/spese/Arbitri");
    stubApi({ ...speseRoutes(), "GET /ledger/entries": () => json(200, page([ARBITRO])) });
    renderWithProviders(<SpeseCategoryPage category="Arbitri" />);
    const [arbitro] = within(await screen.findByRole("list", { name: "Spese" })).getAllByRole("listitem") as [HTMLElement];

    expect(within(arbitro).getByText("Arbitro")).toBeInTheDocument();
    expect(within(arbitro).queryByText("Registrata qui")).not.toBeInTheDocument();
    expect(arbitro).toHaveTextContent("Compenso di un arbitro: si modifica dalla designazione.");
    await userEvent.click(within(arbitro).getByRole("button", { name: /Altre azioni|Azioni/ }));
    expect(await screen.findByRole("menuitem", { name: /Allegati/ })).toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: /Modifica|Elimina/ })).not.toBeInTheDocument();
  });

  it("opens on a name that has capitals, spaces and accents in the address", async () => {
    address.open("/altro/spese/Iscrizioni%20e%20affiliazioni%20%C3%A0");
    const api = stubApi(speseRoutes());
    renderWithProviders(<SpeseCategoryPage category="Iscrizioni%20e%20affiliazioni%20%C3%A0" />);
    expect(await screen.findByRole("heading", { level: 1, name: "Iscrizioni e affiliazioni à" })).toBeInTheDocument();
    expect(lastQuery(api, "/ledger/summary")?.get("category")).toBe("Iscrizioni e affiliazioni à");
  });

  it("does not break on an address that cannot be decoded", async () => {
    const api = stubApi(speseRoutes());
    renderWithProviders(<SpeseCategoryPage category="100%" />);
    expect(await screen.findByRole("heading", { level: 1, name: "100%" })).toBeInTheDocument();
    expect(lastQuery(api, "/ledger/summary")?.get("category")).toBe("100%");
  });

  it("explains a category without expenses in the period, and a failed list can be reloaded", async () => {
    let attempts = 0;
    stubApi({ ...speseRoutes(), "GET /ledger/entries": () => (++attempts === 1 ? problem(500, "internal") : json(200, page([]))) });
    renderWithProviders(<SpeseCategoryPage category={ATTREZZATURA} />);
    expect(await screen.findByText(/Il servizio non è disponibile/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Riprova" }));
    expect(await screen.findByRole("heading", { name: "Nessuna spesa in questo periodo" })).toBeInTheDocument();
  });

  it("does not offer to register or change expenses without the write permission", async () => {
    auth.permissions = ["ledger:read"];
    stubApi(speseRoutes());
    renderWithProviders(<SpeseCategoryPage category={ATTREZZATURA} />);
    await screen.findByRole("list", { name: "Spese" });
    expect(screen.queryByRole("button", { name: "Nuova spesa" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Altre azioni|Azioni/ })).not.toBeInTheDocument();
  });
});
