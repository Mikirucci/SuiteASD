import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { expectNoA11yViolations } from "@/test/a11y";
import { json, problem, renderWithProviders, stubApi } from "@/test/stub-api";
import type { Society } from "./api";
import { SocietyPage } from "./society-page";
import { societyPatchOf, societyValuesOf } from "./society-schema";

const auth = vi.hoisted(() => ({ permissions: [] as string[] }));
vi.mock("@/features/auth/auth-provider", () => ({
  useAuth: () => ({ status: "authenticated", me: { permissions: auth.permissions, roles: ["ADMIN"] } }),
}));

const SOCIETY: Society = {
  id: "s1",
  name: "Aquile Volley",
  slug: "aquile-volley",
  sport: "VOLLEY",
  timezone: "Europe/Rome",
  contactEmail: "info@aquilevolley.it",
  legal: { legalName: "Aquile Volley ASD", legalForm: "ASD", vatNumber: "12345678903" },
};
const WITHOUT_LEGAL: Society = { id: "s1", name: "Aquile Volley", slug: "aquile-volley", sport: "VOLLEY", timezone: "Europe/Rome" };

beforeEach(() => {
  auth.permissions = ["society:read", "society:readLegal", "society:write"];
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("society patch", () => {
  it("sends only what changed and empties a field left blank", () => {
    const values = { ...societyValuesOf(SOCIETY), contactEmail: "", legalName: "Aquile Volley ASD ", vatNumber: "98765432109" };
    expect(societyPatchOf(values, SOCIETY)).toEqual({ contactEmail: null, legal: { vatNumber: "98765432109" } });
  });

  it("leaves the fiscal block out for somebody who was never sent it", () => {
    const values = { ...societyValuesOf(WITHOUT_LEGAL), name: "Aquile", vatNumber: "12345678903" };
    expect(societyPatchOf(values, WITHOUT_LEGAL)).toEqual({ name: "Aquile" });
  });
});

describe("SocietyPage", () => {
  it("shows the general and the fiscal data to the administrator, ready to edit", async () => {
    stubApi({ "GET /society": () => json(200, SOCIETY) });
    const { container } = renderWithProviders(<SocietyPage />);

    expect(await screen.findByLabelText(/^Nome della società/)).toHaveValue("Aquile Volley");
    expect(screen.getByRole("heading", { name: "Dati legali e fiscali" })).toBeInTheDocument();
    expect(screen.getByLabelText("Partita IVA")).toHaveValue("12345678903");
    expect(screen.getByRole("button", { name: "Salva i dati" })).toBeDisabled();
    await expectNoA11yViolations(container);
  });

  it("does not show the fiscal block when the server did not send it", async () => {
    auth.permissions = ["society:read"];
    stubApi({ "GET /society": () => json(200, WITHOUT_LEGAL) });
    renderWithProviders(<SocietyPage />);

    await screen.findByLabelText(/^Nome della società/);
    expect(screen.queryByRole("heading", { name: "Dati legali e fiscali" })).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Partita IVA")).not.toBeInTheDocument();
  });

  it("is read-only for who may not write", async () => {
    auth.permissions = ["society:read", "society:readLegal"];
    stubApi({ "GET /society": () => json(200, SOCIETY) });
    renderWithProviders(<SocietyPage />);

    expect(await screen.findByLabelText(/^Nome della società/)).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Salva i dati" })).not.toBeInTheDocument();
    expect(screen.getByText(/Questi dati li modifica l'amministratore/)).toBeInTheDocument();
  });

  it("saves only the changed fields, nested as the API wants", async () => {
    const api = stubApi({
      "GET /society": () => json(200, SOCIETY),
      "PATCH /society": () => json(200, { ...SOCIETY, legal: { ...SOCIETY.legal, vatNumber: "98765432109" } }),
    });
    renderWithProviders(<SocietyPage />);
    const vat = await screen.findByLabelText("Partita IVA");
    await userEvent.clear(vat);
    await userEvent.type(vat, "98765432109");
    await userEvent.click(screen.getByRole("button", { name: "Salva i dati" }));

    await waitFor(() => expect(api.count("PATCH /society")).toBe(1));
    expect(api.calls.find((call) => call.method === "PATCH")?.body).toEqual({ legal: { vatNumber: "98765432109" } });
    expect(await screen.findByText("Dati della società salvati")).toBeInTheDocument();
  });

  it("checks the format before calling the API and shows what the server refuses on its field", async () => {
    const api = stubApi({
      "GET /society": () => json(200, SOCIETY),
      "PATCH /society": () => json(422, { type: "about:blank", title: "x", status: 422, code: "validation_error", errors: [{ path: "legal.vatNumber", message: "La partita IVA non è valida" }] }),
    });
    renderWithProviders(<SocietyPage />);
    const vat = await screen.findByLabelText("Partita IVA");
    await userEvent.clear(vat);
    await userEvent.type(vat, "123");
    await userEvent.click(screen.getByRole("button", { name: "Salva i dati" }));
    expect(await screen.findByText("La partita IVA ha 11 cifre")).toBeInTheDocument();
    expect(api.count("PATCH /society")).toBe(0);

    await userEvent.clear(vat);
    await userEvent.type(vat, "11111111111");
    await userEvent.click(screen.getByRole("button", { name: "Salva i dati" }));
    await waitFor(() => expect(api.count("PATCH /society")).toBe(1));
    expect(await screen.findByText("Valore non valido")).toBeInTheDocument();
  });

  it("warns that changing the time zone does not move the events already saved", async () => {
    stubApi({ "GET /society": () => json(200, SOCIETY) });
    renderWithProviders(<SocietyPage />);
    await userEvent.selectOptions(await screen.findByLabelText("Fuso orario"), "Europe/London");

    expect(screen.getByText(/non sposta gli eventi già salvati/)).toBeInTheDocument();
  });

  it("shows an error with a retry, then the data", async () => {
    let attempts = 0;
    stubApi({ "GET /society": () => (++attempts === 1 ? problem(500, "internal") : json(200, SOCIETY)) });
    renderWithProviders(<SocietyPage />);

    expect(await screen.findByText("Il servizio non è disponibile al momento. Riprova tra poco.")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Riprova" }));
    expect(await screen.findByLabelText(/^Nome della società/)).toBeInTheDocument();
  });
});
