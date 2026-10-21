import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { tokens } from "@/lib/api";
import { expectNoA11yViolations } from "@/test/a11y";
import { json, page, problem, renderWithProviders, stubApi, type RecordedCall } from "@/test/stub-api";
import { defaultDueDate } from "./generate-fees-dialog";
import { PlanDetailPage } from "./plan-detail-page";
import {
  OVERDUE_FEE,
  PAID_FEE,
  PENDING_FEE,
  PLAN,
  PLAN_PEOPLE,
  PLAN_STATS,
  STAFF_PERMISSIONS,
  TEAMS,
} from "./test-support";

const auth = vi.hoisted(() => ({ permissions: [] as string[], roles: [] as string[] }));
vi.mock("@/features/auth/auth-provider", () => ({
  useAuth: () => ({ status: "authenticated", me: { permissions: auth.permissions, roles: auth.roles } }),
}));

const FEES = [PAID_FEE, PENDING_FEE, OVERDUE_FEE];

/** The API narrows the people by name, team and situation; the figures of the plan never change. */
function peopleRoute(call: RecordedCall) {
  const q = call.query.get("q")?.toLowerCase();
  const teamId = call.query.get("teamId");
  const status = call.query.get("status");
  const people = PLAN_PEOPLE.filter(
    (person) =>
      (!q || person.memberName.toLowerCase().includes(q)) &&
      (!teamId || person.teams.some((team) => team.id === teamId)) &&
      (!status || person.status === status),
  );
  return json(200, { stats: PLAN_STATS, people });
}

function routes(extra: Parameters<typeof stubApi>[0] = {}) {
  return {
    "GET /fee-plans/p-nov": () => json(200, PLAN),
    "GET /fee-plans/p-nov/people": peopleRoute,
    "GET /fees": (call: RecordedCall) => json(200, page(FEES.filter((fee) => fee.memberId === call.query.get("memberId")))),
    "GET /teams": () => json(200, page(TEAMS)),
    ...extra,
  };
}

beforeEach(() => {
  auth.permissions = STAFF_PERMISSIONS;
  auth.roles = ["SEGRETERIA"];
});

afterEach(() => {
  vi.unstubAllGlobals();
  tokens.clear();
});

describe("PlanDetailPage: report and people", () => {
  it("shows the report of the plan and every person with what is left to pay", async () => {
    stubApi(routes());
    const { container } = renderWithProviders(<PlanDetailPage id="p-nov" />);

    expect(screen.getByRole("status", { name: "Caricamento del piano" })).toBeInTheDocument();
    expect(await screen.findByRole("heading", { level: 1, name: "Quota novembre" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Tutti i pagamenti" })).toHaveAttribute("href", "/quote");

    const report = screen.getByRole("region", { name: "Rendiconto del piano" });
    expect(within(report).getByText("Incassato").parentElement?.parentElement).toHaveTextContent(/€\s60/);
    expect(within(report).getByText("Da incassare").parentElement?.parentElement).toHaveTextContent(/€\s120.*€\s60 scaduti/);
    expect(within(report).getByText("In regola").parentElement?.parentElement).toHaveTextContent("1 persona");
    expect(within(report).getByText("In attesa").parentElement?.parentElement).toHaveTextContent("1 persona");
    expect(within(report).getByText("Quote scadute").parentElement?.parentElement).toHaveTextContent("1 persona");

    const people = within(screen.getByRole("list", { name: "Persone del piano" })).getAllByRole("listitem");
    expect(people.map((item) => within(item).getByText(/^(Anna|Chiara|Marta) /).textContent)).toEqual(["Anna Ferri", "Chiara Neri", "Marta Bianchi"]);
    expect(people[0]).toHaveTextContent(/€\s0/);
    expect(within(people[0]!).getByText("In regola")).toBeInTheDocument();
    expect(people[0]).toHaveTextContent("Tutto pagato");
    expect(people[1]).toHaveTextContent("Da pagare in totale");
    expect(people[1]).toHaveTextContent(/€\s90/);
    expect(people[1]).toHaveTextContent(/€\s60 in questo piano/);
    expect(within(people[1]!).getByText("In attesa")).toBeInTheDocument();
    expect(within(people[2]!).getByText("Scaduta")).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it("searches and filters inside the plan through the API, leaving the report untouched", async () => {
    const api = stubApi(routes());
    renderWithProviders(<PlanDetailPage id="p-nov" />);
    await screen.findByText("Anna Ferri");

    await userEvent.click(screen.getByRole("button", { name: "Scaduta" }));
    await waitFor(() => expect(api.calls.some((call) => call.path === "/fee-plans/p-nov/people" && call.query.get("status") === "OVERDUE")).toBe(true));
    await waitFor(() => expect(screen.queryByText("Anna Ferri")).not.toBeInTheDocument());
    expect(screen.getByText("Marta Bianchi")).toBeInTheDocument();
    expect(within(screen.getByRole("region", { name: "Rendiconto del piano" })).getByText("Quote scadute")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Tutti" }));
    await userEvent.selectOptions(screen.getByLabelText("Squadra"), "t-u16");
    await waitFor(() => expect(api.calls.some((call) => call.query.get("teamId") === "t-u16")).toBe(true));
    await waitFor(() => expect(screen.queryByText("Marta Bianchi")).not.toBeInTheDocument());
    expect(screen.getByText("Chiara Neri")).toBeInTheDocument();

    await userEvent.type(screen.getByLabelText("Cerca un tesserato"), "zzz");
    expect(await screen.findByRole("heading", { name: "Nessuno con questi filtri" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Azzera i filtri" }));
    expect(await screen.findByText("Anna Ferri")).toBeInTheDocument();
    expect(screen.getByText("Marta Bianchi")).toBeInTheDocument();
  });

  it("invites to generate the fees when the plan has none yet", async () => {
    stubApi(
      routes({
        "GET /fee-plans/p-nov/people": () =>
          json(200, { stats: { incassatoCents: 0, daIncassareCents: 0, scadutoCents: 0, paidPeople: 0, pendingPeople: 0, overduePeople: 0 }, people: [] }),
      }),
    );
    renderWithProviders(<PlanDetailPage id="p-nov" />);
    expect(await screen.findByRole("heading", { name: "Nessuna quota in questo piano" })).toBeInTheDocument();
    expect(screen.queryByLabelText("Cerca un tesserato")).not.toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Genera quote" })).toHaveLength(2);
  });

  it("says when the plan does not exist, and retries when the server fails", async () => {
    stubApi(routes({ "GET /fee-plans/p-nov": () => problem(404, "not_found") }));
    renderWithProviders(<PlanDetailPage id="p-nov" />);
    expect(await screen.findByRole("heading", { name: "Piano non trovato" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Riprova" })).not.toBeInTheDocument();
  });

  it("shows an error with a retry button when the people cannot be loaded", async () => {
    let attempts = 0;
    stubApi(routes({ "GET /fee-plans/p-nov/people": (call: RecordedCall) => (++attempts === 1 ? problem(500, "internal") : peopleRoute(call)) }));
    renderWithProviders(<PlanDetailPage id="p-nov" />);
    await userEvent.click(await screen.findByRole("button", { name: "Riprova" }));
    expect(await screen.findByText("Anna Ferri")).toBeInTheDocument();
  });
});

describe("PlanDetailPage: the fees of a person", () => {
  const receiptRoute = () => new Response("%PDF-1.4", { status: 200, headers: { "content-type": "application/pdf" } });

  beforeEach(() => {
    URL.createObjectURL = () => "blob:ricevuta";
    URL.revokeObjectURL = vi.fn();
  });

  it("opens the fees of the person of that plan only", async () => {
    const api = stubApi(routes());
    renderWithProviders(<PlanDetailPage id="p-nov" />);
    await userEvent.click(await screen.findByRole("button", { name: /Chiara Neri/ }));

    const dialog = await screen.findByRole("dialog", { name: "Quote di Chiara Neri" });
    expect(dialog).toHaveAccessibleDescription(/€\s60 da pagare in questo piano · €\s90 in totale · Quota novembre/);
    expect(await within(dialog).findByText(/Quota novembre · €\s60/)).toBeInTheDocument();
    const request = api.calls.find((call) => call.path === "/fees");
    expect(request?.query.get("memberId")).toBe("m-neri");
    expect(request?.query.get("feePlanId")).toBe("p-nov");
  });

  it("shows the reminders sent for an unpaid fee and the action to register the payment", async () => {
    stubApi(routes());
    renderWithProviders(<PlanDetailPage id="p-nov" />);
    await userEvent.click(await screen.findByRole("button", { name: /Marta Bianchi/ }));
    const list = await screen.findByRole("dialog", { name: "Quote di Marta Bianchi" });
    await userEvent.click(await within(list).findByRole("button", { name: /^Marta Bianchi/ }));
    const dialog = await screen.findByRole("dialog", { name: "Marta Bianchi" });
    expect(within(dialog).getByText("Promemoria").nextElementSibling).toHaveTextContent(/2, ultimo il/);
    expect(within(dialog).getByRole("button", { name: "Registra pagamento" })).toBeInTheDocument();
  });

  it("opens the fee card with the numbered receipt and downloads it with the Bearer token", async () => {
    tokens.setTokens({ accessToken: "access-1", refreshToken: "refresh-1" });
    const api = stubApi(routes({ "GET /fees/f-paid/receipt": () => new Response("%PDF-1.4", { status: 200, headers: { "content-type": "application/pdf", "content-disposition": 'attachment; filename="ricevuta-0147.pdf"' } }) }));
    const saved: string[] = [];
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
      saved.push(this.download);
    });

    renderWithProviders(<PlanDetailPage id="p-nov" />);
    await userEvent.click(await screen.findByRole("button", { name: /Anna Ferri/ }));
    const list = await screen.findByRole("dialog", { name: "Quote di Anna Ferri" });
    await userEvent.click(await within(list).findByRole("button", { name: /^Anna Ferri/ }));
    const dialog = await screen.findByRole("dialog", { name: "Anna Ferri" });
    expect(within(dialog).getByText("n. 0147")).toBeInTheDocument();
    expect(within(dialog).getByText("Contanti")).toBeInTheDocument();
    expect(within(dialog).queryByRole("button", { name: "Registra pagamento" })).not.toBeInTheDocument();

    await userEvent.click(within(dialog).getByRole("button", { name: "Scarica ricevuta" }));
    await waitFor(() => expect(saved).toEqual(["ricevuta-0147.pdf"]));
    expect(api.calls.find((call) => call.path === "/fees/f-paid/receipt")?.headers.Authorization).toBe("Bearer access-1");
    click.mockRestore();
  });

  it("previews the receipt of a paid fee from the row", async () => {
    tokens.setTokens({ accessToken: "access-1", refreshToken: "refresh-1" });
    stubApi(routes({ "GET /fees/f-paid/receipt": receiptRoute }));
    renderWithProviders(<PlanDetailPage id="p-nov" />);
    await userEvent.click(await screen.findByRole("button", { name: /Anna Ferri/ }));
    await userEvent.click(await screen.findByRole("button", { name: "Vedi ricevuta n. 0147" }));
    const preview = await screen.findByRole("dialog", { name: "Ricevuta n. 0147" });
    expect(await within(preview).findByTitle("Anteprima di Ricevuta n. 0147")).toBeInTheDocument();
  });

  it("registers a payment from the fee card and then shows the receipt and the refreshed report", async () => {
    const PAID_NOW = {
      ...OVERDUE_FEE,
      status: "PAID" as const,
      paidAt: "2026-11-12T10:00:00.000Z",
      method: "BANK_TRANSFER" as const,
      receipt: { id: "r148", number: 148, code: "0148", issuedAt: "2026-11-12T10:00:00.000Z", sentAt: null },
    };
    const api = stubApi(routes({ "POST /fees/f-overdue/pay": () => json(200, PAID_NOW) }));
    renderWithProviders(<PlanDetailPage id="p-nov" />);

    await userEvent.click(await screen.findByRole("button", { name: /Marta Bianchi/ }));
    const list = await screen.findByRole("dialog", { name: "Quote di Marta Bianchi" });
    await userEvent.click(await within(list).findByRole("button", { name: /^Marta Bianchi/ }));
    await userEvent.click(within(await screen.findByRole("dialog", { name: "Marta Bianchi" })).getByRole("button", { name: "Registra pagamento" }));
    await userEvent.click(await screen.findByRole("button", { name: "Conferma pagamento" }));

    const dialog = await screen.findByRole("dialog", { name: "Marta Bianchi" });
    expect(await within(dialog).findByText(/Pagamento registrato\. Ricevuta n\. 0148/)).toBeInTheDocument();
    expect(api.count("POST /fees/f-overdue/pay")).toBe(1);
    // the plan report and the people are read again so the card of the person follows the payment
    await waitFor(() => expect(api.count("GET /fee-plans/p-nov/people")).toBeGreaterThan(1));
  });
});

describe("PlanDetailPage: managing the plan", () => {
  it("edits the plan and clears an optional field with null", async () => {
    const api = stubApi(routes({ "PATCH /fee-plans/p-nov": () => json(200, PLAN) }));
    renderWithProviders(<PlanDetailPage id="p-nov" />);
    await userEvent.click(await screen.findByRole("button", { name: "Modifica" }));
    const dialog = await screen.findByRole("dialog", { name: "Modifica il piano" });
    expect(within(dialog).getByLabelText(/Nome del piano/)).toHaveValue("Quota novembre");

    await userEvent.clear(within(dialog).getByLabelText("Giorno di scadenza"));
    await userEvent.click(within(dialog).getByRole("switch", { name: "Piano attivo" }));
    await userEvent.click(within(dialog).getByRole("button", { name: "Salva le modifiche" }));

    await waitFor(() => expect(api.count("PATCH /fee-plans/p-nov")).toBe(1));
    expect(api.calls.find((call) => call.method === "PATCH")?.body).toEqual({
      name: "Quota novembre",
      kind: "MONTHLY",
      amountCents: 6000,
      teamId: null,
      installments: null,
      dueDay: null,
      isActive: false,
    });
  });

  it("generates the fees of the plan and reports how many were created", async () => {
    const api = stubApi(routes({ "POST /fee-plans/p-nov/generate": () => json(200, { created: 18, skipped: 2 }) }));
    renderWithProviders(<PlanDetailPage id="p-nov" />);
    await userEvent.click(await screen.findByRole("button", { name: "Genera quote" }));
    const dialog = await screen.findByRole("dialog", { name: "Genera le quote" });
    expect(dialog).toHaveAccessibleDescription(/Quota novembre · €\s60/);

    await userEvent.clear(within(dialog).getByLabelText(/Scadenza delle quote/));
    await userEvent.type(within(dialog).getByLabelText(/Scadenza delle quote/), "2026-11-10");
    await userEvent.click(within(dialog).getByRole("button", { name: "Genera le quote" }));

    expect(await screen.findByText("18 quote create")).toBeInTheDocument();
    expect(screen.getByText(/2 tesserati la avevano già/)).toBeInTheDocument();
    expect(api.calls.find((call) => call.method === "POST")?.body).toEqual({ dueDate: "2026-11-10" });
    await waitFor(() => expect(api.count("GET /fee-plans/p-nov/people")).toBeGreaterThan(1));
  });

  it("explains an inactive plan when the server refuses to generate", async () => {
    stubApi(routes({ "POST /fee-plans/p-nov/generate": () => problem(409, "fee_plan_inactive", "Conflict") }));
    renderWithProviders(<PlanDetailPage id="p-nov" />);
    await userEvent.click(await screen.findByRole("button", { name: "Genera quote" }));
    const dialog = await screen.findByRole("dialog", { name: "Genera le quote" });
    await userEvent.click(within(dialog).getByRole("button", { name: "Genera le quote" }));
    expect(await within(dialog).findByText(/Il piano non è attivo/)).toBeInTheDocument();
  });

  it("offers no generation for an inactive plan", async () => {
    stubApi(routes({ "GET /fee-plans/p-nov": () => json(200, { ...PLAN, isActive: false }) }));
    renderWithProviders(<PlanDetailPage id="p-nov" />);
    await screen.findByRole("heading", { level: 1, name: "Quota novembre" });
    expect(screen.queryByRole("button", { name: "Genera quote" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Modifica" })).toBeInTheDocument();
  });

  it("is read-only for users without the write permission", async () => {
    auth.permissions = ["payments:read"];
    stubApi(routes());
    renderWithProviders(<PlanDetailPage id="p-nov" />);
    await screen.findByText("Anna Ferri");
    expect(screen.queryByRole("button", { name: "Modifica" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Genera quote" })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /Marta Bianchi/ }));
    const list = await screen.findByRole("dialog", { name: "Quote di Marta Bianchi" });
    await within(list).findByText(/Quota novembre · €\s60/);
    expect(within(list).queryByRole("button", { name: /^Registra pagamento/ })).not.toBeInTheDocument();
  });
});

describe("defaultDueDate", () => {
  it("proposes the next occurrence of the plan due day", () => {
    const now = new Date(2026, 10, 12);
    expect(defaultDueDate({ ...PLAN, dueDay: 20 }, now)).toBe("2026-11-20");
    expect(defaultDueDate({ ...PLAN, dueDay: 5 }, now)).toBe("2026-12-05");
    expect(defaultDueDate({ ...PLAN, dueDay: null }, now)).toBe("2026-11-12");
  });
});
