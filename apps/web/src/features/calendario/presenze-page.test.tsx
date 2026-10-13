import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { expectNoA11yViolations } from "@/test/a11y";
import { PresenzePage } from "./presenze-page";
import {
  COACH_PERMISSIONS,
  NOW,
  SARA,
  PAST_TRAINING,
  SECRETARY_PERMISSIONS,
  TEAM_ATTENDANCE,
  TRAINING_EVENT,
  at,
  attendanceSheet,
} from "./test-fixtures";
import { TEAMS, json, page, problem, renderWithProviders, stubApi } from "./test-support";

const auth = vi.hoisted(() => ({ permissions: [] as string[] }));
vi.mock("@/features/auth/auth-provider", () => ({
  useAuth: () => ({ status: "authenticated", me: { permissions: auth.permissions, roles: [] } }),
}));

function routes(extra: Parameters<typeof stubApi>[0] = {}) {
  return {
    "GET /teams": () => json(200, page(TEAMS)),
    "GET /events": () => json(200, page([PAST_TRAINING, TRAINING_EVENT])),
    "GET /events/ev-past/attendance": () => json(200, attendanceSheet([true, null, null])),
    "GET /teams/t-sd/attendance": () => json(200, TEAM_ATTENDANCE),
    ...extra,
  };
}

beforeEach(() => {
  vi.setSystemTime(NOW);
  auth.permissions = COACH_PERMISSIONS;
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("PresenzePage check-in", () => {
  it("opens the latest training with one row per athlete and saves the marks in one request", async () => {
    const api = stubApi(
      routes({ "PUT /events/ev-past/attendance": () => json(200, attendanceSheet([true, true, false])) }),
    );
    const { container } = renderWithProviders(<PresenzePage />);

    expect(screen.getByRole("heading", { level: 1, name: /Chi c'è, a colpo d'occhio\./ })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Calendario" })).toHaveAttribute("href", "/calendario");
    const select = await screen.findByLabelText("Allenamento");
    expect(select).toHaveValue("ev-past");
    expect(within(select).getAllByRole("option")).toHaveLength(2);

    const list = await screen.findByRole("list", { name: "Atleti dell'allenamento" });
    expect(screen.getByText("1 presente · 0 assenti · 2 da segnare")).toBeInTheDocument();
    const giulia = within(list).getAllByRole("listitem")[1]!;
    expect(within(giulia).getByText("Giulia Rossi")).toBeInTheDocument();
    expect(within(within(list).getAllByRole("listitem")[0]!).getByRole("button", { name: "Presente" })).toHaveAttribute("aria-pressed", "true");
    await expectNoA11yViolations(container);

    await userEvent.click(within(giulia).getByRole("button", { name: "Presente" }));
    await userEvent.click(within(within(list).getAllByRole("listitem")[2]!).getByRole("button", { name: "Assente" }));
    expect(screen.getByText("2 presenti · 1 assente · 0 da segnare")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Salva presenze" }));

    expect(await screen.findByText("Presenze salvate")).toBeInTheDocument();
    expect(api.calls.find((call) => call.method === "PUT")?.body).toEqual({
      entries: [
        { memberId: "m-anna", present: true },
        { memberId: "m-giulia", present: true },
        { memberId: "m-sara", present: false },
      ],
    });
  });

  it("marks everybody present with one tap", async () => {
    const api = stubApi(routes({ "PUT /events/ev-past/attendance": () => json(200, attendanceSheet([true, true, true])) }));
    renderWithProviders(<PresenzePage />);
    await userEvent.click(await screen.findByRole("button", { name: "Tutti presenti" }));
    expect(screen.getByText("3 presenti · 0 assenti · 0 da segnare")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Salva presenze" }));
    await screen.findByText("Presenze salvate");
    expect(api.count("PUT /events/ev-past/attendance")).toBe(1);
  });

  it("keeps the save button off until something is marked", async () => {
    stubApi(routes({ "GET /events/ev-past/attendance": () => json(200, attendanceSheet([])) }));
    renderWithProviders(<PresenzePage />);
    await screen.findByRole("list", { name: "Atleti dell'allenamento" });
    expect(screen.getByRole("button", { name: "Salva presenze" })).toBeDisabled();
  });

  it("switches to another training of the team", async () => {
    const api = stubApi(routes({ "GET /events/ev-training/attendance": () => json(200, attendanceSheet([null, null, null])) }));
    renderWithProviders(<PresenzePage />);
    await userEvent.selectOptions(await screen.findByLabelText("Allenamento"), "ev-training");
    expect(await screen.findByText("0 presenti · 0 assenti · 3 da segnare")).toBeInTheDocument();
    expect(api.count("GET /events/ev-training/attendance")).toBe(1);
  });

  it("shows the sheet without buttons to those who cannot check in", async () => {
    auth.permissions = SECRETARY_PERMISSIONS;
    stubApi(routes());
    renderWithProviders(<PresenzePage />);
    const list = await screen.findByRole("list", { name: "Atleti dell'allenamento" });
    expect(within(list).getAllByText("Da segnare")).toHaveLength(2);
    expect(within(list).getByText("Presente")).toBeInTheDocument();
    expect(within(list).queryByRole("button")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Salva presenze" })).not.toBeInTheDocument();
  });

  it("explains the missing trainings, and shows an error with retry", async () => {
    let attempts = 0;
    stubApi(routes({ "GET /events": () => (++attempts === 1 ? problem(500, "internal") : json(200, page([]))) }));
    renderWithProviders(<PresenzePage />);
    await userEvent.click(await screen.findByRole("button", { name: "Riprova" }));
    expect(await screen.findByRole("heading", { name: "Nessun allenamento in programma" })).toBeInTheDocument();
  });

  it("explains that the sheet is empty when the team has no athletes", async () => {
    stubApi(routes({ "GET /events/ev-past/attendance": () => json(200, { ...attendanceSheet([]), data: [] }) }));
    renderWithProviders(<PresenzePage />);
    expect(await screen.findByRole("heading", { name: "Nessun atleta in squadra" })).toBeInTheDocument();
  });

  it("asks for a team first when there are none", async () => {
    stubApi(routes({ "GET /teams": () => json(200, page([])) }));
    renderWithProviders(<PresenzePage />);
    expect(await screen.findByRole("heading", { name: "Nessuna squadra" })).toBeInTheDocument();
  });

  it("is reserved to the roles with the attendance permission", async () => {
    auth.permissions = ["events:read", "teams:read"];
    const api = stubApi(routes());
    renderWithProviders(<PresenzePage />);
    expect(await screen.findByRole("heading", { name: "Le presenze sono riservate" })).toBeInTheDocument();
    expect(api.count("GET /events")).toBe(0);
  });
});

describe("PresenzePage history and percentages", () => {
  async function openHistory() {
    await userEvent.click(await screen.findByRole("tab", { name: "Storico e percentuali" }));
  }

  it("shows the team percentage and one row per athlete", async () => {
    const api = stubApi(routes());
    const { container } = renderWithProviders(<PresenzePage />);
    await openHistory();

    expect(await screen.findByText("87,5%")).toBeInTheDocument();
    expect(screen.getByRole("progressbar", { name: "Presenza media della squadra" })).toHaveAttribute("aria-valuenow", "87.5");
    expect(screen.getByText("8 allenamenti con presenze segnate")).toBeInTheDocument();
    const list = screen.getByRole("list", { name: "Presenze per atleta" });
    const sara = within(list).getAllByRole("listitem").find((item) => within(item).queryByText("Sara Conti"));
    expect(sara).toHaveTextContent("5 su 8 allenamenti");
    expect(sara).toHaveTextContent("62,5%");
    expect(api.calls.find((call) => call.path === "/teams/t-sd/attendance")?.query.get("from")).toBe(at(10, 13));
    await expectNoA11yViolations(container);
  });

  it("changes the period", async () => {
    const api = stubApi(routes());
    renderWithProviders(<PresenzePage />);
    await openHistory();
    await screen.findByText("87,5%");
    await userEvent.selectOptions(screen.getByLabelText("Periodo"), "all");
    await waitFor(() => expect(api.calls.filter((call) => call.path === "/teams/t-sd/attendance").some((call) => call.query.get("from") === null)).toBe(true));
  });

  it("opens the history of an athlete and loads more trainings", async () => {
    const row = (eventId: string, startsAt: string, present: boolean) => ({ eventId, title: "Allenamento", startsAt, present, note: null });
    const historyOf = (data: ReturnType<typeof row>[], nextCursor: string | null) => ({
      member: SARA,
      summary: { present: 5, total: 8, percentage: 62.5 },
      data,
      page: { nextCursor, hasMore: nextCursor !== null },
    });
    stubApi(
      routes({
        "GET /members/m-sara/attendance": (call) =>
          call.query.get("cursor") === "c1"
            ? json(200, historyOf([row("e3", at(10, 29, 19), true)], null))
            : json(200, historyOf([row("e1", at(11, 5, 19), true), row("e2", at(10, 29, 19), false)], "c1")),
      }),
    );
    renderWithProviders(<PresenzePage />);
    await openHistory();
    await userEvent.click(await screen.findByRole("button", { name: /Sara Conti/ }));

    const dialog = await screen.findByRole("dialog", { name: "Sara Conti" });
    expect(await within(dialog).findByText("62,5%")).toBeInTheDocument();
    const history = within(dialog).getByRole("list", { name: "Storico degli allenamenti" });
    expect(within(history).getAllByRole("listitem")).toHaveLength(2);
    expect(within(history).getByText("Assente")).toBeInTheDocument();
    await expectNoA11yViolations(dialog);

    await userEvent.click(within(dialog).getByRole("button", { name: "Mostra altri allenamenti" }));
    await waitFor(() => expect(within(history).getAllByRole("listitem")).toHaveLength(3));
    expect(within(dialog).queryByRole("button", { name: "Mostra altri allenamenti" })).not.toBeInTheDocument();
  });

  it("says when no attendance was recorded yet", async () => {
    stubApi(routes({ "GET /teams/t-sd/attendance": () => json(200, { ...TEAM_ATTENDANCE, trainings: 0, members: [] }) }));
    renderWithProviders(<PresenzePage />);
    await openHistory();
    expect(await screen.findByRole("heading", { name: "Nessuna presenza registrata" })).toBeInTheDocument();
  });

  it("shows an error with retry", async () => {
    let attempts = 0;
    stubApi(routes({ "GET /teams/t-sd/attendance": () => (++attempts === 1 ? problem(500, "internal") : json(200, TEAM_ATTENDANCE)) }));
    renderWithProviders(<PresenzePage />);
    await openHistory();
    await userEvent.click(await screen.findByRole("button", { name: "Riprova" }));
    expect(await screen.findByText("87,5%")).toBeInTheDocument();
  });
});
