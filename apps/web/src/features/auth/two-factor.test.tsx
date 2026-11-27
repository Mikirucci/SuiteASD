import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, type TwoFactorChallenge } from "@/lib/api";
import { expectNoA11yViolations } from "@/test/a11y";
import { LoginForm } from "./login-form";
import { TwoFactorBanner } from "./two-factor-banner";

vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams("") }));

const auth = vi.hoisted(() => ({
  login: vi.fn(),
  verifyTwoFactor: vi.fn(),
  me: null as null | { user: { twoFactorEnabled: boolean; twoFactorRequired: boolean; twoFactorGraceEndsAt: string | null } },
}));
vi.mock("./auth-provider", () => ({
  useAuth: () => ({ status: "unauthenticated", me: auth.me, login: auth.login, verifyTwoFactor: auth.verifyTwoFactor }),
}));

const CHALLENGE: TwoFactorChallenge = { twoFactorRequired: true, challengeToken: "ch-1", expiresAt: "2026-11-27T10:05:00Z" };

function problem(status: number, code: string) {
  return new ApiError(status, { type: "about:blank", title: "t", status, code });
}

beforeEach(() => {
  auth.login.mockReset();
  auth.verifyTwoFactor.mockReset();
  auth.me = null;
});

async function signInAndReachTheCode() {
  auth.login.mockResolvedValue(CHALLENGE);
  render(<LoginForm />);
  await userEvent.type(screen.getByLabelText(/^Email/), "presidente@aquilevolley.it");
  await userEvent.type(screen.getByLabelText(/^Password/), "una-password-valida");
  await userEvent.click(screen.getByRole("button", { name: "Accedi" }));
  return screen.findByRole("form", { name: "Verifica in due passaggi" });
}

describe("Sign-in with the second step", () => {
  it("asks for the code of the app and opens the session with it", async () => {
    auth.verifyTwoFactor.mockResolvedValue({});
    const form = await signInAndReachTheCode();

    await userEvent.type(screen.getByLabelText(/^Codice dell'app/), "123456");
    await userEvent.click(screen.getByRole("button", { name: "Verifica" }));

    await waitFor(() => expect(auth.verifyTwoFactor).toHaveBeenCalledWith({ challengeToken: "ch-1", code: "123456" }));
    await expectNoA11yViolations(form);
  });

  it("checks the six digits before sending and says when the code is wrong", async () => {
    auth.verifyTwoFactor.mockRejectedValue(problem(422, "invalid_two_factor_code"));
    await signInAndReachTheCode();

    await userEvent.type(screen.getByLabelText(/^Codice dell'app/), "12");
    await userEvent.click(screen.getByRole("button", { name: "Verifica" }));
    expect(await screen.findByText("Scrivi le 6 cifre che vedi nell'app.")).toBeInTheDocument();
    expect(auth.verifyTwoFactor).not.toHaveBeenCalled();

    await userEvent.clear(screen.getByLabelText(/^Codice dell'app/));
    await userEvent.type(screen.getByLabelText(/^Codice dell'app/), "654321");
    await userEvent.click(screen.getByRole("button", { name: "Verifica" }));
    expect(await screen.findByText("Codice non corretto. Controlla l'app e riprova.")).toBeInTheDocument();
  });

  it("accepts a recovery code for who lost the phone", async () => {
    auth.verifyTwoFactor.mockResolvedValue({});
    await signInAndReachTheCode();

    await userEvent.click(screen.getByRole("button", { name: /Usa un codice di recupero/ }));
    await userEvent.type(screen.getByLabelText(/^Codice di recupero/), "abcd-efgh-ijkl-mnop");
    await userEvent.click(screen.getByRole("button", { name: "Verifica" }));

    await waitFor(() => expect(auth.verifyTwoFactor).toHaveBeenCalledWith({ challengeToken: "ch-1", code: "abcd-efgh-ijkl-mnop" }));
  });

  it("goes back to the password when the time for the code is over", async () => {
    auth.verifyTwoFactor.mockRejectedValue(problem(401, "invalid_two_factor_challenge"));
    await signInAndReachTheCode();

    await userEvent.type(screen.getByLabelText(/^Codice dell'app/), "123456");
    await userEvent.click(screen.getByRole("button", { name: "Verifica" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Il tempo per inserire il codice è finito. Accedi di nuovo.");
    expect(screen.getByRole("button", { name: "Accedi" })).toBeInTheDocument();
  });
});

describe("TwoFactorBanner", () => {
  it("reminds the administration until the second step is on", () => {
    auth.me = { user: { twoFactorEnabled: false, twoFactorRequired: true, twoFactorGraceEndsAt: "2099-12-11T10:00:00Z" } };
    render(<TwoFactorBanner />);
    expect(screen.getByRole("region", { name: "Attiva la verifica in due passaggi" })).toHaveTextContent("11 dic 2099");
    expect(screen.getByRole("link", { name: "Attivala ora" })).toHaveAttribute("href", "/account");
  });

  it("says what is blocked once the date has passed", () => {
    auth.me = { user: { twoFactorEnabled: false, twoFactorRequired: true, twoFactorGraceEndsAt: "2020-01-01T10:00:00Z" } };
    render(<TwoFactorBanner />);
    expect(screen.getByRole("region")).toHaveTextContent("non puoi gestire inviti, account e dati della società");
  });

  it("stays away when it is on or not required", () => {
    auth.me = { user: { twoFactorEnabled: true, twoFactorRequired: true, twoFactorGraceEndsAt: null } };
    const { rerender } = render(<TwoFactorBanner />);
    expect(screen.queryByRole("region")).not.toBeInTheDocument();
    auth.me = { user: { twoFactorEnabled: false, twoFactorRequired: false, twoFactorGraceEndsAt: null } };
    rerender(<TwoFactorBanner />);
    expect(screen.queryByRole("region")).not.toBeInTheDocument();
  });
});
