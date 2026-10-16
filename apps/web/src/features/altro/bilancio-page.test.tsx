import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { json, page, problem, renderWithProviders, stubApi } from "@/test/stub-api";
import { expectNoA11yViolations } from "@/test/a11y";
import { BilancioPage } from "./bilancio-page";
import { AFFITTO, QUOTE_NOVEMBRE, REPORT } from "./test-fixtures";

const auth = vi.hoisted(() => ({ permissions: [] as string[] }));
vi.mock("@/features/auth/auth-provider", () => ({
  useAuth: () => ({ status: "authenticated", me: { permissions: auth.permissions, roles: ["ADMIN"] } }),
}));

function routes(extra: Parameters<typeof stubApi>[0] = {}) {
  return {
    "GET /ledger/report": () => json(200, REPORT),
    "GET /ledger/entries": () => json(200, page([QUOTE_NOVEMBRE, AFFITTO])),
    ...extra,
  };
}

beforeEach(() => {
  auth.permissions = ["ledger:read", "ledger:write"];
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("BilancioPage", () => {
  it("shows the totals of the year, the categories and the entries", async () => {
    stubApi(routes());
    const { container } = renderWithProviders(<BilancioPage />);
    expect(screen.getByRole("status", { name: "Caricamento del riepilogo" })).toBeInTheDocument();

    expect(await screen.findByText("Entrate", { selector: "dt" })).toBeInTheDocument();
    const totals = screen.getByText("Saldo", { selector: "dt" }).parentElement;
    expect(totals).toHaveTextContent(/−\s€\s390/);
    const categories = screen.getByRole("region", { name: "Uscite per categoria" });
    expect(within(categories).getByText("Affitto palestra")).toBeInTheDocument();
    expect(within(categories).getByRole("progressbar", { name: "Uscite per categoria: Affitto palestra" })).toBeInTheDocument();

    const entries = await screen.findByRole("list", { name: "Movimenti" });
    expect(within(entries).getAllByRole("listitem")).toHaveLength(2);
    await expectNoA11yViolations(container);
  });

  it("asks only for the chosen year and filters the entries by category", async () => {
    const api = stubApi(routes());
    renderWithProviders(<BilancioPage />);
    await screen.findByRole("list", { name: "Movimenti" });
    const year = new Date().getFullYear();
    expect(api.calls.find((call) => call.path === "/ledger/report")?.query.get("year")).toBe(String(year));
    expect(api.calls.find((call) => call.path === "/ledger/entries")?.query.get("from")).toBe(`${year}-01-01`);

    await userEvent.selectOptions(screen.getByLabelText("Categoria"), "Quote");
    await waitFor(() => expect(api.calls.at(-1)?.query.get("category")).toBe("Quote"));

    await userEvent.selectOptions(screen.getByLabelText("Anno"), String(year - 1));
    await waitFor(() => expect(api.calls.filter((call) => call.path === "/ledger/report").at(-1)?.query.get("year")).toBe(String(year - 1)));
    expect(screen.getByLabelText("Categoria")).toHaveValue("");
  });

  it("explains a failed summary and reloads it", async () => {
    let attempts = 0;
    stubApi(routes({ "GET /ledger/report": () => (++attempts === 1 ? problem(500, "internal") : json(200, REPORT)) }));
    renderWithProviders(<BilancioPage />);
    expect(await screen.findByText("Riepilogo non disponibile")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Riprova" }));
    expect(await screen.findByText("Entrate", { selector: "dt" })).toBeInTheDocument();
  });

  it("creates an entry with the amount in cents", async () => {
    const api = stubApi(routes({ "POST /ledger/entries": () => json(201, AFFITTO) }));
    renderWithProviders(<BilancioPage />);
    await userEvent.click(await screen.findByRole("button", { name: "Nuovo movimento" }));
    const dialog = await screen.findByRole("dialog", { name: "Nuovo movimento" });
    await userEvent.selectOptions(within(dialog).getByLabelText("Tipo"), "EXPENSE");
    await userEvent.type(within(dialog).getByLabelText(/Categoria/), "Arbitri");
    await userEvent.type(within(dialog).getByLabelText(/Importo in euro/), "75,50");
    await userEvent.click(within(dialog).getByRole("button", { name: "Registra il movimento" }));

    await screen.findByText("Movimento registrato");
    const body = api.calls.find((call) => call.method === "POST")?.body;
    expect(body).toMatchObject({ kind: "EXPENSE", category: "Arbitri", amountCents: 7550 });
    expect(body).toHaveProperty("occurredOn");
  });
});
