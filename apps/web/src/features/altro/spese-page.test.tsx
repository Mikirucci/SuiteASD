import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { expectNoA11yViolations } from "@/test/a11y";
import { address } from "@/test/fake-navigation";
import { json, problem, renderWithProviders, stubApi } from "@/test/stub-api";
import { CATEGORIES, EMPTY_SUMMARY, PALLONI, speseRoutes } from "./spese-fixtures";
import { SpesePage } from "./spese-page";
import { rangeOf, rangeQuery, shiftRange } from "./spese-period";

const auth = vi.hoisted(() => ({ permissions: [] as string[] }));
vi.mock("@/features/auth/auth-provider", () => ({
  useAuth: () => ({ status: "authenticated", me: { permissions: auth.permissions, roles: ["ADMIN"] } }),
}));
vi.mock("next/navigation", async () => (await import("@/test/fake-navigation")).fakeNavigation);

const lastQuery = (api: ReturnType<typeof stubApi>, path: string) => api.calls.filter((call) => call.path === path).at(-1)?.query;
const year = new Date().getFullYear();
const dayName = (day: Date) => new Intl.DateTimeFormat("it-IT", { weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(day);

const periodGroup = () => screen.getByRole("group", { name: "Periodo" });
const openPeriod = async (label: string = String(year)) => {
  await userEvent.click(within(periodGroup()).getByRole("button", { name: label }));
  return screen.findByRole("dialog", { name: "Scegli il periodo" });
};
const ringSlice = (name: RegExp) => within(screen.getByRole("group", { name: "Spese per categoria" })).getByRole("button", { name });
const categoryCards = async () => within(await screen.findByRole("list", { name: "Categorie" })).getAllByRole("listitem");

beforeEach(() => {
  auth.permissions = ["ledger:read", "ledger:write"];
  address.open("/altro/spese");
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("SpesePage", () => {
  it("shows the totals of the year, the ring and one card per category", async () => {
    const api = stubApi(speseRoutes());
    const { container } = renderWithProviders(<SpesePage />);
    expect(await screen.findByRole("heading", { level: 1, name: /Ogni spesa, al suo posto\./ })).toBeInTheDocument();

    const tiles = await screen.findByRole("region", { name: "Rendiconto delle spese" });
    expect(within(tiles).getByText("Spese del periodo").parentElement?.parentElement).toHaveTextContent(/€\s805.*3 spese/);
    expect(within(tiles).getByText("Registrate qui").parentElement?.parentElement).toHaveTextContent(/€\s760/);
    expect(within(tiles).getByText("Da altre sezioni").parentElement?.parentElement).toHaveTextContent(/€\s45/);
    expect(within(tiles).getByText("Categorie").parentElement?.parentElement).toHaveTextContent("2");

    const [attrezzatura, arbitri] = (await categoryCards()) as [HTMLElement, HTMLElement];
    // the card has what the category holds, the days it covers and the total of everything inside
    expect(attrezzatura).toHaveTextContent("Attrezzatura sportiva");
    expect(attrezzatura).toHaveTextContent("Palloni da gara, Reti da gara");
    expect(attrezzatura).toHaveTextContent("18 set – 2 ott 2026");
    expect(attrezzatura).toHaveTextContent(/−\s€\s760/);
    expect(attrezzatura).toHaveTextContent("2 spese");
    expect(arbitri).toHaveTextContent("14 novembre 2026");
    expect(arbitri).toHaveTextContent("1 spesa");
    // the card opens the page of the category
    expect(within(attrezzatura).getByRole("link", { name: "Attrezzatura sportiva" })).toHaveAttribute("href", "/altro/spese/Attrezzatura%20sportiva");

    const query = api.calls.find((call) => call.path === "/ledger/summary")?.query;
    expect(query?.get("kind")).toBe("EXPENSE");
    expect(query?.get("from")).toBe(`${year}-01-01`);
    expect(query?.get("to")).toBe(`${year}-12-31`);
    // the single expenses are on the page of the category, not here
    expect(api.count("GET /ledger/entries")).toBe(0);
    await expectNoA11yViolations(container);
    // the first render of the ring and the accessibility audit are slow when the machine is busy
  }, 20_000);

  it("reads the category out when the pointer is on its slice of the ring or on its card, and lifts the other one", async () => {
    stubApi(speseRoutes());
    renderWithProviders(<SpesePage />);
    const [attrezzatura, arbitri] = (await categoryCards()) as [HTMLElement, HTMLElement];
    expect(screen.getByText(/Passa su un colore/)).toBeInTheDocument();

    await userEvent.hover(ringSlice(/^Arbitri/));
    expect(screen.queryByText(/Passa su un colore/)).not.toBeInTheDocument();
    const readout = screen.getByRole("link", { name: "Apri la categoria" });
    expect(readout).toHaveAttribute("href", "/altro/spese/Arbitri");
    expect(readout.parentElement).toHaveTextContent(/−\s€\s45.*6% del totale.*1 spesa.*14 novembre 2026/);
    expect(arbitri).toHaveClass("-translate-y-0.5");
    expect(attrezzatura).not.toHaveClass("-translate-y-0.5");

    await userEvent.unhover(ringSlice(/^Arbitri/));
    expect(screen.getByText(/Passa su un colore/)).toBeInTheDocument();
    expect(arbitri).not.toHaveClass("-translate-y-0.5");

    // the other way round: the card shows its slice in the ring
    await userEvent.hover(attrezzatura);
    expect(screen.getByRole("link", { name: "Apri la categoria" })).toHaveAttribute("href", "/altro/spese/Attrezzatura%20sportiva");
    expect(attrezzatura).toHaveClass("-translate-y-0.5");
  });

  it("names every slice of the ring, which a keyboard can reach and keep chosen", async () => {
    stubApi(speseRoutes());
    renderWithProviders(<SpesePage />);
    await categoryCards();
    const slices = within(screen.getByRole("group", { name: "Spese per categoria" })).getAllByRole("button");
    expect(slices.map((slice) => slice.getAttribute("aria-label")?.replace(/\s/g, " "))).toEqual([
      "Attrezzatura sportiva, € 760, 94% del totale",
      "Arbitri, € 45, 6% del totale",
    ]);

    act(() => ringSlice(/^Arbitri/).focus());
    expect(screen.getByRole("link", { name: "Apri la categoria" })).toHaveAttribute("href", "/altro/spese/Arbitri");
    await userEvent.keyboard("{Enter}");
    expect(ringSlice(/^Arbitri/)).toHaveAttribute("aria-pressed", "true");

    // chosen, it stays read out when the focus moves away; a second choice lets it go
    act(() => ringSlice(/^Arbitri/).blur());
    expect(screen.getByRole("link", { name: "Apri la categoria" })).toHaveAttribute("href", "/altro/spese/Arbitri");
    await userEvent.click(ringSlice(/^Arbitri/));
    await userEvent.unhover(ringSlice(/^Arbitri/));
    expect(ringSlice(/^Arbitri/)).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByText(/Passa su un colore/)).toBeInTheDocument();
  });

  it("registers an expense with its name, category, supplier and notes, offering the categories in use", async () => {
    const api = stubApi({ ...speseRoutes(), "POST /ledger/entries": () => json(201, PALLONI) });
    renderWithProviders(<SpesePage />);
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
    const api = stubApi({ ...speseRoutes(), "POST /ledger/entries": () => json(201, PALLONI) });
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

  it("does not offer to register expenses without the write permission", async () => {
    auth.permissions = ["ledger:read"];
    stubApi(speseRoutes());
    renderWithProviders(<SpesePage />);
    await categoryCards();
    expect(screen.queryByRole("button", { name: "Nuova spesa" })).not.toBeInTheDocument();
  });

  describe("the period", () => {
    it("starts from the current year, with only the arrows and the period in the middle", async () => {
      stubApi(speseRoutes());
      renderWithProviders(<SpesePage />);
      await categoryCards();
      expect(within(periodGroup()).getAllByRole("button").map((button) => button.textContent || button.getAttribute("aria-label"))).toEqual([
        "Periodo precedente",
        String(year),
        "Periodo successivo",
      ]);
      expect(screen.queryByRole("dialog", { name: "Scegli il periodo" })).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Azzera filtri" })).not.toBeInTheDocument();
    });

    it("goes to the year before and after with the arrows, and writes the period in the address", async () => {
      const api = stubApi(speseRoutes());
      renderWithProviders(<SpesePage />);
      await categoryCards();

      await userEvent.click(screen.getByRole("button", { name: "Periodo precedente" }));
      await waitFor(() => expect(lastQuery(api, "/ledger/summary")?.get("from")).toBe(`${year - 1}-01-01`));
      expect(lastQuery(api, "/ledger/summary")?.get("to")).toBe(`${year - 1}-12-31`);
      expect(address.href).toBe(`/altro/spese?dal=${year - 1}-01-01&al=${year - 1}-12-31`);
      expect(within(periodGroup()).getByText(String(year - 1))).toBeInTheDocument();
      // the cards carry the period to the page of the category
      const [first] = await categoryCards();
      expect(within(first as HTMLElement).getByRole("link", { name: "Attrezzatura sportiva" })).toHaveAttribute(
        "href",
        `/altro/spese/Attrezzatura%20sportiva?dal=${year - 1}-01-01&al=${year - 1}-12-31`,
      );

      await userEvent.click(screen.getByRole("button", { name: "Periodo successivo" }));
      await waitFor(() => expect(lastQuery(api, "/ledger/summary")?.get("from")).toBe(`${year}-01-01`));
      // the current year is the plain address again
      expect(address.href).toBe("/altro/spese");
    });

    it("opens on the period written in the address, and on the current year when the address is wrong", async () => {
      address.open("/altro/spese?dal=2026-03-01&al=2026-03-31");
      const api = stubApi(speseRoutes());
      const { unmount } = renderWithProviders(<SpesePage />);
      await categoryCards();
      expect(within(periodGroup()).getByText("Marzo 2026")).toBeInTheDocument();
      expect(lastQuery(api, "/ledger/summary")?.get("from")).toBe("2026-03-01");
      expect(lastQuery(api, "/ledger/summary")?.get("to")).toBe("2026-03-31");
      expect(screen.getByRole("button", { name: "Azzera filtri" })).toBeInTheDocument();
      unmount();

      address.open("/altro/spese?dal=ieri&al=2026-03-31");
      const wrong = stubApi(speseRoutes());
      renderWithProviders(<SpesePage />);
      await categoryCards();
      expect(lastQuery(wrong, "/ledger/summary")?.get("from")).toBe(`${year}-01-01`);
    });

    it("chooses a week with one click on any day of it", async () => {
      const api = stubApi(speseRoutes());
      renderWithProviders(<SpesePage />);
      await categoryCards();
      const dialog = await openPeriod();
      await userEvent.click(within(dialog).getByRole("tab", { name: "Settimana" }));
      // from a year the calendar opens on the current month
      const day = new Date(year, new Date().getMonth(), 11);
      await userEvent.click(within(dialog).getByRole("button", { name: dayName(day) }));

      const week = rangeQuery(rangeOf("week", day));
      await waitFor(() => expect(lastQuery(api, "/ledger/summary")?.get("from")).toBe(week.from));
      expect(lastQuery(api, "/ledger/summary")?.get("to")).toBe(week.to);
      expect(screen.queryByRole("dialog", { name: "Scegli il periodo" })).not.toBeInTheDocument();
      // and the arrows move by weeks
      await userEvent.click(screen.getByRole("button", { name: "Periodo successivo" }));
      const next = rangeQuery(shiftRange(rangeOf("week", day), 1));
      await waitFor(() => expect(lastQuery(api, "/ledger/summary")?.get("from")).toBe(next.from));
    });

    it("chooses a month on its grid, with arrows for the other years", async () => {
      const api = stubApi(speseRoutes());
      renderWithProviders(<SpesePage />);
      await categoryCards();
      const dialog = await openPeriod();
      expect(within(dialog).getByRole("tab", { name: "Anno" })).toHaveAttribute("aria-selected", "true");
      await userEvent.click(within(dialog).getByRole("tab", { name: "Mese" }));
      await userEvent.click(within(dialog).getByRole("button", { name: "Anno precedente" }));
      await userEvent.click(within(dialog).getByRole("button", { name: `novembre ${year - 1}` }));

      await waitFor(() => expect(lastQuery(api, "/ledger/summary")?.get("from")).toBe(`${year - 1}-11-01`));
      expect(lastQuery(api, "/ledger/summary")?.get("to")).toBe(`${year - 1}-11-30`);
      expect(screen.queryByRole("dialog", { name: "Scegli il periodo" })).not.toBeInTheDocument();
      expect(within(periodGroup()).getByText(`Novembre ${year - 1}`)).toBeInTheDocument();

      // and the arrows now move by months
      await userEvent.click(screen.getByRole("button", { name: "Periodo successivo" }));
      await waitFor(() => expect(lastQuery(api, "/ledger/summary")?.get("from")).toBe(`${year - 1}-12-01`));
    });

    it("chooses a year from a window of years, and the window moves", async () => {
      const api = stubApi(speseRoutes());
      renderWithProviders(<SpesePage />);
      await categoryCards();
      const dialog = await openPeriod();
      await userEvent.click(within(dialog).getByRole("button", { name: "Anni precedenti" }));
      await userEvent.click(within(dialog).getByRole("button", { name: String(year - 12) }));
      await waitFor(() => expect(lastQuery(api, "/ledger/summary")?.get("from")).toBe(`${year - 12}-01-01`));
      expect(lastQuery(api, "/ledger/summary")?.get("to")).toBe(`${year - 12}-12-31`);
    });

    it("picks any range on the calendar, and the arrows then move by the length of the range", async () => {
      const api = stubApi(speseRoutes());
      renderWithProviders(<SpesePage />);
      await categoryCards();
      const dialog = await openPeriod();
      await userEvent.click(within(dialog).getByRole("tab", { name: "Intervallo" }));

      // from a year the calendar opens on the current month
      const month = new Date().getMonth();
      const first = new Date(year, month, 3);
      const last = new Date(year, month, 12);
      await userEvent.click(within(dialog).getByRole("button", { name: dayName(first) }));
      await userEvent.click(within(dialog).getByRole("button", { name: dayName(last) }));

      const query = rangeQuery({ from: first, to: last });
      await waitFor(() => expect(lastQuery(api, "/ledger/summary")?.get("from")).toBe(query.from));
      expect(lastQuery(api, "/ledger/summary")?.get("to")).toBe(query.to);
      expect(screen.queryByRole("dialog", { name: "Scegli il periodo" })).not.toBeInTheDocument();
      expect(within(periodGroup()).getByText(/^3 – 12 /)).toBeInTheDocument();
      expect(address.href).toBe(`/altro/spese?dal=${query.from}&al=${query.to}`);

      await userEvent.click(screen.getByRole("button", { name: "Periodo successivo" }));
      const next = rangeQuery(shiftRange({ from: first, to: last }, 1));
      await waitFor(() => expect(lastQuery(api, "/ledger/summary")?.get("from")).toBe(next.from));
      expect(lastQuery(api, "/ledger/summary")?.get("to")).toBe(next.to);
    });

    it("brings back the current year from outside the panel", async () => {
      const api = stubApi(speseRoutes());
      renderWithProviders(<SpesePage />);
      await categoryCards();
      await userEvent.click(screen.getByRole("button", { name: "Periodo precedente" }));
      await userEvent.click(await screen.findByRole("button", { name: "Azzera filtri" }));

      await waitFor(() => expect(lastQuery(api, "/ledger/summary")?.get("from")).toBe(`${year}-01-01`));
      expect(address.href).toBe("/altro/spese");
      expect(screen.queryByRole("button", { name: "Azzera filtri" })).not.toBeInTheDocument();
    });

    it("closes the panel with Escape without changing the period", async () => {
      const api = stubApi(speseRoutes());
      renderWithProviders(<SpesePage />);
      await categoryCards();
      await openPeriod();
      await userEvent.keyboard("{Escape}");
      expect(screen.queryByRole("dialog", { name: "Scegli il periodo" })).not.toBeInTheDocument();
      expect(api.calls.filter((call) => call.path === "/ledger/summary")).toHaveLength(1);
    });
  });

  it("explains a period without expenses and offers the first one", async () => {
    stubApi({ ...speseRoutes(), "GET /ledger/summary": () => json(200, EMPTY_SUMMARY) });
    renderWithProviders(<SpesePage />);
    expect(await screen.findByRole("heading", { name: "Nessuna spesa in questo periodo" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Nuova spesa" })).toBeInTheDocument();
    expect(screen.queryByRole("group", { name: "Spese per categoria" })).not.toBeInTheDocument();
    expect(screen.queryByRole("list", { name: "Categorie" })).not.toBeInTheDocument();
  });

  it("shows a loading state, and a failed load can be tried again", async () => {
    let attempts = 0;
    stubApi({ ...speseRoutes(), "GET /ledger/summary": () => (++attempts === 1 ? problem(500, "internal") : json(200, EMPTY_SUMMARY)) });
    renderWithProviders(<SpesePage />);
    expect(screen.getByRole("status", { name: "Caricamento delle spese" })).toBeInTheDocument();
    expect(await screen.findByText("Spese non disponibili")).toBeInTheDocument();
    // the period stays on screen: it can be changed while the load fails
    expect(periodGroup()).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Riprova" }));
    expect(await screen.findByRole("heading", { name: "Nessuna spesa in questo periodo" })).toBeInTheDocument();
  });
});
