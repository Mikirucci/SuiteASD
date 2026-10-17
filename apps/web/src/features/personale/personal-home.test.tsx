import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  NOW,
  PALAZZETTO,
  SARA,
  at,
  makeConvocation,
  makeEvent,
  member as memberRef,
} from "@/features/calendario/test-fixtures";
import type { CalendarEvent, Convocation, ConvocationStatus, MemberRef } from "@/features/calendario/types";
import type { MeResponse } from "@/lib/api";
import { expectNoA11yViolations } from "@/test/a11y";
import {
  ANNA_FERRI,
  SARA_CONTI,
  detailOf,
  indicator,
  member,
  mockApi,
  page,
  problem,
  renderScreen,
} from "../tesserati/test-support";
import type { Fee } from "@/features/quote/types";
import { PersonalHome } from "./personal-home";
import { athleteMe, guardianMe } from "./test-support";

const auth = vi.hoisted(() => ({ me: null as MeResponse | null }));
vi.mock("@/features/auth/auth-provider", () => ({
  useAuth: () => ({ status: "authenticated", me: auth.me }),
}));
vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: { href: string; children: ReactNode } & Record<string, unknown>) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

const U16 = { id: "t16", name: "U16" };
const SERIE_D = { id: "td", name: "Serie D" };

function fee(overrides: Partial<Fee> = {}): Fee {
  return {
    id: "fee-1",
    memberId: "m-sara",
    memberName: "Sara Conti",
    teams: [],
    feePlanId: null,
    description: "Quota novembre",
    amountCents: 6000,
    currency: "EUR",
    dueDate: "2026-11-10",
    status: "PENDING",
    paidAt: null,
    method: null,
    payerName: null,
    payerEmail: null,
    reference: null,
    reminderCount: 0,
    lastReminderAt: null,
    receipt: null,
    claimedAt: null,
    createdAt: "2026-10-01T08:00:00.000Z",
    updatedAt: "2026-10-01T08:00:00.000Z",
    ...overrides,
  };
}

function training(overrides: Partial<CalendarEvent> = {}): CalendarEvent {
  return makeEvent({
    id: "ev-train",
    type: "TRAINING",
    title: "Allenamento U16",
    startsAt: at(11, 12, 19),
    endsAt: at(11, 12, 20, 30),
    team: U16,
    venue: PALAZZETTO,
    ...overrides,
  });
}

function convocationOf(event: CalendarEvent, status: ConvocationStatus, who: MemberRef = SARA, overrides: Partial<Convocation> = {}): Convocation {
  return makeConvocation(who, status, {
    id: `cv-${event.id}-${who.id}`,
    event: { id: event.id, type: event.type, title: event.title, startsAt: event.startsAt, status: event.status },
    ...overrides,
  });
}

beforeEach(() => {
  auth.me = athleteMe();
  vi.setSystemTime(NOW);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

function api(extra: Parameters<typeof mockApi>[0] = {}) {
  return mockApi({
    "GET /members/m-sara": () => ({ body: detailOf(SARA_CONTI) }),
    "GET /fees": () => page([fee()]),
    "GET /events": () => page([training()]),
    "GET /convocations": () => page([]),
    ...extra,
  });
}

const WEEK_TABLE = "Appuntamenti di questa settimana";
const LATER_TABLE = "Appuntamenti dopo questa settimana";

function rowTitles(table: HTMLElement): string[] {
  return within(table)
    .getAllByRole("row")
    .slice(1)
    .map((row) => within(row).getAllByRole("button")[0]?.textContent ?? "");
}

/** The row of an event; `hidden` because the table is out of the accessibility tree while a dialog is open. */
function rowOf(table: HTMLElement, name: string | RegExp): HTMLElement {
  const row = within(table).getByRole("button", { name, hidden: true }).closest("tr");
  if (!row) throw new Error("The event button is not inside a table row");
  return row;
}

describe("PersonalHome: documents and payments squares", () => {
  it("greets the athlete and shows a square for the documents and one for the payments", async () => {
    api();
    const { container } = renderScreen(<PersonalHome />);
    expect(screen.getByRole("heading", { level: 1, name: "Ciao Sara, ecco la tua area." })).toBeInTheDocument();

    const documents = await screen.findByRole("region", { name: "Documenti" });
    expect(await within(documents).findByText("1 in scadenza")).toBeInTheDocument();
    expect(within(documents).getByText("1 documento da sistemare")).toBeInTheDocument();
    expect(within(documents).getByText("Certificato medico")).toBeInTheDocument();
    expect(within(documents).getByText("Scade il 27 novembre 2026 · scade tra 15 giorni")).toBeInTheDocument();
    expect(within(documents).getByRole("link", { name: "Apri documenti" })).toHaveAttribute("href", "/area-personale/documenti");

    const payments = await screen.findByRole("region", { name: "Pagamenti" });
    expect(await within(payments).findByText("1 quota da pagare · € 60")).toBeInTheDocument();
    expect(within(payments).getByText("10 novembre 2026")).toBeInTheDocument();
    expect(within(payments).getByText("Quota novembre · € 60")).toBeInTheDocument();
    expect(within(payments).getByRole("link", { name: "Apri pagamenti" })).toHaveAttribute("href", "/area-personale/pagamenti");
    await expectNoA11yViolations(container);
  });

  it.each([
    ["is red when it expired", -3, "text-danger"],
    ["is red within a week", 5, "text-danger"],
    ["is amber within a month", 20, "text-warning"],
    ["is plain beyond a month", 60, "text-fg-muted"],
  ])("colours the nearest expiry only as text: it %s", async (_label, daysRemaining, tone) => {
    api({
      "GET /members/m-sara": () => ({
        body: detailOf(
          member({
            id: "m-sara",
            firstName: "Sara",
            lastName: "Conti",
            documents: [
              indicator({ key: "MEDICAL_CERTIFICATE", name: "Certificato medico", status: daysRemaining < 0 ? "EXPIRED" : "OK", expiresAt: "2026-12-01", daysRemaining }),
            ],
          }),
        ),
      }),
    });
    renderScreen(<PersonalHome />);
    const documents = await screen.findByRole("region", { name: "Documenti" });
    const line = await within(documents).findByText(/^Scad(e|uto) il 1 dicembre 2026/);
    expect(line).toHaveClass(tone);
    for (const other of ["text-danger", "text-warning", "text-fg-muted"].filter((name) => name !== tone)) {
      expect(line).not.toHaveClass(other);
    }
  });

  it("flags a missing certificate, overdue fees and the fees the payer says she paid", async () => {
    api({
      "GET /members/m-sara": () => ({ body: detailOf(ANNA_FERRI, { id: "m-sara" }) }),
      "GET /fees": () =>
        page([
          fee({ status: "OVERDUE", dueDate: "2026-10-10" }),
          fee({ id: "fee-2", amountCents: 4000, status: "PENDING", claimedAt: "2026-11-11T08:00:00.000Z" }),
        ]),
    });
    renderScreen(<PersonalHome />);
    const documents = await screen.findByRole("region", { name: "Documenti" });
    expect(await within(documents).findByText("1 documento mancante")).toBeInTheDocument();
    expect(within(documents).getByText("1 documento da sistemare")).toBeInTheDocument();
    expect(within(documents).getByText("Nessuna scadenza in arrivo")).toBeInTheDocument();

    const payments = await screen.findByRole("region", { name: "Pagamenti" });
    expect(await within(payments).findByText("2 quote da pagare · € 100")).toBeInTheDocument();
    expect(within(payments).getByText("1 scaduta")).toBeInTheDocument();
    expect(within(payments).getByText("1 segnalata come pagata")).toBeInTheDocument();
  });

  it("congratulates when everything is in order", async () => {
    api({
      "GET /members/m-sara": () => ({ body: detailOf(member({ id: "m-sara", firstName: "Sara", lastName: "Conti" })) }),
      "GET /fees": () => page([fee({ status: "PAID", paidAt: "2026-11-02T08:00:00.000Z" })]),
    });
    renderScreen(<PersonalHome />);
    const documents = await screen.findByRole("region", { name: "Documenti" });
    expect(await within(documents).findByText("In regola")).toBeInTheDocument();
    expect(within(documents).getByText("Nessun documento da sistemare")).toBeInTheDocument();
    const payments = await screen.findByRole("region", { name: "Pagamenti" });
    expect(await within(payments).findByText("Tutto pagato")).toBeInTheDocument();
    expect(within(payments).queryByText("Prossima scadenza")).not.toBeInTheDocument();
  });

  it("shows a loading state in each square while the data arrives", async () => {
    api({ "GET /fees": () => new Promise(() => undefined), "GET /members/m-sara": () => new Promise(() => undefined) });
    renderScreen(<PersonalHome />);
    const documents = await screen.findByRole("region", { name: "Documenti" });
    const payments = await screen.findByRole("region", { name: "Pagamenti" });
    expect(within(documents).getByRole("status", { name: "Caricamento dei documenti" })).toBeInTheDocument();
    expect(within(payments).getByRole("status", { name: "Caricamento dei pagamenti" })).toBeInTheDocument();
  });

  it("shows an error with a retry only in the square whose request failed", async () => {
    let attempts = 0;
    api({ "GET /fees": () => (++attempts === 1 ? problem(500, "internal_error") : page([fee()])) });
    renderScreen(<PersonalHome />);
    const payments = await screen.findByRole("region", { name: "Pagamenti" });
    expect(await within(payments).findByRole("alert")).toBeInTheDocument();
    expect(within(screen.getByRole("region", { name: "Documenti" })).queryByRole("alert")).not.toBeInTheDocument();
    await userEvent.click(within(payments).getByRole("button", { name: "Riprova" }));
    expect(await within(payments).findByText("1 quota da pagare · € 60")).toBeInTheDocument();
  });

  it("gives each child squares of their own, with the name of the child", async () => {
    auth.me = guardianMe();
    api({
      "GET /members/m-anna": () => ({ body: detailOf(member({ id: "m-anna", firstName: "Anna", lastName: "Conti" })) }),
      "GET /members/m-marta": () => ({ body: detailOf(ANNA_FERRI, { id: "m-marta", firstName: "Marta", lastName: "Conti" }) }),
      "GET /fees": (request) => page(request.query.get("memberId") === "m-marta" ? [fee({ memberId: "m-marta" })] : []),
    });
    renderScreen(<PersonalHome />);
    const annaDocuments = await screen.findByRole("region", { name: "Documenti di Anna Conti" });
    const martaDocuments = await screen.findByRole("region", { name: "Documenti di Marta Conti" });
    const annaPayments = await screen.findByRole("region", { name: "Pagamenti di Anna Conti" });
    const martaPayments = await screen.findByRole("region", { name: "Pagamenti di Marta Conti" });
    expect(await within(annaDocuments).findByText("In regola")).toBeInTheDocument();
    expect(await within(martaDocuments).findByText("1 documento mancante")).toBeInTheDocument();
    expect(await within(annaPayments).findByText("Tutto pagato")).toBeInTheDocument();
    expect(await within(martaPayments).findByText(/1 quota da pagare/)).toBeInTheDocument();
    expect(within(martaDocuments).getByRole("link", { name: "Apri documenti di Marta Conti" })).toHaveAttribute("href", "/area-personale/documenti");
  });

  it("explains when no member is linked to the account, without any appointment table", async () => {
    auth.me = { ...athleteMe(), member: null };
    api();
    renderScreen(<PersonalHome />);
    expect(await screen.findByRole("heading", { name: "Nessun tesserato collegato al tuo account" })).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });
});

describe("PersonalHome: appointments of the week and after", () => {
  it("lists this week and the first appointments after it, only for the team of the athlete and the events of no team", async () => {
    const calls = api({
      "GET /events": () =>
        page([
          training({ id: "ev-a", title: "Allenamento U16" }),
          makeEvent({ id: "ev-b", type: "MEETING", title: "Cena sociale", startsAt: at(11, 13, 20), team: null }),
          training({ id: "ev-c", title: "Aquile vs Delfini", type: "MATCH", startsAt: at(11, 14, 20, 30), endsAt: null }),
          training({ id: "ev-d", title: "Allenamento Serie D", startsAt: at(11, 13, 19), team: SERIE_D }),
          training({ id: "ev-e", title: "Allenamento di lunedì", startsAt: at(11, 16, 19) }),
        ]),
      "GET /convocations": () => page([convocationOf(training({ id: "ev-a" }), "PENDING"), convocationOf(training({ id: "ev-c", title: "Aquile vs Delfini", type: "MATCH" }), "CONFIRMED")]),
    }).calls;
    renderScreen(<PersonalHome />);

    const week = await screen.findByRole("table", { name: WEEK_TABLE });
    await waitFor(() => expect(rowTitles(week)).toEqual(["Allenamento U16", "Cena sociale", "Aquile vs Delfini"]));
    const later = screen.getByRole("table", { name: LATER_TABLE });
    expect(rowTitles(later)).toEqual(["Allenamento di lunedì"]);

    const trainingRow = within(rowOf(week, "Allenamento U16"));
    expect(trainingRow.getByText("Gio 12 nov · 19:00")).toBeInTheDocument();
    expect(trainingRow.getByText("Allenamento · U16")).toBeInTheDocument();
    expect(trainingRow.getByText("Palazzetto")).toBeInTheDocument();
    expect(trainingRow.getByText("Da rispondere")).toBeInTheDocument();
    expect(within(rowOf(week, "Aquile vs Delfini")).getByText("Confermato")).toBeInTheDocument();
    expect(within(rowOf(week, "Cena sociale")).getByText("Nessuna risposta richiesta")).toBeInTheDocument();
    expect(within(week).queryByRole("columnheader", { name: "Atleta" })).not.toBeInTheDocument();
    expect(within(week).getByRole("columnheader", { name: "La tua risposta" })).toBeInTheDocument();

    const request = calls.find((call) => call.path === "/events");
    expect(request?.query.get("from")).toBe(new Date(2026, 10, 12).toISOString());
    expect(request?.query.get("status")).toBeNull();
    expect(new Date(request?.query.get("to") ?? "").getTime()).toBeGreaterThan(new Date(2026, 10, 16).getTime());
    const asked = calls.find((call) => call.path === "/convocations");
    expect(asked?.query.get("upcoming")).toBe("true");
    expect(asked?.query.get("status")).toBeNull();
  });

  it("keeps the first six appointments after the week", async () => {
    api({
      "GET /events": () =>
        page(Array.from({ length: 9 }, (_, index) => training({ id: `ev-${index}`, title: `Allenamento ${index + 1}`, startsAt: at(11, 16 + index, 19) }))),
    });
    renderScreen(<PersonalHome />);
    const later = await screen.findByRole("table", { name: LATER_TABLE });
    await waitFor(() => expect(rowTitles(later)).toHaveLength(6));
    expect(rowTitles(later)[5]).toBe("Allenamento 6");
  });

  it("explains an empty week and an empty future", async () => {
    api({ "GET /events": () => page([]) });
    renderScreen(<PersonalHome />);
    expect(await screen.findByRole("heading", { name: "Nessun appuntamento questa settimana" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Nessun appuntamento nelle prossime settimane" })).toBeInTheDocument();
  });

  it("shows a loading state for the tables", async () => {
    api({ "GET /events": () => new Promise(() => undefined) });
    renderScreen(<PersonalHome />);
    expect(await screen.findAllByRole("status", { name: "Caricamento degli appuntamenti" })).toHaveLength(2);
  });

  it("shows an error with a retry when the appointments cannot be loaded", async () => {
    let attempts = 0;
    api({ "GET /events": () => (++attempts === 1 ? problem(500, "internal_error") : page([training()])) });
    renderScreen(<PersonalHome />);
    const alert = await screen.findByRole("alert");
    await userEvent.click(within(alert).getByRole("button", { name: "Riprova" }));
    expect(await screen.findByRole("table", { name: WEEK_TABLE })).toBeInTheDocument();
  });

  it("does not ask for convocations when the user cannot answer them", async () => {
    auth.me = { ...athleteMe(), permissions: athleteMe().permissions.filter((permission) => permission !== "convocations:respond") };
    const calls = api().calls;
    renderScreen(<PersonalHome />);
    const week = await screen.findByRole("table", { name: WEEK_TABLE });
    await waitFor(() => expect(rowTitles(week)).toEqual(["Allenamento U16"]));
    expect(calls.some((call) => call.path === "/convocations")).toBe(false);
  });

  it("adds a column with the person when the user looks after more than one", async () => {
    auth.me = guardianMe();
    const trainingEvent = training();
    api({
      "GET /members/m-anna": () => ({ body: detailOf(member({ id: "m-anna", firstName: "Anna", lastName: "Conti", teams: [{ ...U16, category: null, position: null, jerseyNumber: null }] })) }),
      "GET /members/m-marta": () => ({ body: detailOf(member({ id: "m-marta", firstName: "Marta", lastName: "Conti", teams: [{ ...U16, category: null, position: null, jerseyNumber: null }] })) }),
      "GET /fees": () => page([]),
      "GET /events": () => page([trainingEvent]),
      "GET /convocations": () =>
        page([
          convocationOf(trainingEvent, "PENDING", memberRef("m-anna", "Anna", "Conti")),
          convocationOf(trainingEvent, "CONFIRMED", memberRef("m-marta", "Marta", "Conti")),
        ]),
    });
    renderScreen(<PersonalHome />);
    const week = await screen.findByRole("table", { name: WEEK_TABLE });
    expect(within(week).getByRole("columnheader", { name: "Atleta" })).toBeInTheDocument();
    const anna = rowOf(week, "Allenamento U16: Anna Conti");
    const marta = rowOf(week, "Allenamento U16: Marta Conti");
    expect(within(anna).getByText("Anna Conti")).toBeInTheDocument();
    expect(within(anna).getByText("Da rispondere")).toBeInTheDocument();
    expect(within(marta).getByText("Marta Conti")).toBeInTheDocument();
    expect(within(marta).getByText("Confermato")).toBeInTheDocument();
  });

  it("notes that the athlete cannot be convocated when the medical certificate expired", async () => {
    api({
      "GET /members/m-sara": () => ({
        body: detailOf(
          member({
            id: "m-sara",
            firstName: "Sara",
            lastName: "Conti",
            teams: [{ ...U16, category: null, position: null, jerseyNumber: null }],
            documents: [indicator({ key: "MEDICAL_CERTIFICATE", name: "Certificato medico", status: "EXPIRED", expiresAt: "2026-10-01", daysRemaining: -42 })],
          }),
        ),
      }),
    });
    renderScreen(<PersonalHome />);
    const week = await screen.findByRole("table", { name: WEEK_TABLE });
    expect(await within(week).findByText("Non sei convocabile: controlla i documenti")).toBeInTheDocument();
    await userEvent.click(within(week).getByRole("button", { name: "Allenamento U16" }));
    const dialog = await screen.findByRole("dialog", { name: "Allenamento U16" });
    expect(within(dialog).getByText("Non sei convocabile: controlla i documenti")).toBeInTheDocument();
    expect(within(dialog).getByRole("link", { name: "Apri documenti" })).toHaveAttribute("href", "/area-personale/documenti");
    expect(within(dialog).queryByRole("button", { name: /Confermo la presenza/ })).not.toBeInTheDocument();
  });

  it("does not claim the athlete cannot be convocated when nothing says so", async () => {
    api({
      "GET /members/m-sara": () => ({
        body: detailOf(member({ id: "m-sara", firstName: "Sara", lastName: "Conti", teams: [{ ...U16, category: null, position: null, jerseyNumber: null }] })),
      }),
    });
    renderScreen(<PersonalHome />);
    const week = await screen.findByRole("table", { name: WEEK_TABLE });
    expect(await within(week).findByText("Nessuna convocazione")).toBeInTheDocument();
    expect(within(week).queryByText(/Non sei convocabile/)).not.toBeInTheDocument();
  });
});

describe("PersonalHome: answering from an appointment", () => {
  const trainingEvent = training();

  function answerApi(initial: Convocation, extra: Parameters<typeof mockApi>[0] = {}) {
    let stored = initial;
    const calls = api({
      "GET /events": () => page([trainingEvent]),
      "GET /convocations": () => page([stored]),
      [`PUT /convocations/${initial.id}/response`]: (request) => {
        const body = request.body as { status: "CONFIRMED" | "DECLINED"; reason?: string };
        stored = { ...stored, status: body.status, declineReason: body.reason ?? null };
        return { body: stored };
      },
      ...extra,
    }).calls;
    return calls;
  }

  async function openTraining() {
    const week = await screen.findByRole("table", { name: WEEK_TABLE });
    await userEvent.click(await within(week).findByRole("button", { name: "Allenamento U16" }));
    return { week, dialog: await screen.findByRole("dialog", { name: "Allenamento U16" }) };
  }

  it("opens the event on click, with its details and the two buttons to answer", async () => {
    answerApi(convocationOf(trainingEvent, "PENDING"));
    renderScreen(<PersonalHome />);
    const { dialog } = await openTraining();
    expect(dialog).toHaveAccessibleDescription("Giovedì 12 novembre · 19:00–20:30 · Palazzetto");
    expect(within(dialog).getByText("Allenamento · U16")).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Confermo la presenza di Sara Conti" })).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Non ci sono: Sara Conti" })).toBeInTheDocument();
    await expectNoA11yViolations(dialog);
  });

  it("confirms the presence, refreshes the lists and lets the athlete change her mind", async () => {
    const calls = answerApi(convocationOf(trainingEvent, "PENDING"));
    renderScreen(<PersonalHome />);
    const { week, dialog } = await openTraining();
    await userEvent.click(within(dialog).getByRole("button", { name: "Confermo la presenza di Sara Conti" }));

    expect(await screen.findByText("Presenza confermata")).toBeInTheDocument();
    expect(calls.find((call) => call.method === "PUT")?.body).toEqual({ status: "CONFIRMED" });
    await waitFor(() => expect(within(rowOf(week, "Allenamento U16")).getByText("Confermato")).toBeInTheDocument());
    expect(calls.filter((call) => call.path === "/convocations" && call.method === "GET").length).toBeGreaterThanOrEqual(2);
    expect(calls.filter((call) => call.path === "/events").length).toBeGreaterThanOrEqual(2);

    await waitFor(() => expect(within(dialog).queryByRole("button", { name: /Confermo la presenza/ })).not.toBeInTheDocument());
    await userEvent.click(within(dialog).getByRole("button", { name: "Non ci sono: Sara Conti" }));
    await userEvent.click(within(dialog).getByRole("button", { name: "Conferma che non ci sono" }));
    await waitFor(() => expect(within(rowOf(week, "Allenamento U16")).getByText("Rifiutato")).toBeInTheDocument());
    expect(calls.filter((call) => call.method === "PUT")).toHaveLength(2);
  });

  it("declines with an optional reason", async () => {
    const calls = answerApi(convocationOf(trainingEvent, "PENDING"));
    renderScreen(<PersonalHome />);
    const { week, dialog } = await openTraining();
    await userEvent.click(within(dialog).getByRole("button", { name: "Non ci sono: Sara Conti" }));
    await userEvent.type(within(dialog).getByLabelText("Motivo (facoltativo)"), "Ho l'esame");
    await userEvent.click(within(dialog).getByRole("button", { name: "Conferma che non ci sono" }));

    expect(await screen.findByText("Risposta registrata")).toBeInTheDocument();
    expect(calls.find((call) => call.method === "PUT")?.body).toEqual({ status: "DECLINED", reason: "Ho l'esame" });
    await waitFor(() => expect(within(rowOf(week, "Allenamento U16")).getByText("Rifiutato")).toBeInTheDocument());
    expect(await within(dialog).findByText("Motivo: Ho l'esame")).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Confermo la presenza di Sara Conti" })).toBeInTheDocument();
  });

  it("explains a refusal of the server when the event started meanwhile", async () => {
    answerApi(convocationOf(trainingEvent, "PENDING"), {
      "PUT /convocations/cv-ev-train-m-sara/response": () => problem(409, "event_started"),
    });
    renderScreen(<PersonalHome />);
    const { dialog } = await openTraining();
    await userEvent.click(within(dialog).getByRole("button", { name: "Confermo la presenza di Sara Conti" }));
    expect(await within(dialog).findByText("L'evento è già iniziato.")).toBeInTheDocument();
  });

  it("opens from the keyboard and gives the focus back to the event when it closes", async () => {
    answerApi(convocationOf(trainingEvent, "PENDING"));
    renderScreen(<PersonalHome />);
    const week = await screen.findByRole("table", { name: WEEK_TABLE });
    const button = await within(week).findByRole("button", { name: "Allenamento U16" });
    button.focus();
    await userEvent.keyboard("{Enter}");
    const dialog = await screen.findByRole("dialog", { name: "Allenamento U16" });
    expect(dialog).toBeInTheDocument();
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    await waitFor(() => expect(button).toHaveFocus());
  });

  it("opens from any cell of the row with the mouse, and gives the focus back to the event when it closes", async () => {
    answerApi(convocationOf(trainingEvent, "PENDING"));
    renderScreen(<PersonalHome />);
    const week = await screen.findByRole("table", { name: WEEK_TABLE });
    await userEvent.click(await within(week).findByText("Palazzetto"));
    await screen.findByRole("dialog", { name: "Allenamento U16" });
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(within(week).getByRole("button", { name: "Allenamento U16" })).toHaveFocus());
  });

  it("answers for the right child when the guardian has more than one", async () => {
    auth.me = guardianMe();
    const anna = memberRef("m-anna", "Anna", "Conti");
    const marta = memberRef("m-marta", "Marta", "Conti");
    let martaStatus: ConvocationStatus = "PENDING";
    const calls = api({
      "GET /members/m-anna": () => ({ body: detailOf(member({ id: "m-anna", firstName: "Anna", lastName: "Conti", teams: [{ ...U16, category: null, position: null, jerseyNumber: null }] })) }),
      "GET /members/m-marta": () => ({ body: detailOf(member({ id: "m-marta", firstName: "Marta", lastName: "Conti", teams: [{ ...U16, category: null, position: null, jerseyNumber: null }] })) }),
      "GET /fees": () => page([]),
      "GET /events": () => page([trainingEvent]),
      "GET /convocations": () => page([convocationOf(trainingEvent, "PENDING", anna), convocationOf(trainingEvent, martaStatus, marta)]),
      "PUT /convocations/cv-ev-train-m-marta/response": () => {
        martaStatus = "CONFIRMED";
        return { body: convocationOf(trainingEvent, "CONFIRMED", marta) };
      },
    }).calls;
    renderScreen(<PersonalHome />);
    const week = await screen.findByRole("table", { name: WEEK_TABLE });
    await userEvent.click(await within(week).findByRole("button", { name: "Allenamento U16: Marta Conti" }));
    const dialog = await screen.findByRole("dialog", { name: "Allenamento U16" });
    expect(within(dialog).queryByRole("button", { name: /Anna Conti/ })).not.toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole("button", { name: "Confermo la presenza di Marta Conti" }));
    await screen.findByText("Presenza confermata");
    expect(calls.find((call) => call.method === "PUT")?.path).toBe("/convocations/cv-ev-train-m-marta/response");
    await waitFor(() => expect(within(rowOf(week, "Allenamento U16: Marta Conti")).getByText("Confermato")).toBeInTheDocument());
    expect(within(rowOf(week, "Allenamento U16: Anna Conti")).getByText("Da rispondere")).toBeInTheDocument();
  });

  it("tells that an event already started and does not offer to answer it", async () => {
    const morning = training({ id: "ev-morning", title: "Allenamento del mattino", startsAt: at(11, 12, 8), endsAt: at(11, 12, 9, 30) });
    api({ "GET /events": () => page([morning]), "GET /convocations": () => page([convocationOf(morning, "PENDING")]) });
    renderScreen(<PersonalHome />);
    const week = await screen.findByRole("table", { name: WEEK_TABLE });
    expect(await within(week).findByText("Senza risposta")).toBeInTheDocument();
    await userEvent.click(within(week).getByRole("button", { name: "Allenamento del mattino" }));
    const dialog = await screen.findByRole("dialog", { name: "Allenamento del mattino" });
    expect(within(dialog).getByText("L'evento è già iniziato: non si può più rispondere.")).toBeInTheDocument();
    expect(within(dialog).queryByRole("button", { name: /Confermo la presenza|Non ci sono/ })).not.toBeInTheDocument();
  });

  it("keeps the answer given to an event that already started, read only", async () => {
    const morning = training({ id: "ev-morning", title: "Allenamento del mattino", startsAt: at(11, 12, 8), endsAt: at(11, 12, 9, 30) });
    api({ "GET /events": () => page([morning]), "GET /convocations": () => page([convocationOf(morning, "CONFIRMED")]) });
    renderScreen(<PersonalHome />);
    const week = await screen.findByRole("table", { name: WEEK_TABLE });
    expect(await within(week).findByText("Confermato")).toBeInTheDocument();
    await userEvent.click(within(week).getByRole("button", { name: "Allenamento del mattino" }));
    const dialog = await screen.findByRole("dialog", { name: "Allenamento del mattino" });
    expect(within(dialog).getByText("L'evento è già iniziato: non si può più cambiare la risposta.")).toBeInTheDocument();
    expect(within(dialog).queryByRole("button", { name: /Non ci sono/ })).not.toBeInTheDocument();
  });

  it("tells that an event was cancelled and does not offer to answer it", async () => {
    const cancelled = training({ id: "ev-cancelled", title: "Allenamento annullato", status: "CANCELLED" });
    api({ "GET /events": () => page([cancelled]), "GET /convocations": () => page([convocationOf(cancelled, "PENDING")]) });
    renderScreen(<PersonalHome />);
    const week = await screen.findByRole("table", { name: WEEK_TABLE });
    expect(await within(week).findByText("Annullato")).toBeInTheDocument();
    await userEvent.click(within(week).getByRole("button", { name: "Allenamento annullato" }));
    const dialog = await screen.findByRole("dialog", { name: "Allenamento annullato" });
    expect(within(dialog).getByText("Evento annullato: non c'è più nulla a cui rispondere.")).toBeInTheDocument();
    expect(within(dialog).queryByRole("button", { name: /Confermo la presenza|Non ci sono/ })).not.toBeInTheDocument();
  });

  it("shows an event of no team without any answer to give", async () => {
    const dinner = makeEvent({ id: "ev-dinner", type: "MEETING", title: "Cena sociale", startsAt: at(11, 13, 20), team: null });
    api({ "GET /events": () => page([dinner]) });
    renderScreen(<PersonalHome />);
    const week = await screen.findByRole("table", { name: WEEK_TABLE });
    await userEvent.click(await within(week).findByRole("button", { name: "Cena sociale" }));
    const dialog = await screen.findByRole("dialog", { name: "Cena sociale" });
    expect(within(dialog).getByText("Per questo evento non serve rispondere.")).toBeInTheDocument();
    expect(within(dialog).queryByRole("button", { name: /Confermo la presenza|Non ci sono/ })).not.toBeInTheDocument();
  });
});
