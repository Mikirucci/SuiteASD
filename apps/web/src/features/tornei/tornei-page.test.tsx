import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Competition } from "@/features/classifiche/types";
import { expectNoA11yViolations } from "@/test/a11y";
import { installFakeApi, pageOf, problem } from "@/test/fake-api";
import { renderWithQuery } from "@/test/render-with-query";
import { POOL_A, POOL_B, SEASON, STANDINGS_A, STANDINGS_B, TOURNAMENT } from "./test-fixtures";
import { TorneiPage } from "./tornei-page";

const auth = vi.hoisted(() => ({ permissions: [] as string[] }));

vi.mock("@/features/auth/auth-provider", () => ({
  useAuth: () => ({ me: { permissions: auth.permissions } }),
}));

const ROUTES = {
  "GET /seasons": pageOf([SEASON]),
  "GET /competitions": pageOf([TOURNAMENT]),
  "GET /competitions/c-natale/groups": pageOf([POOL_A, POOL_B]),
  "GET /competitions/c-natale/groups/g-a/standings": { body: STANDINGS_A },
  "GET /competitions/c-natale/groups/g-b/standings": { body: STANDINGS_B },
  "GET /competitions/c-natale/groups/g-a/matches": pageOf([]),
  "GET /competitions/c-natale/groups/g-a/teams": pageOf([]),
};

beforeEach(() => {
  auth.permissions = [];
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("TorneiPage", () => {
  it("asks only for tournaments and shows one standings table per pool", async () => {
    const api = installFakeApi(ROUTES);
    const { container } = renderWithQuery(<TorneiPage />);

    expect(screen.getByRole("heading", { level: 1, name: "Ogni girone ha la sua classifica." })).toBeInTheDocument();
    expect(await screen.findByRole("heading", { name: "Classifica Girone A" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Classifica Girone B" })).toBeInTheDocument();
    expect(within(screen.getByRole("table", { name: "Classifica Girone A" })).getByText("Aquile Volley")).toBeInTheDocument();
    expect(within(screen.getByRole("table", { name: "Classifica Girone B" })).getByText("Tigri Volley")).toBeInTheDocument();
    expect(api.calls.find((call) => call.path === "/competitions")?.query.get("kind")).toBe("TOURNAMENT");
    await expectNoA11yViolations(container);
  });

  it("gives a reader no Gestione tab and no write actions", async () => {
    installFakeApi(ROUTES);
    renderWithQuery(<TorneiPage />);
    await screen.findByRole("heading", { name: "Classifica Girone A" });
    expect(screen.queryByRole("tab", { name: "Gestione" })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("tab", { name: "Partite" }));
    expect(await screen.findByText("Nessuna partita in questo girone")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Aggiungi partita" })).not.toBeInTheDocument();
  });

  it("lets a writer create a tournament without choosing its kind", async () => {
    auth.permissions = ["competitions:read", "competitions:write"];
    const created: Competition = { ...TOURNAMENT, id: "c-pasqua", name: "Torneo di Pasqua", groupsCount: 0 };
    const api = installFakeApi({ ...ROUTES, "POST /competitions": { status: 201, body: created } });
    renderWithQuery(<TorneiPage />);

    await userEvent.click(await screen.findByRole("tab", { name: "Gestione" }));
    expect(await screen.findByRole("list", { name: "Tornei" })).toHaveTextContent("Torneo di Natale");
    await userEvent.click(screen.getByRole("button", { name: "Nuovo torneo" }));

    const dialog = await screen.findByRole("dialog", { name: "Nuovo torneo" });
    expect(within(dialog).queryByLabelText("Tipo")).not.toBeInTheDocument();
    await userEvent.type(within(dialog).getByLabelText(/^Nome/), "Torneo di Pasqua");
    await userEvent.click(within(dialog).getByRole("button", { name: "Crea" }));

    await waitFor(() => expect(api.calls.find((call) => call.method === "POST")?.body).toMatchObject({ name: "Torneo di Pasqua", kind: "TOURNAMENT", seasonId: "s1" }));
    expect(await screen.findByText("Competizione creata")).toBeInTheDocument();
  });

  it("explains how to start when the season has no tournament", async () => {
    auth.permissions = ["competitions:write"];
    installFakeApi({ ...ROUTES, "GET /competitions": pageOf<Competition>([]) });
    renderWithQuery(<TorneiPage />);
    expect(await screen.findByText("Nessun torneo in questa stagione")).toBeInTheDocument();
    expect(screen.getByText("Crea stagione, torneo e gironi dalla scheda Gestione.")).toBeInTheDocument();
  });

  it("shows a loading placeholder, then an error with a retry", async () => {
    let failing = true;
    installFakeApi({ ...ROUTES, "GET /seasons": () => (failing ? problem(500, "internal") : pageOf([SEASON])) });
    renderWithQuery(<TorneiPage />);
    expect(screen.getByRole("status", { name: "Caricamento dei tornei" })).toBeInTheDocument();
    expect(await screen.findByText("Il servizio non è disponibile al momento. Riprova tra poco.")).toBeInTheDocument();
    failing = false;
    await userEvent.click(screen.getByRole("button", { name: "Riprova" }));
    expect(await screen.findByRole("heading", { name: "Classifica Girone A" })).toBeInTheDocument();
  });
});
