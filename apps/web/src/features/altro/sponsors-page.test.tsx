import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { expectNoA11yViolations } from "@/test/a11y";
import { json, page, problem, renderWithProviders, stubApi } from "@/test/stub-api";
import { SponsorsPage } from "./sponsors-page";
import { PANIFICIO } from "./test-fixtures";
import type { Sponsor, SponsorSummary } from "./types";

const auth = vi.hoisted(() => ({ permissions: [] as string[] }));
vi.mock("@/features/auth/auth-provider", () => ({
  useAuth: () => ({ status: "authenticated", me: { permissions: auth.permissions, roles: ["ADMIN"] } }),
}));

const OTTICA: Sponsor = { ...PANIFICIO, id: "s-ottica", name: "Ottica Bianchi", contactName: null, email: null, phone: null, status: "PROSPECT", amountCents: 0, contractStart: null, contractEnd: null };
const SUMMARY: SponsorSummary = { activeCount: 3, activeCents: 450000, expiringCount: 1, prospectCount: 2, expiredCount: 1 };
const EMPTY_SUMMARY: SponsorSummary = { activeCount: 0, activeCents: 0, expiringCount: 0, prospectCount: 0, expiredCount: 0 };

function routes(extra: Parameters<typeof stubApi>[0] = {}) {
  return {
    "GET /sponsors/summary": () => json(200, SUMMARY),
    "GET /sponsors": () => json(200, page([PANIFICIO, OTTICA])),
    ...extra,
  };
}

const tile = (label: string) => within(screen.getByRole("region", { name: "Riepilogo degli sponsor" })).getByText(label).parentElement?.parentElement;

beforeEach(() => {
  auth.permissions = ["sponsors:read", "sponsors:write"];
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("SponsorsPage", () => {
  it("shows the totals of the contracts and one card for each sponsor", async () => {
    stubApi(routes());
    const { container } = renderWithProviders(<SponsorsPage />);
    expect(screen.getByRole("status", { name: "Caricamento del riepilogo degli sponsor" })).toBeInTheDocument();

    expect(await screen.findByRole("region", { name: "Riepilogo degli sponsor" })).toBeInTheDocument();
    expect(tile("Attivi")).toHaveTextContent(/3.*1 contratto scaduto/);
    expect(tile("Valore")).toHaveTextContent(/€\s4\.?500/);
    expect(tile("In scadenza")).toHaveTextContent(/1.*entro 30 giorni/);
    expect(tile("Potenziali")).toHaveTextContent(/2.*ancora da convincere/);

    const list = await screen.findByRole("list", { name: "Sponsor" });
    const [panificio, ottica] = within(list).getAllByRole("listitem") as [HTMLElement, HTMLElement];
    expect(panificio).toHaveTextContent("Panificio Rizzi");
    expect(panificio).toHaveTextContent(/€\s1\.?500/);
    expect(panificio).toHaveTextContent("elena@panificiorizzi.it");
    expect(panificio).toHaveTextContent("Fino al 31 ago 2027");
    expect(panificio).toHaveTextContent("Attivo");
    expect(ottica).toHaveTextContent("Potenziale");
    expect(ottica).toHaveTextContent("Importo da definire");
    expect(ottica).toHaveTextContent("Senza scadenza");
    // the card is the way in: one button, no menu of actions
    expect(within(panificio).getAllByRole("button").map((button) => button.textContent)).toEqual(["Panificio Rizzi"]);
    await expectNoA11yViolations(container);
  }, 20_000);

  it("does not warn about expiring contracts when there are none", async () => {
    stubApi(routes({ "GET /sponsors/summary": () => json(200, { ...SUMMARY, expiringCount: 0, expiredCount: 0 }) }));
    renderWithProviders(<SponsorsPage />);
    await screen.findByRole("region", { name: "Riepilogo degli sponsor" });
    expect(tile("Attivi")).toHaveTextContent("Nessun contratto scaduto");
    expect(tile("In scadenza")).toHaveTextContent(/0.*entro 30 giorni/);
  });

  it("filters the cards by state with the menu next to the search", async () => {
    const api = stubApi(routes());
    renderWithProviders(<SponsorsPage />);
    await screen.findByRole("list", { name: "Sponsor" });
    await userEvent.selectOptions(screen.getByLabelText("Filtra per stato"), "PROSPECT");
    await waitFor(() => expect(api.calls.filter((call) => call.path === "/sponsors").at(-1)?.query.get("status")).toBe("PROSPECT"));
  });

  it("registers a sponsor with its contract files, then reads the totals again", async () => {
    const api = stubApi(routes({ "POST /sponsors": () => json(201, OTTICA), "POST /attachments": () => json(201, {}) }));
    renderWithProviders(<SponsorsPage />);
    await userEvent.click(await screen.findByRole("button", { name: "Nuovo sponsor" }));
    const dialog = await screen.findByRole("dialog", { name: "Nuovo sponsor" });
    await userEvent.type(within(dialog).getByLabelText(/Nome dello sponsor/), "Ottica Bianchi");
    await userEvent.type(within(dialog).getByLabelText(/Importo del contratto/), "2000");
    const contract = new File(["%PDF-1.4"], "contratto.pdf", { type: "application/pdf" });
    await userEvent.upload(within(dialog).getByLabelText("File da allegare"), contract);
    await userEvent.click(within(dialog).getByRole("button", { name: "Crea lo sponsor" }));

    await screen.findByText("Sponsor creato");
    expect(api.calls.find((call) => call.method === "POST" && call.path === "/sponsors")?.body).toMatchObject({ name: "Ottica Bianchi", amountCents: 200000 });
    const upload = api.calls.find((call) => call.path === "/attachments");
    expect(upload?.query.get("entityType")).toBe("SPONSOR");
    expect(upload?.query.get("entityId")).toBe(OTTICA.id);
    expect(upload?.query.get("fileName")).toBe("contratto.pdf");
    await waitFor(() => expect(api.count("GET /sponsors/summary")).toBeGreaterThan(1));
  });

  describe("the detail of a sponsor", () => {
    const openPanificio = async () => {
      await userEvent.click(await screen.findByRole("button", { name: "Panificio Rizzi" }));
      return screen.findByRole("dialog", { name: "Panificio Rizzi" });
    };

    it("opens on the same page with every field to change and the attachments, with no Modifica button", async () => {
      const api = stubApi(routes({ "GET /attachments": () => json(200, { data: [] }) }));
      renderWithProviders(<SponsorsPage />);
      const dialog = await openPanificio();

      expect(within(dialog).getByLabelText(/Nome dello sponsor/)).toHaveValue("Panificio Rizzi");
      expect(within(dialog).getByLabelText("Referente")).toHaveValue("Elena Rizzi");
      expect(within(dialog).getByLabelText("Email")).toHaveValue("elena@panificiorizzi.it");
      expect(within(dialog).getByLabelText("Telefono")).toHaveValue("035 123456");
      expect(within(dialog).getByLabelText(/Importo del contratto/)).toHaveValue("1500");
      expect(within(dialog).getByLabelText("Inizio del contratto")).toHaveValue("2026-09-01");
      expect(within(dialog).getByLabelText("Fine del contratto")).toHaveValue("2027-08-31");
      expect(within(dialog).getByRole("heading", { name: "Allegati" })).toBeInTheDocument();
      expect(await within(dialog).findByText("Nessun allegato")).toBeInTheDocument();
      const attachments = api.calls.find((call) => call.path === "/attachments");
      expect(attachments?.query.get("entityType")).toBe("SPONSOR");
      expect(attachments?.query.get("entityId")).toBe(PANIFICIO.id);
      expect(screen.queryByRole("menuitem", { name: /Modifica/ })).not.toBeInTheDocument();
      expect(within(dialog).queryByRole("button", { name: /^Modifica/ })).not.toBeInTheDocument();
    });

    it("saves what was changed and reads the totals and the cards again", async () => {
      const api = stubApi(routes({ "GET /attachments": () => json(200, { data: [] }), [`PATCH /sponsors/${PANIFICIO.id}`]: () => json(200, PANIFICIO) }));
      renderWithProviders(<SponsorsPage />);
      const dialog = await openPanificio();
      const amount = within(dialog).getByLabelText(/Importo del contratto/);
      await userEvent.clear(amount);
      await userEvent.type(amount, "1800");
      await userEvent.click(within(dialog).getByRole("button", { name: "Salva le modifiche" }));

      await screen.findByText("Sponsor aggiornato");
      expect(api.calls.find((call) => call.method === "PATCH")?.body).toMatchObject({ amountCents: 180000 });
      await waitFor(() => expect(api.count("GET /sponsors/summary")).toBeGreaterThan(1));
      expect(screen.queryByRole("dialog", { name: "Panificio Rizzi" })).not.toBeInTheDocument();
    });

    it("deletes the sponsor from its detail, after asking", async () => {
      const api = stubApi(routes({ "GET /attachments": () => json(200, { data: [] }), [`DELETE /sponsors/${PANIFICIO.id}`]: () => json(204) }));
      renderWithProviders(<SponsorsPage />);
      const dialog = await openPanificio();
      await userEvent.click(within(dialog).getByRole("button", { name: "Elimina" }));

      const confirm = await screen.findByRole("dialog", { name: "Eliminare Panificio Rizzi?" });
      expect(confirm).toHaveTextContent("Eliminare Panificio Rizzi?");
      expect(api.count(`DELETE /sponsors/${PANIFICIO.id}`)).toBe(0);
      await userEvent.click(within(confirm).getByRole("button", { name: "Elimina" }));
      await screen.findByText("Sponsor eliminato");
      expect(api.count(`DELETE /sponsors/${PANIFICIO.id}`)).toBe(1);
    });
  });

  it("explains an empty list and offers the first sponsor", async () => {
    stubApi(routes({ "GET /sponsors": () => json(200, page([])), "GET /sponsors/summary": () => json(200, EMPTY_SUMMARY) }));
    renderWithProviders(<SponsorsPage />);
    expect(await screen.findByRole("heading", { name: "Nessuno sponsor" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Nuovo sponsor" })).toBeInTheDocument();
    expect(tile("Valore")).toHaveTextContent(/€\s0/);
  });

  it("does not offer to register sponsors without the write permission, and opens the card to read only", async () => {
    auth.permissions = ["sponsors:read"];
    stubApi(routes());
    renderWithProviders(<SponsorsPage />);
    await screen.findByRole("list", { name: "Sponsor" });
    expect(screen.queryByRole("button", { name: "Nuovo sponsor" })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Panificio Rizzi" }));
    const dialog = await screen.findByRole("dialog", { name: "Panificio Rizzi" });
    expect(within(dialog).getByLabelText("Email")).toBeDisabled();
    expect(within(dialog).queryByRole("button", { name: "Salva le modifiche" })).not.toBeInTheDocument();
    expect(within(dialog).queryByRole("button", { name: "Elimina" })).not.toBeInTheDocument();
  });

  it("keeps the list when the totals fail, and loads them again on request", async () => {
    let attempts = 0;
    stubApi(routes({ "GET /sponsors/summary": () => (++attempts === 1 ? problem(500, "internal") : json(200, SUMMARY)) }));
    renderWithProviders(<SponsorsPage />);
    expect(await screen.findByText("Riepilogo non disponibile")).toBeInTheDocument();
    expect(await screen.findByRole("list", { name: "Sponsor" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Riprova" }));
    expect(await screen.findByRole("region", { name: "Riepilogo degli sponsor" })).toBeInTheDocument();
  });
});
