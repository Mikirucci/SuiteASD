import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { expectNoA11yViolations } from "@/test/a11y";
import { installFakeApi, pageOf, problem } from "@/test/fake-api";
import { renderWithQuery } from "@/test/render-with-query";
import { ClassifichePage } from "./classifiche-page";
import { COMPETITION, GROUP, GROUP_TEAMS, SEASON, STANDINGS_AFTER, match } from "./test-fixtures";
import type { Season } from "./types";

const auth = vi.hoisted(() => ({ permissions: [] as string[] }));

vi.mock("@/features/auth/auth-provider", () => ({
  useAuth: () => ({ me: { permissions: auth.permissions } }),
}));

const ROUTES = {
  "GET /seasons": pageOf([SEASON]),
  "GET /competitions": pageOf([COMPETITION]),
  "GET /competitions/c1/groups": pageOf([GROUP]),
  "GET /competitions/c1/groups/g1/standings": { body: STANDINGS_AFTER },
  "GET /competitions/c1/groups/g1/matches": pageOf([match({ id: "m1" })]),
  "GET /competitions/c1/groups/g1/teams": pageOf(GROUP_TEAMS),
};

beforeEach(() => {
  auth.permissions = [];
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("ClassifichePage", () => {
  it("opens on the standings of the current season, first championship and first group", async () => {
    const api = installFakeApi(ROUTES);
    const { container } = renderWithQuery(<ClassifichePage />);

    expect(screen.getByRole("heading", { level: 1, name: "Classifiche che si aggiornano da sole." })).toBeInTheDocument();
    expect(await screen.findByRole("heading", { name: "Classifica Girone B" })).toBeInTheDocument();
    expect(screen.getByLabelText("Stagione")).toHaveValue("s1");
    expect(screen.getByLabelText("Girone")).toHaveValue("g1");
    expect(api.calls.find((call) => call.path === "/competitions")?.query.get("seasonId")).toBe("s1");
    await expectNoA11yViolations(container);
  });

  it("gives a reader no Gestione tab and no write actions", async () => {
    installFakeApi(ROUTES);
    renderWithQuery(<ClassifichePage />);
    await screen.findByRole("heading", { name: "Classifica Girone B" });
    expect(screen.queryByRole("tab", { name: "Gestione" })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("tab", { name: "Partite" }));
    expect(await screen.findByRole("list", { name: "Giornata 1" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Aggiungi partita" })).not.toBeInTheDocument();
  });

  it("lets a writer set up groups and teams from the Gestione tab", async () => {
    auth.permissions = ["competitions:read", "competitions:write"];
    const api = installFakeApi({
      ...ROUTES,
      "POST /competitions/c1/groups": { status: 201, body: { ...GROUP, id: "g2", name: "Girone C" } },
    });
    renderWithQuery(<ClassifichePage />);
    await userEvent.click(await screen.findByRole("tab", { name: "Gestione" }));

    const groups = await screen.findByRole("list", { name: "Gironi" });
    expect(within(groups).getByText("Girone B")).toBeInTheDocument();
    expect(await screen.findByRole("list", { name: "Squadre di Girone B" })).toHaveTextContent("Delfini Volley");

    await userEvent.click(screen.getByRole("button", { name: "Nuovo girone" }));
    const dialog = await screen.findByRole("dialog", { name: "Nuovo girone" });
    await userEvent.click(within(dialog).getByRole("button", { name: "Crea girone" }));
    expect(await within(dialog).findByText("Scrivi un nome")).toBeInTheDocument();
    await userEvent.type(within(dialog).getByLabelText(/Nome del girone/), "Girone C");
    await userEvent.click(within(dialog).getByRole("button", { name: "Crea girone" }));

    await waitFor(() => expect(api.calls.find((call) => call.method === "POST")?.body).toEqual({ name: "Girone C" }));
    expect(await screen.findByText("Girone creato")).toBeInTheDocument();
  });

  it("creates a tournament with the standard volleyball scoring and rejects repeated tiebreakers", async () => {
    auth.permissions = ["competitions:write"];
    const api = installFakeApi({
      ...ROUTES,
      "POST /competitions": { status: 201, body: { ...COMPETITION, id: "c2", name: "Torneo di Natale", kind: "TOURNAMENT" } },
    });
    renderWithQuery(<ClassifichePage />);
    await userEvent.click(await screen.findByRole("tab", { name: "Gestione" }));
    await userEvent.click(await screen.findByRole("button", { name: "Nuovo campionato o torneo" }));

    const dialog = await screen.findByRole("dialog", { name: "Nuovo campionato o torneo" });
    await userEvent.type(within(dialog).getByLabelText(/^Nome/), "Torneo di Natale");
    await userEvent.selectOptions(within(dialog).getByLabelText("Tipo"), "TOURNAMENT");
    await userEvent.selectOptions(within(dialog).getByLabelText("Secondo criterio"), "WINS");
    await userEvent.click(within(dialog).getByRole("button", { name: "Crea" }));
    expect(await within(dialog).findByText("Ogni criterio può comparire una sola volta")).toBeInTheDocument();

    await userEvent.selectOptions(within(dialog).getByLabelText("Secondo criterio"), "SET_RATIO");
    await userEvent.selectOptions(within(dialog).getByLabelText("Terzo criterio"), "");
    await userEvent.click(within(dialog).getByRole("button", { name: "Crea" }));
    await waitFor(() => expect(api.calls.find((call) => call.method === "POST")?.body).toEqual({
      name: "Torneo di Natale",
      kind: "TOURNAMENT",
      pointsRules: { "3-0": [3, 0], "3-1": [3, 0], "3-2": [2, 1] },
      tiebreakers: ["WINS", "SET_RATIO"],
      seasonId: "s1",
    }));
  });

  it("guides a writer when there is no season yet", async () => {
    auth.permissions = ["competitions:write"];
    installFakeApi({ ...ROUTES, "GET /seasons": pageOf<Season>([]) });
    renderWithQuery(<ClassifichePage />);
    expect(await screen.findByText("Nessuna stagione")).toBeInTheDocument();
    expect(screen.getByText("Crea stagione, campionato e girone dalla scheda Gestione.")).toBeInTheDocument();
  });

  it("shows a loading placeholder, then an error with a retry when the seasons cannot be loaded", async () => {
    let failing = true;
    installFakeApi({ ...ROUTES, "GET /seasons": () => (failing ? problem(500, "internal") : pageOf([SEASON])) });
    renderWithQuery(<ClassifichePage />);
    expect(screen.getByRole("status", { name: "Caricamento di stagioni e gironi" })).toBeInTheDocument();
    expect(await screen.findByText("Il servizio non è disponibile al momento. Riprova tra poco.")).toBeInTheDocument();
    failing = false;
    await userEvent.click(screen.getByRole("button", { name: "Riprova" }));
    expect(await screen.findByRole("heading", { name: "Classifica Girone B" })).toBeInTheDocument();
  });
});
