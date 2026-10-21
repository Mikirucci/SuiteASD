import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { expectNoA11yViolations } from "@/test/a11y";
import { json, problem, renderWithProviders, stubApi } from "@/test/stub-api";
import { AcceptInvitationPage } from "./accept-invitation-page";

const mocks = vi.hoisted(() => ({
  replace: vi.fn<(url: string) => void>(),
  adoptSession: vi.fn<(session: unknown) => Promise<void>>(),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: mocks.replace }) }));
vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: { href: string; children: ReactNode } & Record<string, unknown>) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));
vi.mock("@/features/auth/auth-provider", () => ({
  useAuth: () => ({ status: "unauthenticated", me: null, adoptSession: mocks.adoptSession }),
}));

const SESSION = { accessToken: "a", refreshToken: "r", roles: ["ALLENATORE"] };
const INFO = { society: { name: "Aquile Volley" }, role: "ALLENATORE", maskedEmail: "m***@example.test" };
const info = () => json(200, INFO);

beforeEach(() => {
  mocks.replace.mockReset();
  mocks.adoptSession.mockReset();
  mocks.adoptSession.mockResolvedValue(undefined);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const TITLE = "Sei stato invitato da Aquile Volley come allenatore.";

/** Renders the page and waits for the invitation to be read, so the form is on screen. */
async function openPage(token: string) {
  const view = renderWithProviders(<AcceptInvitationPage token={token} />);
  await screen.findByRole("heading", { level: 1, name: TITLE });
  return view;
}

async function fill({ first = "Marco", last = "Bianchi", password = "Sup3rSegreta!" } = {}) {
  if (first) await userEvent.type(screen.getByLabelText("Nome"), first);
  if (last) await userEvent.type(screen.getByLabelText("Cognome"), last);
  await userEvent.type(screen.getByLabelText(/^Password/), password);
}

const submit = () => userEvent.click(screen.getByRole("button", { name: "Entra nella società" }));

describe("AcceptInvitationPage", () => {
  it("says which society invites, as what, and for which email", async () => {
    stubApi({ "GET /invitations/tok": info });
    const { container } = await openPage("tok");
    expect(screen.getByText(/L'invito è per m\*\*\*@example\.test/)).toBeInTheDocument();
    expect(screen.getByText("Solo se non hai ancora un account.")).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it.each([
    ["ADMIN", "amministratore"],
    ["SEGRETERIA", "segreteria"],
    ["STAFF", "staff"],
    ["ATLETA", "atleta"],
    ["GENITORE", "genitore"],
  ])("names the role %s in Italian", async (role, label) => {
    stubApi({ "GET /invitations/tok": () => json(200, { ...INFO, role }) });
    renderWithProviders(<AcceptInvitationPage token="tok" />);
    expect(await screen.findByRole("heading", { level: 1, name: `Sei stato invitato da Aquile Volley come ${label}.` })).toBeInTheDocument();
  });

  describe("a link that names nobody", () => {
    const NAMELESS = { ...INFO, maskedEmail: null };

    it("asks for the email and explains that it is the one of the new access", async () => {
      stubApi({ "GET /invitations/tok": () => json(200, NAMELESS) });
      const { container } = await openPage("tok");
      expect(screen.getByLabelText(/^Email/)).toBeInTheDocument();
      expect(screen.getByText(/Scrivi la tua email e scegli una password/)).toBeInTheDocument();
      expect(screen.queryByText(/L'invito è per/)).not.toBeInTheDocument();
      await expectNoA11yViolations(container);
    });

    it("sends the email with the name and the password, and signs the person in", async () => {
      const api = stubApi({ "GET /invitations/tok": () => json(200, NAMELESS), "POST /invitations/accept": () => json(200, SESSION) });
      await openPage("tok");
      await userEvent.type(screen.getByLabelText(/^Email/), " marco@example.test ");
      await fill();
      await submit();
      await vi.waitFor(() => expect(mocks.replace).toHaveBeenCalledWith("/"));
      expect(api.calls.find((call) => call.method === "POST")?.body).toEqual({
        token: "tok",
        password: "Sup3rSegreta!",
        email: "marco@example.test",
        firstName: "Marco",
        lastName: "Bianchi",
      });
    });

    it("checks the email before calling the API", async () => {
      const api = stubApi({ "GET /invitations/tok": () => json(200, NAMELESS) });
      await openPage("tok");
      await userEvent.type(screen.getByLabelText(/^Email/), "non-una-email");
      await fill();
      await submit();
      expect(await screen.findByText("Inserisci un'email valida")).toBeInTheDocument();
      expect(api.calls.some((call) => call.method === "POST")).toBe(false);
    });

    it("shows the error of the email when the server asks for it", async () => {
      stubApi({ "GET /invitations/tok": () => json(200, NAMELESS), "POST /invitations/accept": () => problem(422, "email_required") });
      await openPage("tok");
      await userEvent.type(screen.getByLabelText(/^Email/), "marco@example.test");
      await fill();
      await submit();
      expect(await screen.findByText("Scrivi la tua email: serve per creare il tuo accesso.")).toBeInTheDocument();
    });

    it("does not ask for the email, nor send one, when the invitation already names it", async () => {
      const api = stubApi({ "GET /invitations/tok": info, "POST /invitations/accept": () => json(200, SESSION) });
      await openPage("tok");
      expect(screen.queryByLabelText(/^Email/)).not.toBeInTheDocument();
      await fill();
      await submit();
      await vi.waitFor(() => expect(mocks.replace).toHaveBeenCalled());
      expect(api.calls.find((call) => call.method === "POST")?.body).not.toHaveProperty("email");
    });
  });

  it("shows a loading state while the invitation is read, without the form", () => {
    stubApi({ "GET /invitations/tok": () => new Promise<Response>(() => undefined) });
    renderWithProviders(<AcceptInvitationPage token="tok" />);
    expect(screen.getByRole("status", { name: "Caricamento dell'invito" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Entra nella società" })).not.toBeInTheDocument();
  });

  it.each([
    ["invitation_expired", "Questo invito è scaduto."],
    ["invitation_revoked", "Questo invito è stato annullato."],
    ["invitation_used", "Questo invito è già stato usato."],
  ])("closes the page before any typing when the invitation is gone: %s", async (code, message) => {
    stubApi({ "GET /invitations/tok": () => problem(410, code) });
    renderWithProviders(<AcceptInvitationPage token="tok" />);
    expect(await screen.findByRole("heading", { name: "Invito non utilizzabile" })).toBeInTheDocument();
    expect(screen.getByText(new RegExp(message))).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Vai all'accesso" })).toHaveAttribute("href", "/login");
    expect(screen.queryByRole("button", { name: "Entra nella società" })).not.toBeInTheDocument();
  });

  it("says when the invitation does not exist", async () => {
    stubApi({ "GET /invitations/tok": () => problem(404, "not_found") });
    renderWithProviders(<AcceptInvitationPage token="tok" />);
    expect(await screen.findByText(/Questo invito non esiste/)).toBeInTheDocument();
  });

  it("offers a retry when the invitation cannot be read", async () => {
    let attempts = 0;
    stubApi({ "GET /invitations/tok": () => (++attempts === 1 ? problem(500, "internal") : info()) });
    renderWithProviders(<AcceptInvitationPage token="tok" />);
    const alert = await screen.findByRole("alert");
    await userEvent.click(within(alert).getByRole("button"));
    expect(await screen.findByRole("heading", { level: 1, name: TITLE })).toBeInTheDocument();
  });

  it("creates the account, signs in and takes a collaborator to the administration", async () => {
    const api = stubApi({ "GET /invitations/tok_ABC-123": info, "POST /invitations/accept": () => json(200, SESSION) });
    await openPage("tok_ABC-123");
    await fill();
    await submit();

    await vi.waitFor(() => expect(mocks.replace).toHaveBeenCalledWith("/"));
    expect(mocks.adoptSession).toHaveBeenCalledWith(SESSION);
    expect(api.calls.find((call) => call.method === "POST")?.body).toEqual({
      token: "tok_ABC-123",
      password: "Sup3rSegreta!",
      firstName: "Marco",
      lastName: "Bianchi",
    });
  });

  it("sends only the password when the person already has an account", async () => {
    const api = stubApi({ "GET /invitations/tok": info, "POST /invitations/accept": () => json(200, SESSION) });
    await openPage("tok");
    await fill({ first: "", last: "" });
    await submit();
    await vi.waitFor(() => expect(mocks.replace).toHaveBeenCalled());
    expect(api.calls.find((call) => call.method === "POST")?.body).toEqual({ token: "tok", password: "Sup3rSegreta!" });
  });

  it("sends a person with a personal role to their own area", async () => {
    stubApi({ "GET /invitations/tok": info, "POST /invitations/accept": () => json(200, { ...SESSION, roles: ["GENITORE"] }) });
    await openPage("tok");
    await fill();
    await submit();
    await vi.waitFor(() => expect(mocks.replace).toHaveBeenCalledWith("/area-personale"));
  });

  it("checks the password before calling the API", async () => {
    const api = stubApi({ "GET /invitations/tok": info });
    await openPage("tok");
    await fill({ password: "corta" });
    await submit();
    expect(await screen.findByText("La password deve avere almeno 8 caratteri")).toBeInTheDocument();
    expect(api.calls.filter((call) => call.method === "POST")).toHaveLength(0);
  });

  it("asks for the name when the invited email has no account yet", async () => {
    stubApi({ "GET /invitations/tok": info, "POST /invitations/accept": () => problem(422, "profile_required") });
    await openPage("tok");
    await fill({ first: "", last: "" });
    await submit();
    expect(await screen.findByRole("alert")).toHaveTextContent("Per creare il tuo accesso servono nome e cognome.");
    expect(screen.getAllByText("Scrivilo: serve per creare il tuo accesso.")).toHaveLength(2);
    expect(mocks.replace).not.toHaveBeenCalled();
  });

  it("tells somebody with an account that the password does not match", async () => {
    stubApi({ "GET /invitations/tok": info, "POST /invitations/accept": () => problem(401, "unauthorized") });
    await openPage("tok");
    await fill({ first: "", last: "" });
    await submit();
    expect(await screen.findByRole("alert")).toHaveTextContent("scrivi la password del tuo account");
  });

  it("closes the page when the invitation is used in the meantime", async () => {
    stubApi({ "GET /invitations/tok": info, "POST /invitations/accept": () => problem(422, "invalid_invitation") });
    await openPage("tok");
    await fill();
    await submit();
    expect(await screen.findByRole("heading", { name: "Invito non utilizzabile" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Vai all'accesso" })).toHaveAttribute("href", "/login");
    expect(screen.queryByRole("button", { name: "Entra nella società" })).not.toBeInTheDocument();
  });

  it("shows the generic message for any other failure and keeps the form", async () => {
    stubApi({ "GET /invitations/tok": info, "POST /invitations/accept": () => problem(500, "internal") });
    await openPage("tok");
    await fill();
    await submit();
    expect(await screen.findByRole("alert")).toHaveTextContent("Il servizio non è disponibile al momento");
    expect(screen.getByRole("button", { name: "Entra nella società" })).toBeEnabled();
  });
});
