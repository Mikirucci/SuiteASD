import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { expectNoA11yViolations } from "@/test/a11y";
import { problem, renderWithProviders, stubApi } from "@/test/stub-api";
import { EmailVerificationBanner } from "./email-verification-banner";
import { ForgotPasswordForm } from "./forgot-password-form";
import { ResetPasswordForm } from "./reset-password-form";
import { VerifyEmailPage } from "./verify-email-page";

const nav = vi.hoisted(() => ({ search: "", replace: vi.fn() }));
vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(nav.search),
  useRouter: () => ({ replace: nav.replace }),
}));

type MockedMe = { user: { email: string; emailVerified: boolean } };
const auth = vi.hoisted(() => ({
  state: { status: "unauthenticated", me: null } as { status: "unauthenticated" | "authenticated"; me: unknown },
  logout: vi.fn(),
  refresh: vi.fn(),
}));
vi.mock("./auth-provider", () => ({
  useAuth: () => ({ ...auth.state, logout: auth.logout, refresh: auth.refresh }),
}));

beforeEach(() => {
  nav.search = "";
  nav.replace.mockReset();
  auth.state = { status: "unauthenticated", me: null };
  auth.logout.mockReset();
  auth.logout.mockResolvedValue(undefined);
  auth.refresh.mockReset();
  auth.refresh.mockResolvedValue(undefined);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("ForgotPasswordForm", () => {
  it("validates the email before calling the API", async () => {
    const api = stubApi({});
    render(<ForgotPasswordForm />);
    await userEvent.click(screen.getByRole("button", { name: "Mandami il link" }));

    expect(await screen.findByText("Inserisci un'email valida")).toBeInTheDocument();
    expect(api.calls).toHaveLength(0);
  });

  it("asks for the link and answers the same whatever the address", async () => {
    const api = stubApi({ "POST /auth/password/forgot": () => new Response(null, { status: 204 }) });
    const { container } = render(<ForgotPasswordForm />);
    await expectNoA11yViolations(container);

    await userEvent.type(screen.getByLabelText(/^Email/), "  sconosciuta@example.test ");
    await userEvent.click(screen.getByRole("button", { name: "Mandami il link" }));

    expect(await screen.findByText("Richiesta inviata")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("sconosciuta@example.test");
    expect(api.calls[0]?.body).toEqual({ email: "sconosciuta@example.test" });
    await userEvent.click(screen.getByRole("button", { name: "Usa un altro indirizzo" }));
    expect(screen.getByLabelText(/^Email/)).toBeInTheDocument();
  });

  it("says when there are too many attempts", async () => {
    stubApi({ "POST /auth/password/forgot": () => problem(429, "rate_limited") });
    render(<ForgotPasswordForm />);
    await userEvent.type(screen.getByLabelText(/^Email/), "a@b.it");
    await userEvent.click(screen.getByRole("button", { name: "Mandami il link" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Troppi tentativi");
  });
});

describe("ResetPasswordForm", () => {
  async function fillAndSubmit(first: string, second: string) {
    await userEvent.type(screen.getByLabelText(/^Nuova password/), first);
    await userEvent.type(screen.getByLabelText(/^Ripeti la password/), second);
    await userEvent.click(screen.getByRole("button", { name: "Salva la nuova password" }));
  }

  it("asks for a new link when the address carries no token", () => {
    render(<ResetPasswordForm />);
    expect(screen.getByRole("heading", { name: "Link non valido o scaduto" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Richiedi un nuovo link" })).toHaveAttribute("href", "/password/dimenticata");
  });

  it("checks the two passwords before calling the API", async () => {
    nav.search = "token=abc";
    const api = stubApi({});
    render(<ResetPasswordForm />);
    await fillAndSubmit("una-password-lunga", "un-altra-password");

    expect(await screen.findByText("Le password non coincidono")).toBeInTheDocument();
    expect(api.calls).toHaveLength(0);
  });

  it("saves the password and sends the person to sign in, without a session", async () => {
    nav.search = "token=abc";
    const api = stubApi({ "POST /auth/password/reset": () => new Response(null, { status: 204 }) });
    const { container } = render(<ResetPasswordForm />);
    await expectNoA11yViolations(container);
    await fillAndSubmit("una-password-lunga", "una-password-lunga");

    await waitFor(() => expect(nav.replace).toHaveBeenCalledWith("/login?motivo=password-aggiornata"));
    expect(api.calls[0]?.body).toEqual({ token: "abc", newPassword: "una-password-lunga" });
    expect(auth.logout).not.toHaveBeenCalled();
  });

  it("drops a session still stored on this device", async () => {
    nav.search = "token=abc";
    auth.state = { status: "authenticated", me: null };
    stubApi({ "POST /auth/password/reset": () => new Response(null, { status: 204 }) });
    render(<ResetPasswordForm />);
    await fillAndSubmit("una-password-lunga", "una-password-lunga");

    await waitFor(() => expect(auth.logout).toHaveBeenCalledTimes(1));
  });

  it("explains a link that does not work and offers a new one", async () => {
    nav.search = "token=scaduto";
    stubApi({ "POST /auth/password/reset": () => problem(400, "invalid_reset_token") });
    render(<ResetPasswordForm />);
    await fillAndSubmit("una-password-lunga", "una-password-lunga");

    expect(await screen.findByRole("heading", { name: "Link non valido o scaduto" })).toBeInTheDocument();
    expect(nav.replace).not.toHaveBeenCalled();
  });
});

describe("VerifyEmailPage", () => {
  it("verifies once as soon as it opens and says it worked", async () => {
    nav.search = "token=abc";
    const api = stubApi({ "POST /auth/email/verify": () => new Response(null, { status: 204 }) });
    render(<VerifyEmailPage />);

    expect(await screen.findByRole("heading", { name: "Email verificata" })).toBeInTheDocument();
    expect(api.count("POST /auth/email/verify")).toBe(1);
    expect(api.calls[0]?.body).toEqual({ token: "abc" });
    expect(screen.getByRole("link", { name: "Vai all'accesso" })).toHaveAttribute("href", "/login");
  });

  it("refreshes the profile of a signed-in person, so the banner goes away", async () => {
    nav.search = "token=abc";
    auth.state = { status: "authenticated", me: null };
    stubApi({ "POST /auth/email/verify": () => new Response(null, { status: 204 }) });
    render(<VerifyEmailPage />);

    await screen.findByRole("heading", { name: "Email verificata" });
    await waitFor(() => expect(auth.refresh).toHaveBeenCalledTimes(1));
    expect(screen.getByRole("link", { name: "Vai all'app" })).toHaveAttribute("href", "/");
  });

  it("says when the address carries no token", () => {
    render(<VerifyEmailPage />);
    expect(screen.getByRole("heading", { name: "Link non valido o scaduto" })).toBeInTheDocument();
  });

  it("explains a refused token", async () => {
    nav.search = "token=vecchio";
    stubApi({ "POST /auth/email/verify": () => problem(400, "invalid_verification_token") });
    render(<VerifyEmailPage />);

    expect(await screen.findByRole("heading", { name: "Link non valido o scaduto" })).toBeInTheDocument();
  });

  it("reports a failure that is not about the link", async () => {
    nav.search = "token=abc";
    stubApi({ "POST /auth/email/verify": () => problem(500, "internal") });
    render(<VerifyEmailPage />);

    expect(await screen.findByRole("heading", { name: "Non siamo riusciti a verificare" })).toBeInTheDocument();
    expect(screen.getByText("Il servizio non è disponibile al momento. Riprova tra poco.")).toBeInTheDocument();
  });
});

describe("EmailVerificationBanner", () => {
  const meWith = (emailVerified: boolean): MockedMe => ({ user: { email: "rita@example.test", emailVerified } });

  it("is not there for somebody who verified, or who is not signed in", () => {
    auth.state = { status: "authenticated", me: meWith(true) };
    const { unmount } = renderWithProviders(<EmailVerificationBanner />);
    expect(screen.queryByRole("region", { name: "Verifica la tua email" })).not.toBeInTheDocument();
    unmount();
    auth.state = { status: "unauthenticated", me: null };
    renderWithProviders(<EmailVerificationBanner />);
    expect(screen.queryByRole("region", { name: "Verifica la tua email" })).not.toBeInTheDocument();
  });

  it("reminds and sends the link again", async () => {
    auth.state = { status: "authenticated", me: meWith(false) };
    const api = stubApi({ "POST /auth/email/resend": () => new Response(null, { status: 204 }) });
    const { container } = renderWithProviders(<EmailVerificationBanner />);
    expect(screen.getByRole("region", { name: "Verifica la tua email" })).toHaveTextContent("non puoi invitare persone né pubblicare comunicazioni");
    await expectNoA11yViolations(container);

    await userEvent.click(screen.getByRole("button", { name: "Reinvia l'email" }));

    expect(await screen.findByText("Email inviata")).toBeInTheDocument();
    expect(api.count("POST /auth/email/resend")).toBe(1);
  });

  it("explains when it cannot send", async () => {
    auth.state = { status: "authenticated", me: meWith(false) };
    stubApi({ "POST /auth/email/resend": () => problem(429, "rate_limited") });
    renderWithProviders(<EmailVerificationBanner />);
    await userEvent.click(screen.getByRole("button", { name: "Reinvia l'email" }));

    expect(await screen.findByText("Non siamo riusciti a inviarla")).toBeInTheDocument();
  });
});
