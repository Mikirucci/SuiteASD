import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CalendarEvent } from "@/features/calendario/types";
import type { Fee, FeesSummary } from "@/features/quote/types";
import { ANNA_FERRI, SARA_CONTI, member, team } from "@/features/tesserati/test-support";
import type { MemberListItem, Team } from "@/features/tesserati/types";
import { expectNoA11yViolations } from "@/test/a11y";
import { json, page, problem, renderWithProviders, stubApi } from "@/test/stub-api";
import { TeamDetailPage } from "./team-detail-page";

const mocks = vi.hoisted(() => ({ permissions: [] as string[], push: vi.fn<(url: string) => void>() }));

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: mocks.push }), usePathname: () => "/squadre/t16" }));
vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: { href: string; children: ReactNode } & Record<string, unknown>) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));
vi.mock("@/features/auth/auth-provider", () => ({
  useAuth: () => ({ status: "authenticated", me: { permissions: mocks.permissions, roles: ["ADMIN"] } }),
}));

const ALL_PERMISSIONS = ["teams:read", "teams:write", "members:read", "members:write", "events:read", "payments:read"];

const U16: Team = {
  ...team("t16", "Under 16", "U16"),
  description: "Martedì e giovedì, palestra comunale",
  membersCount: 2,
};

const U16_REF = { id: "t16", name: "Under 16", category: "U16" };
const SARA: MemberListItem = {
  ...SARA_CONTI,
  teams: [{ ...U16_REF, position: "Libero", jerseyNumber: 7 }],
};
const ANNA: MemberListItem = {
  ...ANNA_FERRI,
  teams: [{ ...U16_REF, position: null, jerseyNumber: null }],
  fieldRole: "Schiacciatrice",
};

function feeOf(id: string, memberId: string, status: Fee["status"], amountCents: number): Fee {
  return {
    id,
    memberId,
    memberName: memberId === SARA.id ? "Sara Conti" : "Anna Ferri",
    teams: [{ id: "t16", name: "Under 16" }],
    feePlanId: null,
    description: "Quota di novembre",
    amountCents,
    currency: "EUR",
    dueDate: "2026-11-10",
    status,
    paidAt: null,
    method: null,
    payerName: null,
    payerEmail: null,
    reference: null,
    reminderCount: 0,
    lastReminderAt: null,
    claimedAt: null,
    receipt: null,
    createdAt: "2026-10-01T08:00:00.000Z",
    updatedAt: "2026-10-01T08:00:00.000Z",
  };
}

const SUMMARY: FeesSummary = {
  incassatoCents: 24_000,
  daIncassareCents: 18_000,
  scadutoCents: 6_000,
  promemoriaInviati: 2,
  paidCount: 4,
  pendingCount: 2,
  overdueCount: 1,
};

function eventOf(id: string, title: string, startsAt: string): CalendarEvent {
  return {
    id,
    type: "TRAINING",
    title,
    startsAt,
    endsAt: null,
    status: "SCHEDULED",
    notes: null,
    team: { id: "t16", name: "Under 16" },
    venue: { id: "v1", name: "Palestra comunale", address: null },
    recurrenceRule: null,
    recurrenceParentId: null,
    convocations: { confirmed: 0, declined: 0, pending: 0, total: 0, capacity: 0 },
    convocationsSentAt: null,
    createdAt: "2026-09-01T08:00:00.000Z",
    updatedAt: "2026-09-01T08:00:00.000Z",
  };
}

beforeEach(() => {
  mocks.permissions = ALL_PERMISSIONS;
  mocks.push.mockReset();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function routes(extra: Parameters<typeof stubApi>[0] = {}) {
  return {
    "GET /teams/t16": () => json(200, U16),
    "GET /members": () => json(200, page([SARA, ANNA])),
    "GET /events": () => json(200, page([])),
    "GET /fees/summary": () => json(200, SUMMARY),
    "GET /fees": () => json(200, page([])),
    ...extra,
  };
}

describe("TeamDetailPage", () => {
  it("shows a loading state, then the team with its details and a way back to the list", async () => {
    stubApi(routes());
    const { container } = renderWithProviders(<TeamDetailPage id="t16" />);
    expect(screen.getByRole("status", { name: "Caricamento della squadra" })).toBeInTheDocument();

    expect(await screen.findByRole("heading", { level: 1, name: /Under 16/ })).toBeInTheDocument();
    expect(screen.getByText("Martedì e giovedì, palestra comunale")).toBeInTheDocument();
    expect(screen.getByText("Femminile")).toBeInTheDocument();
    expect(screen.getByText("2 tesserati")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Tutte le squadre" })).toHaveAttribute("href", "/squadre");
    await screen.findByRole("table", { name: "Rosa di Under 16" });
    await expectNoA11yViolations(container);
  });

  it("lists the roster with role, jersey number, documents and a link to each member", async () => {
    const api = stubApi(routes());
    renderWithProviders(<TeamDetailPage id="t16" />);

    const table = await screen.findByRole("table", { name: "Rosa di Under 16" });
    const sara = within(table).getByRole("link", { name: "Sara Conti" });
    expect(sara).toHaveAttribute("href", "/tesserati/m-sara");
    expect(within(table).getByRole("link", { name: "Anna Ferri" })).toHaveAttribute("href", "/tesserati/m-anna");

    const saraRow = sara.closest("tr") as HTMLElement;
    expect(saraRow).toHaveTextContent("Libero");
    expect(saraRow).toHaveTextContent("n. 7");
    expect(saraRow).toHaveTextContent("1 in scadenza");
    const annaRow = within(table).getByRole("link", { name: "Anna Ferri" }).closest("tr") as HTMLElement;
    // Without a position in this team the role on the court of the member is used
    expect(annaRow).toHaveTextContent("Schiacciatrice");
    expect(annaRow).toHaveTextContent("1 documento mancante");
    expect(annaRow).toHaveTextContent("Non assegnata");
    expect(api.calls.find((call) => call.path === "/members")?.query.get("teamId")).toBe("t16");
  });

  it("explains an empty roster and offers to add athletes right here", async () => {
    stubApi(routes({ "GET /members": () => json(200, page([])) }));
    renderWithProviders(<TeamDetailPage id="t16" />);
    expect(await screen.findByRole("heading", { name: "Nessun tesserato in questa squadra" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Aggiungi atleti" }));
    expect(await screen.findByRole("dialog", { name: "Aggiungi atleti a Under 16" })).toBeInTheDocument();
  });

  it("does not offer to add athletes to who cannot write teams", async () => {
    mocks.permissions = ["teams:read", "members:read"];
    stubApi(routes({ "GET /members": () => json(200, page([])) }));
    renderWithProviders(<TeamDetailPage id="t16" />);
    expect(await screen.findByRole("heading", { name: "Nessun tesserato in questa squadra" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Aggiungi atleti" })).not.toBeInTheDocument();
  });

  it("searches the roster by name and tells when nobody matches", async () => {
    const api = stubApi(
      routes({
        "GET /members": ({ query }) =>
          json(200, page(query.get("q") === "zzz" ? [] : query.get("q") === "sara" ? [SARA] : [SARA, ANNA])),
      }),
    );
    renderWithProviders(<TeamDetailPage id="t16" />);
    await screen.findByRole("table", { name: "Rosa di Under 16" });

    await userEvent.type(screen.getByRole("searchbox", { name: "Cerca nella rosa" }), "sara");
    // The search waits for a pause in typing, then the roster reloads with the narrowed result
    await waitFor(() => expect(screen.queryByRole("link", { name: "Anna Ferri" })).not.toBeInTheDocument());
    expect(await screen.findByRole("link", { name: "Sara Conti" })).toBeInTheDocument();
    expect(api.calls.some((call) => call.path === "/members" && call.query.get("q") === "sara")).toBe(true);

    await userEvent.clear(screen.getByRole("searchbox", { name: "Cerca nella rosa" }));
    await userEvent.type(screen.getByRole("searchbox", { name: "Cerca nella rosa" }), "zzz");
    expect(await screen.findByRole("heading", { name: "Nessun tesserato trovato" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Azzera la ricerca" }));
    expect(await screen.findByRole("link", { name: "Anna Ferri" })).toBeInTheDocument();
  });

  it("loads further members of the roster on request", async () => {
    stubApi(
      routes({ "GET /members": ({ query }) => json(200, query.get("cursor") ? page([ANNA]) : page([SARA], "next")) }),
    );
    renderWithProviders(<TeamDetailPage id="t16" />);
    await screen.findByRole("link", { name: "Sara Conti" });
    await userEvent.click(screen.getByRole("button", { name: "Carica altri tesserati" }));
    expect(await screen.findByRole("link", { name: "Anna Ferri" })).toBeInTheDocument();
  });

  it("marks the members who have unpaid fees, overdue first, when the role can read payments", async () => {
    const api = stubApi(
      routes({
        "GET /fees": ({ query }) =>
          json(
            200,
            page(
              query.get("status") === "OVERDUE"
                ? [feeOf("f1", SARA.id, "OVERDUE", 6_000)]
                : [feeOf("f2", SARA.id, "PENDING", 3_000), feeOf("f3", ANNA.id, "PENDING", 6_000)],
            ),
          ),
      }),
    );
    renderWithProviders(<TeamDetailPage id="t16" />);
    const table = await screen.findByRole("table", { name: "Rosa di Under 16" });
    const saraRow = within(table).getByRole("link", { name: "Sara Conti" }).closest("tr") as HTMLElement;
    await waitFor(() => expect(saraRow).toHaveTextContent("Scaduta € 60"));
    expect(saraRow).toHaveTextContent("Da pagare € 30");
    const annaRow = within(table).getByRole("link", { name: "Anna Ferri" }).closest("tr") as HTMLElement;
    expect(annaRow).toHaveTextContent("Da pagare € 60");
    expect(annaRow).not.toHaveTextContent("Scaduta");
    const statuses = api.calls.filter((call) => call.path === "/fees").map((call) => call.query.get("status"));
    expect(statuses.sort()).toEqual(["OVERDUE", "PENDING"]);
    expect(api.calls.filter((call) => call.path === "/fees").every((call) => call.query.get("teamId") === "t16")).toBe(
      true,
    );
  });

  it("summarises the fees of the team when the role can read payments", async () => {
    const api = stubApi(routes());
    renderWithProviders(<TeamDetailPage id="t16" />);
    const block = await screen.findByRole("region", { name: "Quote della squadra" });
    await waitFor(() => expect(block).toHaveTextContent("€ 240"));
    expect(block).toHaveTextContent("Incassato");
    expect(block).toHaveTextContent("Da incassare");
    expect(block).toHaveTextContent("€ 180");
    expect(block).toHaveTextContent("di cui scaduto € 60");
    expect(within(block).getByRole("link", { name: "Apri le quote" })).toHaveAttribute("href", "/quote");
    expect(api.calls.find((call) => call.path === "/fees/summary")?.query.get("teamId")).toBe("t16");
  });

  it("hides the fees, and does not ask for them, from a role without the payments permission", async () => {
    mocks.permissions = ["teams:read", "members:read", "events:read"];
    const api = stubApi(routes());
    renderWithProviders(<TeamDetailPage id="t16" />);
    const table = await screen.findByRole("table", { name: "Rosa di Under 16" });
    expect(screen.queryByRole("region", { name: "Quote della squadra" })).not.toBeInTheDocument();
    expect(within(table).queryByRole("columnheader", { name: "Quota" })).not.toBeInTheDocument();
    expect(api.calls.some((call) => call.path.startsWith("/fees"))).toBe(false);
  });

  it("hides the roster, and does not ask for it, from a role that cannot read members", async () => {
    mocks.permissions = ["teams:read", "events:read"];
    const api = stubApi(routes());
    renderWithProviders(<TeamDetailPage id="t16" />);
    expect(await screen.findByRole("heading", { level: 1, name: /Under 16/ })).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Rosa" })).not.toBeInTheDocument();
    expect(api.calls.some((call) => call.path === "/members")).toBe(false);
  });

  it("lists the next three appointments with a quiet link to the whole calendar", async () => {
    const api = stubApi(
      routes({
        "GET /events": () =>
          json(
            200,
            page([
              eventOf("e1", "Allenamento del martedì", "2026-11-10T17:00:00.000Z"),
              eventOf("e2", "Allenamento del giovedì", "2026-11-12T17:00:00.000Z"),
            ]),
          ),
      }),
    );
    renderWithProviders(<TeamDetailPage id="t16" />);
    const block = await screen.findByRole("region", { name: "Prossimi appuntamenti" });
    await waitFor(() => expect(block).toHaveTextContent("Allenamento del martedì"));
    expect(block).toHaveTextContent("Allenamento del giovedì");
    expect(block).toHaveTextContent("Palestra comunale");
    expect(within(block).getByRole("link", { name: "Vedi tutti gli appuntamenti" })).toHaveAttribute("href", "/calendario");
    expect(within(block).queryByRole("button")).not.toBeInTheDocument();
    const request = api.calls.find((call) => call.path === "/events");
    expect(request?.query.get("teamId")).toBe("t16");
    expect(request?.query.get("status")).toBe("SCHEDULED");
    expect(request?.query.get("limit")).toBe("3");
    // "Next" means from this moment on, so past events never take a place
    expect(Math.abs(new Date(request?.query.get("from") ?? "").getTime() - Date.now())).toBeLessThan(60_000);
  });

  it("says there is nothing scheduled when the team has no appointments", async () => {
    stubApi(routes());
    renderWithProviders(<TeamDetailPage id="t16" />);
    const block = await screen.findByRole("region", { name: "Prossimi appuntamenti" });
    expect(await within(block).findByText("Nessun appuntamento in programma")).toBeInTheDocument();
  });

  it("keeps the rest of the page when the appointments fail to load", async () => {
    stubApi(routes({ "GET /events": () => problem(500, "internal") }));
    renderWithProviders(<TeamDetailPage id="t16" />);
    const block = await screen.findByRole("region", { name: "Prossimi appuntamenti" });
    expect(await within(block).findByText(/Il servizio non è disponibile/)).toBeInTheDocument();
    expect(screen.getByRole("table", { name: "Rosa di Under 16" })).toBeInTheDocument();
  });

  it("edits the team from its page", async () => {
    const api = stubApi(routes({ "PATCH /teams/t16": () => json(200, { ...U16, name: "Under 16 Blu" }) }));
    renderWithProviders(<TeamDetailPage id="t16" />);
    await userEvent.click(await screen.findByRole("button", { name: "Modifica" }));
    const dialog = await screen.findByRole("dialog", { name: "Modifica squadra" });
    expect(within(dialog).getByRole("textbox", { name: /^Nome/ })).toHaveValue("Under 16");
    await userEvent.type(within(dialog).getByRole("textbox", { name: /^Nome/ }), " Blu");
    await userEvent.click(within(dialog).getByRole("button", { name: "Salva modifiche" }));
    expect(await screen.findByText("Modifiche salvate")).toBeInTheDocument();
    expect(api.calls.find((call) => call.method === "PATCH")?.body).toMatchObject({ name: "Under 16 Blu" });
  });

  it("deletes the team after the confirmation and goes back to the list", async () => {
    const api = stubApi(routes({ "DELETE /teams/t16": () => json(204) }));
    renderWithProviders(<TeamDetailPage id="t16" />);
    await userEvent.click(await screen.findByRole("button", { name: "Elimina" }));
    const confirm = await screen.findByRole("dialog", { name: "Eliminare Under 16?" });
    expect(confirm).toHaveTextContent("2 tesserati restano in società ma escono dalla squadra");
    await userEvent.click(within(confirm).getByRole("button", { name: "Elimina" }));
    await waitFor(() => expect(mocks.push).toHaveBeenCalledWith("/squadre"));
    expect(api.calls.some((call) => call.method === "DELETE" && call.path === "/teams/t16")).toBe(true);
  });

  it("is read-only without the write permission", async () => {
    mocks.permissions = ["teams:read", "members:read", "events:read"];
    stubApi(routes());
    renderWithProviders(<TeamDetailPage id="t16" />);
    await screen.findByRole("table", { name: "Rosa di Under 16" });
    expect(screen.queryByRole("button", { name: "Modifica" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Elimina" })).not.toBeInTheDocument();
  });

  it("says the team does not exist on a 404 and links back to the list", async () => {
    stubApi(routes({ "GET /teams/t16": () => problem(404, "not_found") }));
    renderWithProviders(<TeamDetailPage id="t16" />);
    expect(await screen.findByRole("heading", { level: 1, name: "Squadra non trovata" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Tutte le squadre" })).toHaveAttribute("href", "/squadre");
  });

  it("shows the error in Italian and reloads with Riprova", async () => {
    let attempts = 0;
    stubApi(routes({ "GET /teams/t16": () => (++attempts === 1 ? problem(500, "internal") : json(200, U16)) }));
    renderWithProviders(<TeamDetailPage id="t16" />);
    expect(await screen.findByText(/Il servizio non è disponibile/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Riprova" }));
    expect(await screen.findByRole("heading", { level: 1, name: /Under 16/ })).toBeInTheDocument();
  });

  it("does not need the jersey of other teams: only the position in this one counts", async () => {
    const elsewhere = member({
      id: "m-elena",
      firstName: "Elena",
      lastName: "Neri",
      teams: [
        { id: "td", name: "Serie D", category: "Serie D", position: "Palleggiatrice", jerseyNumber: 3 },
        { ...U16_REF, position: "Opposto", jerseyNumber: 11 },
      ],
    });
    stubApi(routes({ "GET /members": () => json(200, page([elsewhere])) }));
    renderWithProviders(<TeamDetailPage id="t16" />);
    const row = (await screen.findByRole("link", { name: "Elena Neri" })).closest("tr") as HTMLElement;
    expect(row).toHaveTextContent("Opposto");
    expect(row).toHaveTextContent("n. 11");
    expect(row).not.toHaveTextContent("Palleggiatrice");
  });
});
