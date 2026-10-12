import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { COMPETITION, GROUP, SEASON, match } from "@/features/classifiche/test-fixtures";
import { expectNoA11yViolations } from "@/test/a11y";
import { installFakeApi, pageOf } from "@/test/fake-api";
import { renderWithQuery } from "@/test/render-with-query";
import { PagellePage } from "./pagelle-page";
import { GIULIA, HISTORY_GIULIA, SARA, SUMMARY_GIULIA } from "./test-fixtures";

const auth = vi.hoisted(() => ({
  me: { permissions: [] as string[], member: null as { id: string; firstName: string; lastName: string } | null, children: [] as Array<{ memberId: string; firstName: string; lastName: string }> },
}));

vi.mock("@/features/auth/auth-provider", () => ({ useAuth: () => ({ me: auth.me }) }));
vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: { href: string; children: ReactNode } & Record<string, unknown>) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

const PLAYED = match({ id: "m1", status: "PLAYED", homeSets: 3, awaySets: 1, round: 5 });
const OLDER = match({ id: "m0", status: "PLAYED", homeSets: 3, awaySets: 0, round: 4, playedAt: "2026-10-31T12:00:00.000Z" });

const STAFF_ROUTES = {
  "GET /seasons": pageOf([SEASON]),
  "GET /competitions": pageOf([COMPETITION]),
  "GET /competitions/c1/groups": pageOf([GROUP]),
  "GET /competitions/c1/groups/g1/matches": pageOf([OLDER, PLAYED]),
  "GET /teams": pageOf([{ id: "t1", name: "Serie D", category: "Serie D" }]),
  "GET /evaluation-summaries": pageOf([
    { ...SUMMARY_GIULIA, member: SARA, averageRating: 6.8, mvpCount: 0, matchesRated: 1 },
    SUMMARY_GIULIA,
  ]),
};

beforeEach(() => {
  auth.me = { permissions: [], member: null, children: [] };
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("PagellePage as the coach", () => {
  beforeEach(() => {
    auth.me.permissions = ["evaluations:read", "evaluations:write"];
  });

  it("lists the played matches, newest first, each one linking to its report cards", async () => {
    const api = installFakeApi(STAFF_ROUTES);
    const { container } = renderWithQuery(<PagellePage />);
    expect(screen.getByRole("heading", { level: 1, name: "Ogni partita, ogni giocatrice." })).toBeInTheDocument();

    const list = await screen.findByRole("list", { name: "Partite giocate" });
    const links = within(list).getAllByRole("link");
    expect(links.map((link) => link.getAttribute("href"))).toEqual(["/pagelle/partita/m1", "/pagelle/partita/m0"]);
    expect(links[0]).toHaveTextContent("Aquile Volley 3-1 Delfini Volley");
    expect(api.calls.find((call) => call.path.endsWith("/matches"))?.query.get("status")).toBe("PLAYED");
    await expectNoA11yViolations(container);
  });

  it("compares the players by average, best first", async () => {
    installFakeApi(STAFF_ROUTES);
    renderWithQuery(<PagellePage />);
    await userEvent.click(screen.getByRole("tab", { name: "Giocatrici" }));
    const list = await screen.findByRole("list", { name: "Giocatrici con pagelle pubblicate" });
    const rows = within(list).getAllByRole("link");
    expect(rows.map((row) => row.getAttribute("href"))).toEqual([
      `/pagelle/giocatrice/${GIULIA.id}`,
      `/pagelle/giocatrice/${SARA.id}`,
    ]);
    expect(rows[0]).toHaveTextContent("Giulia Rossi");
    expect(rows[0]).toHaveTextContent("Media 8,2");
    expect(within(rows[0] as HTMLElement).getByText("MVP")).toBeInTheDocument();
  });

  it("explains an empty comparison", async () => {
    installFakeApi({ ...STAFF_ROUTES, "GET /evaluation-summaries": pageOf([]) });
    renderWithQuery(<PagellePage />);
    await userEvent.click(screen.getByRole("tab", { name: "Giocatrici" }));
    expect(await screen.findByText("Nessuna pagella pubblicata")).toBeInTheDocument();
  });

  it("guides the coach when no match has been played", async () => {
    installFakeApi({ ...STAFF_ROUTES, "GET /competitions/c1/groups/g1/matches": pageOf([]) });
    renderWithQuery(<PagellePage />);
    expect(await screen.findByText("Nessuna partita giocata")).toBeInTheDocument();
  });
});

describe("PagellePage as an athlete or a guardian", () => {
  const OWN_ROUTES = {
    "GET /seasons": pageOf([SEASON]),
    "GET /members/mb-giulia/evaluation-summary": { body: SUMMARY_GIULIA },
    "GET /members/mb-giulia/evaluations": pageOf(HISTORY_GIULIA),
    "GET /members/mb-sara/evaluation-summary": { body: { ...SUMMARY_GIULIA, member: SARA } },
    "GET /members/mb-sara/evaluations": pageOf(HISTORY_GIULIA.slice(0, 1)),
  };

  it("shows the athlete only her own report, without staff tabs", async () => {
    auth.me = { permissions: ["evaluations:readOwn"], member: { id: "mb-giulia", firstName: "Giulia", lastName: "Rossi" }, children: [] };
    installFakeApi(OWN_ROUTES);
    const { container } = renderWithQuery(<PagellePage />);
    expect(await screen.findByRole("heading", { level: 2, name: "Giulia Rossi" })).toBeInTheDocument();
    expect(screen.queryByRole("tab")).not.toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it("lets a guardian switch between the linked children", async () => {
    auth.me = {
      permissions: ["evaluations:readOwn"],
      member: null,
      children: [
        { memberId: "mb-giulia", firstName: "Giulia", lastName: "Rossi" },
        { memberId: "mb-sara", firstName: "Sara", lastName: "Conti" },
      ],
    };
    installFakeApi(OWN_ROUTES);
    renderWithQuery(<PagellePage />);
    expect(await screen.findByRole("heading", { level: 2, name: "Giulia Rossi" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Sara Conti" }));
    expect(await screen.findByRole("heading", { level: 2, name: "Sara Conti" })).toBeInTheDocument();
  });

  it("explains when the account is not linked to a member", async () => {
    auth.me = { permissions: ["evaluations:readOwn"], member: null, children: [] };
    installFakeApi({});
    renderWithQuery(<PagellePage />);
    expect(screen.getByText("Nessuna pagella collegata al tuo account")).toBeInTheDocument();
  });
});

describe("PagellePage without access", () => {
  it("says the report cards are reserved", () => {
    auth.me = { permissions: ["competitions:read"], member: null, children: [] };
    installFakeApi({});
    renderWithQuery(<PagellePage />);
    expect(screen.getByText("Le pagelle sono riservate")).toBeInTheDocument();
  });
});
