import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { expectNoA11yViolations } from "@/test/a11y";
import { address } from "@/test/fake-navigation";
import { json, problem, renderWithProviders, stubApi } from "@/test/stub-api";
import { BilancioPage } from "./bilancio-page";
import { EMPTY_SUMMARY, EMPTY_TREND, ledgerRoutes, summaryOf, trendOf } from "./ledger-fixtures";
import { REPORT_SUMMARY } from "./test-fixtures";
import type { LedgerEntry } from "./types";

const auth = vi.hoisted(() => ({ permissions: [] as string[] }));
vi.mock("@/features/auth/auth-provider", () => ({
  useAuth: () => ({ status: "authenticated", me: { permissions: auth.permissions, roles: ["ADMIN"] } }),
}));
vi.mock("next/navigation", async () => (await import("@/test/fake-navigation")).fakeNavigation);

const year = new Date().getFullYear();
type Api = ReturnType<typeof stubApi>;
const queryOf = (api: Api, path: string) => api.calls.filter((call) => call.path === path).at(-1)?.query;
const tile = (label: string) => within(screen.getByRole("region", { name: "Riepilogo del periodo" })).getByText(label).parentElement?.parentElement;
const ready = () => screen.findByRole("region", { name: "Riepilogo del periodo" });

beforeEach(() => {
  auth.permissions = ["ledger:read", "ledger:write"];
  address.open("/altro/bilancio");
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("BilancioPage", () => {
  it("shows the balance of the year, how it went and where the money comes from and goes", async () => {
    const api = stubApi(ledgerRoutes());
    const { container } = renderWithProviders(<BilancioPage />);
    expect(screen.getByRole("status", { name: "Caricamento del bilancio" })).toBeInTheDocument();
    expect(await screen.findByRole("heading", { level: 1, name: /Cosa succede ai soldi\./ })).toBeInTheDocument();

    await ready();
    expect(tile("Entrate")).toHaveTextContent(/€\s2240.*3 entrate/);
    expect(tile("Uscite")).toHaveTextContent(/€\s805.*3 spese/);
    expect(tile("Saldo")).toHaveTextContent(/€\s1435/);
    // the part that does not have to be written: it comes from the other sections
    expect(tile("Da altre sezioni")).toHaveTextContent(/€\s1785/);

    // how it went: a chart that has the same numbers in a table
    expect(screen.getByRole("heading", { name: "Andamento" })).toBeInTheDocument();
    expect(screen.getByRole("figure", { name: "Entrate e uscite del periodo" })).toBeInTheDocument();

    // where the money comes from and where it goes, each category a way into its movements
    const income = within(screen.getByRole("region", { name: "Da dove arrivano i soldi" }));
    expect(income.getAllByRole("listitem").map((item) => item.textContent)).toEqual([
      expect.stringContaining("Sponsor"),
      expect.stringContaining("Contributi"),
      expect.stringContaining("Quote"),
    ]);
    expect(income.getByRole("link", { name: "Sponsor" })).toHaveAttribute("href", "/altro/entrate/Sponsor");
    expect(income.getByRole("link", { name: "Apri le entrate" })).toHaveAttribute("href", "/altro/entrate");
    expect(income.getByRole("progressbar", { name: "Da dove arrivano i soldi: Sponsor" })).toBeInTheDocument();
    const costs = within(screen.getByRole("region", { name: "Dove vanno i soldi" }));
    expect(costs.getByRole("link", { name: "Attrezzatura sportiva" })).toHaveAttribute("href", "/altro/uscite/Attrezzatura%20sportiva");
    expect(costs.getByRole("link", { name: "Apri le uscite" })).toHaveAttribute("href", "/altro/uscite");

    expect(queryOf(api, "/ledger/trend")?.get("from")).toBe(`${year}-01-01`);
    expect(queryOf(api, "/ledger/trend")?.get("to")).toBe(`${year}-12-31`);
    // nothing is written here: the movements have their own sections
    expect(screen.queryByRole("button", { name: /^Nuov/ })).not.toBeInTheDocument();
    expect(api.count("GET /ledger/entries")).toBe(0);
    await expectNoA11yViolations(container);
  }, 20_000);

  it("carries the period to the pages of the movements, and the address keeps it", async () => {
    address.open("/altro/bilancio?dal=2026-03-01&al=2026-03-31");
    const api = stubApi(ledgerRoutes());
    renderWithProviders(<BilancioPage />);
    await ready();
    const period = screen.getByRole("group", { name: "Periodo" });
    expect(within(period).getAllByRole("button").map((button) => button.textContent || button.getAttribute("aria-label"))).toEqual([
      "Periodo precedente",
      "Marzo 2026",
      "Periodo successivo",
    ]);
    expect(queryOf(api, "/ledger/trend")?.get("from")).toBe("2026-03-01");
    expect(screen.getByRole("button", { name: "Azzera filtri" })).toBeInTheDocument();
    expect(within(screen.getByRole("region", { name: "Da dove arrivano i soldi" })).getByRole("link", { name: "Sponsor" })).toHaveAttribute(
      "href",
      "/altro/entrate/Sponsor?dal=2026-03-01&al=2026-03-31",
    );
    expect(within(screen.getByRole("region", { name: "Dove vanno i soldi" })).getByRole("link", { name: "Apri le uscite" })).toHaveAttribute(
      "href",
      "/altro/uscite?dal=2026-03-01&al=2026-03-31",
    );
  });

  it("changes everything with the period: the totals, the chart and the categories are read again", async () => {
    const api = stubApi(ledgerRoutes());
    renderWithProviders(<BilancioPage />);
    await ready();
    await userEvent.click(screen.getByRole("button", { name: "Periodo precedente" }));
    await waitFor(() => expect(queryOf(api, "/ledger/trend")?.get("from")).toBe(`${year - 1}-01-01`));
    expect(api.calls.filter((call) => call.path === "/ledger/summary").map((call) => call.query.get("from"))).toContain(`${year - 1}-01-01`);
    expect(address.href).toBe(`/altro/bilancio?dal=${year - 1}-01-01&al=${year - 1}-12-31`);
  });

  it("opens the report for the accountant on the period of the page, with incomes and expenses among the sections", async () => {
    address.open("/altro/bilancio?dal=2026-03-01&al=2026-03-31");
    const api = stubApi({ ...ledgerRoutes(), "GET /reports/accounting/summary": () => json(200, REPORT_SUMMARY) });
    renderWithProviders(<BilancioPage />);
    await ready();
    await userEvent.click(screen.getByRole("button", { name: "Report per il commercialista" }));

    const dialog = await screen.findByRole("dialog", { name: "Report per il commercialista" });
    const sections = within(await within(dialog).findByRole("list", { name: "Sezioni del report" }));
    for (const name of ["Bilancio", "Entrate", "Uscite"]) expect(sections.getByRole("checkbox", { name })).toBeChecked();
    expect(queryOf(api, "/reports/accounting/summary")?.get("from")).toBe("2026-03-01");
    expect(queryOf(api, "/reports/accounting/summary")?.get("to")).toBe("2026-03-31");
  });

  it("tells a negative balance, and a category beyond the first six", async () => {
    const costs: LedgerEntry[] = Array.from({ length: 8 }, (_, index) => ({
      id: `l-${index}`,
      kind: "EXPENSE",
      category: `Categoria ${index}`,
      description: `Voce ${index}`,
      amountCents: 10000 - index * 100,
      occurredOn: "2026-10-05",
      supplier: null,
      notes: null,
      paymentId: null,
      source: null,
      sourceId: null,
      createdAt: "2026-10-01T08:00:00.000Z",
      updatedAt: "2026-10-01T08:00:00.000Z",
    }));
    stubApi({
      ...ledgerRoutes(),
      "GET /ledger/summary": (call: { query: URLSearchParams }) => json(200, call.query.get("kind") === "INCOME" ? EMPTY_SUMMARY : summaryOf(costs)),
      "GET /ledger/trend": () => json(200, trendOf(costs)),
    });
    renderWithProviders(<BilancioPage />);
    await ready();
    expect(tile("Saldo")).toHaveTextContent(/−\s€\s772/);
    const column = within(screen.getByRole("region", { name: "Dove vanno i soldi" }));
    expect(column.getAllByRole("listitem")).toHaveLength(6);
    expect(column.getByText(/Più 2 altre categorie/)).toBeInTheDocument();
    expect(within(screen.getByRole("region", { name: "Da dove arrivano i soldi" })).getByText("Nessun movimento in questo periodo.")).toBeInTheDocument();
  });

  it("explains a period without movements", async () => {
    stubApi({ ...ledgerRoutes(), "GET /ledger/summary": () => json(200, EMPTY_SUMMARY), "GET /ledger/trend": () => json(200, EMPTY_TREND) });
    renderWithProviders(<BilancioPage />);
    await ready();
    expect(tile("Saldo")).toHaveTextContent(/€\s0/);
    expect(screen.getByRole("heading", { name: "Nessun movimento in questo periodo" })).toBeInTheDocument();
  });

  it("explains a failed load and reloads it, with the period still on screen", async () => {
    let attempts = 0;
    stubApi({ ...ledgerRoutes(), "GET /ledger/trend": () => (++attempts === 1 ? problem(500, "internal") : json(200, EMPTY_TREND)) });
    renderWithProviders(<BilancioPage />);
    expect(await screen.findByText("Bilancio non disponibile")).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "Periodo" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Riprova" }));
    expect(await ready()).toBeInTheDocument();
  });
});
