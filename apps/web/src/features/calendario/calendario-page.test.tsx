import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { tokens } from "@/lib/api";
import { expectNoA11yViolations } from "@/test/a11y";
import { CalendarioPage } from "./calendario-page";
import { ATHLETE_PERMISSIONS, COACH_PERMISSIONS, NOW, TRAINING_EVENT, at } from "./test-fixtures";
import { json, page, problem, renderWithProviders, stubApi } from "@/test/stub-api";
import { calendarRoutes } from "./test-support";

const auth = vi.hoisted(() => ({ permissions: [] as string[] }));
vi.mock("@/features/auth/auth-provider", () => ({
  useAuth: () => ({ status: "authenticated", me: { permissions: auth.permissions, roles: [] } }),
}));

beforeEach(() => {
  vi.setSystemTime(NOW);
  auth.permissions = COACH_PERMISSIONS;
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  tokens.clear();
});

describe("CalendarioPage week view", () => {
  it("shows the week strip with a green dot on the days with events and the events of today", async () => {
    stubApi(calendarRoutes());
    const { container } = renderWithProviders(<CalendarioPage />);

    expect(screen.getByRole("status", { name: "Caricamento degli eventi" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1, name: /Partite e convocazioni, già organizzate\./ })).toBeInTheDocument();
    expect(screen.getByText("9 – 15 novembre 2026")).toBeInTheDocument();

    const list = await screen.findByRole("list", { name: "Eventi del giorno" });
    expect(screen.getByRole("heading", { level: 2, name: /Giovedì 12 novembre/ })).toBeInTheDocument();
    expect(within(list).getAllByRole("listitem")).toHaveLength(1);
    expect(within(list).getByRole("button", { name: "Allenamento" })).toBeInTheDocument();
    expect(within(list).getByText("Allenamento · Serie D")).toBeInTheDocument();
    expect(within(list).getByText("Giovedì 12 novembre · 19:00–20:30 · Palestra comunale")).toBeInTheDocument();

    const strip = screen.getByRole("group", { name: "Giorni della settimana" });
    expect(within(strip).getByRole("button", { name: /gio 12 novembre, con eventi/ })).toHaveAttribute("aria-pressed", "true");
    expect(within(strip).getByRole("button", { name: /sab 14 novembre, con eventi/ })).toBeInTheDocument();
    expect(within(strip).getByRole("button", { name: /ven 13 novembre, nessun evento/ })).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it("shows the match card of the selected day with its place in the league and the confirmed count", async () => {
    stubApi(calendarRoutes());
    const { container } = renderWithProviders(<CalendarioPage />);
    await userEvent.click(await screen.findByRole("button", { name: /sab 14 novembre, con eventi/ }));

    const list = await screen.findByRole("list", { name: "Eventi del giorno" });
    expect(await within(list).findByText("Serie D · Girone B · Giornata 6")).toBeInTheDocument();
    expect(within(list).getByRole("heading", { level: 3, name: "Aquile Volley vs Delfini Volley" })).toBeInTheDocument();
    expect(within(list).getByText("Sabato 14 novembre · 20:30–22:30 · Palazzetto")).toBeInTheDocument();
    expect(within(list).getByText("5/12 confermate")).toBeInTheDocument();
    const bar = within(list).getByRole("progressbar", { name: "Presenze confermate: Aquile Volley vs Delfini Volley" });
    expect(bar).toHaveAttribute("aria-valuenow", "5");
    expect(bar).toHaveAttribute("aria-valuetext", "5 su 12 confermate");
    await expectNoA11yViolations(container);
  });

  it("keeps the match card usable when the competitions cannot be read", async () => {
    stubApi(calendarRoutes({ "GET /competitions": () => problem(500, "internal") }));
    renderWithProviders(<CalendarioPage />);
    await userEvent.click(await screen.findByRole("button", { name: /sab 14 novembre, con eventi/ }));
    const list = await screen.findByRole("list", { name: "Eventi del giorno" });
    expect(await within(list).findByRole("button", { name: "Aquile Volley vs Delfini Volley" })).toBeInTheDocument();
    expect(within(list).getByText("Serie D")).toBeInTheDocument();
  });

  it("explains an empty day and offers to add an event to those who can", async () => {
    stubApi(calendarRoutes());
    renderWithProviders(<CalendarioPage />);
    await userEvent.click(await screen.findByRole("button", { name: /ven 13 novembre/ }));
    expect(await screen.findByRole("heading", { name: "Nessun evento in questo giorno" })).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Nuovo evento" })).toHaveLength(2);
  });

  it("is read only for users who cannot write events", async () => {
    auth.permissions = ATHLETE_PERMISSIONS;
    stubApi(calendarRoutes({ "GET /convocations": () => json(200, page([])) }));
    renderWithProviders(<CalendarioPage />);
    await userEvent.click(await screen.findByRole("button", { name: /ven 13 novembre/ }));
    expect(await screen.findByRole("heading", { name: "Nessun evento in questo giorno" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Nuovo evento" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Presenze allenamenti" })).not.toBeInTheDocument();
  });

  it("shows an error with a retry button, then the events", async () => {
    let attempts = 0;
    stubApi(calendarRoutes({ "GET /events": () => (++attempts === 1 ? problem(500, "internal") : json(200, page([TRAINING_EVENT]))) }));
    renderWithProviders(<CalendarioPage />);
    expect(await screen.findByText("Il servizio non è disponibile al momento. Riprova tra poco.")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Riprova" }));
    expect(await screen.findByRole("button", { name: "Allenamento" })).toBeInTheDocument();
  });

  it("moves to the next week and back to today", async () => {
    const api = stubApi(calendarRoutes());
    renderWithProviders(<CalendarioPage />);
    await screen.findByRole("button", { name: "Allenamento" });
    expect(screen.queryByRole("button", { name: "Torna a oggi" })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Settimana successiva" }));
    expect(await screen.findByText("16 – 22 novembre 2026")).toBeInTheDocument();
    await waitFor(() => expect(api.calls.some((call) => call.path === "/events" && call.query.get("from") === at(11, 16))).toBe(true));
    expect(api.calls.some((call) => call.path === "/events" && call.query.get("to") === at(11, 23))).toBe(true);

    await userEvent.click(screen.getByRole("button", { name: "Torna a oggi" }));
    expect(await screen.findByText("9 – 15 novembre 2026")).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: /Giovedì 12 novembre/ })).toBeInTheDocument();
  });

  it("filters the week by team", async () => {
    const api = stubApi(calendarRoutes());
    renderWithProviders(<CalendarioPage />);
    await screen.findByRole("button", { name: "Allenamento" });
    await userEvent.selectOptions(screen.getByLabelText("Squadra"), "t-u16");
    await waitFor(() => expect(api.calls.some((call) => call.path === "/events" && call.query.get("teamId") === "t-u16")).toBe(true));
  });
});

describe("CalendarioPage iCal export", () => {
  it("downloads the calendar with the Bearer token", async () => {
    tokens.setTokens({ accessToken: "access-1", refreshToken: "refresh-1" });
    const api = stubApi(
      calendarRoutes({
        "GET /events/export.ics": () =>
          new Response("BEGIN:VCALENDAR\r\nEND:VCALENDAR\r\n", {
            status: 200,
            headers: { "content-type": "text/calendar", "content-disposition": 'attachment; filename="calendario.ics"' },
          }),
      }),
    );
    URL.createObjectURL = vi.fn(() => "blob:calendario");
    URL.revokeObjectURL = vi.fn();
    const saved: string[] = [];
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
      saved.push(this.download);
    });

    renderWithProviders(<CalendarioPage />);
    await userEvent.click(await screen.findByRole("button", { name: "Esporta in iCal" }));
    await waitFor(() => expect(saved).toEqual(["calendario.ics"]));
    expect(api.calls.find((call) => call.path === "/events/export.ics")?.headers.Authorization).toBe("Bearer access-1");
    expect(await screen.findByText("Calendario esportato")).toBeInTheDocument();
    click.mockRestore();
  });

  it("says when the export failed", async () => {
    stubApi(calendarRoutes({ "GET /events/export.ics": () => problem(500, "internal") }));
    renderWithProviders(<CalendarioPage />);
    await userEvent.click(await screen.findByRole("button", { name: "Esporta in iCal" }));
    expect(await screen.findByText("Il servizio non è disponibile al momento. Riprova tra poco.")).toBeInTheDocument();
  });
});

describe("CalendarioPage new event", () => {
  it("validates the form before sending anything", async () => {
    const api = stubApi(calendarRoutes());
    renderWithProviders(<CalendarioPage />);
    await userEvent.click((await screen.findAllByRole("button", { name: "Nuovo evento" }))[0]!);
    const dialog = await screen.findByRole("dialog", { name: "Nuovo evento" });
    await userEvent.click(within(dialog).getByRole("button", { name: "Crea l'evento" }));
    expect(await within(dialog).findByText("Inserisci il titolo dell'evento")).toBeInTheDocument();
    expect(within(dialog).getByText("Inserisci l'ora di inizio")).toBeInTheDocument();
    expect(api.count("POST /events")).toBe(0);
    await expectNoA11yViolations(dialog);
  });

  it("creates a weekly series of trainings", async () => {
    const api = stubApi(
      calendarRoutes({ "POST /events": () => json(201, { ...TRAINING_EVENT, occurrencesCreated: 10 }) }),
    );
    renderWithProviders(<CalendarioPage />);
    await userEvent.click((await screen.findAllByRole("button", { name: "Nuovo evento" }))[0]!);
    const dialog = await screen.findByRole("dialog", { name: "Nuovo evento" });

    expect(within(dialog).getByLabelText(/^Data/)).toHaveValue("2026-11-12");
    await userEvent.type(within(dialog).getByLabelText(/^Titolo/), "Allenamento del giovedì");
    fireEvent.change(within(dialog).getByLabelText(/^Inizio/), { target: { value: "19:00" } });
    fireEvent.change(within(dialog).getByLabelText("Fine"), { target: { value: "20:30" } });
    await userEvent.selectOptions(within(dialog).getByLabelText("Squadra"), "t-sd");
    await userEvent.selectOptions(await within(dialog).findByRole("combobox", { name: "Luogo" }), "v-palestra");
    await userEvent.click(within(dialog).getByRole("switch", { name: "Ripeti ogni settimana" }));
    await userEvent.type(within(dialog).getByLabelText("Numero di allenamenti"), "10");
    await userEvent.click(within(dialog).getByRole("button", { name: "Crea l'evento" }));

    expect(await screen.findByText("10 allenamenti creati")).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(api.calls.find((call) => call.method === "POST")?.body).toEqual({
      type: "TRAINING",
      title: "Allenamento del giovedì",
      startsAt: at(11, 12, 19, 0),
      endsAt: at(11, 12, 20, 30),
      teamId: "t-sd",
      venueId: "v-palestra",
      recurrence: { frequency: "WEEKLY", interval: 1, count: 10 },
    });
    await waitFor(() => expect(api.count("GET /events")).toBe(2));
  });

  it("shows the convocation slots only for matches and tournaments", async () => {
    stubApi(calendarRoutes());
    renderWithProviders(<CalendarioPage />);
    await userEvent.click((await screen.findAllByRole("button", { name: "Nuovo evento" }))[0]!);
    const dialog = await screen.findByRole("dialog", { name: "Nuovo evento" });
    expect(within(dialog).queryByLabelText("Posti per le convocazioni")).not.toBeInTheDocument();
    await userEvent.selectOptions(within(dialog).getByLabelText("Tipo di evento"), "MATCH");
    expect(within(dialog).getByLabelText("Posti per le convocazioni")).toBeInTheDocument();
    expect(within(dialog).queryByRole("switch", { name: "Ripeti ogni settimana" })).not.toBeInTheDocument();
  });

  it("reports a server refusal inside the form", async () => {
    stubApi(calendarRoutes({ "POST /events": () => problem(422, "invalid_time_range") }));
    renderWithProviders(<CalendarioPage />);
    await userEvent.click((await screen.findAllByRole("button", { name: "Nuovo evento" }))[0]!);
    const dialog = await screen.findByRole("dialog", { name: "Nuovo evento" });
    await userEvent.type(within(dialog).getByLabelText(/^Titolo/), "Riunione");
    fireEvent.change(within(dialog).getByLabelText(/^Inizio/), { target: { value: "18:00" } });
    await userEvent.click(within(dialog).getByRole("button", { name: "Crea l'evento" }));
    expect(await within(dialog).findByText(/L'ora di fine deve essere dopo l'ora di inizio/)).toBeInTheDocument();
  });
});
