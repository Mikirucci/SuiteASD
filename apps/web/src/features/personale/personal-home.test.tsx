import { screen, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CalendarEvent } from "@/features/calendario/types";
import type { Fee } from "@/features/quote/types";
import type { MeResponse } from "@/lib/api";
import { expectNoA11yViolations } from "@/test/a11y";
import { ANNA_FERRI, SARA_CONTI, detailOf, member, mockApi, page, problem, renderScreen } from "../tesserati/test-support";
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
    createdAt: "2026-10-01T08:00:00.000Z",
    updatedAt: "2026-10-01T08:00:00.000Z",
    ...overrides,
  };
}

function event(overrides: Partial<CalendarEvent> = {}): CalendarEvent {
  return {
    id: "ev-1",
    type: "TRAINING",
    title: "Allenamento U16",
    startsAt: "2026-11-12T18:00:00.000Z",
    endsAt: "2026-11-12T19:30:00.000Z",
    status: "SCHEDULED",
    notes: null,
    team: { id: "t16", name: "U16" },
    venue: { id: "v-1", name: "Palazzetto", address: null },
    recurrenceRule: null,
    recurrenceParentId: null,
    convocations: { confirmed: 0, declined: 0, pending: 0, total: 0, capacity: 12 },
    convocationsSentAt: null,
    createdAt: "2026-10-01T08:00:00.000Z",
    updatedAt: "2026-10-01T08:00:00.000Z",
    ...overrides,
  };
}

beforeEach(() => {
  auth.me = athleteMe();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function api(extra: Parameters<typeof mockApi>[0] = {}) {
  return mockApi({
    "GET /members/m-sara": () => ({ body: detailOf(SARA_CONTI) }),
    "GET /fees": () => page([fee()]),
    "GET /events": () => page([event()]),
    "GET /convocations": () => page([]),
    ...extra,
  });
}

describe("PersonalHome", () => {
  it("greets the athlete and shows documents, payments and the next appointments", async () => {
    api();
    const { container } = renderScreen(<PersonalHome />);
    expect(screen.getByRole("heading", { level: 1, name: "Ciao Sara, ecco la tua area." })).toBeInTheDocument();

    const summary = await screen.findByRole("region", { name: "Riepilogo" });
    expect(await within(summary).findByText("1 in scadenza")).toBeInTheDocument();
    expect(await within(summary).findByText(/1 quota da pagare · € 60/)).toBeInTheDocument();
    expect(within(summary).getByRole("link", { name: "Apri: documenti" })).toHaveAttribute("href", "/area-personale/documenti");
    expect(within(summary).getByRole("link", { name: "Apri: pagamenti" })).toHaveAttribute("href", "/area-personale/pagamenti");

    const events = await screen.findByRole("list", { name: "Prossimi appuntamenti" });
    expect(within(events).getByText("Allenamento U16")).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it("flags overdue fees and a missing certificate", async () => {
    api({
      "GET /members/m-sara": () => ({ body: detailOf(ANNA_FERRI, { id: "m-sara" }) }),
      "GET /fees": () => page([fee({ status: "OVERDUE" }), fee({ id: "fee-2", amountCents: 4000, status: "PENDING" })]),
    });
    renderScreen(<PersonalHome />);
    const summary = await screen.findByRole("region", { name: "Riepilogo" });
    expect(await within(summary).findByText("1 documento mancante")).toBeInTheDocument();
    expect(await within(summary).findByText(/2 quote da pagare · € 100/)).toBeInTheDocument();
    expect(within(summary).getByText("1 scaduta")).toBeInTheDocument();
  });

  it("congratulates when everything is in order", async () => {
    api({
      "GET /members/m-sara": () => ({ body: detailOf(member({ id: "m-sara", firstName: "Sara", lastName: "Conti" })) }),
      "GET /fees": () => page([fee({ status: "PAID", paidAt: "2026-11-02T08:00:00.000Z" })]),
    });
    renderScreen(<PersonalHome />);
    const summary = await screen.findByRole("region", { name: "Riepilogo" });
    expect(await within(summary).findByText("Tutto pagato")).toBeInTheDocument();
    expect(within(summary).getAllByText("In regola").length).toBeGreaterThan(0);
  });

  it("shows only the events of the team of the athlete and the ones of no team", async () => {
    api({
      "GET /events": () =>
        page([
          event({ id: "ev-a", title: "Allenamento U16" }),
          event({ id: "ev-b", title: "Allenamento Serie D", team: { id: "td", name: "Serie D" } }),
          event({ id: "ev-c", title: "Cena sociale", type: "MEETING", team: null }),
        ]),
    });
    renderScreen(<PersonalHome />);
    const events = await screen.findByRole("list", { name: "Prossimi appuntamenti" });
    const titles = within(events).getAllByRole("listitem").map((item) => item.querySelector("p")?.textContent);
    expect(titles).toEqual(["Allenamento U16", "Cena sociale"]);
  });

  it("asks only for the events of the next thirty days that are still scheduled", async () => {
    const calls = api().calls;
    renderScreen(<PersonalHome />);
    await screen.findByRole("list", { name: "Prossimi appuntamenti" });
    const request = calls.find((call) => call.path === "/events");
    expect(request?.query.get("status")).toBe("SCHEDULED");
    const days = (new Date(request?.query.get("to") ?? "").getTime() - new Date(request?.query.get("from") ?? "").getTime()) / 86_400_000;
    expect(days).toBe(30);
  });

  it("explains an empty calendar", async () => {
    api({ "GET /events": () => page([]) });
    renderScreen(<PersonalHome />);
    expect(await screen.findByRole("heading", { name: "Nessun appuntamento nei prossimi giorni" })).toBeInTheDocument();
  });

  it("shows a pending convocation with the buttons to answer it", async () => {
    api({
      "GET /convocations": () =>
        page([
          {
            id: "conv-1",
            status: "PENDING",
            declineReason: null,
            member: { id: "m-sara", firstName: "Sara", lastName: "Conti" },
            event: event({ title: "Aquile vs Delfini", type: "MATCH" }),
          },
        ]),
    });
    renderScreen(<PersonalHome />);
    expect(await screen.findByRole("heading", { name: "Da confermare" })).toBeInTheDocument();
    expect(await screen.findByRole("button", { name: "Confermo la presenza di Sara Conti" })).toBeInTheDocument();
  });

  it("gives each child an overview of their own", async () => {
    auth.me = guardianMe();
    api({
      "GET /members/m-anna": () => ({ body: detailOf(member({ id: "m-anna", firstName: "Anna", lastName: "Conti" })) }),
      "GET /members/m-marta": () => ({ body: detailOf(ANNA_FERRI, { id: "m-marta", firstName: "Marta", lastName: "Conti" }) }),
      "GET /fees": (request) => page(request.query.get("memberId") === "m-marta" ? [fee({ memberId: "m-marta" })] : []),
    });
    renderScreen(<PersonalHome />);
    const anna = await screen.findByRole("region", { name: "Riepilogo di Anna Conti" });
    const marta = await screen.findByRole("region", { name: "Riepilogo di Marta Conti" });
    expect(await within(anna).findByText("Tutto pagato")).toBeInTheDocument();
    expect(await within(marta).findByText("1 documento mancante")).toBeInTheDocument();
    expect(await within(marta).findByText(/1 quota da pagare/)).toBeInTheDocument();
  });

  it("shows an error with a retry where a request fails", async () => {
    let attempts = 0;
    api({ "GET /fees": () => (++attempts === 1 ? problem(500, "internal_error") : page([])) });
    renderScreen(<PersonalHome />);
    const summary = await screen.findByRole("region", { name: "Riepilogo" });
    expect(await within(summary).findByRole("alert")).toBeInTheDocument();
  });

  it("explains when no member is linked to the account", async () => {
    auth.me = { ...athleteMe(), member: null };
    api();
    renderScreen(<PersonalHome />);
    expect(await screen.findByRole("heading", { name: "Nessun tesserato collegato al tuo account" })).toBeInTheDocument();
  });
});
