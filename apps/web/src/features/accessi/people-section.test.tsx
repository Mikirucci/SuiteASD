import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { expectNoA11yViolations } from "@/test/a11y";
import { json, page, problem, renderWithProviders, stubApi } from "@/test/stub-api";
import type { Account, AuditEntry } from "./api";
import { PeopleSection } from "./people-section";

const auth = vi.hoisted(() => ({ permissions: [] as string[] }));
vi.mock("@/features/auth/auth-provider", () => ({
  useAuth: () => ({ status: "authenticated", me: { permissions: auth.permissions, roles: ["ADMIN"], user: { email: "rita@example.test" } } }),
}));

function account(overrides: Partial<Account> = {}): Account {
  return {
    id: "u-1",
    email: "rita@example.test",
    firstName: "Rita",
    lastName: "Bianchi",
    phone: null,
    isActive: true,
    roles: ["ADMIN"],
    emailVerified: true,
    createdAt: "2026-03-02T09:14:00Z",
    lastLoginAt: "2026-11-20T18:02:00Z",
    member: null,
    ...overrides,
  };
}

const RITA = account();
const MARCO = account({ id: "u-2", email: "marco@example.test", firstName: "Marco", lastName: "Rossi", roles: ["ALLENATORE"] });
const LUCA = account({ id: "u-3", email: "luca@example.test", firstName: "Luca", lastName: "Neri", roles: ["STAFF"], isActive: false, emailVerified: false, lastLoginAt: null });

const ENTRY: AuditEntry = {
  id: "a-1",
  actorId: "u-1",
  actorName: "Rita Bianchi",
  action: "ROLES_CHANGED",
  rolesBefore: ["STAFF"],
  rolesAfter: ["ALLENATORE"],
  createdAt: "2026-11-21T10:00:00Z",
};

beforeEach(() => {
  auth.permissions = ["users:read", "users:write", "users:auditRead"];
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function rowOf(list: HTMLElement, name: string): HTMLElement {
  const row = within(list).getAllByRole("listitem").find((item) => item.textContent?.includes(name));
  if (!row) throw new Error(`No row for ${name}`);
  return row;
}

describe("PeopleSection", () => {
  it("shows nothing to somebody who cannot read the accounts", () => {
    auth.permissions = ["invitations:read"];
    const api = stubApi({});
    const { container } = renderWithProviders(<PeopleSection />);
    expect(container.querySelector("section")).toBeNull();
    expect(api.calls).toHaveLength(0);
  });

  it("lists the people with role, last sign-in and what is wrong with the account", async () => {
    stubApi({ "GET /users": () => json(200, page([RITA, MARCO, LUCA])) });
    const { container } = renderWithProviders(<PeopleSection />);

    const list = await screen.findByRole("list", { name: "Persone con accesso" });
    expect(rowOf(list, "Rita Bianchi")).toHaveTextContent("(sei tu)");
    expect(rowOf(list, "Marco Rossi")).toHaveTextContent("Allenatore");
    expect(rowOf(list, "Luca Neri")).toHaveTextContent("Disattivato");
    expect(rowOf(list, "Luca Neri")).toHaveTextContent("Email non verificata");
    expect(rowOf(list, "Luca Neri")).toHaveTextContent("Non ha ancora fatto accesso");
    await expectNoA11yViolations(container);
  });

  it("offers the actions only to who may use them, and never to disable or remove oneself", async () => {
    stubApi({ "GET /users": () => json(200, page([RITA, MARCO, LUCA])) });
    renderWithProviders(<PeopleSection />);
    const list = await screen.findByRole("list", { name: "Persone con accesso" });

    const own = rowOf(list, "Rita Bianchi");
    expect(within(own).getByRole("button", { name: "Cambia i ruoli di Rita Bianchi" })).toBeInTheDocument();
    expect(within(own).queryByRole("button", { name: /Disattiva/ })).not.toBeInTheDocument();
    expect(within(own).queryByRole("button", { name: /Rimuovi / })).not.toBeInTheDocument();
    const disabled = rowOf(list, "Luca Neri");
    expect(within(disabled).getByRole("button", { name: "Riattiva l'account di Luca Neri" })).toBeInTheDocument();
    expect(within(disabled).queryByRole("button", { name: /Disattiva/ })).not.toBeInTheDocument();
  });

  it("is read-only for the secretary", async () => {
    auth.permissions = ["users:read"];
    stubApi({ "GET /users": () => json(200, page([RITA, MARCO])) });
    renderWithProviders(<PeopleSection />);
    const list = await screen.findByRole("list", { name: "Persone con accesso" });

    expect(within(list).queryByRole("button")).not.toBeInTheDocument();
  });

  it("changes the roles and tells the person that the permissions arrive with the next renewal", async () => {
    const api = stubApi({
      "GET /users": () => json(200, page([RITA, MARCO])),
      "PUT /users/u-2/roles": () => json(200, { ...MARCO, roles: ["ALLENATORE", "SEGRETERIA"] }),
    });
    renderWithProviders(<PeopleSection />);
    await userEvent.click(await screen.findByRole("button", { name: "Cambia i ruoli di Marco Rossi" }));

    const dialog = await screen.findByRole("dialog", { name: "Cambia i ruoli" });
    expect(dialog).toHaveTextContent("al massimo entro 15 minuti");
    expect(within(dialog).getByRole("checkbox", { name: /Allenatore/ })).toBeChecked();
    const save = within(dialog).getByRole("button", { name: "Salva i ruoli" });
    expect(save).toBeDisabled();
    await userEvent.click(within(dialog).getByRole("checkbox", { name: /Segreteria/ }));
    await userEvent.click(save);

    await waitFor(() => expect(api.count("PUT /users/u-2/roles")).toBe(1));
    expect(api.calls.find((call) => call.method === "PUT")?.body).toEqual({ roles: ["SEGRETERIA", "ALLENATORE"] });
    expect(await screen.findByText("Ruoli aggiornati")).toBeInTheDocument();
  });

  it("does not let a person end up with no role and explains the refusal of the last administrator", async () => {
    stubApi({ "GET /users": () => json(200, page([RITA, MARCO])), "PUT /users/u-1/roles": () => problem(409, "last_admin") });
    renderWithProviders(<PeopleSection />);
    await userEvent.click(await screen.findByRole("button", { name: "Cambia i ruoli di Rita Bianchi" }));
    const dialog = await screen.findByRole("dialog", { name: "Cambia i ruoli" });

    await userEvent.click(within(dialog).getByRole("checkbox", { name: /Amministratore/ }));
    expect(within(dialog).getByRole("button", { name: "Salva i ruoli" })).toBeDisabled();
    expect(dialog).toHaveTextContent("Scegli almeno un ruolo");
    await userEvent.click(within(dialog).getByRole("checkbox", { name: /Staff/ }));
    await userEvent.click(within(dialog).getByRole("button", { name: "Salva i ruoli" }));

    expect(await within(dialog).findByRole("alert")).toHaveTextContent("almeno un amministratore attivo");
  });

  it("deactivates after asking and says what happens", async () => {
    const api = stubApi({ "GET /users": () => json(200, page([RITA, MARCO])), "POST /users/u-2/deactivate": () => json(200, { ...MARCO, isActive: false }) });
    renderWithProviders(<PeopleSection />);
    await userEvent.click(await screen.findByRole("button", { name: "Disattiva l'account di Marco Rossi" }));

    const dialog = await screen.findByRole("dialog", { name: "Disattivare l'account?" });
    expect(dialog).toHaveTextContent("uscirà subito da tutti i dispositivi");
    await userEvent.click(within(dialog).getByRole("button", { name: "Disattiva" }));

    await waitFor(() => expect(api.count("POST /users/u-2/deactivate")).toBe(1));
    expect(await screen.findByText("Account disattivato")).toBeInTheDocument();
  });

  it("reactivates and removes, each after asking", async () => {
    const api = stubApi({
      "GET /users": () => json(200, page([RITA, MARCO, LUCA])),
      "POST /users/u-3/reactivate": () => json(200, { ...LUCA, isActive: true }),
      "DELETE /users/u-2": () => new Response(null, { status: 204 }),
    });
    renderWithProviders(<PeopleSection />);
    await userEvent.click(await screen.findByRole("button", { name: "Riattiva l'account di Luca Neri" }));
    await userEvent.click(within(await screen.findByRole("dialog", { name: "Riattivare l'account?" })).getByRole("button", { name: "Riattiva" }));
    await waitFor(() => expect(api.count("POST /users/u-3/reactivate")).toBe(1));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());

    await userEvent.click(screen.getByRole("button", { name: "Rimuovi Marco Rossi dalla società" }));
    const dialog = await screen.findByRole("dialog", { name: "Togliere la persona dalla società?" });
    expect(dialog).toHaveTextContent("non si cancella nulla di personale");
    await userEvent.click(within(dialog).getByRole("button", { name: "Rimuovi" }));
    await waitFor(() => expect(api.count("DELETE /users/u-2")).toBe(1));
  });

  it("explains a refusal inside the dialog and keeps it open", async () => {
    stubApi({ "GET /users": () => json(200, page([RITA, MARCO])), "POST /users/u-2/deactivate": () => problem(409, "last_admin") });
    renderWithProviders(<PeopleSection />);
    await userEvent.click(await screen.findByRole("button", { name: "Disattiva l'account di Marco Rossi" }));
    const dialog = await screen.findByRole("dialog");
    await userEvent.click(within(dialog).getByRole("button", { name: "Disattiva" }));

    expect(await within(dialog).findByRole("alert")).toBeInTheDocument();
  });

  it("shows who changed what and when", async () => {
    stubApi({ "GET /users": () => json(200, page([RITA, MARCO])), "GET /users/u-2/audit": () => json(200, page([ENTRY])) });
    renderWithProviders(<PeopleSection />);
    await userEvent.click(await screen.findByRole("button", { name: "Storia delle modifiche di Marco Rossi" }));

    const dialog = await screen.findByRole("dialog", { name: "Storia delle modifiche" });
    const item = await within(dialog).findByRole("listitem");
    expect(item).toHaveTextContent("Ruoli cambiati");
    expect(item).toHaveTextContent("Staff → Allenatore");
    expect(item).toHaveTextContent("Rita Bianchi");
  });

  it("shows an error with a retry, then the people", async () => {
    let attempts = 0;
    stubApi({ "GET /users": () => (++attempts === 1 ? problem(500, "internal") : json(200, page([RITA]))) });
    renderWithProviders(<PeopleSection />);

    expect(await screen.findByText("Il servizio non è disponibile al momento. Riprova tra poco.")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Riprova" }));
    expect(await screen.findByText("Rita Bianchi")).toBeInTheDocument();
  });
});
