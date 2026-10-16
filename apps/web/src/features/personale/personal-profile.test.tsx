import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MeResponse } from "@/lib/api";
import { expectNoA11yViolations } from "@/test/a11y";
import { ANNA_FERRI, SARA_CONTI, detailOf, member, mockApi, problem, renderScreen } from "../tesserati/test-support";
import { PersonalProfile } from "./personal-profile";
import { athleteMe, guardianMe } from "./test-support";

const auth = vi.hoisted(() => ({
  me: null as MeResponse | null,
  adoptSession: vi.fn<(session: unknown) => Promise<void>>(),
  refresh: vi.fn<() => Promise<void>>(),
}));
vi.mock("@/features/auth/auth-provider", () => ({
  useAuth: () => ({ status: "authenticated", me: auth.me, adoptSession: auth.adoptSession, refresh: auth.refresh }),
}));
vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: { href: string; children: ReactNode } & Record<string, unknown>) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

const SARA = detailOf(
  { ...SARA_CONTI, birthDate: "2009-03-10", fiscalCode: "CNTSRA09C50A944X", phone: "333 1234567", email: "sara@example.test", city: "Bologna" },
  {},
);

beforeEach(() => {
  auth.me = athleteMe();
  auth.adoptSession.mockReset();
  auth.adoptSession.mockResolvedValue(undefined);
  auth.refresh.mockReset();
  auth.refresh.mockResolvedValue(undefined);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("PersonalProfile", () => {
  it("shows what the society knows and the contact details in a form", async () => {
    mockApi({ "GET /members/m-sara": () => ({ body: SARA }) });
    const { container } = renderScreen(<PersonalProfile />);
    expect(screen.getByRole("heading", { level: 1, name: /I tuoi dati, sempre aggiornati/ })).toBeInTheDocument();

    const data = await screen.findByRole("region", { name: "Dati di Sara Conti" });
    expect(await within(data).findByText("10 marzo 2009")).toBeInTheDocument();
    expect(within(data).getByText("CNTSRA09C50A944X")).toBeInTheDocument();
    expect(within(data).getByText("U16")).toBeInTheDocument();
    expect(within(data).getByLabelText("Telefono")).toHaveValue("333 1234567");
    expect(within(data).getByLabelText("Email")).toHaveValue("sara@example.test");
    expect(within(data).getByLabelText("Città")).toHaveValue("Bologna");
    expect(within(data).getByRole("button", { name: "Salva i dati" })).toBeDisabled();
    await expectNoA11yViolations(container);
  });

  it("saves only through the contact endpoint, clearing what was emptied", async () => {
    const api = mockApi({
      "GET /members/m-sara": () => ({ body: SARA }),
      "PATCH /members/m-sara/contact": () => ({ body: { ...SARA, phone: "339 7654321", city: null, updatedAt: "2026-11-01T10:00:00.000Z" } }),
    });
    renderScreen(<PersonalProfile />);
    const form = await screen.findByRole("form", { name: "Contatti di Sara Conti" });

    const phone = within(form).getByLabelText("Telefono");
    await userEvent.clear(phone);
    await userEvent.type(phone, "339 7654321");
    await userEvent.clear(within(form).getByLabelText("Città"));
    await userEvent.click(within(form).getByRole("button", { name: "Salva i dati" }));

    expect(await screen.findByText("Dati salvati")).toBeInTheDocument();
    expect(api.calls.find((call) => call.method === "PATCH")?.body).toEqual({
      phone: "339 7654321",
      email: "sara@example.test",
      address: null,
      city: null,
      postalCode: null,
      kitSize: null,
    });
  });

  it("checks the email and the phone before saving", async () => {
    const api = mockApi({ "GET /members/m-sara": () => ({ body: SARA }) });
    renderScreen(<PersonalProfile />);
    const form = await screen.findByRole("form", { name: "Contatti di Sara Conti" });
    const email = within(form).getByLabelText("Email");
    await userEvent.clear(email);
    await userEvent.type(email, "non-una-email");
    await userEvent.clear(within(form).getByLabelText("Telefono"));
    await userEvent.type(within(form).getByLabelText("Telefono"), "12");
    await userEvent.click(within(form).getByRole("button", { name: "Salva i dati" }));
    expect(await within(form).findByText("Inserisci un'email valida")).toBeInTheDocument();
    expect(within(form).getByText("Il numero è troppo corto")).toBeInTheDocument();
    expect(api.calls.some((call) => call.method === "PATCH")).toBe(false);
  });

  it("shows why the save failed", async () => {
    mockApi({
      "GET /members/m-sara": () => ({ body: SARA }),
      "PATCH /members/m-sara/contact": () => problem(500, "internal_error"),
    });
    renderScreen(<PersonalProfile />);
    const form = await screen.findByRole("form", { name: "Contatti di Sara Conti" });
    await userEvent.type(within(form).getByLabelText("CAP"), "40100");
    await userEvent.click(within(form).getByRole("button", { name: "Salva i dati" }));
    expect(await within(form).findByText("Il servizio non è disponibile al momento. Riprova tra poco.")).toBeInTheDocument();
  });

  it("changes the password and keeps the user signed in with the new session", async () => {
    const session = { accessToken: "new", refreshToken: "new-refresh" };
    const api = mockApi({
      "GET /members/m-sara": () => ({ body: SARA }),
      "PUT /auth/password": () => ({ body: session }),
    });
    renderScreen(<PersonalProfile />);
    const form = await screen.findByRole("form", { name: "Cambio password" });
    await userEvent.type(within(form).getByLabelText("Password attuale"), "VecchiaPassword1!");
    await userEvent.type(within(form).getByLabelText("Nuova password"), "NuovaPassword2!");
    await userEvent.type(within(form).getByLabelText("Ripeti la nuova password"), "NuovaPassword2!");
    await userEvent.click(within(form).getByRole("button", { name: "Cambia la password" }));

    expect(await screen.findByText("Password cambiata")).toBeInTheDocument();
    expect(api.calls.find((call) => call.method === "PUT")?.body).toEqual({ currentPassword: "VecchiaPassword1!", newPassword: "NuovaPassword2!" });
    expect(auth.adoptSession).toHaveBeenCalledWith(session);
  });

  it("rejects short passwords, a mismatch, and a wrong current password", async () => {
    mockApi({
      "GET /members/m-sara": () => ({ body: SARA }),
      "PUT /auth/password": () => problem(422, "invalid_current_password"),
    });
    renderScreen(<PersonalProfile />);
    const form = await screen.findByRole("form", { name: "Cambio password" });
    await userEvent.type(within(form).getByLabelText("Password attuale"), "Sbagliata1!");
    await userEvent.type(within(form).getByLabelText("Nuova password"), "corta");
    await userEvent.type(within(form).getByLabelText("Ripeti la nuova password"), "altra");
    await userEvent.click(within(form).getByRole("button", { name: "Cambia la password" }));
    expect(await within(form).findByText("La nuova password deve avere almeno 8 caratteri")).toBeInTheDocument();
    expect(within(form).getByText("Le password non coincidono")).toBeInTheDocument();

    await userEvent.clear(within(form).getByLabelText("Nuova password"));
    await userEvent.clear(within(form).getByLabelText("Ripeti la nuova password"));
    await userEvent.type(within(form).getByLabelText("Nuova password"), "NuovaPassword2!");
    await userEvent.type(within(form).getByLabelText("Ripeti la nuova password"), "NuovaPassword2!");
    await userEvent.click(within(form).getByRole("button", { name: "Cambia la password" }));
    expect(await within(form).findByText("La password attuale non è corretta")).toBeInTheDocument();
    expect(auth.adoptSession).not.toHaveBeenCalled();
  });

  it("shows the account and the way to the notification preferences", async () => {
    mockApi({ "GET /members/m-sara": () => ({ body: SARA }) });
    renderScreen(<PersonalProfile />);
    const account = await screen.findByRole("region", { name: "Il tuo account" });
    expect(within(account).getByText("sara@example.test")).toBeInTheDocument();
    expect(within(account).getByText("Atleta")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Preferenze di notifica" })).toHaveAttribute("href", "/area-personale/notifiche");
    expect(screen.queryByRole("button", { name: "Aggiungi un figlio" })).not.toBeInTheDocument();
  });

  describe("a parent", () => {
    beforeEach(() => {
      auth.me = guardianMe();
    });

    const childRoutes = {
      "GET /members/m-anna": () => ({ body: detailOf(member({ id: "m-anna", firstName: "Anna", lastName: "Conti" })) }),
      "GET /members/m-marta": () => ({ body: detailOf(ANNA_FERRI, { id: "m-marta", firstName: "Marta", lastName: "Conti" }) }),
    };

    it("lists the children and edits the details of the chosen one", async () => {
      const api = mockApi({
        ...childRoutes,
        "PATCH /members/m-marta/contact": () => ({ body: detailOf(ANNA_FERRI, { id: "m-marta", firstName: "Marta", lastName: "Conti", phone: "340 1112233" }) }),
      });
      renderScreen(<PersonalProfile />);
      const children = await screen.findByRole("list", { name: "Figli" });
      expect(within(children).getAllByRole("listitem").map((item) => item.textContent)).toEqual(["Anna Conti", "Marta Conti"]);

      await userEvent.click(within(screen.getByRole("group", { name: "Per chi" })).getByRole("button", { name: "Marta Conti" }));
      const form = await screen.findByRole("form", { name: "Contatti di Marta Conti" });
      await userEvent.type(within(form).getByLabelText("Telefono"), "340 1112233");
      await userEvent.click(within(form).getByRole("button", { name: "Salva i dati" }));
      expect(await screen.findByText("Dati salvati")).toBeInTheDocument();
      expect(api.calls.find((call) => call.method === "PATCH")?.path).toBe("/members/m-marta/contact");
    });

    it("adds a child and reloads the user so the child appears everywhere", async () => {
      const api = mockApi({
        ...childRoutes,
        "POST /me/children": () => ({ status: 201, body: detailOf(member({ id: "m-luca", firstName: "Luca", lastName: "Conti" })) }),
      });
      renderScreen(<PersonalProfile />);
      await userEvent.click(await screen.findByRole("button", { name: "Aggiungi un figlio" }));
      const dialog = await screen.findByRole("dialog", { name: "Aggiungi un figlio" });
      await userEvent.type(within(dialog).getByLabelText(/Nome/, { selector: "input" }), "Luca");
      await userEvent.type(within(dialog).getByLabelText(/Cognome/), "Conti");
      await userEvent.type(within(dialog).getByLabelText(/Data di nascita/), "2016-02-29");
      await userEvent.selectOptions(within(dialog).getByLabelText("Genere"), "MALE");
      await userEvent.selectOptions(within(dialog).getByLabelText("Tu sei"), "MADRE");
      await userEvent.click(within(dialog).getByRole("button", { name: "Aggiungi" }));

      expect(await screen.findByText("Figlio aggiunto")).toBeInTheDocument();
      expect(api.calls.find((call) => call.method === "POST")?.body).toEqual({
        firstName: "Luca",
        lastName: "Conti",
        birthDate: "2016-02-29",
        relation: "MADRE",
        gender: "MALE",
      });
      expect(auth.refresh).toHaveBeenCalledTimes(1);
      await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    });

    it("checks the child before calling the API, and explains a duplicate", async () => {
      const api = mockApi({ ...childRoutes, "POST /me/children": () => problem(409, "fiscal_code_taken") });
      renderScreen(<PersonalProfile />);
      await userEvent.click(await screen.findByRole("button", { name: "Aggiungi un figlio" }));
      const dialog = await screen.findByRole("dialog");
      await userEvent.click(within(dialog).getByRole("button", { name: "Aggiungi" }));
      expect(await within(dialog).findByText("Inserisci il nome")).toBeInTheDocument();
      expect(within(dialog).getByText("Inserisci il cognome")).toBeInTheDocument();
      expect(within(dialog).getByText("Inserisci la data di nascita")).toBeInTheDocument();
      expect(api.calls.some((call) => call.method === "POST")).toBe(false);

      await userEvent.type(within(dialog).getByLabelText(/Nome/, { selector: "input" }), "Luca");
      await userEvent.type(within(dialog).getByLabelText(/Cognome/), "Conti");
      await userEvent.type(within(dialog).getByLabelText(/Data di nascita/), "2016-02-29");
      await userEvent.click(within(dialog).getByRole("button", { name: "Aggiungi" }));
      expect(await within(dialog).findByText("Questo atleta è già registrato.")).toBeInTheDocument();
      expect(auth.refresh).not.toHaveBeenCalled();
    });
  });
});
