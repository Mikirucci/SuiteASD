import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { match } from "@/features/classifiche/test-fixtures";
import { expectNoA11yViolations } from "@/test/a11y";
import { installFakeApi, problem } from "@/test/fake-api";
import { renderWithQuery } from "@/test/render-with-query";
import { MatchReportView } from "./match-report-view";
import { ANNA, MARTA, SQUAD, evaluation, reportCards } from "./test-fixtures";
import type { Match } from "@/features/classifiche/types";

const auth = vi.hoisted(() => ({ permissions: [] as string[] }));

vi.mock("@/features/auth/auth-provider", () => ({
  useAuth: () => ({ me: { permissions: auth.permissions } }),
}));
vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: { href: string; children: ReactNode } & Record<string, unknown>) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

const PLAYED: Match = match({ id: "m1", status: "PLAYED", homeSets: 3, awaySets: 1, round: 5 });
const COACH = ["evaluations:read", "evaluations:write"];

function routes(overrides: Record<string, never> = {}) {
  return {
    "GET /matches/m1": { body: PLAYED },
    "GET /matches/m1/report-cards": { body: reportCards(SQUAD) },
    ...overrides,
  };
}

beforeEach(() => {
  auth.permissions = COACH;
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("MatchReportView as the coach", () => {
  it("shows a loading state, then the squad with grade rings, the MVP badge and statistics bars", async () => {
    installFakeApi(routes());
    const { container } = renderWithQuery(<MatchReportView matchId="m1" />);
    expect(screen.getByRole("status", { name: "Caricamento delle pagelle" })).toBeInTheDocument();

    expect(await screen.findByRole("heading", { level: 1, name: "Aquile Volley 3-1 Delfini Volley" })).toBeInTheDocument();
    expect(await screen.findByRole("img", { name: "Voto di Giulia Rossi: 8,5 su 10" })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Voto di Sara Conti: 7,0 su 10" })).toBeInTheDocument();

    const giulia = screen.getByRole("heading", { name: "Giulia Rossi" }).closest("li") as HTMLElement;
    expect(within(giulia).getByText("MVP")).toBeInTheDocument();
    expect(within(giulia).getByText("Schiacciatrice")).toBeInTheDocument();
    expect(within(giulia).getByText("Ottimo ritmo in attacco nel terzo set.")).toBeInTheDocument();
    const attacks = within(giulia).getByRole("progressbar", { name: "Attacchi vincenti" });
    expect(attacks).toHaveAttribute("aria-valuenow", "18");
    expect(attacks).toHaveAttribute("aria-valuemax", "18");
    // Sara has the highest number of receptions, so Giulia's bar is shorter than the full scale
    expect(within(giulia).getByRole("progressbar", { name: "Ricezioni" })).toHaveAttribute("aria-valuemax", "15");
    expect(screen.getAllByText("MVP")).toHaveLength(1);
    await expectNoA11yViolations(container);
  });

  it("tells drafts from published cards and unrated players", async () => {
    installFakeApi(routes());
    renderWithQuery(<MatchReportView matchId="m1" />);
    const anna = (await screen.findByRole("heading", { name: "Anna Ferri" })).closest("li") as HTMLElement;
    expect(within(anna).getByText("Bozza")).toBeInTheDocument();
    expect(within(anna).getByText("Ruolo non indicato")).toBeInTheDocument();
    const marta = screen.getByRole("heading", { name: "Marta Bianchi" }).closest("li") as HTMLElement;
    expect(within(marta).getByText("Senza voto")).toBeInTheDocument();
    expect(within(marta).getByRole("button", { name: "Assegna voto a Marta Bianchi" })).toBeInTheDocument();
  });

  it("publishes the drafts after a confirmation and refreshes the cards", async () => {
    const api = installFakeApi(
      routes({
        "POST /matches/m1/evaluations/publish": { body: { publishedCount: 1, evaluations: [evaluation(ANNA)] } },
      } as never),
    );
    renderWithQuery(<MatchReportView matchId="m1" />);
    expect(await screen.findByText("Una pagella è in bozza")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Pubblica la pagella" }));

    const confirm = await screen.findByRole("dialog", { name: "Pubblicare la pagella?" });
    expect(confirm).toHaveAccessibleDescription(/ricevono subito una notifica/);
    await userEvent.click(within(confirm).getByRole("button", { name: "Pubblica" }));
    await waitFor(() => expect(api.labels()).toContain("POST /matches/m1/evaluations/publish"));
    expect(await screen.findByText("Pagella pubblicata")).toBeInTheDocument();
    expect(api.labels().filter((label) => label === "GET /matches/m1/report-cards")).toHaveLength(2);
  });

  it("rates a player: validates the grade, then saves rating and notes", async () => {
    const api = installFakeApi(
      routes({
        "PUT /matches/m1/evaluations/mb-marta": { body: evaluation(MARTA, { rating: 8.5 }) },
      } as never),
    );
    renderWithQuery(<MatchReportView matchId="m1" />);
    await userEvent.click(await screen.findByRole("button", { name: "Assegna voto a Marta Bianchi" }));

    const dialog = await screen.findByRole("dialog", { name: "Assegna il voto" });
    expect(dialog).toHaveAccessibleDescription("Marta Bianchi");
    await userEvent.type(within(dialog).getByLabelText(/^Voto/), "11");
    await userEvent.click(within(dialog).getByRole("button", { name: "Salva pagella" }));
    expect(await within(dialog).findByText(/Inserisci un voto da 1 a 10/)).toBeInTheDocument();
    expect(api.labels().some((label) => label.startsWith("PUT"))).toBe(false);

    const rating = within(dialog).getByLabelText(/^Voto/);
    await userEvent.clear(rating);
    await userEvent.type(rating, "8,5");
    await userEvent.type(within(dialog).getByLabelText("Note dell'allenatore"), "Alzata precisa.");
    await userEvent.click(within(dialog).getByRole("button", { name: "Salva pagella" }));

    await waitFor(() => expect(api.labels()).toContain("PUT /matches/m1/evaluations/mb-marta"));
    expect(api.calls.find((call) => call.method === "PUT")?.body).toEqual({ rating: 8.5, notes: "Alzata precisa." });
    // No statistics typed and none existing: the stats endpoint is not called
    expect(api.labels().some((label) => label.includes("/stats/"))).toBe(false);
    expect(await screen.findByText("Pagella salvata")).toBeInTheDocument();
  });

  it("saves the statistics together with the grade", async () => {
    const api = installFakeApi(
      routes({
        "PUT /matches/m1/evaluations/mb-marta": { body: evaluation(MARTA, { rating: 7 }) },
        "PUT /matches/m1/stats/mb-marta": { body: { matchId: "m1", memberId: "mb-marta" } },
      } as never),
    );
    renderWithQuery(<MatchReportView matchId="m1" />);
    await userEvent.click(await screen.findByRole("button", { name: "Assegna voto a Marta Bianchi" }));
    const dialog = await screen.findByRole("dialog");
    await userEvent.type(within(dialog).getByLabelText(/^Voto/), "7");
    await userEvent.type(within(dialog).getByLabelText("Ace"), "4");
    await userEvent.click(within(dialog).getByRole("button", { name: "Salva pagella" }));
    await waitFor(() => expect(api.labels()).toContain("PUT /matches/m1/stats/mb-marta"));
    expect(api.calls.find((call) => call.path.includes("/stats/"))?.body).toEqual({
      attackPoints: 0,
      aces: 4,
      blocks: 0,
      receptions: 0,
      errors: 0,
    });
  });

  it("shows the server error inside the dialog", async () => {
    installFakeApi(routes({ "PUT /matches/m1/evaluations/mb-marta": problem(409, "match_not_played") } as never));
    renderWithQuery(<MatchReportView matchId="m1" />);
    await userEvent.click(await screen.findByRole("button", { name: "Assegna voto a Marta Bianchi" }));
    const dialog = await screen.findByRole("dialog");
    await userEvent.type(within(dialog).getByLabelText(/^Voto/), "7");
    await userEvent.click(within(dialog).getByRole("button", { name: "Salva pagella" }));
    expect(await within(dialog).findByText("L'operazione è in conflitto con i dati esistenti.")).toBeInTheDocument();
  });

  it("does not offer ratings before the match is played", async () => {
    installFakeApi({
      "GET /matches/m1": { body: match({ id: "m1", status: "SCHEDULED" }) },
      "GET /matches/m1/report-cards": { body: reportCards(SQUAD) },
    });
    renderWithQuery(<MatchReportView matchId="m1" />);
    expect(await screen.findByText(/inserisci prima il risultato/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Assegna voto/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Pubblica/ })).not.toBeInTheDocument();
  });

  it("shows the error with a retry", async () => {
    let failing = true;
    installFakeApi({
      "GET /matches/m1": { body: PLAYED },
      "GET /matches/m1/report-cards": () => (failing ? problem(500, "internal") : { body: reportCards(SQUAD) }),
    });
    renderWithQuery(<MatchReportView matchId="m1" />);
    expect(await screen.findByText("Il servizio non è disponibile al momento. Riprova tra poco.")).toBeInTheDocument();
    failing = false;
    await userEvent.click(screen.getByRole("button", { name: "Riprova" }));
    expect(await screen.findByRole("heading", { name: "Giulia Rossi" })).toBeInTheDocument();
  });
});

describe("MatchReportView as a player", () => {
  beforeEach(() => {
    auth.permissions = ["evaluations:readOwn"];
  });

  it("is read only and shows only the own published card", async () => {
    const own = SQUAD.filter((entry) => entry.member.id === "mb-giulia");
    installFakeApi({ "GET /matches/m1": { body: PLAYED }, "GET /matches/m1/report-cards": { body: reportCards(own) } });
    const { container } = renderWithQuery(<MatchReportView matchId="m1" />);
    expect(await screen.findByRole("heading", { name: "Giulia Rossi" })).toBeInTheDocument();
    expect(screen.getAllByRole("heading", { level: 3 })).toHaveLength(1);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.queryByText("Bozza")).not.toBeInTheDocument();
    expect(screen.queryByText("Pubblicata")).not.toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it("says that the report card is not published yet", async () => {
    installFakeApi({ "GET /matches/m1": { body: PLAYED }, "GET /matches/m1/report-cards": { body: reportCards([]) } });
    renderWithQuery(<MatchReportView matchId="m1" />);
    expect(await screen.findByText("La pagella non è ancora pubblicata")).toBeInTheDocument();
  });
});
