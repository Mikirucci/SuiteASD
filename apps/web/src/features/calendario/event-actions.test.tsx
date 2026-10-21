import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { expectNoA11yViolations } from "@/test/a11y";
import { CalendarioPage } from "./calendario-page";
import {
  COACH_PERMISSIONS,
  MATCH_CONVOCATIONS_RESPONSE,
  MATCH_EVENT,
  NOW,
  SECRETARY_PERMISSIONS,
  TRAINING_EVENT,
  at,
  makeConvocation,
  makeEvent,
  ANNA,
  CHIARA,
} from "./test-fixtures";
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
});

async function openMatch() {
  await userEvent.click(await screen.findByRole("button", { name: /sab 14 novembre, con eventi/ }));
  await userEvent.click(await screen.findByRole("button", { name: "Aquile Volley vs Delfini Volley" }));
  return screen.findByRole("dialog", { name: "Aquile Volley vs Delfini Volley" });
}

async function openTraining() {
  await userEvent.click(await screen.findByRole("button", { name: "Allenamento" }));
  return screen.findByRole("dialog", { name: "Allenamento" });
}

describe("event detail and squad", () => {
  it("shows the squad in three groups with their counts: confirmed, declined with the reason, no answer", async () => {
    stubApi(calendarRoutes());
    renderWithProviders(<CalendarioPage />);
    const dialog = await openMatch();

    expect(dialog).toHaveAccessibleDescription("Sabato 14 novembre · 20:30–22:30 · Palazzetto");
    expect(within(dialog).getByText("Serie D · Girone B · Giornata 6")).toBeInTheDocument();
    expect(within(dialog).getByText("Via dello Sport 1, Roma")).toBeInTheDocument();
    expect(await within(dialog).findByText("5/12 confermate")).toBeInTheDocument();
    // The API does not say who notified them, so the label must not claim it went out automatically
    expect(within(dialog).getByText(/^Avviso inviato il /)).toBeInTheDocument();
    expect(within(dialog).queryByText(/in automatico/)).not.toBeInTheDocument();
    expect(within(dialog).queryByText(/Bozza/i)).not.toBeInTheDocument();
    expect(within(dialog).queryByText(/non vedono/)).not.toBeInTheDocument();

    expect(within(dialog).getByRole("heading", { name: "Confermati (5)" })).toBeInTheDocument();
    expect(within(dialog).getByRole("heading", { name: "Rifiutati (1)" })).toBeInTheDocument();
    expect(within(dialog).getByRole("heading", { name: "Senza risposta (2)" })).toBeInTheDocument();

    const confirmed = within(within(dialog).getByRole("list", { name: "Confermati" })).getAllByRole("listitem");
    expect(confirmed.map((item) => item.querySelector("p")?.textContent).sort()).toEqual([
      "Beatrice Gallo",
      "Elena Russo",
      "Giulia Rossi",
      "Ilaria Riva",
      "Sara Conti",
    ]);
    const declined = within(within(dialog).getByRole("list", { name: "Rifiutati" })).getAllByRole("listitem");
    expect(declined).toHaveLength(1);
    expect(within(declined[0]!).getByText("Chiara Neri")).toBeInTheDocument();
    expect(within(declined[0]!).getByText("Motivo: Esame all'università")).toBeInTheDocument();
    const waiting = within(within(dialog).getByRole("list", { name: "Senza risposta" })).getAllByRole("listitem");
    expect(waiting.map((item) => item.querySelector("p")?.textContent).sort()).toEqual(["Anna Ferri", "Marta Bianchi"]);
    await expectNoA11yViolations(dialog);
  });

  it("writes 'confermati · posti' instead of a fraction above one when more athletes confirmed than there are slots", async () => {
    const crowded = { ...MATCH_CONVOCATIONS_RESPONSE, summary: { confirmed: 14, declined: 1, pending: 2, total: 17, capacity: 12 } };
    stubApi(calendarRoutes({ "GET /events/ev-match/convocations": () => json(200, crowded) }));
    renderWithProviders(<CalendarioPage />);
    const dialog = await openMatch();
    expect(await within(dialog).findByText("14 confermati · posti 12")).toBeInTheDocument();
    expect(within(dialog).queryByText("14/12 confermate")).not.toBeInTheDocument();
  });

  it("says so in every group that is empty", async () => {
    const onlyConfirmed = [makeConvocation(ANNA, "CONFIRMED")];
    stubApi(
      calendarRoutes({
        "GET /events/ev-match/convocations": () =>
          json(200, { data: onlyConfirmed, summary: { confirmed: 1, declined: 0, pending: 0, total: 1, capacity: 12 } }),
      }),
    );
    renderWithProviders(<CalendarioPage />);
    const dialog = await openMatch();
    expect(await within(dialog).findByRole("heading", { name: "Rifiutati (0)" })).toBeInTheDocument();
    expect(within(dialog).getByText("Nessuna rinuncia.")).toBeInTheDocument();
    expect(within(dialog).getByRole("heading", { name: "Senza risposta (0)" })).toBeInTheDocument();
    expect(within(dialog).getByText("Hanno risposto tutti.")).toBeInTheDocument();
  });

  it("shows an error with a retry when the squad cannot be loaded", async () => {
    let attempts = 0;
    stubApi(
      calendarRoutes({
        "GET /events/ev-match/convocations": () => (++attempts === 1 ? problem(500, "internal") : json(200, MATCH_CONVOCATIONS_RESPONSE)),
      }),
    );
    renderWithProviders(<CalendarioPage />);
    const dialog = await openMatch();
    await userEvent.click(await within(dialog).findByRole("button", { name: "Riprova" }));
    expect(await within(dialog).findByText("5/12 confermate")).toBeInTheDocument();
  });

  it("invites to convocate when nobody was called yet", async () => {
    stubApi(
      calendarRoutes({
        "GET /events/ev-match/convocations": () =>
          json(200, { data: [], summary: { confirmed: 0, declined: 0, pending: 0, total: 0, capacity: 12 } }),
      }),
    );
    renderWithProviders(<CalendarioPage />);
    const dialog = await openMatch();
    expect(await within(dialog).findByText("Nessun atleta convocato ancora.")).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Convoca atleti" })).toBeInTheDocument();
  });

  it("lets the secretariat see the squad without changing it", async () => {
    auth.permissions = SECRETARY_PERMISSIONS;
    stubApi(calendarRoutes());
    renderWithProviders(<CalendarioPage />);
    const dialog = await openMatch();
    expect(await within(dialog).findByText("5/12 confermate")).toBeInTheDocument();
    expect(within(dialog).queryByRole("button", { name: "Convoca atleti" })).not.toBeInTheDocument();
    expect(within(dialog).queryByRole("button", { name: /Rimuovi/ })).not.toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Modifica" })).toBeInTheDocument();
  });

  it("notifies the athletes that were not notified yet, explaining that they already see the event", async () => {
    const unsent = [makeConvocation(ANNA, "PENDING", { sentAt: null })];
    const api = stubApi(
      calendarRoutes({
        "GET /events/ev-match/convocations": () =>
          json(200, { data: unsent, summary: { confirmed: 0, declined: 0, pending: 1, total: 1, capacity: 12 } }),
        "POST /events/ev-match/convocations/send": () =>
          json(200, { eventId: "ev-match", sent: 1, notified: 2, convocationsSentAt: at(11, 12, 10, 0) }),
      }),
    );
    renderWithProviders(<CalendarioPage />);
    const dialog = await openMatch();
    const notify = await within(dialog).findByRole("button", { name: "Avvisa gli atleti" });
    expect(within(dialog).getByText("Gli atleti vedono già l'evento e possono rispondere. Questo invia loro una notifica.")).toBeInTheDocument();
    expect(notify).toHaveAccessibleDescription("Gli atleti vedono già l'evento e possono rispondere. Questo invia loro una notifica.");
    expect(within(dialog).queryByText(/Bozza/i)).not.toBeInTheDocument();
    expect(within(dialog).queryByText(/^Avviso inviato il /)).not.toBeInTheDocument();
    expect(within(dialog).queryByRole("button", { name: "Sollecita chi non ha risposto" })).not.toBeInTheDocument();
    expect(within(dialog).queryByRole("button", { name: "Invia convocazioni" })).not.toBeInTheDocument();
    await userEvent.click(notify);
    expect(await screen.findByText("1 atleta avvisato")).toBeInTheDocument();
    expect(api.count("POST /events/ev-match/convocations/send")).toBe(1);
  });

  it("says nobody was left to notify when everybody already was", async () => {
    const unsent = [makeConvocation(ANNA, "PENDING", { sentAt: null })];
    stubApi(
      calendarRoutes({
        "GET /events/ev-match/convocations": () =>
          json(200, { data: unsent, summary: { confirmed: 0, declined: 0, pending: 1, total: 1, capacity: 12 } }),
        "POST /events/ev-match/convocations/send": () => json(200, { eventId: "ev-match", sent: 0, notified: 0, convocationsSentAt: at(11, 9, 8, 0) }),
      }),
    );
    renderWithProviders(<CalendarioPage />);
    const dialog = await openMatch();
    await userEvent.click(await within(dialog).findByRole("button", { name: "Avvisa gli atleti" }));
    expect(await screen.findByText("Erano già tutti avvisati")).toBeInTheDocument();
  });

  it("puts notifying first, as the main action, while some athletes were not notified yet", async () => {
    const unsent = [makeConvocation(ANNA, "PENDING", { sentAt: null })];
    stubApi(
      calendarRoutes({
        "GET /events/ev-match/convocations": () =>
          json(200, { data: unsent, summary: { confirmed: 0, declined: 0, pending: 1, total: 1, capacity: 12 } }),
      }),
    );
    renderWithProviders(<CalendarioPage />);
    const dialog = await openMatch();
    const notify = await within(dialog).findByRole("button", { name: "Avvisa gli atleti" });
    const convocate = within(dialog).getByRole("button", { name: "Convoca atleti" });
    expect(notify.compareDocumentPosition(convocate) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("shows the secretariat the squad and the answers without notes about drafts or a button to notify", async () => {
    auth.permissions = SECRETARY_PERMISSIONS;
    const unsent = [makeConvocation(ANNA, "PENDING", { sentAt: null })];
    stubApi(
      calendarRoutes({
        "GET /events/ev-match/convocations": () =>
          json(200, { data: unsent, summary: { confirmed: 0, declined: 0, pending: 1, total: 1, capacity: 12 } }),
      }),
    );
    renderWithProviders(<CalendarioPage />);
    const dialog = await openMatch();
    expect(await within(dialog).findByRole("heading", { name: "Senza risposta (1)" })).toBeInTheDocument();
    expect(within(dialog).queryByText(/Bozza/i)).not.toBeInTheDocument();
    expect(within(dialog).queryByText(/Questo invia loro una notifica/)).not.toBeInTheDocument();
    expect(within(dialog).queryByRole("button", { name: "Avvisa gli atleti" })).not.toBeInTheDocument();
  });

  it("shows both the date of the notice and the button when athletes were added after it", async () => {
    const mixed = [makeConvocation(ANNA, "PENDING", { sentAt: null }), ...MATCH_CONVOCATIONS_RESPONSE.data.slice(0, 1)];
    stubApi(
      calendarRoutes({
        "GET /events/ev-match/convocations": () =>
          json(200, { data: mixed, summary: { confirmed: 1, declined: 0, pending: 1, total: 2, capacity: 12 } }),
      }),
    );
    renderWithProviders(<CalendarioPage />);
    const dialog = await openMatch();
    expect(await within(dialog).findByText(/^Avviso inviato il /)).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Avvisa gli atleti" })).toBeInTheDocument();
  });

  it("reminds who has not answered, and says when nobody needs a reminder", async () => {
    let reminded = 2;
    const api = stubApi(
      calendarRoutes({
        "POST /events/ev-match/convocations/remind": () => json(200, { eventId: "ev-match", reminded: reminded--, notified: 2 }),
      }),
    );
    renderWithProviders(<CalendarioPage />);
    const dialog = await openMatch();
    expect(within(dialog).queryByRole("button", { name: "Avvisa gli atleti" })).not.toBeInTheDocument();
    await userEvent.click(await within(dialog).findByRole("button", { name: "Sollecita chi non ha risposto" }));
    expect(await screen.findByText("2 promemoria inviati")).toBeInTheDocument();
    reminded = 0;
    await userEvent.click(within(dialog).getByRole("button", { name: "Sollecita chi non ha risposto" }));
    expect(await screen.findByText("Nessun promemoria da inviare")).toBeInTheDocument();
    expect(api.count("POST /events/ev-match/convocations/remind")).toBe(2);
  });

  it("removes an athlete from the squad", async () => {
    const api = stubApi(calendarRoutes({ "DELETE /convocations/cv-m-anna": () => json(204) }));
    renderWithProviders(<CalendarioPage />);
    const dialog = await openMatch();
    await userEvent.click(await within(dialog).findByRole("button", { name: "Rimuovi Anna Ferri dalle convocazioni" }));
    await waitFor(() => expect(api.count("DELETE /convocations/cv-m-anna")).toBe(1));
    await waitFor(() => expect(api.count("GET /events/ev-match/convocations")).toBe(2));
  });
});

describe("convocate athletes", () => {
  it("lists the team, blocks who is already in or has an expired certificate, and creates the convocations", async () => {
    const api = stubApi(
      calendarRoutes({ "POST /events/ev-match/convocations": () => json(201, MATCH_CONVOCATIONS_RESPONSE) }),
    );
    renderWithProviders(<CalendarioPage />);
    const detail = await openMatch();
    await userEvent.click(await within(detail).findByRole("button", { name: "Convoca atleti" }));

    const dialog = await screen.findByRole("dialog", { name: "Convoca gli atleti" });
    expect(dialog).toHaveAccessibleDescription(/squadra Serie D/);
    const anna = await within(dialog).findByRole("checkbox", { name: /Anna Ferri/ });
    expect(anna).toBeDisabled();
    expect(within(dialog).getAllByText("Già in elenco")).toHaveLength(2);
    const federica = within(dialog).getByRole("checkbox", { name: /Federica Greco/ });
    expect(federica).toBeDisabled();
    expect(within(dialog).getByText("Certificato scaduto")).toBeInTheDocument();
    expect(within(dialog).getByText(/sono già convocati in automatico/)).toBeInTheDocument();
    expect(within(dialog).getByText("Scelti: 0 · Posti liberi: 7")).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Convoca" })).toBeDisabled();
    await expectNoA11yViolations(dialog);

    await userEvent.click(within(dialog).getByRole("checkbox", { name: /Luisa Villa/ }));
    expect(within(dialog).getByText("Scelti: 1 · Posti liberi: 7")).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole("button", { name: "Convoca" }));

    expect(await screen.findByText("1 convocazione creata")).toBeInTheDocument();
    expect(screen.getByText("Gli atleti la vedono subito e possono rispondere. Per mandare la notifica premi «Avvisa gli atleti».")).toBeInTheDocument();
    expect(api.calls.find((call) => call.method === "POST")?.body).toEqual({ memberIds: ["m-luisa"] });
    // Back to the event, where the squad shows the new numbers
    expect(await screen.findByRole("dialog", { name: "Aquile Volley vs Delfini Volley" })).toBeInTheDocument();
  });

  it("lets an administrator override an expired certificate, with a reason", async () => {
    auth.permissions = [...COACH_PERMISSIONS, "convocations:override"];
    const api = stubApi(
      calendarRoutes({ "POST /events/ev-match/convocations": () => json(201, MATCH_CONVOCATIONS_RESPONSE) }),
    );
    renderWithProviders(<CalendarioPage />);
    const detail = await openMatch();
    await userEvent.click(await within(detail).findByRole("button", { name: "Convoca atleti" }));
    const dialog = await screen.findByRole("dialog", { name: "Convoca gli atleti" });

    await userEvent.click(await within(dialog).findByRole("checkbox", { name: /Federica Greco/ }));
    const submit = within(dialog).getByRole("button", { name: "Convoca" });
    expect(submit).toBeDisabled();
    await userEvent.type(within(dialog).getByLabelText(/Motivo della deroga/), "Visita rinnovata, certificato in arrivo");
    expect(submit).toBeEnabled();
    await userEvent.click(submit);

    await screen.findByText("1 convocazione creata");
    expect(api.calls.find((call) => call.method === "POST")?.body).toEqual({
      memberIds: ["m-federica"],
      override: { reason: "Visita rinnovata, certificato in arrivo" },
    });
  });

  it("refuses more athletes than the free slots", async () => {
    const full = { ...MATCH_CONVOCATIONS_RESPONSE, summary: { ...MATCH_EVENT.convocations, capacity: 5 } };
    stubApi(calendarRoutes({ "GET /events/ev-match/convocations": () => json(200, full) }));
    renderWithProviders(<CalendarioPage />);
    const detail = await openMatch();
    await userEvent.click(await within(detail).findByRole("button", { name: "Convoca atleti" }));
    const dialog = await screen.findByRole("dialog", { name: "Convoca gli atleti" });
    await userEvent.click(await within(dialog).findByRole("checkbox", { name: /Luisa Villa/ }));
    expect(within(dialog).getByText(/più atleti dei posti liberi/)).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Convoca" })).toBeDisabled();
  });

  it("explains that a team is needed to convocate", async () => {
    const noTeam = { ...MATCH_EVENT, team: null };
    stubApi(calendarRoutes({ "GET /events": () => json(200, { data: [noTeam], page: { nextCursor: null, hasMore: false } }) }));
    renderWithProviders(<CalendarioPage />);
    const dialog = await openMatch();
    expect(await within(dialog).findByText(/assegna una squadra all'evento/)).toBeInTheDocument();
    expect(within(dialog).queryByRole("button", { name: "Convoca atleti" })).not.toBeInTheDocument();
  });
});

describe("change an event", () => {
  it("moves a training: the end follows the start and athletes are told", async () => {
    const moved = { ...TRAINING_EVENT, status: "POSTPONED" as const, startsAt: at(11, 19, 19, 30), endsAt: at(11, 19, 21, 0) };
    const api = stubApi(calendarRoutes({ "PATCH /events/ev-training": () => json(200, moved) }));
    renderWithProviders(<CalendarioPage />);
    const detail = await openTraining();
    await userEvent.click(within(detail).getByRole("button", { name: "Sposta" }));

    const dialog = await screen.findByRole("dialog", { name: "Sposta l'evento" });
    fireEvent.change(within(dialog).getByLabelText(/Nuova data/), { target: { value: "2026-11-19" } });
    fireEvent.change(within(dialog).getByLabelText(/Nuova ora di inizio/), { target: { value: "19:30" } });
    await userEvent.selectOptions(await within(dialog).findByRole("combobox", { name: "Luogo" }), "v-palazzetto");
    await expectNoA11yViolations(dialog);
    await userEvent.click(within(dialog).getByRole("button", { name: "Sposta l'evento" }));

    expect(await screen.findByText("Evento spostato")).toBeInTheDocument();
    expect(api.calls.find((call) => call.method === "PATCH")?.body).toEqual({
      startsAt: at(11, 19, 19, 30),
      endsAt: at(11, 19, 21, 0),
      venueId: "v-palazzetto",
    });
    // The week of the new date is shown and the event opens again, now marked as moved
    expect(await screen.findByText("16 – 22 novembre 2026")).toBeInTheDocument();
    const reopened = await screen.findByRole("dialog", { name: "Allenamento" });
    expect(within(reopened).getByText("Spostato")).toBeInTheDocument();
  });

  it("cancels an event with a reason for the notification", async () => {
    const cancelled = { ...TRAINING_EVENT, status: "CANCELLED" as const };
    const api = stubApi(calendarRoutes({ "POST /events/ev-training/cancel": () => json(200, cancelled) }));
    renderWithProviders(<CalendarioPage />);
    const detail = await openTraining();
    await userEvent.click(within(detail).getByRole("button", { name: "Annulla evento" }));

    const dialog = await screen.findByRole("dialog", { name: "Annullare l'evento?" });
    await userEvent.type(within(dialog).getByLabelText(/Motivo/), "Palestra chiusa per allerta meteo");
    await userEvent.click(within(dialog).getByRole("button", { name: "Annulla l'evento" }));

    expect(await screen.findByText("Evento annullato")).toBeInTheDocument();
    expect(api.calls.find((call) => call.method === "POST")?.body).toEqual({ reason: "Palestra chiusa per allerta meteo" });
    const reopened = await screen.findByRole("dialog", { name: "Allenamento" });
    expect(within(reopened).getByText(/Evento annullato: atleti e genitori sono stati avvisati/)).toBeInTheDocument();
    expect(within(reopened).queryByRole("button", { name: "Sposta" })).not.toBeInTheDocument();
    expect(within(reopened).queryByRole("button", { name: "Modifica" })).not.toBeInTheDocument();
  });

  it("edits the event keeping its type and sending null for cleared fields", async () => {
    const api = stubApi(calendarRoutes({ "PATCH /events/ev-training": () => json(200, { ...TRAINING_EVENT, title: "Allenamento tecnico" }) }));
    renderWithProviders(<CalendarioPage />);
    const detail = await openTraining();
    await userEvent.click(within(detail).getByRole("button", { name: "Modifica" }));

    const dialog = await screen.findByRole("dialog", { name: "Modifica l'evento" });
    expect(within(dialog).getByText("Allenamento", { selector: "span" })).toBeInTheDocument();
    expect(within(dialog).getByLabelText(/^Titolo/)).toHaveValue("Allenamento");
    await userEvent.clear(within(dialog).getByLabelText(/^Titolo/));
    await userEvent.type(within(dialog).getByLabelText(/^Titolo/), "Allenamento tecnico");
    await userEvent.click(within(dialog).getByRole("button", { name: "Salva le modifiche" }));

    expect(await screen.findByText("Evento aggiornato")).toBeInTheDocument();
    expect(api.calls.find((call) => call.method === "PATCH")?.body).toEqual({
      title: "Allenamento tecnico",
      startsAt: TRAINING_EVENT.startsAt,
      endsAt: TRAINING_EVENT.endsAt,
      teamId: "t-sd",
      venueId: "v-palestra",
      notes: null,
    });
  });

  it("refuses to change an event that was cancelled meanwhile", async () => {
    stubApi(calendarRoutes({ "PATCH /events/ev-training": () => problem(409, "event_cancelled") }));
    renderWithProviders(<CalendarioPage />);
    const detail = await openTraining();
    await userEvent.click(within(detail).getByRole("button", { name: "Modifica" }));
    const dialog = await screen.findByRole("dialog", { name: "Modifica l'evento" });
    await userEvent.click(within(dialog).getByRole("button", { name: "Salva le modifiche" }));
    expect(await within(dialog).findByText("L'evento è stato annullato: non si può più modificare.")).toBeInTheDocument();
  });

  it("links trainings to the attendance page and shows who answered, as every event of a team", async () => {
    const training = [makeConvocation(ANNA, "CONFIRMED"), makeConvocation(CHIARA, "PENDING")];
    stubApi(
      calendarRoutes({
        "GET /events/ev-training/convocations": () =>
          json(200, { data: training, summary: { confirmed: 1, declined: 0, pending: 1, total: 2, capacity: 12 } }),
      }),
    );
    renderWithProviders(<CalendarioPage />);
    const detail = await openTraining();
    expect(within(detail).getByRole("link", { name: "Registra le presenze" })).toHaveAttribute("href", "/calendario/presenze");
    expect(await within(detail).findByRole("heading", { name: "Convocazioni" })).toBeInTheDocument();
    expect(await within(detail).findByRole("heading", { name: "Confermati (1)" })).toBeInTheDocument();
    expect(within(detail).getByRole("heading", { name: "Senza risposta (1)" })).toBeInTheDocument();
  });

  it("does not show a squad for an event of no team that nobody was convocated to", async () => {
    const meeting = makeEvent({ id: "ev-meeting", title: "Riunione dei genitori", startsAt: at(11, 12, 18) });
    stubApi(calendarRoutes({ "GET /events": () => json(200, page([meeting])) }));
    renderWithProviders(<CalendarioPage />);
    await userEvent.click(await screen.findByRole("button", { name: "Riunione dei genitori" }));
    const detail = await screen.findByRole("dialog", { name: "Riunione dei genitori" });
    expect(within(detail).queryByRole("heading", { name: "Convocazioni" })).not.toBeInTheDocument();
  });
});
