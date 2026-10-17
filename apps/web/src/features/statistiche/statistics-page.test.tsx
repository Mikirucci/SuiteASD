import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { expectNoA11yViolations } from "@/test/a11y";
import { installFakeApi, problem } from "@/test/fake-api";
import { renderWithQuery } from "@/test/render-with-query";
import { StatisticsPage } from "./statistics-page";
import { EMPTY_OVERVIEW, OVERVIEW } from "./test-fixtures";
import type { StatisticsOverview } from "./types";

const auth = vi.hoisted(() => ({ permissions: [] as string[] }));

vi.mock("@/features/auth/auth-provider", () => ({
  useAuth: () => ({ me: { permissions: auth.permissions } }),
}));

beforeEach(() => {
  auth.permissions = ["statistics:read"];
});

afterEach(() => {
  vi.unstubAllGlobals();
});

async function renderOverview(body: StatisticsOverview = OVERVIEW) {
  installFakeApi({ "GET /statistics/overview": { body } });
  const view = renderWithQuery(<StatisticsPage />);
  await screen.findByRole("heading", { level: 2, name: "Quote" });
  return view;
}

/** Label and headline value of every figure of the <dl>, in document order. */
function figuresOf(root: HTMLElement): Array<{ label: string; value: string }> {
  return Array.from(root.querySelectorAll("dl > div")).map((figure) => ({
    label: figure.querySelector("dt")?.textContent ?? "",
    value: figure.querySelector("dd")?.textContent ?? "",
  }));
}

describe("StatisticsPage hierarchy", () => {
  it("has one page title and the sections as second-level headings, in order of importance", async () => {
    await renderOverview();

    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(screen.getByRole("heading", { level: 1, name: "La società in un colpo d'occhio." })).toBeInTheDocument();
    expect(screen.getAllByRole("heading", { level: 2 }).map((heading) => heading.textContent)).toEqual([
      "Numeri principali",
      "Quote",
      "Certificati medici",
      "Tesserati per squadra",
      "Prossimi eventi",
      "Ultimi risultati",
    ]);
    // Nothing deeper than h2 when every block has data: no skipped levels, no heading used as decoration
    expect(screen.queryAllByRole("heading", { level: 3 })).toHaveLength(0);
  });

  it("gives every section a plain-language reading hint", async () => {
    await renderOverview();
    for (const name of ["Quote", "Certificati medici", "Tesserati per squadra", "Prossimi eventi", "Ultimi risultati"]) {
      const section = screen.getByRole("region", { name });
      expect(within(section).getByText("Come leggere.")).toBeInTheDocument();
    }
  });

  it("passes the accessibility audit", async () => {
    const { container } = await renderOverview();
    await expectNoA11yViolations(container);
  });
});

describe("StatisticsPage headline figures", () => {
  it("shows four figures in a fixed order, each with its label, a formatted value and a context line", async () => {
    await renderOverview();
    const figures = screen.getByRole("region", { name: "Numeri principali" });

    expect(figuresOf(figures)).toEqual([
      { label: "Tesserati attivi", value: "118" },
      { label: "Incassato", value: expect.stringMatching(/^€\s6400$/) },
      { label: "Da incassare", value: expect.stringMatching(/^€\s1820,50$/) },
      { label: "Presenza media", value: "84%" },
    ]);

    const members = within(figures).getByText("Tesserati attivi").closest("div");
    expect(members).toHaveTextContent("4 squadre con tesserati");
    const toCollect = within(figures).getByText("Da incassare").closest("div");
    expect(toCollect).toHaveTextContent(/di cui €\s540 scaduti/);
    const attendance = within(figures).getByText("Presenza media").closest("div");
    expect(attendance).toHaveTextContent("Allenamenti degli ultimi 90 giorni, 412 presenze registrate");
  });

  it("does not invent a variation: there is nothing to compare with", async () => {
    await renderOverview();
    expect(screen.getByRole("region", { name: "Numeri principali" })).not.toHaveTextContent(/[+-]\d+\s?%/);
  });
});

describe("StatisticsPage fees", () => {
  it("splits the fees into collected, waiting and overdue, with a text equivalent of the bar", async () => {
    await renderOverview();
    const section = screen.getByRole("region", { name: "Quote" });

    const bar = within(section).getByRole("img", { name: /Ripartizione delle quote/ });
    expect(bar).toHaveAccessibleName(/incassato €\s6400/);
    expect(bar).toHaveAccessibleName(/in attesa €\s1280,50/);
    expect(bar).toHaveAccessibleName(/scadute €\s540/);

    const legend = within(section).getByRole("list", { name: "Dettaglio delle quote" });
    const rows = within(legend).getAllByRole("listitem");
    expect(rows).toHaveLength(3);
    expect(rows[0]).toHaveTextContent(/Incassato\s*€\s6400/);
    expect(rows[1]).toHaveTextContent(/In attesa\s*€\s1280,50/);
    expect(rows[2]).toHaveTextContent(/Scadute\s*€\s540/);
    expect(within(section).getByText("Promemoria inviati")).toBeInTheDocument();
    expect(within(section).getByText("37")).toBeInTheDocument();
  });

  it("says so when there are no fees yet", async () => {
    await renderOverview(EMPTY_OVERVIEW);
    const section = screen.getByRole("region", { name: "Quote" });
    expect(within(section).getByRole("heading", { level: 3, name: "Nessuna quota registrata" })).toBeInTheDocument();
    expect(within(section).queryByRole("img")).not.toBeInTheDocument();
  });
});

describe("StatisticsPage certificates", () => {
  it("lists the statuses from the one that needs attention first, with counts as text", async () => {
    await renderOverview();
    const section = screen.getByRole("region", { name: "Certificati medici" });
    const rows = within(section).getAllByRole("listitem");

    expect(rows).toHaveLength(4);
    expect(rows[0]).toHaveTextContent(/^Scaduti\s*5$/);
    expect(rows[1]).toHaveTextContent(/^Mancanti\s*8$/);
    expect(rows[2]).toHaveTextContent(/^In scadenza\s*9$/);
    expect(rows[3]).toHaveTextContent(/^In regola\s*96$/);
    // The bars only repeat the numbers written next to them: nothing for assistive technology to announce twice
    expect(within(section).queryByRole("img")).not.toBeInTheDocument();
    expect(within(section).queryByRole("progressbar")).not.toBeInTheDocument();
  });

  it("says so when there are no active members to check", async () => {
    await renderOverview(EMPTY_OVERVIEW);
    const section = screen.getByRole("region", { name: "Certificati medici" });
    expect(within(section).getByRole("heading", { level: 3, name: "Nessun certificato da controllare" })).toBeInTheDocument();
  });
});

describe("StatisticsPage members by team", () => {
  it("orders the teams from the largest and exposes each bar with its value", async () => {
    await renderOverview();
    const section = screen.getByRole("region", { name: "Tesserati per squadra" });

    const bars = within(section).getAllByRole("progressbar");
    expect(bars.map((bar) => bar.getAttribute("aria-label"))).toEqual(["U16", "U18", "U14", "Serie D"]);
    expect(screen.getByRole("progressbar", { name: "U16" })).toHaveAttribute("aria-valuenow", "28");
    expect(screen.getByRole("progressbar", { name: "U16" })).toHaveAttribute("aria-valuetext", "28 tesserati");
  });

  it("offers the same ordered data as a table with right-aligned numbers", async () => {
    await renderOverview();
    await userEvent.click(screen.getByRole("button", { name: "Mostra come tabella" }));

    const table = screen.getByRole("table", { name: "Tesserati per squadra" });
    const rows = within(table).getAllByRole("row").slice(1);
    expect(rows.map((row) => row.querySelector("th")?.textContent)).toEqual(["U16", "U18", "U14", "Serie D"]);
    expect(within(table).getByRole("row", { name: /Serie D/ })).toHaveTextContent("16");
    expect(within(table).getByRole("columnheader", { name: "Tesserati" })).toHaveClass("text-right");
    expect(screen.queryByRole("progressbar", { name: "U16" })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Mostra come grafico" }));
    expect(screen.getByRole("progressbar", { name: "U16" })).toBeInTheDocument();
  });

  it("breaks ties by team name", async () => {
    await renderOverview({
      ...OVERVIEW,
      members: {
        total: 20,
        byTeam: [
          { teamId: "b", teamName: "Beta", count: 10 },
          { teamId: "a", teamName: "Alfa", count: 10 },
        ],
      },
    });
    const bars = within(screen.getByRole("region", { name: "Tesserati per squadra" })).getAllByRole("progressbar");
    expect(bars.map((bar) => bar.getAttribute("aria-label"))).toEqual(["Alfa", "Beta"]);
  });

  it("says so when no member is in a team", async () => {
    await renderOverview(EMPTY_OVERVIEW);
    const section = screen.getByRole("region", { name: "Tesserati per squadra" });
    expect(within(section).getByRole("heading", { level: 3, name: "Nessun tesserato in squadra" })).toBeInTheDocument();
    expect(within(section).queryByRole("button")).not.toBeInTheDocument();
  });
});

describe("StatisticsPage events and results", () => {
  it("lists the upcoming events from the nearest one and the results from the latest one", async () => {
    await renderOverview({
      ...OVERVIEW,
      latestResults: [
        { matchId: "old", competitionName: "Coppa", homeTeam: "Aquile Volley", awayTeam: "Lupi Volley", homeSets: 0, awaySets: 3, playedAt: "2026-10-01T18:00:00.000Z" },
        { matchId: "undated", competitionName: "Coppa", homeTeam: "Aquile Volley", awayTeam: "Orsi Volley", homeSets: 3, awaySets: 2, playedAt: null },
        ...OVERVIEW.latestResults,
      ],
    });

    const events = within(screen.getByRole("list", { name: "Prossimi eventi" })).getAllByRole("listitem");
    expect(events[0]).toHaveTextContent("Allenamento U16");
    expect(events[1]).toHaveTextContent("Aquile Volley - Delfini Volley");

    const results = within(screen.getByRole("list", { name: "Ultimi risultati" })).getAllByRole("listitem");
    expect(results.map((row) => row.textContent)).toEqual([
      expect.stringContaining("Aquile Volley - Falchi Volley"),
      expect.stringContaining("Aquile Volley - Lupi Volley"),
      expect.stringContaining("Aquile Volley - Orsi Volley"),
    ]);
    expect(results[0]).toHaveTextContent("Risultato 3-1");
  });

  it("says so when there are no events or results", async () => {
    await renderOverview(EMPTY_OVERVIEW);
    expect(screen.getByText("Nessun evento in programma")).toBeInTheDocument();
    expect(screen.getByText("Nessun risultato ancora")).toBeInTheDocument();
  });
});

describe("StatisticsPage empty society", () => {
  it("explains every figure without data and passes the accessibility audit", async () => {
    const { container } = await renderOverview(EMPTY_OVERVIEW);
    const figures = screen.getByRole("region", { name: "Numeri principali" });
    expect(within(figures).getByText("Nessun dato")).toBeInTheDocument();
    expect(within(figures).getByText("Servono presenze registrate agli allenamenti.")).toBeInTheDocument();
    expect(within(figures).getByText("nessuna quota scaduta")).toBeInTheDocument();
    expect(within(figures).getByText("nessuna squadra assegnata")).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });
});

describe("StatisticsPage loading, error and permission", () => {
  it("shows a placeholder shaped like the page, then an error with a retry", async () => {
    let failing = true;
    installFakeApi({ "GET /statistics/overview": () => (failing ? problem(500, "internal") : { body: OVERVIEW }) });
    renderWithQuery(<StatisticsPage />);

    const placeholder = screen.getByRole("status", { name: "Caricamento delle statistiche" });
    expect(placeholder).toHaveAttribute("aria-busy", "true");
    // At least one placeholder for the figures row and one for each of the five blocks
    expect(placeholder.querySelectorAll('[aria-hidden="true"]').length).toBeGreaterThanOrEqual(6);

    expect(await screen.findByText("Il servizio non è disponibile al momento. Riprova tra poco.")).toBeInTheDocument();
    failing = false;
    await userEvent.click(screen.getByRole("button", { name: "Riprova" }));
    expect(await screen.findByRole("heading", { level: 2, name: "Tesserati per squadra" })).toBeInTheDocument();
  });

  it("does not even ask for the figures to a user without permission", () => {
    auth.permissions = ["competitions:read"];
    const api = installFakeApi({});
    renderWithQuery(<StatisticsPage />);
    expect(screen.getByText("Statistiche riservate")).toBeInTheDocument();
    expect(api.calls).toHaveLength(0);
  });
});
