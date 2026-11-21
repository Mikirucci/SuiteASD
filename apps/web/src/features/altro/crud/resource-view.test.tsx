import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { json, page, problem, renderWithProviders, stubApi } from "@/test/stub-api";
import { expectNoA11yViolations } from "@/test/a11y";
import { joinParts } from "../format";
import { venuesConfig } from "../resources/venues";
import { PALAZZETTO, SCUOLA } from "../test-fixtures";
import type { Venue } from "../types";
import type { ResourceConfig } from "./types";
import { pickFromMenu } from "@/test/row-menu";
import { ResourceView } from "./resource-view";

const auth = vi.hoisted(() => ({ permissions: [] as string[] }));
vi.mock("@/features/auth/auth-provider", () => ({
  useAuth: () => ({ status: "authenticated", me: { permissions: auth.permissions, roles: ["ADMIN"] } }),
}));

/** A resource whose rows have the menu of actions: the generic behaviour of the list, whatever it holds. */
const menuVenues: ResourceConfig<Venue> = {
  ...venuesConfig,
  openOnClick: false,
  row: (venue) => ({
    title: venue.name,
    lines: [
      joinParts([venue.address, venue.city]),
      venue.availability ? `Orari: ${venue.availability}` : null,
      venue.capacity !== null ? `Capienza: ${venue.capacity} persone` : null,
    ],
  }),
};

function routes(extra: Parameters<typeof stubApi>[0] = {}) {
  return { "GET /venues": () => json(200, page([PALAZZETTO, SCUOLA])), ...extra };
}

beforeEach(() => {
  auth.permissions = ["venues:read", "venues:write"];
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("ResourceView (venues)", () => {
  it("shows a loading state, then the rows with their details", async () => {
    stubApi(routes());
    const { container } = renderWithProviders(<ResourceView config={menuVenues} />);
    expect(screen.getByRole("status", { name: "Caricamento delle palestre" })).toBeInTheDocument();

    const list = await screen.findByRole("list", { name: "Palestre" });
    const [palazzetto, scuola] = within(list).getAllByRole("listitem");
    expect(palazzetto).toHaveTextContent("Palazzetto dello Sport");
    expect(palazzetto).toHaveTextContent("Via dello Sport 12 · Bergamo");
    expect(palazzetto).toHaveTextContent("Orari: Anche il sabato per le gare");
    expect(palazzetto).toHaveTextContent("Capienza: 400 persone");
    expect(scuola).toHaveTextContent("Seriate");
    expect(screen.getByText("Palestre in tutto: 2")).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it("explains an empty list and offers the first creation", async () => {
    stubApi(routes({ "GET /venues": () => json(200, page([])) }));
    renderWithProviders(<ResourceView config={menuVenues} />);
    expect(await screen.findByRole("heading", { name: "Nessuna palestra" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Nuova palestra" })).toBeInTheDocument();
  });

  it("shows the error in Italian and reloads with Riprova", async () => {
    let attempts = 0;
    stubApi(routes({ "GET /venues": () => (++attempts === 1 ? problem(500, "internal") : json(200, page([PALAZZETTO]))) }));
    renderWithProviders(<ResourceView config={menuVenues} />);
    expect(await screen.findByText(/Il servizio non è disponibile/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Riprova" }));
    expect(await screen.findByText("Palazzetto dello Sport")).toBeInTheDocument();
  });

  it("opens the attachments of a row from its Allegati action, only for those who can write", async () => {
    const api = stubApi(
      routes({
        "GET /attachments": () =>
          json(200, {
            data: [
              {
                id: "att-1",
                entityType: "VENUE",
                entityId: PALAZZETTO.id,
                title: "Contratto di affitto",
                fileName: "contratto.pdf",
                mimeType: "application/pdf",
                sizeBytes: 2048,
                downloadUrl: "/api/v1/attachments/att-1/file",
                createdAt: "2026-10-01T08:00:00.000Z",
              },
            ],
          }),
      }),
    );
    renderWithProviders(<ResourceView config={menuVenues} />);
    await pickFromMenu("Altre azioni di Palazzetto dello Sport", "Allegati di Palazzetto dello Sport");

    const dialog = await screen.findByRole("dialog", { name: "Allegati · Palazzetto dello Sport" });
    expect(await within(dialog).findByText("Contratto di affitto")).toBeInTheDocument();
    const call = api.calls.find((entry) => entry.path === "/attachments");
    expect(call?.query.get("entityType")).toBe("VENUE");
    expect(call?.query.get("entityId")).toBe(PALAZZETTO.id);
  });

  it("offers no Allegati action to a reader", async () => {
    auth.permissions = ["venues:read"];
    stubApi(routes());
    renderWithProviders(<ResourceView config={menuVenues} />);
    await screen.findByText("Palazzetto dello Sport");
    expect(screen.queryByRole("button", { name: /^Altre azioni di/ })).not.toBeInTheDocument();
  });

  it("sends the search text as q and offers to clear it when nothing matches", async () => {
    const api = stubApi(
      routes({ "GET /venues": (call) => json(200, page(call.query.get("q") === "zzz" ? [] : [PALAZZETTO, SCUOLA])) }),
    );
    renderWithProviders(<ResourceView config={menuVenues} />);
    await screen.findByRole("list", { name: "Palestre" });

    await userEvent.type(screen.getByLabelText("Cerca per nome o città"), "zzz");
    expect(await screen.findByRole("heading", { name: "Nessun risultato" })).toBeInTheDocument();
    expect(api.calls.at(-1)?.query.get("q")).toBe("zzz");

    await userEvent.click(screen.getByRole("button", { name: "Azzera i filtri" }));
    expect(await screen.findByRole("list", { name: "Palestre" })).toBeInTheDocument();
    expect(screen.getByLabelText("Cerca per nome o città")).toHaveValue("");
  });

  it("validates the form, creates the venue and leaves out the empty optional fields", async () => {
    const api = stubApi(routes({ "POST /venues": () => json(201, { ...SCUOLA, id: "v-new", name: "Palestra Comunale" }) }));
    renderWithProviders(<ResourceView config={menuVenues} />);
    await userEvent.click(await screen.findByRole("button", { name: "Nuova palestra" }));
    const dialog = await screen.findByRole("dialog", { name: "Nuova palestra" });

    await userEvent.click(within(dialog).getByRole("button", { name: "Crea la palestra" }));
    expect(await within(dialog).findByText("Inserisci il nome della palestra")).toBeInTheDocument();
    expect(api.count("POST /venues")).toBe(0);

    await userEvent.type(within(dialog).getByLabelText(/Nome della palestra/), "Palestra Comunale");
    await userEvent.type(within(dialog).getByLabelText("Capienza"), "150");
    await userEvent.click(within(dialog).getByRole("button", { name: "Crea la palestra" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(api.calls.find((call) => call.method === "POST")?.body).toEqual({ name: "Palestra Comunale", capacity: 150, slots: [] });
    expect(await screen.findByText("Palestra creata")).toBeInTheDocument();
    await waitFor(() => expect(api.count("GET /venues")).toBe(2));
  });

  it("edits a venue and clears an optional field with null", async () => {
    const api = stubApi(routes({ "PATCH /venues/v-palazzetto": () => json(200, PALAZZETTO) }));
    renderWithProviders(<ResourceView config={menuVenues} />);
    await pickFromMenu("Altre azioni di Palazzetto dello Sport", "Modifica Palazzetto dello Sport");
    const dialog = await screen.findByRole("dialog", { name: "Modifica la palestra" });
    expect(within(dialog).getByLabelText(/Nome della palestra/)).toHaveValue("Palazzetto dello Sport");
    expect(within(dialog).getByLabelText("Capienza")).toHaveValue("400");

    await userEvent.clear(within(dialog).getByLabelText("Capienza"));
    await userEvent.click(within(dialog).getByRole("button", { name: "Salva le modifiche" }));

    await waitFor(() => expect(api.count("PATCH /venues/v-palazzetto")).toBe(1));
    expect(api.calls.find((call) => call.method === "PATCH")?.body).toEqual({
      name: "Palazzetto dello Sport",
      address: "Via dello Sport 12",
      city: "Bergamo",
      capacity: null,
      slots: [
        { weekday: 2, from: "18:00", to: "21:00" },
        { weekday: 4, from: "18:00", to: "21:00" },
      ],
      availability: "Anche il sabato per le gare",
      notes: null,
      costCents: 45000,
      costDate: "2026-11-02",
    });
    expect(await screen.findByText("Palestra aggiornata")).toBeInTheDocument();
  });

  it("shows server-side validation inside the form", async () => {
    stubApi(
      routes({
        "POST /venues": () =>
          json(422, {
            type: "about:blank",
            title: "Unprocessable",
            status: 422,
            code: "validation_error",
            errors: [{ path: "capacity", message: "Too big" }],
          }),
      }),
    );
    renderWithProviders(<ResourceView config={menuVenues} />);
    await userEvent.click(await screen.findByRole("button", { name: "Nuova palestra" }));
    const dialog = await screen.findByRole("dialog", { name: "Nuova palestra" });
    await userEvent.type(within(dialog).getByLabelText(/Nome della palestra/), "Palestra Comunale");
    await userEvent.click(within(dialog).getByRole("button", { name: "Crea la palestra" }));

    expect(await within(dialog).findByText("Alcuni dati non sono validi. Controlla i campi evidenziati.")).toBeInTheDocument();
    expect(within(dialog).getByLabelText("Capienza")).toBeInvalid();
  });

  it("asks before deleting, deletes and reloads the list", async () => {
    const api = stubApi(routes({ "DELETE /venues/v-scuola": () => json(204) }));
    renderWithProviders(<ResourceView config={menuVenues} />);
    await pickFromMenu("Altre azioni di Palestra Scuola Media", "Elimina Palestra Scuola Media");
    const dialog = await screen.findByRole("dialog", { name: "Eliminare Palestra Scuola Media?" });
    expect(api.count("DELETE /venues/v-scuola")).toBe(0);

    await userEvent.click(within(dialog).getByRole("button", { name: "Elimina" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(api.count("DELETE /venues/v-scuola")).toBe(1);
    expect(await screen.findByText("Palestra eliminata")).toBeInTheDocument();
    await waitFor(() => expect(api.count("GET /venues")).toBe(2));
  });

  it("keeps the confirmation open and explains a failed deletion", async () => {
    stubApi(routes({ "DELETE /venues/v-scuola": () => problem(403, "forbidden") }));
    renderWithProviders(<ResourceView config={menuVenues} />);
    await pickFromMenu("Altre azioni di Palestra Scuola Media", "Elimina Palestra Scuola Media");
    const dialog = await screen.findByRole("dialog");
    await userEvent.click(within(dialog).getByRole("button", { name: "Elimina" }));
    expect(await within(dialog).findByText("Non hai i permessi per eseguire questa azione.")).toBeInTheDocument();
  });

  it("is read-only without the write permission", async () => {
    auth.permissions = ["venues:read"];
    stubApi(routes());
    renderWithProviders(<ResourceView config={menuVenues} />);
    await screen.findByText("Palazzetto dello Sport");
    expect(screen.queryByRole("button", { name: "Nuova palestra" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Altre azioni di / })).not.toBeInTheDocument();
  });
});

describe("ResourceView (a resource that opens on click)", () => {
  const ATTACHMENTS = { "GET /attachments": () => json(200, { data: [] }) };
  const open = async () => {
    await userEvent.click(await screen.findByRole("button", { name: "Palazzetto dello Sport" }));
    return screen.findByRole("dialog", { name: "Palazzetto dello Sport" });
  };

  it("makes the card the way in, with no menu of actions", async () => {
    stubApi(routes());
    renderWithProviders(<ResourceView config={venuesConfig} layout="grid" columns={2} />);
    const card = (await screen.findByText("Palazzetto dello Sport")).closest("li") as HTMLElement;
    expect(within(card).getAllByRole("button").map((button) => button.textContent)).toEqual(["Palazzetto dello Sport"]);
    expect(card).toHaveTextContent("Via dello Sport 12 · Bergamo");
    expect(card).toHaveTextContent("Capienza 400 persone");
    expect(card).toHaveTextContent(/€\s450/);
    // hours and notes are not on the card
    expect(card).not.toHaveTextContent("18:00");
  });

  it("opens the record with its fields, its attachments and Elimina, and saves what changed", async () => {
    const api = stubApi(routes({ ...ATTACHMENTS, [`PATCH /venues/${PALAZZETTO.id}`]: () => json(200, PALAZZETTO) }));
    renderWithProviders(<ResourceView config={venuesConfig} layout="grid" columns={2} />);
    const dialog = await open();
    // the weekly hours as rows to change, and what they cannot say as free text
    const hours = within(dialog).getByRole("list", { name: "Orari fissi" });
    expect(within(hours).getAllByRole("listitem")).toHaveLength(2);
    expect(within(dialog).getByLabelText("Giorno dell'orario 1")).toHaveValue("2");
    expect(within(dialog).getByLabelText("Dalle, orario 1")).toHaveValue("18:00");
    expect(within(dialog).getByLabelText("Alle, orario 2")).toHaveValue("21:00");
    expect(within(dialog).getByLabelText("Altro")).toHaveValue("Anche il sabato per le gare");
    expect(within(dialog).getByRole("heading", { name: "Allegati" })).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Elimina" })).toBeInTheDocument();

    const address = within(dialog).getByLabelText("Indirizzo");
    await userEvent.clear(address);
    await userEvent.type(address, "Via Roma 3");
    await userEvent.click(within(dialog).getByRole("button", { name: "Salva le modifiche" }));
    await screen.findByText("Palestra aggiornata");
    expect(api.calls.find((call) => call.method === "PATCH")?.body).toMatchObject({ address: "Via Roma 3" });
  });

  it("deletes from the detail after asking", async () => {
    const api = stubApi(routes({ ...ATTACHMENTS, [`DELETE /venues/${PALAZZETTO.id}`]: () => json(204) }));
    renderWithProviders(<ResourceView config={venuesConfig} layout="grid" columns={2} />);
    const dialog = await open();
    await userEvent.click(within(dialog).getByRole("button", { name: "Elimina" }));
    const confirm = await screen.findByRole("dialog", { name: "Eliminare Palazzetto dello Sport?" });
    expect(api.count(`DELETE /venues/${PALAZZETTO.id}`)).toBe(0);
    await userEvent.click(within(confirm).getByRole("button", { name: "Elimina" }));
    await screen.findByText("Palestra eliminata");
    expect(api.count(`DELETE /venues/${PALAZZETTO.id}`)).toBe(1);
  });

  it("shows the same record to someone who cannot write, to read only: fields off, no save, no delete, no attachments", async () => {
    auth.permissions = ["venues:read"];
    const api = stubApi(routes(ATTACHMENTS));
    renderWithProviders(<ResourceView config={venuesConfig} layout="grid" columns={2} />);
    const dialog = await open();
    expect(within(dialog).getByLabelText("Altro")).toBeDisabled();
    expect(within(dialog).getByLabelText("Altro")).toHaveValue("Anche il sabato per le gare");
    // the hours can be read, not changed
    expect(within(dialog).getByLabelText("Dalle, orario 1")).toBeDisabled();
    expect(within(dialog).getByLabelText("Dalle, orario 1")).toHaveValue("18:00");
    expect(within(dialog).queryByRole("button", { name: "Aggiungi un orario" })).toBeDisabled();
    expect(within(dialog).getByLabelText("Indirizzo")).toBeDisabled();
    expect(dialog).toHaveAccessibleDescription("Puoi consultare questa scheda, ma non modificarla.");
    for (const name of ["Salva le modifiche", "Elimina"]) expect(within(dialog).queryByRole("button", { name })).not.toBeInTheDocument();
    expect(within(dialog).queryByRole("heading", { name: "Allegati" })).not.toBeInTheDocument();
    // nothing in it can be focused, so the body itself can: a keyboard can scroll a long record
    expect(within(dialog).getByRole("region", { name: "Palazzetto dello Sport" })).toHaveAttribute("tabindex", "0");
    expect(within(dialog).getAllByRole("button", { name: "Chiudi" }).length).toBeGreaterThan(0);
    expect(api.count("GET /attachments")).toBe(0);
  });
});
