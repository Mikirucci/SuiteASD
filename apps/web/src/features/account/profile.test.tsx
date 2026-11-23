import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { expectNoA11yViolations } from "@/test/a11y";
import { json, problem, renderWithProviders, stubApi } from "@/test/stub-api";
import { EmergencyContactsSection } from "./emergency-contacts-section";
import { MyProfileSection } from "./my-profile-form";
import type { MyProfile } from "./profile-api";
import { profilePatchOf, profileValuesOf } from "./profile-schema";
import { QualificationsSection } from "./qualifications-section";

const auth = vi.hoisted(() => ({ permissions: [] as string[] }));
vi.mock("@/features/auth/auth-provider", () => ({
  useAuth: () => ({ status: "authenticated", me: { permissions: auth.permissions, roles: ["ALLENATORE"] } }),
}));

const COACH: MyProfile = {
  userId: "u1",
  firstName: "Davide",
  lastName: "Rossi",
  email: "davide@example.test",
  phone: "3331234567",
  city: "Milano",
  iban: "IT60X0542811101000000123456",
  fixedFields: [],
  qualifications: [
    { id: "q1", title: "Allenatore 2 grado", issuedOn: "2020-01-01", expiresOn: "2099-06-30" },
    { id: "q2", title: "Primo soccorso", issuedOn: "2015-01-01", expiresOn: "2016-01-01" },
  ],
};
const ATHLETE: MyProfile = { userId: "u2", firstName: "Sara", lastName: "Conti", email: "sara@example.test", memberId: "m1", fiscalCode: "RSSMRA85T10A562S", fixedFields: ["fiscalCode"] };

beforeEach(() => {
  auth.permissions = ["profile:readOwn", "profile:updateOwn", "profile:professional"];
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("profile patch", () => {
  it("sends only the fields that changed, and null for one emptied", () => {
    const values = { ...profileValuesOf(COACH), phone: "3339999999", city: "" };
    expect(profilePatchOf(values, COACH)).toEqual({ phone: "3339999999", city: null });
  });
});

describe("MyProfileSection", () => {
  it("shows the data of the person, with the IBAN only to who works for the society", async () => {
    stubApi({ "GET /me/profile": () => json(200, COACH) });
    const { container } = renderWithProviders(<MyProfileSection />);

    expect(await screen.findByLabelText(/^Telefono/)).toHaveValue("3331234567");
    expect(screen.getByLabelText(/^IBAN/)).toHaveValue("IT60X0542811101000000123456");
    expect(screen.getByText("davide@example.test")).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it("hides the IBAN from an athlete and locks the fields already on the member card", async () => {
    auth.permissions = ["profile:readOwn", "profile:updateOwn"];
    stubApi({ "GET /me/profile": () => json(200, ATHLETE) });
    renderWithProviders(<MyProfileSection />);

    expect(await screen.findByLabelText(/^Codice fiscale/)).toBeDisabled();
    expect(screen.queryByLabelText(/^IBAN/)).not.toBeInTheDocument();
    expect(screen.getByLabelText(/^Data di nascita/)).toBeEnabled();
  });

  it("saves what changed", async () => {
    const api = stubApi({ "GET /me/profile": () => json(200, COACH), "PATCH /me/profile": () => json(200, { ...COACH, phone: "3339999999" }) });
    renderWithProviders(<MyProfileSection />);
    const phone = await screen.findByLabelText(/^Telefono/);
    expect(screen.getByRole("button", { name: "Salva i dati" })).toBeDisabled();
    await userEvent.clear(phone);
    await userEvent.type(phone, "3339999999");
    await userEvent.click(screen.getByRole("button", { name: "Salva i dati" }));

    await waitFor(() => expect(api.count("PATCH /me/profile")).toBe(1));
    expect(api.calls.find((call) => call.method === "PATCH")?.body).toEqual({ phone: "3339999999" });
    expect(await screen.findByText("Dati salvati")).toBeInTheDocument();
  });

  it("checks the format and shows a refusal of the server on its field", async () => {
    const api = stubApi({ "GET /me/profile": () => json(200, ATHLETE), "PATCH /me/profile": () => problem(409, "fiscal_code_taken") });
    auth.permissions = ["profile:readOwn", "profile:updateOwn"];
    renderWithProviders(<MyProfileSection />);
    await userEvent.type(await screen.findByLabelText(/^CAP/), "12");
    await userEvent.click(screen.getByRole("button", { name: "Salva i dati" }));
    expect(await screen.findByText("Il CAP ha 5 cifre")).toBeInTheDocument();
    expect(api.count("PATCH /me/profile")).toBe(0);
  });
});

describe("QualificationsSection", () => {
  it("lists the qualifications and marks an expired one", async () => {
    stubApi({ "GET /me/profile": () => json(200, COACH) });
    renderWithProviders(<QualificationsSection />);

    const list = await screen.findByRole("list", { name: "Qualifiche" });
    expect(within(list).getAllByRole("listitem")).toHaveLength(2);
    expect(list).toHaveTextContent("Allenatore 2 grado");
    expect(within(list.querySelectorAll("li")[1] as HTMLElement).getByText("Scaduta")).toBeInTheDocument();
  });

  it("adds one with a title and dates", async () => {
    const api = stubApi({ "GET /me/profile": () => json(200, COACH), "POST /me/qualifications": () => json(201, { id: "q3", title: "BLSD" }) });
    renderWithProviders(<QualificationsSection />);
    await userEvent.click(await screen.findByRole("button", { name: "Aggiungi" }));
    const dialog = await screen.findByRole("dialog", { name: "Nuova qualifica" });
    await userEvent.click(within(dialog).getByRole("button", { name: "Aggiungi" }));
    expect(await within(dialog).findByText("Scrivi il titolo")).toBeInTheDocument();
    await userEvent.type(within(dialog).getByLabelText(/^Titolo/), "BLSD");
    await userEvent.click(within(dialog).getByRole("button", { name: "Aggiungi" }));

    await waitFor(() => expect(api.count("POST /me/qualifications")).toBe(1));
    expect(api.calls.find((call) => call.method === "POST")?.body).toEqual({ title: "BLSD", issuedOn: null, expiresOn: null });
  });

  it("deletes one after asking", async () => {
    const api = stubApi({ "GET /me/profile": () => json(200, COACH), "DELETE /me/qualifications/q2": () => new Response(null, { status: 204 }) });
    renderWithProviders(<QualificationsSection />);
    await userEvent.click(await screen.findByRole("button", { name: "Elimina la qualifica Primo soccorso" }));
    await userEvent.click(within(await screen.findByRole("dialog", { name: "Eliminare la qualifica?" })).getByRole("button", { name: "Elimina" }));

    await waitFor(() => expect(api.count("DELETE /me/qualifications/q2")).toBe(1));
  });
});

describe("EmergencyContactsSection", () => {
  const MOTHER = { id: "c1", name: "Anna Conti", relation: "madre", phone: "3331112222" };

  it("lists the contacts of the member", async () => {
    stubApi({ "GET /members/m1/emergency-contacts": () => json(200, { data: [MOTHER] }) });
    const { container } = renderWithProviders(<EmergencyContactsSection memberId="m1" ownerName="Sara Conti" />);

    const list = await screen.findByRole("list", { name: "Contatti di Sara Conti" });
    expect(list).toHaveTextContent("Anna Conti");
    expect(within(list).getByRole("link", { name: "3331112222" })).toHaveAttribute("href", "tel:3331112222");
    await expectNoA11yViolations(container);
  });

  it("explains what to do when there are none, and adds the first", async () => {
    const api = stubApi({
      "GET /members/m1/emergency-contacts": () => json(200, { data: [] }),
      "POST /members/m1/emergency-contacts": () => json(201, MOTHER),
    });
    renderWithProviders(<EmergencyContactsSection memberId="m1" ownerName="Sara Conti" />);
    expect(await screen.findByRole("heading", { name: "Nessun contatto" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Aggiungi" }));
    const dialog = await screen.findByRole("dialog", { name: "Nuovo contatto di emergenza" });
    await userEvent.type(within(dialog).getByLabelText(/^Nome e cognome/), "Anna Conti");
    await userEvent.type(within(dialog).getByLabelText(/^Chi è per te/), "madre");
    await userEvent.type(within(dialog).getByLabelText(/^Telefono/), "3331112222");
    await userEvent.click(within(dialog).getByRole("button", { name: "Aggiungi" }));

    await waitFor(() => expect(api.count("POST /members/m1/emergency-contacts")).toBe(1));
    expect(api.calls.find((call) => call.method === "POST")?.body).toEqual({ name: "Anna Conti", relation: "madre", phone: "3331112222" });
  });

  it("stops at three contacts", async () => {
    const three = [MOTHER, { ...MOTHER, id: "c2", name: "Luca Conti" }, { ...MOTHER, id: "c3", name: "Rita Conti" }];
    stubApi({ "GET /members/m1/emergency-contacts": () => json(200, { data: three }) });
    renderWithProviders(<EmergencyContactsSection memberId="m1" ownerName="Sara Conti" />);

    await screen.findByRole("list", { name: "Contatti di Sara Conti" });
    expect(screen.getByRole("button", { name: "Aggiungi" })).toBeDisabled();
  });

  it("deletes after asking", async () => {
    const api = stubApi({ "GET /members/m1/emergency-contacts": () => json(200, { data: [MOTHER] }), "DELETE /members/m1/emergency-contacts/c1": () => new Response(null, { status: 204 }) });
    renderWithProviders(<EmergencyContactsSection memberId="m1" ownerName="Sara Conti" />);
    await userEvent.click(await screen.findByRole("button", { name: "Elimina il contatto Anna Conti" }));
    await userEvent.click(within(await screen.findByRole("dialog", { name: "Eliminare il contatto?" })).getByRole("button", { name: "Elimina" }));

    await waitFor(() => expect(api.count("DELETE /members/m1/emergency-contacts/c1")).toBe(1));
  });
});
