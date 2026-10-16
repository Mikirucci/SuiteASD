import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { tokens } from "@/lib/api";
import { expectNoA11yViolations } from "@/test/a11y";
import { QuotePage } from "./quote-page";
import { json, page, problem, renderWithProviders, stubApi } from "@/test/stub-api";
import {
  ATHLETE_PERMISSIONS,
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
    "GET /fees": () => json(200, page(ALL_FEES)),
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
      "GET /fees": () => (++attempts === 1 ? problem(500, "internal") : json(200, page(ALL_FEES))),
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

    await userEvent.click(screen.getByRole("button", { name: /Chiara Neri/ }));
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
