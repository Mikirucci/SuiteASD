import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { tokens } from "@/lib/api";
import { expectNoA11yViolations } from "@/test/a11y";
import { QuotePage } from "./quote-page";
import { json, page, problem, renderWithProviders, stubApi, type RecordedCall } from "@/test/stub-api";
import {
  ATHLETE_PERMISSIONS,
  CLAIMED_FEE,
  OVERDUE_FEE,
  PAID_FEE,
  PENDING_FEE,
  STAFF_PERMISSIONS,
  SUMMARY,
  TEAMS,
} from "./test-support";

const auth = vi.hoisted(() => ({ permissions: [] as string[], roles: [] as string[] }));
vi.mock("@/features/auth/auth-provider", () => ({
  useAuth: () => ({ status: "authenticated", me: { permissions: auth.permissions, roles: auth.roles } }),
}));

const ALL_FEES = [PAID_FEE, PENDING_FEE, OVERDUE_FEE];

function staffRoutes() {
  return {
    "GET /fees": (call: RecordedCall) => json(200, page(ALL_FEES.filter((fee) => call.query.get("claimed") !== "true" || fee.claimedAt))),
    "GET /fees/summary": () => json(200, SUMMARY),
    "GET /teams": () => json(200, page(TEAMS)),
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

describe("QuotePage for the secretariat", () => {
  it("shows the summary header and one line per member with a status chip", async () => {
    stubApi(staffRoutes());
    const { container } = renderWithProviders(<QuotePage />);

    expect(screen.getByRole("status", { name: "Caricamento delle quote" })).toBeInTheDocument();
    expect(await screen.findByRole("heading", { level: 1, name: /Quote incassate, senza rincorrere\./ })).toBeInTheDocument();

    const summary = await screen.findByText("Incassato");
    expect(summary.parentElement).toHaveTextContent(/€\s240/);
    expect(screen.getByText("Promemoria inviati").parentElement).toHaveTextContent("4");
    expect(screen.getByRole("link", { name: "Gestisci le automazioni" })).toHaveAttribute("href", "/automazioni");

    const list = await screen.findByRole("list", { name: "Quote" });
    const rows = within(list).getAllByRole("listitem");
    expect(rows).toHaveLength(3);
    expect(within(rows[0]!).getByText("Pagato")).toBeInTheDocument();
    expect(within(rows[0]!).getByText(/Quota novembre · €\s60/)).toBeInTheDocument();
    expect(within(rows[0]!).getByText(/Ricevuta n\. 0147/)).toBeInTheDocument();
    expect(within(rows[1]!).getByText("In attesa")).toBeInTheDocument();
    expect(within(rows[2]!).getByText("Scaduto")).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it("explains how to start when there are no fees", async () => {
    stubApi({ ...staffRoutes(), "GET /fees": () => json(200, page([])) });
    renderWithProviders(<QuotePage />);
    expect(await screen.findByRole("heading", { name: "Nessuna quota ancora" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Vai ai piani quota" }));
    expect(await screen.findByRole("heading", { name: "Piani quota" })).toBeInTheDocument();
  });

  it("shows an error with a retry button, then the list", async () => {
    let attempts = 0;
    stubApi({
      ...staffRoutes(),
      // The banner of reported fees reads the same endpoint: only the list itself must fail the first time
      "GET /fees": (call: RecordedCall) =>
        call.query.get("claimed") === "true" ? json(200, page([])) : ++attempts === 1 ? problem(500, "internal") : json(200, page(ALL_FEES)),
    });
    renderWithProviders(<QuotePage />);
    expect(await screen.findByText("Il servizio non è disponibile al momento. Riprova tra poco.")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Riprova" }));
    expect(await screen.findByText("Anna Ferri")).toBeInTheDocument();
  });

  it("filters by status, team and name through the API", async () => {
    const api = stubApi(staffRoutes());
    renderWithProviders(<QuotePage />);
    await screen.findByText("Anna Ferri");

    await userEvent.click(screen.getByRole("button", { name: "Scaduto" }));
    await waitFor(() => expect(api.calls.some((call) => call.path === "/fees" && call.query.get("status") === "OVERDUE")).toBe(true));

    await userEvent.selectOptions(screen.getByLabelText("Squadra"), "t-u18");
    await waitFor(() => expect(api.calls.some((call) => call.path === "/fees" && call.query.get("teamId") === "t-u18")).toBe(true));
    expect(api.calls.some((call) => call.path === "/fees/summary" && call.query.get("teamId") === "t-u18")).toBe(true);

    await userEvent.type(screen.getByLabelText("Cerca un tesserato"), "mar");
    await waitFor(() => expect(api.calls.some((call) => call.path === "/fees" && call.query.get("q") === "mar")).toBe(true));
  });

  it("offers to reset the filters when nothing matches", async () => {
    stubApi({
      ...staffRoutes(),
      "GET /fees": (call) => json(200, page(call.query.get("status") === "PAID" ? [] : ALL_FEES)),
    });
    renderWithProviders(<QuotePage />);
    await screen.findByText("Anna Ferri");
    await userEvent.click(screen.getByRole("button", { name: "Pagato" }));
    expect(await screen.findByRole("heading", { name: "Nessuna quota con questi filtri" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Azzera i filtri" }));
    expect(await screen.findByText("Anna Ferri")).toBeInTheDocument();
  });

  it("loads the next page with the cursor", async () => {
    const api = stubApi({
      ...staffRoutes(),
      "GET /fees": (call) =>
        call.query.get("cursor") === "c1" ? json(200, page([OVERDUE_FEE])) : json(200, page([PAID_FEE, PENDING_FEE], "c1")),
    });
    renderWithProviders(<QuotePage />);
    await screen.findByText("Anna Ferri");
    expect(screen.queryByText("Marta Bianchi")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Mostra altre quote" }));
    expect(await screen.findByText("Marta Bianchi")).toBeInTheDocument();
    expect(api.calls.filter((call) => call.path === "/fees").at(-1)?.query.get("cursor")).toBe("c1");
    expect(screen.queryByRole("button", { name: "Mostra altre quote" })).not.toBeInTheDocument();
  });

  it("opens the fee card with the numbered receipt and downloads it with the Bearer token", async () => {
    tokens.setTokens({ accessToken: "access-1", refreshToken: "refresh-1" });
    const api = stubApi({
      ...staffRoutes(),
      "GET /fees/f-paid/receipt": () =>
        new Response("%PDF-1.4", {
          status: 200,
          headers: { "content-type": "application/pdf", "content-disposition": 'attachment; filename="ricevuta-0147.pdf"' },
        }),
    });
    const createObjectURL = vi.fn(() => "blob:ricevuta");
    URL.createObjectURL = createObjectURL;
    URL.revokeObjectURL = vi.fn();
    const saved: string[] = [];
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
      saved.push(this.download);
    });

    renderWithProviders(<QuotePage />);
    await userEvent.click(await screen.findByRole("button", { name: /Anna Ferri/ }));
    const dialog = await screen.findByRole("dialog", { name: "Anna Ferri" });
    expect(within(dialog).getByText("n. 0147")).toBeInTheDocument();
    expect(within(dialog).getByText("Emessa in automatico")).toBeInTheDocument();
    expect(within(dialog).getByText("Contanti")).toBeInTheDocument();
    expect(within(dialog).queryByRole("button", { name: "Registra pagamento" })).not.toBeInTheDocument();

    await userEvent.click(within(dialog).getByRole("button", { name: "Scarica ricevuta" }));
    await waitFor(() => expect(saved).toEqual(["ricevuta-0147.pdf"]));
    const request = api.calls.find((call) => call.path === "/fees/f-paid/receipt");
    expect(request?.headers.Authorization).toBe("Bearer access-1");
    expect(createObjectURL).toHaveBeenCalledOnce();
    click.mockRestore();
  });

  it("shows the reminders sent for an unpaid fee and the action to register the payment", async () => {
    stubApi(staffRoutes());
    renderWithProviders(<QuotePage />);
    await userEvent.click(await screen.findByRole("button", { name: /Marta Bianchi/ }));
    const dialog = await screen.findByRole("dialog", { name: "Marta Bianchi" });
    expect(within(dialog).getByText("Promemoria").nextElementSibling).toHaveTextContent(/2, ultimo il/);
    expect(within(dialog).getByText("Automatico")).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Registra pagamento" })).toBeInTheDocument();
  });

  it("switches to the fee plans", async () => {
    stubApi({ ...staffRoutes(), "GET /fee-plans": () => json(200, page([])) });
    renderWithProviders(<QuotePage />);
    await userEvent.click(screen.getByRole("tab", { name: "Piani quota" }));
    expect(await screen.findByRole("heading", { name: "Nessun piano quota" })).toBeInTheDocument();
  });
});

describe("QuotePage for an athlete or a guardian", () => {
  beforeEach(() => {
    auth.permissions = ATHLETE_PERMISSIONS;
    auth.roles = ["GENITORE"];
  });

  it("shows only their own fees, without staff tools or write actions", async () => {
    const api = stubApi({ "GET /fees": () => json(200, page([PAID_FEE, PENDING_FEE])) });
    const { container } = renderWithProviders(<QuotePage />);

    expect(await screen.findByText("Anna Ferri")).toBeInTheDocument();
    expect(screen.getByText(/Le quote dei tuoi figli/)).toBeInTheDocument();
    expect(screen.queryByRole("tab")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Squadra")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Cerca un tesserato")).not.toBeInTheDocument();
    expect(screen.queryByText("Incassato")).not.toBeInTheDocument();
    expect(api.calls.map((call) => call.path)).toEqual(["/fees"]);

    await userEvent.click(screen.getByRole("button", { name: /^Chiara Neri/ }));
    const dialog = await screen.findByRole("dialog", { name: "Chiara Neri" });
    expect(within(dialog).queryByRole("button", { name: "Registra pagamento" })).not.toBeInTheDocument();
    await userEvent.keyboard("{Escape}");
    await userEvent.click(screen.getByRole("button", { name: /Anna Ferri/ }));
    expect(await screen.findByRole("button", { name: "Scarica ricevuta" })).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it("says what to expect when there are no fees", async () => {
    stubApi({ "GET /fees": () => json(200, page([])) });
    renderWithProviders(<QuotePage />);
    expect(await screen.findByRole("heading", { name: "Nessuna quota da mostrare" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Vai ai piani quota" })).not.toBeInTheDocument();
  });
});

const CLAIMED_ROUTES = () => ({
  ...staffRoutes(),
  "GET /fees": (call: RecordedCall) =>
    json(
      200,
      page([PAID_FEE, CLAIMED_FEE, OVERDUE_FEE].filter((fee) => call.query.get("claimed") !== "true" || fee.claimedAt)),
    ),
});

describe("QuotePage for the secretariat: payments reported by the payer", () => {
  it("highlights a reported fee in the row and offers 'Registra pagamento' there as the main action", async () => {
    stubApi(CLAIMED_ROUTES());
    renderWithProviders(<QuotePage />);

    expect(await screen.findByText("Segnalato dal pagante il 8 nov 2026")).toBeInTheDocument();
    const row = screen.getByText("Segnalato dal pagante il 8 nov 2026").closest("li") as HTMLElement;
    expect(within(row).getByText("In attesa")).toBeInTheDocument();

    await userEvent.click(within(row).getByRole("button", { name: "Registra pagamento: Sara Conti, Quota novembre" }));
    expect(await screen.findByRole("dialog", { name: "Registra pagamento" })).toHaveAccessibleDescription(/Sara Conti/);
  });

  it("keeps the quick action off the fees nobody reported", async () => {
    stubApi(CLAIMED_ROUTES());
    renderWithProviders(<QuotePage />);
    await screen.findByText("Marta Bianchi");
    expect(screen.getAllByRole("button", { name: /^Registra pagamento:/ })).toHaveLength(1);
  });

  it("filters the reported fees through the API, without sending a status", async () => {
    const api = stubApi(CLAIMED_ROUTES());
    renderWithProviders(<QuotePage />);
    await screen.findByText("Marta Bianchi");

    await userEvent.click(screen.getByRole("button", { name: "Segnalate", pressed: false }));
    await waitFor(() => expect(screen.queryByText("Marta Bianchi")).not.toBeInTheDocument());
    expect(screen.getByText("Sara Conti")).toBeInTheDocument();
    const last = api.calls.filter((call) => call.path === "/fees" && call.query.get("limit") === "25").at(-1);
    expect(last?.query.get("claimed")).toBe("true");
    expect(last?.query.get("status")).toBeNull();
  });

  it("announces how many fees were reported and jumps to them", async () => {
    stubApi(CLAIMED_ROUTES());
    renderWithProviders(<QuotePage />);

    expect(await screen.findByText("1 quota segnalata dal pagante.")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Mostra le segnalate" }));
    expect(await screen.findByRole("button", { name: "Segnalate", pressed: true })).toBeInTheDocument();
    expect(screen.queryByText(/segnalat[ae] dal pagante[.]/)).not.toBeInTheDocument();
  });

  it("shows no banner when nobody reported a payment", async () => {
    stubApi(staffRoutes());
    renderWithProviders(<QuotePage />);
    await screen.findByText("Anna Ferri");
    expect(screen.queryByText(/segnalat[ae] dal pagante[.]/)).not.toBeInTheDocument();
  });

  it("explains the empty reported list instead of showing a generic empty state", async () => {
    stubApi(staffRoutes());
    renderWithProviders(<QuotePage />);
    await screen.findByText("Anna Ferri");
    await userEvent.click(screen.getByRole("button", { name: "Segnalate" }));
    expect(await screen.findByRole("heading", { name: "Nessuna quota segnalata" })).toBeInTheDocument();
  });

  it("has no accessibility violations with a reported fee", async () => {
    stubApi(CLAIMED_ROUTES());
    const { container } = renderWithProviders(<QuotePage />);
    await screen.findByText("Segnalato dal pagante il 8 nov 2026");
    await expectNoA11yViolations(container);
  });
});

describe("QuotePage: receipts on the paid rows", () => {
  const receiptRoute = () => new Response("%PDF-1.4", { status: 200, headers: { "content-type": "application/pdf" } });

  beforeEach(() => {
    URL.createObjectURL = () => "blob:ricevuta";
    URL.revokeObjectURL = vi.fn();
  });

  it("previews the receipt of a paid fee from the list, for the secretariat", async () => {
    tokens.setTokens({ accessToken: "access-1", refreshToken: "refresh-1" });
    const api = stubApi({ ...staffRoutes(), "GET /fees/f-paid/receipt": receiptRoute });
    renderWithProviders(<QuotePage />);

    await userEvent.click(await screen.findByRole("button", { name: "Vedi ricevuta n. 0147" }));
    const preview = await screen.findByRole("dialog", { name: "Ricevuta n. 0147" });
    expect(await within(preview).findByTitle("Anteprima di Ricevuta n. 0147")).toBeInTheDocument();
    expect(api.calls.find((call) => call.path === "/fees/f-paid/receipt")?.headers.Authorization).toBe("Bearer access-1");
  });

  it("offers the same receipt to the payer, and none on an unpaid fee", async () => {
    auth.permissions = ATHLETE_PERMISSIONS;
    auth.roles = ["ATLETA"];
    stubApi({ "GET /fees": () => json(200, page([PAID_FEE, PENDING_FEE])) });
    renderWithProviders(<QuotePage />);
    expect(await screen.findByRole("button", { name: "Vedi ricevuta n. 0147" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Scarica ricevuta n. 0147" })).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /ricevuta n\./ })).toHaveLength(2);
  });

  it("downloads the receipt from the row", async () => {
    tokens.setTokens({ accessToken: "access-1", refreshToken: "refresh-1" });
    stubApi({ ...staffRoutes(), "GET /fees/f-paid/receipt": receiptRoute });
    const saved: string[] = [];
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
      saved.push(this.download);
    });
    renderWithProviders(<QuotePage />);
    await userEvent.click(await screen.findByRole("button", { name: "Scarica ricevuta n. 0147" }));
    await waitFor(() => expect(saved).toEqual(["ricevuta-0147.pdf"]));
    click.mockRestore();
  });
});

describe("QuotePage for the secretariat: result of registering a payment", () => {
  const PAID_NOW = {
    ...OVERDUE_FEE,
    status: "PAID" as const,
    paidAt: "2026-11-12T10:00:00.000Z",
    method: "BANK_TRANSFER" as const,
    receipt: { id: "r148", number: 148, code: "0148", issuedAt: "2026-11-12T10:00:00.000Z", sentAt: null },
  };

  it("shows the receipt number, who it went to, and the receipt actions after the payment", async () => {
    const api = stubApi({
      ...staffRoutes(),
      "POST /fees/f-overdue/pay": () => json(200, PAID_NOW),
      "GET /fees/f-overdue": () =>
        json(200, { ...PAID_NOW, receipt: { ...PAID_NOW.receipt, sentAt: "2026-11-12T10:00:03.000Z" } }),
    });
    renderWithProviders(<QuotePage />);

    await userEvent.click(await screen.findByRole("button", { name: /^Marta Bianchi/ }));
    await userEvent.click(within(await screen.findByRole("dialog", { name: "Marta Bianchi" })).getByRole("button", { name: "Registra pagamento" }));
    await userEvent.click(await screen.findByRole("button", { name: "Conferma pagamento" }));

    const dialog = await screen.findByRole("dialog", { name: "Marta Bianchi" });
    expect(
      await within(dialog).findByText("Pagamento registrato. Ricevuta n. 0148 emessa e inviata a Marta Bianchi e all'amministrazione."),
    ).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Vedi ricevuta" })).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Scarica ricevuta" })).toBeInTheDocument();
    expect(api.count("GET /fees/f-overdue")).toBe(1);
  });
});
