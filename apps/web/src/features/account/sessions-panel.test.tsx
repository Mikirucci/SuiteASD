import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { expectNoA11yViolations } from "@/test/a11y";
import { json, problem, renderWithProviders, stubApi } from "@/test/stub-api";
import { SessionsPanel, type DeviceSession } from "./sessions-panel";

const auth = vi.hoisted(() => ({ logout: vi.fn() }));
vi.mock("@/features/auth/auth-provider", () => ({ useAuth: () => ({ logout: auth.logout }) }));

const CHROME = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130.0.0.0 Safari/537.36";
const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 Version/17.5 Mobile/15E148 Safari/604.1";

const THIS_ONE: DeviceSession = { id: "s-1", device: CHROME, createdAt: "2026-11-10T08:00:00Z", lastUsedAt: "2026-11-22T09:00:00Z", current: true };
const PHONE: DeviceSession = { id: "s-2", device: IPHONE, createdAt: "2026-11-01T08:00:00Z", lastUsedAt: "2026-11-20T09:00:00Z", current: false };

beforeEach(() => {
  auth.logout.mockReset();
  auth.logout.mockResolvedValue(undefined);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("SessionsPanel", () => {
  it("lists the devices by name, with the current one marked", async () => {
    stubApi({ "GET /auth/sessions": () => json(200, [THIS_ONE, PHONE]) });
    const { container } = renderWithProviders(<SessionsPanel />);

    const list = await screen.findByRole("list", { name: "Dispositivi connessi" });
    const items = within(list).getAllByRole("listitem");
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent("Chrome su Windows");
    expect(items[0]).toHaveTextContent("Questo dispositivo");
    expect(items[1]).toHaveTextContent("Safari su iPhone");
    await expectNoA11yViolations(container);
  });

  it("signs out of another device after asking, and the list is read again", async () => {
    let sessions = [THIS_ONE, PHONE];
    const api = stubApi({
      "GET /auth/sessions": () => json(200, sessions),
      "DELETE /auth/sessions/s-2": () => {
        sessions = [THIS_ONE];
        return new Response(null, { status: 204 });
      },
    });
    renderWithProviders(<SessionsPanel />);
    await userEvent.click(await screen.findByRole("button", { name: /Esci dal dispositivo: Safari su iPhone/ }));

    const dialog = await screen.findByRole("dialog", { name: "Uscire da questo dispositivo?" });
    expect(dialog).toHaveTextContent("Safari su iPhone non sarà più connesso.");
    await userEvent.click(within(dialog).getByRole("button", { name: "Esci" }));

    await waitFor(() => expect(api.count("DELETE /auth/sessions/s-2")).toBe(1));
    await waitFor(() => expect(screen.getAllByRole("listitem")).toHaveLength(1));
    expect(auth.logout).not.toHaveBeenCalled();
  });

  it("signing out of the current device ends the session here", async () => {
    stubApi({ "GET /auth/sessions": () => json(200, [THIS_ONE, PHONE]), "DELETE /auth/sessions/s-1": () => new Response(null, { status: 204 }) });
    renderWithProviders(<SessionsPanel />);
    await userEvent.click(await screen.findByRole("button", { name: /Esci dal dispositivo: Chrome su Windows \(questo\)/ }));

    const dialog = await screen.findByRole("dialog", { name: "Uscire da questo dispositivo?" });
    expect(dialog).toHaveTextContent("dovrai accedere di nuovo");
    await userEvent.click(within(dialog).getByRole("button", { name: "Esci" }));

    await waitFor(() => expect(auth.logout).toHaveBeenCalledTimes(1));
  });

  it("signs out of every device and ends the session here", async () => {
    const api = stubApi({ "GET /auth/sessions": () => json(200, [THIS_ONE, PHONE]), "POST /auth/logout-all": () => new Response(null, { status: 204 }) });
    renderWithProviders(<SessionsPanel />);
    await userEvent.click(await screen.findByRole("button", { name: "Esci da tutti i dispositivi" }));

    const dialog = await screen.findByRole("dialog", { name: "Uscire da tutti i dispositivi?" });
    await userEvent.click(within(dialog).getByRole("button", { name: "Esci" }));

    await waitFor(() => expect(api.count("POST /auth/logout-all")).toBe(1));
    await waitFor(() => expect(auth.logout).toHaveBeenCalledTimes(1));
  });

  it("offers no 'all devices' action when this is the only one", async () => {
    stubApi({ "GET /auth/sessions": () => json(200, [THIS_ONE]) });
    renderWithProviders(<SessionsPanel />);

    await screen.findByRole("list", { name: "Dispositivi connessi" });
    expect(screen.queryByRole("button", { name: "Esci da tutti i dispositivi" })).not.toBeInTheDocument();
  });

  it("explains a refusal inside the dialog and keeps it open", async () => {
    stubApi({ "GET /auth/sessions": () => json(200, [THIS_ONE, PHONE]), "DELETE /auth/sessions/s-2": () => problem(404, "not_found") });
    renderWithProviders(<SessionsPanel />);
    await userEvent.click(await screen.findByRole("button", { name: /Esci dal dispositivo: Safari su iPhone/ }));
    const dialog = await screen.findByRole("dialog");
    await userEvent.click(within(dialog).getByRole("button", { name: "Esci" }));

    expect(await within(dialog).findByRole("alert")).toBeInTheDocument();
  });

  it("shows an error with a retry, then the devices", async () => {
    let attempts = 0;
    stubApi({ "GET /auth/sessions": () => (++attempts === 1 ? problem(500, "internal") : json(200, [THIS_ONE])) });
    renderWithProviders(<SessionsPanel />);

    expect(await screen.findByText("Il servizio non è disponibile al momento. Riprova tra poco.")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Riprova" }));
    expect(await screen.findByText("Chrome su Windows")).toBeInTheDocument();
  });
});
