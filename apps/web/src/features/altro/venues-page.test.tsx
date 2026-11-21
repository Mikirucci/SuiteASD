import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { expectNoA11yViolations } from "@/test/a11y";
import { json, page, problem, renderWithProviders, stubApi } from "@/test/stub-api";
import { PALAZZETTO, SCUOLA } from "./test-fixtures";
import type { VenueSummary } from "./types";
import { VenuesPage } from "./venues-page";

const auth = vi.hoisted(() => ({ permissions: [] as string[] }));
vi.mock("@/features/auth/auth-provider", () => ({
  useAuth: () => ({ status: "authenticated", me: { permissions: auth.permissions, roles: ["ADMIN"] } }),
}));

const SUMMARY: VenueSummary = {
  count: 3,
  capacityTotal: 720,
  costTotalCents: 155000,
  costThisMonthCents: 110000,
  costedCount: 2,
  priciest: { name: "Palazzetto dello Sport", costCents: 110000 },
  weeklyMinutes: 1650,
  slotsCount: 5,
};
const EMPTY_SUMMARY: VenueSummary = { count: 0, capacityTotal: 0, costTotalCents: 0, costThisMonthCents: 0, costedCount: 0, priciest: null, weeklyMinutes: 0, slotsCount: 0 };

function routes(extra: Parameters<typeof stubApi>[0] = {}) {
  return {
    "GET /venues/summary": () => json(200, SUMMARY),
    "GET /venues": () => json(200, page([PALAZZETTO, SCUOLA])),
    "GET /attachments": () => json(200, { data: [] }),
    ...extra,
  };
}

const tile = (label: string) => within(screen.getByRole("region", { name: "Riepilogo delle palestre" })).getByText(label).parentElement?.parentElement;
/** The text of a figure with its no-break space turned into an ordinary one. */
const plain = (text: string | null | undefined): string => (text ?? "").replace(/\s/g, " ");

beforeEach(() => {
  auth.permissions = ["venues:read", "venues:write"];
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("VenuesPage", () => {
  it("shows at a glance how many venues there are, what they cost and on which one, and how many hours a week", async () => {
    stubApi(routes());
    const { container } = renderWithProviders(<VenuesPage />);
    expect(screen.getByRole("status", { name: "Caricamento del riepilogo delle palestre" })).toBeInTheDocument();

    expect(await screen.findByRole("region", { name: "Riepilogo delle palestre" })).toBeInTheDocument();
    expect(tile("Palestre")).toHaveTextContent(/3.*Capienza totale 720 persone/);
    expect(plain(tile("Spesa")?.textContent)).toContain("€ 1550");
    expect(plain(tile("Spesa")?.textContent)).toContain("€ 1100 in questo mese");
    expect(plain(tile("Più costosa")?.textContent)).toContain("€ 1100");
    expect(tile("Più costosa")).toHaveTextContent("Palazzetto dello Sport · il 71% della spesa");
    expect(tile("Ore a settimana")).toHaveTextContent(/27 h 30 min.*5 orari fissati/);

    const list = await screen.findByRole("list", { name: "Palestre" });
    expect(within(list).getAllByRole("listitem")).toHaveLength(2);
    // the costs of the venues are read here, and in Uscite with all the others: there is no button that sends away
    expect(screen.queryByRole("link", { name: /costi delle palestre/ })).not.toBeInTheDocument();
    await expectNoA11yViolations(container);
  }, 20_000);

  it("says what is missing instead of showing empty figures", async () => {
    stubApi(routes({ "GET /venues/summary": () => json(200, EMPTY_SUMMARY), "GET /venues": () => json(200, page([])) }));
    renderWithProviders(<VenuesPage />);
    await screen.findByRole("region", { name: "Riepilogo delle palestre" });
    expect(tile("Palestre")).toHaveTextContent("Nessuna capienza indicata");
    expect(tile("Spesa")).toHaveTextContent("Nessun costo registrato");
    expect(tile("Più costosa")).toHaveTextContent("Scrivi un costo per vederla");
    expect(tile("Ore a settimana")).toHaveTextContent(/0 min.*Nessun orario fissato/);
    expect(await screen.findByRole("heading", { name: "Nessuna palestra" })).toBeInTheDocument();
  });

  it("names the number of venues with a cost when none was booked this month", async () => {
    stubApi(routes({ "GET /venues/summary": () => json(200, { ...SUMMARY, costThisMonthCents: 0 }) }));
    renderWithProviders(<VenuesPage />);
    await screen.findByRole("region", { name: "Riepilogo delle palestre" });
    expect(tile("Spesa")).toHaveTextContent("2 palestre con un costo");
  });

  it("registers a venue with its weekly hours: a day and from what time to what time, as many as needed", async () => {
    const api = stubApi(routes({ "POST /venues": () => json(201, PALAZZETTO) }));
    renderWithProviders(<VenuesPage />);
    await userEvent.click(await screen.findByRole("button", { name: "Nuova palestra" }));
    const dialog = await screen.findByRole("dialog", { name: "Nuova palestra" });
    expect(within(dialog).getByText("Nessun orario fissato.")).toBeInTheDocument();

    await userEvent.type(within(dialog).getByLabelText(/Nome della palestra/), "Palestra Nord");
    await userEvent.click(within(dialog).getByRole("button", { name: "Aggiungi un orario" }));
    // the first row starts on Tuesday from 18 to 19: it is changed to what the person needs
    expect(within(dialog).getByLabelText("Giorno dell'orario 1")).toHaveValue("2");
    await userEvent.selectOptions(within(dialog).getByLabelText("Giorno dell'orario 1"), "4");
    await userEvent.clear(within(dialog).getByLabelText("Alle, orario 1"));
    await userEvent.type(within(dialog).getByLabelText("Alle, orario 1"), "20:30");
    // the next row follows the last: the next day at the same hours
    await userEvent.click(within(dialog).getByRole("button", { name: "Aggiungi un orario" }));
    expect(within(dialog).getByLabelText("Giorno dell'orario 2")).toHaveValue("5");
    expect(within(dialog).getByLabelText("Dalle, orario 2")).toHaveValue("18:00");
    expect(within(dialog).getByLabelText("Alle, orario 2")).toHaveValue("20:30");
    await userEvent.type(within(dialog).getByLabelText("Altro"), "Anche il sabato per le gare");
    await userEvent.click(within(dialog).getByRole("button", { name: "Crea la palestra" }));

    await screen.findByText("Palestra creata");
    expect(api.calls.find((call) => call.method === "POST" && call.path === "/venues")?.body).toEqual({
      name: "Palestra Nord",
      availability: "Anche il sabato per le gare",
      slots: [
        { weekday: 4, from: "18:00", to: "20:30" },
        { weekday: 5, from: "18:00", to: "20:30" },
      ],
    });
    // the totals are read again with the list
    await waitFor(() => expect(api.count("GET /venues/summary")).toBeGreaterThan(1));
  }, 20_000);

  it("takes a row away, and refuses hours that do not make sense", async () => {
    const api = stubApi(routes({ "POST /venues": () => json(201, PALAZZETTO) }));
    renderWithProviders(<VenuesPage />);
    await userEvent.click(await screen.findByRole("button", { name: "Nuova palestra" }));
    const dialog = await screen.findByRole("dialog", { name: "Nuova palestra" });
    await userEvent.type(within(dialog).getByLabelText(/Nome della palestra/), "Palestra Sud");
    await userEvent.click(within(dialog).getByRole("button", { name: "Aggiungi un orario" }));
    await userEvent.click(within(dialog).getByRole("button", { name: "Aggiungi un orario" }));
    await userEvent.click(within(dialog).getByRole("button", { name: "Togli l'orario 2" }));
    expect(within(dialog).getAllByRole("listitem")).toHaveLength(1);

    // the end before the start
    await userEvent.clear(within(dialog).getByLabelText("Alle, orario 1"));
    await userEvent.type(within(dialog).getByLabelText("Alle, orario 1"), "17:00");
    await userEvent.click(within(dialog).getByRole("button", { name: "Crea la palestra" }));
    expect(await within(dialog).findByText(/la fine deve essere dopo l'inizio/)).toBeInTheDocument();
    expect(api.count("POST /venues")).toBe(0);

    // two on the same day that overlap
    await userEvent.clear(within(dialog).getByLabelText("Alle, orario 1"));
    await userEvent.type(within(dialog).getByLabelText("Alle, orario 1"), "20:00");
    await userEvent.click(within(dialog).getByRole("button", { name: "Aggiungi un orario" }));
    await userEvent.selectOptions(within(dialog).getByLabelText("Giorno dell'orario 2"), "2");
    await userEvent.clear(within(dialog).getByLabelText("Dalle, orario 2"));
    await userEvent.type(within(dialog).getByLabelText("Dalle, orario 2"), "19:00");
    await userEvent.click(within(dialog).getByRole("button", { name: "Crea la palestra" }));
    expect(await within(dialog).findByText(/non possono sovrapporsi/)).toBeInTheDocument();
    expect(api.count("POST /venues")).toBe(0);
    // many steps of typing: slow when the machine is busy
  }, 20_000);

  it("opens a venue with its hours to change, and sends the whole list again when one is added", async () => {
    const api = stubApi(routes({ "PATCH /venues/v-palazzetto": () => json(200, PALAZZETTO) }));
    renderWithProviders(<VenuesPage />);
    await userEvent.click(await screen.findByRole("button", { name: "Palazzetto dello Sport" }));
    const dialog = await screen.findByRole("dialog", { name: "Palazzetto dello Sport" });
    expect(within(within(dialog).getByRole("list", { name: "Orari fissi" })).getAllByRole("listitem")).toHaveLength(2);
    await userEvent.click(within(dialog).getByRole("button", { name: "Aggiungi un orario" }));
    // after Thursday comes Friday, at the same hours
    expect(within(dialog).getByLabelText("Giorno dell'orario 3")).toHaveValue("5");
    await userEvent.click(within(dialog).getByRole("button", { name: "Salva le modifiche" }));

    await screen.findByText("Palestra aggiornata");
    expect((api.calls.find((call) => call.method === "PATCH")?.body as { slots: unknown[] }).slots).toEqual([
      { weekday: 2, from: "18:00", to: "21:00" },
      { weekday: 4, from: "18:00", to: "21:00" },
      { weekday: 5, from: "18:00", to: "21:00" },
    ]);
  });

  it("takes all the hours away with the last row", async () => {
    const api = stubApi(routes({ "PATCH /venues/v-palazzetto": () => json(200, PALAZZETTO) }));
    renderWithProviders(<VenuesPage />);
    await userEvent.click(await screen.findByRole("button", { name: "Palazzetto dello Sport" }));
    const dialog = await screen.findByRole("dialog", { name: "Palazzetto dello Sport" });
    await userEvent.click(within(dialog).getByRole("button", { name: "Togli l'orario 2" }));
    await userEvent.click(within(dialog).getByRole("button", { name: "Togli l'orario 1" }));
    expect(within(dialog).getByText("Nessun orario fissato.")).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole("button", { name: "Salva le modifiche" }));
    await screen.findByText("Palestra aggiornata");
    expect((api.calls.find((call) => call.method === "PATCH")?.body as { slots: unknown[] }).slots).toEqual([]);
  });

  it("keeps the list when the totals fail, and loads them again on request", async () => {
    let attempts = 0;
    stubApi(routes({ "GET /venues/summary": () => (++attempts === 1 ? problem(500, "internal") : json(200, SUMMARY)) }));
    renderWithProviders(<VenuesPage />);
    expect(await screen.findByText("Riepilogo non disponibile")).toBeInTheDocument();
    expect(await screen.findByRole("list", { name: "Palestre" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Riprova" }));
    expect(await screen.findByRole("region", { name: "Riepilogo delle palestre" })).toBeInTheDocument();
  });
});
