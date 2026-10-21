import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Role } from "@/lib/api";
import { expectNoA11yViolations } from "@/test/a11y";
import { json, page, problem, renderWithProviders, stubApi } from "@/test/stub-api";
import type { CreatedInvitation, Invitation } from "./invitation-format";
import { InvitationsPage } from "./invitations-page";

const auth = vi.hoisted(() => ({ permissions: [] as string[], roles: [] as string[] }));
vi.mock("@/features/auth/auth-provider", () => ({
  useAuth: () => ({ status: "authenticated", me: { permissions: auth.permissions, roles: auth.roles } }),
}));

const DAY_MS = 24 * 60 * 60 * 1000;
const inDays = (days: number) => new Date(Date.now() + days * DAY_MS).toISOString();

function invitation(overrides: Partial<Invitation> = {}): Invitation {
  return {
    id: "inv-1",
    email: "marco.allenatore@example.test",
    label: null,
    role: "ALLENATORE",
    memberId: null,
    expiresAt: inDays(5),
    createdAt: inDays(-2),
    ...overrides,
  };
}

const COACH = invitation();
const LINK = invitation({ id: "inv-4", email: null, label: "Marco, nuovo allenatore U14", expiresAt: inDays(7) });
const SECRETARY = invitation({ id: "inv-2", email: "luca@example.test", role: "SEGRETERIA", expiresAt: inDays(1) });

function setUser(roles: Role[], permissions: string[]) {
  auth.roles = roles;
  auth.permissions = permissions;
}

beforeEach(() => {
  setUser(["ADMIN"], ["invitations:read", "invitations:write"]);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function routes(extra: Parameters<typeof stubApi>[0] = {}) {
  return { "GET /invitations": () => json(200, page([COACH, SECRETARY])), ...extra };
}

describe("InvitationsPage", () => {
  it("shows a loading state, then the pending invitations with role and expiry", async () => {
    stubApi(routes());
    const { container } = renderWithProviders(<InvitationsPage />);
    expect(screen.getByRole("status", { name: "Caricamento degli inviti" })).toBeInTheDocument();

    const list = await screen.findByRole("list", { name: "Inviti in attesa" });
    const [first, second] = within(list).getAllByRole("listitem");
    expect(first).toHaveTextContent("marco.allenatore@example.test");
    expect(first).toHaveTextContent("Allenatore · Scade tra 5 giorni");
    expect(first).toHaveTextContent("In attesa");
    expect(second).toHaveTextContent("Segreteria · Scade domani");
    await expectNoA11yViolations(container);
  });

  it("names a link by its note, or by its role when it has none, and never shows an email it does not have", async () => {
    const bare = invitation({ id: "inv-5", email: null, label: null, role: "STAFF" });
    stubApi(routes({ "GET /invitations": () => json(200, page([LINK, bare])) }));
    renderWithProviders(<InvitationsPage />);
    const list = await screen.findByRole("list", { name: "Inviti in attesa" });
    const [noted, plain] = within(list).getAllByRole("listitem");
    expect(noted).toHaveTextContent("Marco, nuovo allenatore U14");
    expect(noted).toHaveTextContent("Allenatore · Scade tra 7 giorni");
    expect(plain).toHaveTextContent("Invito come staff");
    expect(within(noted as HTMLElement).getByRole("button", { name: "Revoca l'invito: Marco, nuovo allenatore U14" })).toBeInTheDocument();
    expect(list).not.toHaveTextContent("null");
  });

  it("says what happens when the link is used: it leaves the list, the person is in Staff and an alert arrives", async () => {
    stubApi(routes());
    renderWithProviders(<InvitationsPage />);
    expect(await screen.findByText(/la persona compare in Staff e ricevi un avviso/)).toBeInTheDocument();
  });

  it("invites the first collaborator when there are no invitations", async () => {
    stubApi(routes({ "GET /invitations": () => json(200, page([])) }));
    renderWithProviders(<InvitationsPage />);
    expect(await screen.findByRole("heading", { name: "Nessun invito in attesa" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Invita una persona" })).toBeInTheDocument();
  });

  it("shows the error in Italian and reloads with Riprova", async () => {
    let attempts = 0;
    stubApi(routes({ "GET /invitations": () => (++attempts === 1 ? problem(500, "internal") : json(200, page([COACH]))) }));
    renderWithProviders(<InvitationsPage />);
    expect(await screen.findByText(/Il servizio non è disponibile/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Riprova" }));
    expect(await screen.findByText("marco.allenatore@example.test")).toBeInTheDocument();
  });

  it("creates a link without asking for an email, and shows the one-time link to copy", async () => {
    const writeText = vi.fn<(text: string) => Promise<void>>().mockResolvedValue(undefined);
    const created: CreatedInvitation = { ...LINK, role: "STAFF", token: "tok_ABC-123" };
    const api = stubApi(routes({ "POST /invitations": () => json(201, created) }));
    renderWithProviders(<InvitationsPage />);
    await userEvent.click(await screen.findByRole("button", { name: "Invita una persona" }));

    const dialog = await screen.findByRole("dialog", { name: "Invita una persona" });
    // Nothing is sent by email, so nobody is asked for one
    expect(within(dialog).queryByLabelText(/Email/)).not.toBeInTheDocument();
    const select = within(dialog).getByLabelText(/^Ruolo/);
    expect(select).toHaveValue("ALLENATORE");
    expect(within(select).getAllByRole("option").map((option) => option.textContent)).toEqual([
      "Amministratore",
      "Segreteria",
      "Allenatore",
      "Staff",
    ]);
    await userEvent.type(within(dialog).getByLabelText("Per chi è"), " Marco, nuovo allenatore U14 ");
    await userEvent.selectOptions(select, "STAFF");
    expect(dialog).toHaveTextContent("Vede tesserati e documenti");
    await userEvent.click(within(dialog).getByRole("button", { name: "Crea il link" }));

    const result = await screen.findByRole("dialog", { name: "Link pronto" });
    expect(api.calls.find((call) => call.method === "POST")?.body).toEqual({ role: "STAFF", label: "Marco, nuovo allenatore U14" });
    expect(result).toHaveTextContent("Marco, nuovo allenatore U14: entrerà come staff.");
    expect(result).toHaveTextContent(`${window.location.origin}/invito/tok_ABC-123`);
    // The truth about the delivery: the platform does not send emails yet
    expect(result).toHaveTextContent("Per ora l'app non invia email");
    expect(result).toHaveTextContent("Chi lo apre scrive nome, email e password ed entra");

    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    await userEvent.click(within(result).getByRole("button", { name: "Copia il link" }));
    expect(await screen.findByText("Link copiato")).toBeInTheDocument();
    expect(writeText).toHaveBeenCalledWith(`${window.location.origin}/invito/tok_ABC-123`);

    await userEvent.click(within(result).getByRole("button", { name: "Fatto" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("sends the note only when it is written", async () => {
    const api = stubApi(routes({ "POST /invitations": () => json(201, { ...LINK, label: null, token: "tok_X" }) }));
    renderWithProviders(<InvitationsPage />);
    await userEvent.click(await screen.findByRole("button", { name: "Invita una persona" }));
    const dialog = await screen.findByRole("dialog", { name: "Invita una persona" });
    await userEvent.click(within(dialog).getByRole("button", { name: "Crea il link" }));
    await screen.findByRole("dialog", { name: "Link pronto" });
    expect(api.calls.find((call) => call.method === "POST")?.body).toEqual({ role: "ALLENATORE" });
  });

  it("never shows the link of a previous invitation when the dialog is opened again", async () => {
    const created: CreatedInvitation = { ...LINK, token: "tok_ONCE" };
    stubApi(routes({ "POST /invitations": () => json(201, created) }));
    renderWithProviders(<InvitationsPage />);
    await userEvent.click(await screen.findByRole("button", { name: "Invita una persona" }));
    await userEvent.type(await screen.findByLabelText("Per chi è"), "Marco");
    await userEvent.click(screen.getByRole("button", { name: "Crea il link" }));
    await userEvent.click(await screen.findByRole("button", { name: "Fatto" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());

    await userEvent.click(screen.getByRole("button", { name: "Invita una persona" }));
    const dialog = await screen.findByRole("dialog", { name: "Invita una persona" });
    expect(within(dialog).getByLabelText("Per chi è")).toHaveValue("");
    expect(dialog).not.toHaveTextContent("tok_ONCE");
  });

  it("limits the note to 80 characters in the field itself", async () => {
    stubApi(routes());
    renderWithProviders(<InvitationsPage />);
    await userEvent.click(await screen.findByRole("button", { name: "Invita una persona" }));
    const dialog = await screen.findByRole("dialog", { name: "Invita una persona" });
    expect(within(dialog).getByLabelText("Per chi è")).toHaveAttribute("maxlength", "80");
  });

  it.each([
    [403, "forbidden", "Non puoi invitare una persona con questo ruolo."],
    [422, "validation_error", "Alcuni dati non sono validi"],
    [500, "internal", "Il servizio non è disponibile al momento"],
  ])("explains a refused invitation (%i)", async (status, code, message) => {
    stubApi(routes({ "POST /invitations": () => problem(status, code) }));
    renderWithProviders(<InvitationsPage />);
    await userEvent.click(await screen.findByRole("button", { name: "Invita una persona" }));
    const dialog = await screen.findByRole("dialog", { name: "Invita una persona" });
    await userEvent.click(within(dialog).getByRole("button", { name: "Crea il link" }));
    expect(await within(dialog).findByRole("alert")).toHaveTextContent(message);
  });

  it("offers the secretary only the roles they may grant", async () => {
    setUser(["SEGRETERIA"], ["invitations:read", "invitations:write"]);
    stubApi(routes());
    renderWithProviders(<InvitationsPage />);
    await userEvent.click(await screen.findByRole("button", { name: "Invita una persona" }));
    const select = within(await screen.findByRole("dialog")).getByLabelText(/^Ruolo/);
    expect(within(select).getAllByRole("option").map((option) => option.textContent)).toEqual(["Allenatore", "Staff"]);
  });

  it("revokes an invitation after the confirmation", async () => {
    let invitations = [COACH, SECRETARY];
    const api = stubApi({
      "GET /invitations": () => json(200, page(invitations)),
      "DELETE /invitations/inv-1": () => {
        invitations = [SECRETARY];
        return json(204);
      },
    });
    renderWithProviders(<InvitationsPage />);
    await userEvent.click(await screen.findByRole("button", { name: "Revoca l'invito: marco.allenatore@example.test" }));
    const confirm = await screen.findByRole("dialog", { name: "Revocare l'invito?" });
    expect(confirm).toHaveTextContent("Il link «marco.allenatore@example.test» smette di funzionare subito.");
    await userEvent.click(within(confirm).getByRole("button", { name: "Revoca" }));

    expect(await screen.findByText("Invito revocato")).toBeInTheDocument();
    expect(api.calls.some((call) => call.method === "DELETE" && call.path === "/invitations/inv-1")).toBe(true);
    // The toast also names the invitation: the list is what must have lost the row
    await waitFor(() =>
      expect(within(screen.getByRole("list", { name: "Inviti in attesa" })).queryByText("marco.allenatore@example.test")).not.toBeInTheDocument(),
    );
  });

  it("explains an invitation that is no longer pending when revoking it fails", async () => {
    stubApi(routes({ "DELETE /invitations/inv-1": () => problem(404, "not_found") }));
    renderWithProviders(<InvitationsPage />);
    await userEvent.click(await screen.findByRole("button", { name: "Revoca l'invito: marco.allenatore@example.test" }));
    const confirm = await screen.findByRole("dialog", { name: "Revocare l'invito?" });
    await userEvent.click(within(confirm).getByRole("button", { name: "Revoca" }));
    expect(await within(confirm).findByRole("alert")).toHaveTextContent("L'invito non è più in attesa");
  });

  it("lets a reader see the invitations but not change them", async () => {
    setUser(["ADMIN"], ["invitations:read"]);
    stubApi(routes());
    renderWithProviders(<InvitationsPage />);
    await screen.findByRole("list", { name: "Inviti in attesa" });
    expect(screen.queryByRole("button", { name: "Invita una persona" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Revoca/ })).not.toBeInTheDocument();
  });

  it("does not ask for the invitations, and says why, without the read permission", async () => {
    setUser(["ALLENATORE"], []);
    const api = stubApi(routes());
    renderWithProviders(<InvitationsPage />);
    expect(await screen.findByRole("heading", { name: "Non hai accesso a questa sezione" })).toBeInTheDocument();
    expect(api.calls).toHaveLength(0);
  });
});
