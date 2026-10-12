import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SEASON } from "@/features/classifiche/test-fixtures";
import { expectNoA11yViolations } from "@/test/a11y";
import { installFakeApi, pageOf, problem } from "@/test/fake-api";
import { renderWithQuery } from "@/test/render-with-query";
import { PlayerReport } from "./player-report";
import { HISTORY_GIULIA, SUMMARY_GIULIA } from "./test-fixtures";
import type { HistoryItem } from "./types";

vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: { href: string; children: ReactNode } & Record<string, unknown>) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

const SUMMARY = "GET /members/mb-giulia/evaluation-summary";
const HISTORY = "GET /members/mb-giulia/evaluations";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("PlayerReport", () => {
  it("shows the season average, the trend, the totals and every report card", async () => {
    installFakeApi({
      "GET /seasons": pageOf([SEASON]),
      [SUMMARY]: { body: SUMMARY_GIULIA },
      [HISTORY]: pageOf(HISTORY_GIULIA),
    });
    const { container } = renderWithQuery(<PlayerReport memberId="mb-giulia" headingLevel="h1" showBackLink />);
    expect(screen.getByRole("status", { name: "Caricamento della pagella" })).toBeInTheDocument();

    expect(await screen.findByRole("heading", { level: 1, name: "Giulia Rossi" })).toBeInTheDocument();
    expect(screen.getByText("Schiacciatrice")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Media voto di Giulia Rossi: 8,2 su 10" })).toBeInTheDocument();
    expect(screen.getByText("Partite valutate").nextElementSibling).toHaveTextContent("3");
    expect(screen.getByText("Voto migliore").nextElementSibling).toHaveTextContent("9,0");
    expect(screen.getByText("Premi MVP").nextElementSibling).toHaveTextContent("2");
    expect(screen.getByText("Attacchi vincenti", { selector: "dt" }).nextElementSibling).toHaveTextContent("41");

    const trend = screen.getByRole("list", { name: /Andamento dei voti/ });
    const points = within(trend).getAllByRole("link");
    expect(points.map((link) => link.getAttribute("href"))).toEqual([
      "/pagelle/partita/m-a",
      "/pagelle/partita/m-b",
      "/pagelle/partita/m1",
    ]);

    const history = screen.getByRole("list", { name: "Pagelle partita per partita" });
    expect(within(history).getAllByRole("listitem")).toHaveLength(3);
    expect(within(history).getByText("Bozza")).toBeInTheDocument();
    expect(within(history).getAllByText("MVP")).toHaveLength(2);
    expect(screen.getByRole("link", { name: "Tutte le pagelle" })).toHaveAttribute("href", "/pagelle");
    await expectNoA11yViolations(container);
  });

  it("filters by season", async () => {
    const api = installFakeApi({
      "GET /seasons": pageOf([SEASON]),
      [SUMMARY]: { body: SUMMARY_GIULIA },
      [HISTORY]: pageOf(HISTORY_GIULIA),
    });
    renderWithQuery(<PlayerReport memberId="mb-giulia" headingLevel="h2" />);
    await screen.findByRole("heading", { level: 2, name: "Giulia Rossi" });
    await userEvent.selectOptions(await screen.findByLabelText("Stagione"), "s1");
    await screen.findByRole("heading", { name: "Giulia Rossi" });
    const summaryCalls = api.calls.filter((call) => call.path.endsWith("evaluation-summary"));
    expect(summaryCalls.map((call) => call.query.get("seasonId"))).toContain("s1");
  });

  it("explains the empty state when there are no report cards", async () => {
    installFakeApi({
      "GET /seasons": pageOf([SEASON]),
      [SUMMARY]: { body: { ...SUMMARY_GIULIA, matchesRated: 0, averageRating: null, bestRating: null, mvpCount: 0, trend: [] } },
      [HISTORY]: pageOf<HistoryItem>([]),
    });
    renderWithQuery(<PlayerReport memberId="mb-giulia" headingLevel="h2" />);
    expect(await screen.findByText("Nessuna pagella pubblicata")).toBeInTheDocument();
    expect(screen.getByText("Ancora nessuna pagella per questa selezione.")).toBeInTheDocument();
  });

  it("tells the coach that drafts do not count while keeping them listed", async () => {
    installFakeApi({
      "GET /seasons": pageOf([SEASON]),
      [SUMMARY]: { body: { ...SUMMARY_GIULIA, matchesRated: 0, averageRating: null, bestRating: null, mvpCount: 0, trend: [] } },
      [HISTORY]: pageOf(HISTORY_GIULIA.slice(2)),
    });
    renderWithQuery(<PlayerReport memberId="mb-giulia" headingLevel="h2" />);
    expect(await screen.findByText(/Le bozze non contano/)).toBeInTheDocument();
    expect(screen.getByText("Bozza")).toBeInTheDocument();
  });

  it("shows a not found error, with a retry", async () => {
    installFakeApi({ "GET /seasons": pageOf([SEASON]), [SUMMARY]: problem(404, "not_found"), [HISTORY]: problem(404, "not_found") });
    renderWithQuery(<PlayerReport memberId="mb-giulia" headingLevel="h2" />);
    expect(await screen.findByText("Elemento non trovato.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Riprova" })).toBeInTheDocument();
  });
});
