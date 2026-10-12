import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { expectNoA11yViolations } from "@/test/a11y";
import { installFakeApi, pageOf, problem } from "@/test/fake-api";
import { renderWithQuery } from "@/test/render-with-query";
import { MatchesView } from "./matches-view";
import { GROUP_TEAMS, match } from "./test-fixtures";
import type { Match } from "./types";

const LIST = "GET /competitions/c1/groups/g1/matches";

const SCHEDULED = match({ id: "m1", round: 5 });
const PLAYED = match({
  id: "m2",
  round: 4,
  status: "PLAYED",
  homeSets: 3,
  awaySets: 0,
  homeTeam: { id: "gt-leoni", name: "Leoni Volley", isOurTeam: false },
  awayTeam: { id: "gt-aquile", name: "Aquile Volley", isOurTeam: true },
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("MatchesView", () => {
  it("explains what to do when the group has no matches", async () => {
    installFakeApi({ [LIST]: pageOf<Match>([]) });
    renderWithQuery(<MatchesView competitionId="c1" groupId="g1" canWrite />);
    expect(screen.getByRole("status", { name: "Caricamento delle partite" })).toBeInTheDocument();
    expect(await screen.findByText("Nessuna partita in questo girone")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Aggiungi partita" })).toBeInTheDocument();
  });

  it("tells a reader that the matches come from the secretary", async () => {
    installFakeApi({ [LIST]: pageOf<Match>([]) });
    renderWithQuery(<MatchesView competitionId="c1" groupId="g1" canWrite={false} />);
    expect(await screen.findByText(/compariranno qui/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Aggiungi partita" })).not.toBeInTheDocument();
  });

  it("shows an error with a retry", async () => {
    let failing = true;
    installFakeApi({ [LIST]: () => (failing ? problem(500, "internal") : pageOf([SCHEDULED])) });
    renderWithQuery(<MatchesView competitionId="c1" groupId="g1" canWrite={false} />);
    expect(await screen.findByRole("alert")).toHaveTextContent("Il servizio non è disponibile");
    failing = false;
    await userEvent.click(screen.getByRole("button", { name: "Riprova" }));
    expect(await screen.findByRole("list", { name: "Giornata 5" })).toBeInTheDocument();
  });

  it("groups matches by round, shows scores and hides write actions from readers", async () => {
    installFakeApi({ [LIST]: pageOf([SCHEDULED, PLAYED]) });
    const { container } = renderWithQuery(<MatchesView competitionId="c1" groupId="g1" canWrite={false} />);
    const played = await screen.findByRole("list", { name: "Giornata 4" });
    expect(within(played).getByText("3-0")).toBeInTheDocument();
    expect(within(played).getByText("Giocata")).toBeInTheDocument();
    const scheduled = screen.getByRole("list", { name: "Giornata 5" });
    expect(within(scheduled).getByText("In programma")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /risultato/i })).not.toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it("filters by round", async () => {
    installFakeApi({ [LIST]: pageOf([SCHEDULED, PLAYED]) });
    renderWithQuery(<MatchesView competitionId="c1" groupId="g1" canWrite={false} />);
    await screen.findByRole("list", { name: "Giornata 5" });
    await userEvent.click(screen.getByRole("button", { name: "G4" }));
    expect(screen.queryByRole("list", { name: "Giornata 5" })).not.toBeInTheDocument();
    expect(screen.getByRole("list", { name: "Giornata 4" })).toBeInTheDocument();
  });

  it("enters a result and the standings are refreshed", async () => {
    const api = installFakeApi({
      [LIST]: pageOf([SCHEDULED]),
      "PUT /matches/m1/result": { body: { ...SCHEDULED, status: "PLAYED", homeSets: 3, awaySets: 1 } },
    });
    renderWithQuery(<MatchesView competitionId="c1" groupId="g1" canWrite />);
    await userEvent.click(await screen.findByRole("button", { name: "Inserisci risultato" }));

    const dialog = await screen.findByRole("dialog", { name: "Inserisci il risultato" });
    expect(dialog).toHaveAccessibleDescription("Aquile Volley - Delfini Volley");
    await userEvent.type(within(dialog).getByLabelText(/Set vinti da Aquile Volley/), "3");
    await userEvent.type(within(dialog).getByLabelText(/Set vinti da Delfini Volley/), "1");
    await userEvent.click(within(dialog).getByRole("button", { name: "Salva risultato" }));

    await waitFor(() => expect(api.labels()).toContain("PUT /matches/m1/result"));
    expect(api.calls.find((call) => call.method === "PUT")?.body).toEqual({
      homeSets: 3,
      awaySets: 1,
      playedAt: SCHEDULED.playedAt,
    });
    expect(await screen.findByText("Risultato salvato")).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(api.labels().filter((label) => label === LIST)).toHaveLength(2);
  });

  it("rejects an impossible result without calling the server", async () => {
    const api = installFakeApi({ [LIST]: pageOf([SCHEDULED]) });
    renderWithQuery(<MatchesView competitionId="c1" groupId="g1" canWrite />);
    await userEvent.click(await screen.findByRole("button", { name: "Inserisci risultato" }));
    const dialog = await screen.findByRole("dialog");
    await userEvent.type(within(dialog).getByLabelText(/Set vinti da Aquile Volley/), "3");
    await userEvent.type(within(dialog).getByLabelText(/Set vinti da Delfini Volley/), "3");
    await userEvent.click(within(dialog).getByRole("button", { name: "Salva risultato" }));

    expect(await within(dialog).findByText("Una squadra deve vincere 3 set e l'altra meno di 3")).toBeInTheDocument();
    expect(within(dialog).getByLabelText(/Set vinti da Delfini Volley/)).toHaveAttribute("aria-invalid", "true");
    expect(api.labels().some((label) => label.startsWith("PUT"))).toBe(false);
  });

  it("checks the set by set scores and sends them when they are coherent", async () => {
    const api = installFakeApi({
      [LIST]: pageOf([SCHEDULED]),
      "PUT /matches/m1/result": { body: { ...SCHEDULED, status: "PLAYED", homeSets: 3, awaySets: 0 } },
    });
    renderWithQuery(<MatchesView competitionId="c1" groupId="g1" canWrite />);
    await userEvent.click(await screen.findByRole("button", { name: "Inserisci risultato" }));
    const dialog = await screen.findByRole("dialog");
    await userEvent.type(within(dialog).getByLabelText(/Set vinti da Aquile Volley/), "3");
    await userEvent.type(within(dialog).getByLabelText(/Set vinti da Delfini Volley/), "0");
    await userEvent.click(within(dialog).getByRole("checkbox", { name: "Inserisci il punteggio set per set" }));

    const scores = [
      [25, 20],
      [25, 24],
      [25, 18],
    ] as const;
    for (const [index, [home, away]] of scores.entries()) {
      await userEvent.type(within(dialog).getByLabelText(`Set ${index + 1}, punti di Aquile Volley`), String(home));
      await userEvent.type(within(dialog).getByLabelText(`Set ${index + 1}, punti di Delfini Volley`), String(away));
    }
    await userEvent.click(within(dialog).getByRole("button", { name: "Salva risultato" }));
    expect(await within(dialog).findByText(/Set 2 non valido/)).toBeInTheDocument();
    expect(api.labels().some((label) => label.startsWith("PUT"))).toBe(false);

    const secondAway = within(dialog).getByLabelText("Set 2, punti di Delfini Volley");
    await userEvent.clear(secondAway);
    await userEvent.type(secondAway, "22");
    await userEvent.click(within(dialog).getByRole("button", { name: "Salva risultato" }));
    await waitFor(() =>
      expect(api.calls.find((call) => call.method === "PUT")?.body).toEqual({
        homeSets: 3,
        awaySets: 0,
        playedAt: SCHEDULED.playedAt,
        setScores: [
          [25, 20],
          [25, 22],
          [25, 18],
        ],
      }),
    );
  });

  it("shows the server's complaint on the field when the API refuses the result", async () => {
    installFakeApi({
      [LIST]: pageOf([SCHEDULED]),
      "PUT /matches/m1/result": problem(422, "validation_error", [{ path: "homeSets", message: "invalid" }]),
    });
    renderWithQuery(<MatchesView competitionId="c1" groupId="g1" canWrite />);
    await userEvent.click(await screen.findByRole("button", { name: "Inserisci risultato" }));
    const dialog = await screen.findByRole("dialog");
    await userEvent.type(within(dialog).getByLabelText(/Set vinti da Aquile Volley/), "3");
    await userEvent.type(within(dialog).getByLabelText(/Set vinti da Delfini Volley/), "2");
    await userEvent.click(within(dialog).getByRole("button", { name: "Salva risultato" }));
    expect(await within(dialog).findByText("Il risultato non è coerente. Controlla i campi evidenziati.")).toBeInTheDocument();
    expect(within(dialog).getByLabelText(/Set vinti da Aquile Volley/)).toHaveAttribute("aria-invalid", "true");
  });

  it("corrects a played result with the current values and removes it after a confirmation", async () => {
    const api = installFakeApi({
      [LIST]: pageOf([PLAYED]),
      "DELETE /matches/m2/result": { body: { ...PLAYED, status: "SCHEDULED", homeSets: null, awaySets: null } },
    });
    renderWithQuery(<MatchesView competitionId="c1" groupId="g1" canWrite />);
    await userEvent.click(await screen.findByRole("button", { name: "Correggi risultato" }));
    const dialog = await screen.findByRole("dialog", { name: "Correggi il risultato" });
    expect(within(dialog).getByLabelText(/Set vinti da Leoni Volley/)).toHaveValue(3);

    await userEvent.click(within(dialog).getByRole("button", { name: "Cancella risultato" }));
    const confirm = await screen.findByRole("dialog", { name: "Cancellare il risultato?" });
    await userEvent.click(within(confirm).getByRole("button", { name: "Cancella risultato" }));
    await waitFor(() => expect(api.labels()).toContain("DELETE /matches/m2/result"));
    expect(await screen.findByText("Risultato cancellato")).toBeInTheDocument();
  });

  it("asks before deleting a match and reports why the server refused", async () => {
    installFakeApi({ [LIST]: pageOf([SCHEDULED]), "DELETE /matches/m1": problem(409, "match_has_report_cards") });
    renderWithQuery(<MatchesView competitionId="c1" groupId="g1" canWrite />);
    await userEvent.click(await screen.findByRole("button", { name: "Elimina la partita Aquile Volley - Delfini Volley" }));
    const confirm = await screen.findByRole("dialog", { name: "Eliminare la partita?" });
    await userEvent.click(within(confirm).getByRole("button", { name: "Elimina partita" }));
    expect(await within(confirm).findByText("L'operazione è in conflitto con i dati esistenti.")).toBeInTheDocument();
  });

  it("schedules a new match between two teams of the group", async () => {
    const api = installFakeApi({
      [LIST]: pageOf([SCHEDULED]),
      "GET /competitions/c1/groups/g1/teams": pageOf(GROUP_TEAMS),
      "POST /competitions/c1/groups/g1/matches": { status: 201, body: SCHEDULED },
    });
    renderWithQuery(<MatchesView competitionId="c1" groupId="g1" canWrite />);
    await userEvent.click(await screen.findByRole("button", { name: "Aggiungi partita" }));
    const dialog = await screen.findByRole("dialog", { name: "Aggiungi una partita" });
    await userEvent.selectOptions(await within(dialog).findByLabelText(/Squadra di casa/), "gt-falchi");
    await userEvent.selectOptions(within(dialog).getByLabelText(/Squadra ospite/), "gt-falchi");
    await userEvent.click(within(dialog).getByRole("button", { name: "Aggiungi partita" }));
    expect(await within(dialog).findByText("Una squadra non può giocare contro se stessa")).toBeInTheDocument();

    await userEvent.selectOptions(within(dialog).getByLabelText(/Squadra ospite/), "gt-tigri");
    await userEvent.type(within(dialog).getByLabelText("Giornata"), "6");
    await userEvent.click(within(dialog).getByRole("button", { name: "Aggiungi partita" }));
    await waitFor(() => expect(api.labels()).toContain("POST /competitions/c1/groups/g1/matches"));
    expect(api.calls.find((call) => call.method === "POST")?.body).toEqual({
      homeTeamId: "gt-falchi",
      awayTeamId: "gt-tigri",
      round: 6,
    });
  });
});
