import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { installFakeApi, problem } from "@/test/fake-api";
import { expectNoA11yViolations } from "@/test/a11y";
import { renderWithQuery } from "@/test/render-with-query";
import { STANDINGS_AFTER, STANDINGS_BEFORE } from "./test-fixtures";
import { StandingsView } from "./standings-view";
import type { Standings } from "./types";

const PATH = "GET /competitions/c1/groups/g1/standings";

afterEach(() => {
  vi.unstubAllGlobals();
});

const TEAMS = ["Aquile", "Delfini", "Falchi", "Leoni", "Tigri"];

/** Team in each body row, in display order. */
function rowNames() {
  return screen
    .getAllByRole("row")
    .slice(1)
    .map((row) => TEAMS.find((team) => row.textContent?.includes(`${team} Volley`)) ?? "?");
}

describe("StandingsView", () => {
  it("shows a loading state, then the standings with points and the automatic badge", async () => {
    installFakeApi({ [PATH]: { body: STANDINGS_AFTER } });
    const { container } = renderWithQuery(<StandingsView competitionId="c1" groupId="g1" />);
    expect(screen.getByRole("status", { name: "Caricamento della classifica" })).toBeInTheDocument();

    expect(await screen.findByRole("heading", { name: "Classifica Girone B" })).toBeInTheDocument();
    expect(screen.getByText("Classifica aggiornata in automatico")).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "PT, punti" })).toBeInTheDocument();
    const first = screen.getAllByRole("row")[1];
    expect(first).toHaveTextContent("Aquile Volley");
    expect(within(first as HTMLElement).getAllByRole("cell")[2]).toHaveTextContent("32");
    expect(screen.getByText(/7 partite giocate su 10/)).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it("highlights our team with a visible label, not only with colour", async () => {
    installFakeApi({ [PATH]: { body: STANDINGS_AFTER } });
    renderWithQuery(<StandingsView competitionId="c1" groupId="g1" />);
    const ours = (await screen.findAllByRole("row"))[1] as HTMLElement;
    expect(within(ours).getByText("Noi")).toBeInTheDocument();
    expect(screen.getAllByText("Noi")).toHaveLength(1);
  });

  it("explains how to fill an empty group", async () => {
    installFakeApi({ [PATH]: { body: { ...STANDINGS_AFTER, rows: [] } satisfies Standings } });
    renderWithQuery(<StandingsView competitionId="c1" groupId="g1" />);
    expect(await screen.findByText("Il girone non ha ancora squadre")).toBeInTheDocument();
  });

  it("shows the error in Italian and retries", async () => {
    let failing = true;
    installFakeApi({ [PATH]: () => (failing ? problem(500, "internal") : { body: STANDINGS_AFTER }) });
    renderWithQuery(<StandingsView competitionId="c1" groupId="g1" />);
    expect(await screen.findByText("Il servizio non è disponibile al momento. Riprova tra poco.")).toBeInTheDocument();
    failing = false;
    await userEvent.click(screen.getByRole("button", { name: "Riprova" }));
    expect(await screen.findByRole("heading", { name: "Classifica Girone B" })).toBeInTheDocument();
  });

  it("reorders the rows and marks the positions gained when a result changes the standings", async () => {
    let current: Standings = STANDINGS_BEFORE;
    installFakeApi({ [PATH]: () => ({ body: current }) });
    const { client } = renderWithQuery(<StandingsView competitionId="c1" groupId="g1" />);
    await screen.findByRole("heading", { name: "Classifica Girone B" });
    expect(rowNames()).toEqual(["Falchi", "Delfini", "Aquile", "Leoni", "Tigri"]);
    expect(screen.queryByText(/Sale di/)).not.toBeInTheDocument();

    current = STANDINGS_AFTER;
    await client.invalidateQueries({ queryKey: ["standings"] });

    await waitFor(() => expect(rowNames()).toEqual(["Aquile", "Falchi", "Delfini", "Leoni", "Tigri"]));
    expect(screen.getByText("Sale di 2 posizioni")).toBeInTheDocument();
    expect(screen.getAllByText("Scende di 1 posizione")).toHaveLength(2);
  });
});
