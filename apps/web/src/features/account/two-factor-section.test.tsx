import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { json, problem, renderWithProviders, stubApi } from "@/test/stub-api";
import { TwoFactorSection } from "./two-factor-section";

const auth = vi.hoisted(() => ({
  refresh: vi.fn(),
  user: { twoFactorEnabled: false, twoFactorRequired: true, twoFactorGraceEndsAt: "2099-12-11T10:00:00Z" as string | null },
}));
vi.mock("@/features/auth/auth-provider", () => ({ useAuth: () => ({ me: { user: auth.user }, refresh: auth.refresh }) }));

const CODES = ["AAAA-BBBB-CCCC-DDDD", "EEEE-FFFF-GGGG-HHHH"];

beforeEach(() => {
  auth.refresh.mockReset();
  auth.refresh.mockResolvedValue(undefined);
  auth.user = { twoFactorEnabled: false, twoFactorRequired: true, twoFactorGraceEndsAt: "2099-12-11T10:00:00Z" };
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("TwoFactorSection", () => {
  it("tells an administrator it is required and by when", () => {
    renderWithProviders(<TwoFactorSection />);
    expect(screen.getByText("Non attiva")).toBeInTheDocument();
    expect(screen.getByText(/attivala entro il 11 dic 2099/)).toBeInTheDocument();
  });

  it("turns it on with a code of the app and shows the recovery codes once", async () => {
    const { calls } = stubApi({
      "POST /auth/2fa/setup": () => json(200, { otpauthUri: "otpauth://totp/SuiteASD:rita?secret=JBSWY3DPEHPK3PXP", secret: "JBSWY3DPEHPK3PXP" }),
      "POST /auth/2fa/enable": () => json(200, { recoveryCodes: CODES }),
    });
    renderWithProviders(<TwoFactorSection />);

    await userEvent.click(screen.getByRole("button", { name: "Attiva" }));
    const dialog = await screen.findByRole("dialog", { name: "Attiva la verifica in due passaggi" });
    expect(await within(dialog).findByText("JBSWY3DPEHPK3PXP")).toBeInTheDocument();
    await userEvent.type(within(dialog).getByLabelText(/^Codice dell'app/), "123456");
    await userEvent.click(within(dialog).getByRole("button", { name: "Conferma e attiva" }));

    const codes = await screen.findByRole("list", { name: "Codici di recupero" });
    expect(within(codes).getAllByRole("listitem").map((item) => item.textContent)).toEqual(CODES);
    expect(calls.find((call) => call.path === "/auth/2fa/enable")?.body).toEqual({ code: "123456" });

    await userEvent.click(screen.getByRole("button", { name: "Ho salvato i codici" }));
    await waitFor(() => expect(auth.refresh).toHaveBeenCalled());
  });

  it("keeps the dialog open and says so when the code is wrong", async () => {
    stubApi({
      "POST /auth/2fa/setup": () => json(200, { otpauthUri: "otpauth://totp/x?secret=ABC", secret: "ABC" }),
      "POST /auth/2fa/enable": () => problem(422, "invalid_two_factor_code"),
    });
    renderWithProviders(<TwoFactorSection />);
    await userEvent.click(screen.getByRole("button", { name: "Attiva" }));
    const dialog = await screen.findByRole("dialog");
    await userEvent.type(await within(dialog).findByLabelText(/^Codice dell'app/), "000000");
    await userEvent.click(within(dialog).getByRole("button", { name: "Conferma e attiva" }));
    expect(await within(dialog).findByText(/Codice non corretto/)).toBeInTheDocument();
    expect(auth.refresh).not.toHaveBeenCalled();
  });

  it("turns it off with the password and a code", async () => {
    auth.user = { twoFactorEnabled: true, twoFactorRequired: false, twoFactorGraceEndsAt: null };
    const { calls } = stubApi({ "POST /auth/2fa/disable": () => new Response(null, { status: 204 }) });
    renderWithProviders(<TwoFactorSection />);
    expect(screen.getByText("Attiva")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Disattiva" }));
    const dialog = await screen.findByRole("dialog", { name: "Disattivare la verifica in due passaggi?" });
    await userEvent.type(within(dialog).getByLabelText(/^Password/), "una-password-valida");
    await userEvent.type(within(dialog).getByLabelText(/^Codice dell'app/), "123456");
    await userEvent.click(within(dialog).getByRole("button", { name: "Disattiva" }));

    await waitFor(() => expect(auth.refresh).toHaveBeenCalled());
    expect(calls.find((call) => call.path === "/auth/2fa/disable")?.body).toEqual({ password: "una-password-valida", code: "123456" });
  });
});
