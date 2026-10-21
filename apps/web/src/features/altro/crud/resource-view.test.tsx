import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { json, page, problem, renderWithProviders, stubApi } from "@/test/stub-api";
import { expectNoA11yViolations } from "@/test/a11y";
import { venuesConfig } from "../resources/venues";
import { PALAZZETTO, SCUOLA } from "../test-fixtures";
import { pickFromMenu } from "@/test/row-menu";
import { ResourceView } from "./resource-view";

const auth = vi.hoisted(() => ({ permissions: [] as string[] }));
vi.mock("@/features/auth/auth-provider", () => ({
  useAuth: () => ({ status: "authenticated", me: { permissions: auth.permissions, roles: ["ADMIN"] } }),
}));

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
    const { container } = renderWithProviders(<ResourceView config={venuesConfig} />);
    expect(screen.getByRole("status", { name: "Caricamento delle palestre" })).toBeInTheDocument();

    const list = await screen.findByRole("list", { name: "Palestre" });
    const [palazzetto, scuola] = within(list).getAllByRole("listitem");
    expect(palazzetto).toHaveTextContent("Palazzetto dello Sport");
    expect(palazzetto).toHaveTextContent("Via dello Sport 12 · Bergamo");
    expect(palazzetto).toHaveTextContent("Orari: Martedì e giovedì 18:00-21:00");
    expect(palazzetto).toHaveTextContent("Capienza: 400 persone");
    expect(scuola).toHaveTextContent("Seriate");
    expect(screen.getByText("Palestre in tutto: 2")).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it("explains an empty list and offers the first creation", async () => {
    stubApi(routes({ "GET /venues": () => json(200, page([])) }));
    renderWithProviders(<ResourceView config={venuesConfig} />);
    expect(await screen.findByRole("heading", { name: "Nessuna palestra" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Nuova palestra" })).toBeInTheDocument();
  });

  it("shows the error in Italian and reloads with Riprova", async () => {
    let attempts = 0;
    stubApi(routes({ "GET /venues": () => (++attempts === 1 ? problem(500, "internal") : json(200, page([PALAZZETTO]))) }));
    renderWithProviders(<ResourceView config={venuesConfig} />);
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
    renderWithProviders(<ResourceView config={venuesConfig} />);
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
    renderWithProviders(<ResourceView config={venuesConfig} />);
    await screen.findByText("Palazzetto dello Sport");
    expect(screen.queryByRole("button", { name: /^Altre azioni di/ })).not.toBeInTheDocument();
  });

  it("sends the search text as q and offers to clear it when nothing matches", async () => {
    const api = stubApi(
      routes({ "GET /venues": (call) => json(200, page(call.query.get("q") === "zzz" ? [] : [PALAZZETTO, SCUOLA])) }),
    );
    renderWithProviders(<ResourceView config={venuesConfig} />);
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
    renderWithProviders(<ResourceView config={venuesConfig} />);
    await userEvent.click(await screen.findByRole("button", { name: "Nuova palestra" }));
    const dialog = await screen.findByRole("dialog", { name: "Nuova palestra" });

    await userEvent.click(within(dialog).getByRole("button", { name: "Crea la palestra" }));
    expect(await within(dialog).findByText("Inserisci il nome della palestra")).toBeInTheDocument();
    expect(api.count("POST /venues")).toBe(0);

    await userEvent.type(within(dialog).getByLabelText(/Nome della palestra/), "Palestra Comunale");
    await userEvent.type(within(dialog).getByLabelText("Capienza"), "150");
    await userEvent.click(within(dialog).getByRole("button", { name: "Crea la palestra" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(api.calls.find((call) => call.method === "POST")?.body).toEqual({ name: "Palestra Comunale", capacity: 150 });
    expect(await screen.findByText("Palestra creata")).toBeInTheDocument();
    await waitFor(() => expect(api.count("GET /venues")).toBe(2));
  });

  it("edits a venue and clears an optional field with null", async () => {
    const api = stubApi(routes({ "PATCH /venues/v-palazzetto": () => json(200, PALAZZETTO) }));
    renderWithProviders(<ResourceView config={venuesConfig} />);
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
      availability: "Martedì e giovedì 18:00-21:00",
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
    renderWithProviders(<ResourceView config={venuesConfig} />);
    await userEvent.click(await screen.findByRole("button", { name: "Nuova palestra" }));
    const dialog = await screen.findByRole("dialog", { name: "Nuova palestra" });
    await userEvent.type(within(dialog).getByLabelText(/Nome della palestra/), "Palestra Comunale");
    await userEvent.click(within(dialog).getByRole("button", { name: "Crea la palestra" }));

    expect(await within(dialog).findByText("Alcuni dati non sono validi. Controlla i campi evidenziati.")).toBeInTheDocument();
    expect(within(dialog).getByLabelText("Capienza")).toBeInvalid();
  });

  it("asks before deleting, deletes and reloads the list", async () => {
    const api = stubApi(routes({ "DELETE /venues/v-scuola": () => json(204) }));
    renderWithProviders(<ResourceView config={venuesConfig} />);
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
    renderWithProviders(<ResourceView config={venuesConfig} />);
    await pickFromMenu("Altre azioni di Palestra Scuola Media", "Elimina Palestra Scuola Media");
    const dialog = await screen.findByRole("dialog");
    await userEvent.click(within(dialog).getByRole("button", { name: "Elimina" }));
    expect(await within(dialog).findByText("Non hai i permessi per eseguire questa azione.")).toBeInTheDocument();
  });

  it("is read-only without the write permission", async () => {
    auth.permissions = ["venues:read"];
    stubApi(routes());
    renderWithProviders(<ResourceView config={venuesConfig} />);
    await screen.findByText("Palazzetto dello Sport");
    expect(screen.queryByRole("button", { name: "Nuova palestra" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Altre azioni di / })).not.toBeInTheDocument();
  });
});
