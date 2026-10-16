import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { expectNoA11yViolations } from "@/test/a11y";
import { defaultDueDate } from "./generate-fees-dialog";
import { PlansPanel } from "./plans-panel";
import { json, page, problem, renderWithProviders, stubApi } from "@/test/stub-api";
import { PLAN, STAFF_PERMISSIONS, TEAMS } from "./test-support";

const auth = vi.hoisted(() => ({ permissions: [] as string[] }));
vi.mock("@/features/auth/auth-provider", () => ({
  useAuth: () => ({ status: "authenticated", me: { permissions: auth.permissions, roles: ["SEGRETERIA"] } }),
}));

const U16_PLAN = { ...PLAN, id: "p-u16", name: "Iscrizione U16", kind: "ENROLLMENT" as const, amountCents: 15050, teamId: "t-u16", dueDay: null, isActive: false };

function routes(extra: Parameters<typeof stubApi>[0] = {}) {
  return {
    "GET /fee-plans": () => json(200, page([PLAN, U16_PLAN])),
    "GET /teams": () => json(200, page(TEAMS)),
    ...extra,
  };
}

beforeEach(() => {
  auth.permissions = STAFF_PERMISSIONS;
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("PlansPanel", () => {
  it("lists the plans with amount, target team and state", async () => {
    stubApi(routes());
    const { container } = renderWithProviders(<PlansPanel />);
    expect(screen.getByRole("status", { name: "Caricamento dei piani quota" })).toBeInTheDocument();

    const list = await screen.findByRole("list", { name: "Piani quota" });
    const [monthly, enrollment] = within(list).getAllByRole("listitem");
    expect(monthly).toHaveTextContent(/Quota novembre/);
    expect(monthly).toHaveTextContent(/€\s60 · Mensile · Tutte le squadre · scade il 10 del mese/);
    expect(within(monthly!).getByText("Attivo")).toBeInTheDocument();
    expect(enrollment).toHaveTextContent(/€\s150,50 · Iscrizione · U16/);
    expect(within(enrollment!).getByText("Non attivo")).toBeInTheDocument();
    expect(within(enrollment!).queryByRole("button", { name: "Genera quote" })).not.toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it("explains what a plan is when there are none, and shows an error with retry", async () => {
    let attempts = 0;
    stubApi(
      routes({
        "GET /fee-plans": () => (++attempts === 1 ? problem(500, "internal") : json(200, page([]))),
      }),
    );
    renderWithProviders(<PlansPanel />);
    await userEvent.click(await screen.findByRole("button", { name: "Riprova" }));
    expect(await screen.findByRole("heading", { name: "Nessun piano quota" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Nuovo piano" })).toBeInTheDocument();
  });

  it("creates a plan from the form, converting euros to cents", async () => {
    const api = stubApi(routes({ "POST /fee-plans": () => json(201, { ...PLAN, id: "p-new", name: "Quota dicembre" }) }));
    renderWithProviders(<PlansPanel />);
    await userEvent.click(await screen.findByRole("button", { name: "Nuovo piano" }));
    const dialog = await screen.findByRole("dialog", { name: "Nuovo piano quota" });

    await userEvent.click(within(dialog).getByRole("button", { name: "Crea il piano" }));
    expect(await within(dialog).findByText("Inserisci il nome del piano")).toBeInTheDocument();
    expect(within(dialog).getByText("Inserisci un importo valido, per esempio 60 o 60,50")).toBeInTheDocument();
    expect(api.count("POST /fee-plans")).toBe(0);

    await userEvent.type(within(dialog).getByLabelText(/Nome del piano/), "Quota dicembre");
    await userEvent.type(within(dialog).getByLabelText(/Importo in euro/), "60,50");
    await userEvent.selectOptions(within(dialog).getByLabelText("Squadra"), "t-u18");
    await userEvent.type(within(dialog).getByLabelText("Giorno di scadenza"), "10");
    await userEvent.click(within(dialog).getByRole("button", { name: "Crea il piano" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    const post = api.calls.find((call) => call.method === "POST");
    expect(post?.body).toEqual({
      name: "Quota dicembre",
      kind: "MONTHLY",
      amountCents: 6050,
      teamId: "t-u18",
      dueDay: 10,
      isActive: true,
    });
    expect(await screen.findByText("Piano creato")).toBeInTheDocument();
    await waitFor(() => expect(api.count("GET /fee-plans")).toBe(2));
  });

  it("edits a plan and clears an optional field with null", async () => {
    const api = stubApi(routes({ "PATCH /fee-plans/p-nov": () => json(200, PLAN) }));
    renderWithProviders(<PlansPanel />);
    const list = await screen.findByRole("list", { name: "Piani quota" });
    await userEvent.click(within(within(list).getAllByRole("listitem")[0]!).getByRole("button", { name: "Modifica" }));
    const dialog = await screen.findByRole("dialog", { name: "Modifica il piano" });
    expect(within(dialog).getByLabelText(/Nome del piano/)).toHaveValue("Quota novembre");
    expect(within(dialog).getByLabelText(/Importo in euro/)).toHaveValue("60");

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

  it("generates the fees of a plan and reports how many were created", async () => {
    const api = stubApi(routes({ "POST /fee-plans/p-nov/generate": () => json(200, { created: 18, skipped: 2 }) }));
    renderWithProviders(<PlansPanel />);
    const list = await screen.findByRole("list", { name: "Piani quota" });
    await userEvent.click(within(within(list).getAllByRole("listitem")[0]!).getByRole("button", { name: "Genera quote" }));
    const dialog = await screen.findByRole("dialog", { name: "Genera le quote" });
    expect(dialog).toHaveAccessibleDescription(/Quota novembre · €\s60/);

    await userEvent.clear(within(dialog).getByLabelText(/Scadenza delle quote/));
    await userEvent.type(within(dialog).getByLabelText(/Scadenza delle quote/), "2026-11-10");
    await userEvent.click(within(dialog).getByRole("button", { name: "Genera le quote" }));

    expect(await screen.findByText("18 quote create")).toBeInTheDocument();
    expect(screen.getByText(/2 tesserati la avevano già/)).toBeInTheDocument();
    expect(api.calls.find((call) => call.method === "POST")?.body).toEqual({ dueDate: "2026-11-10" });
  });

  it("explains an inactive plan when the server refuses to generate", async () => {
    stubApi(routes({ "POST /fee-plans/p-nov/generate": () => problem(409, "fee_plan_inactive", "Conflict") }));
    renderWithProviders(<PlansPanel />);
    const list = await screen.findByRole("list", { name: "Piani quota" });
    await userEvent.click(within(within(list).getAllByRole("listitem")[0]!).getByRole("button", { name: "Genera quote" }));
    const dialog = await screen.findByRole("dialog", { name: "Genera le quote" });
    await userEvent.click(within(dialog).getByRole("button", { name: "Genera le quote" }));
    expect(await within(dialog).findByText(/Il piano non è attivo/)).toBeInTheDocument();
  });

  it("is read-only for users without the write permission", async () => {
    auth.permissions = ["payments:read"];
    stubApi(routes());
    renderWithProviders(<PlansPanel />);
    await screen.findByText("Iscrizione U16");
    expect(screen.queryByRole("button", { name: "Nuovo piano" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Modifica" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Genera quote" })).not.toBeInTheDocument();
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
