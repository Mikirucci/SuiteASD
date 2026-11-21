import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { expectNoA11yViolations } from "@/test/a11y";
import { json, problem, renderWithProviders, stubApi } from "@/test/stub-api";
import { ReportDialog } from "./report-dialog";
import { REPORT_SUMMARY } from "./test-fixtures";

const SUMMARY = "GET /reports/accounting/summary";
const PDF = "GET /reports/accounting.pdf";
const YEAR_2025 = { from: new Date(2025, 0, 1), to: new Date(2025, 11, 31) };

function pdfResponse() {
  return new Response("%PDF-1.4", {
    status: 200,
    headers: { "content-type": "application/pdf", "content-disposition": 'attachment; filename="report-aquile.pdf"' },
  });
}

const renderDialog = (range = YEAR_2025) => renderWithProviders(<ReportDialog range={range} open onOpenChange={() => undefined} />);
const sectionList = () => screen.findByRole("list", { name: "Sezioni del report" });

beforeEach(() => {
  URL.createObjectURL = () => "blob:test";
  URL.revokeObjectURL = () => undefined;
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("ReportDialog", () => {
  it("covers the period of the page and lists what each section holds, incomes and expenses included", async () => {
    const api = stubApi({ [SUMMARY]: () => json(200, REPORT_SUMMARY) });
    renderDialog();

    expect(screen.getByRole("dialog", { name: "Report per il commercialista" })).toHaveAccessibleDescription(/2025/);
    expect(screen.getByRole("status", { name: "Calcolo del contenuto del report" })).toBeInTheDocument();
    const rows = within(await sectionList()).getAllByRole("listitem");
    expect(rows).toHaveLength(7);
    expect(rows[0]).toHaveTextContent("Bilancio");
    expect(rows[0]).toHaveTextContent("12 voci · saldo");
    expect(rows[1]).toHaveTextContent("Entrate");
    expect(rows[1]).toHaveTextContent("3 voci · entrate");
    expect(rows[2]).toHaveTextContent("Uscite");
    expect(rows[2]).toHaveTextContent("9 voci · uscite");
    expect(rows[3]).toHaveTextContent("8 voci · incassato");
    expect(rows[4]).toHaveTextContent("Nessuna voce nel periodo");
    expect(rows[5]).toHaveTextContent("1 voce · costi");
    expect(api.calls[0]?.query.get("from")).toBe("2025-01-01");
    expect(api.calls[0]?.query.get("to")).toBe("2025-12-31");
  });

  it("downloads the whole report with every section", async () => {
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
    const api = stubApi({ [SUMMARY]: () => json(200, REPORT_SUMMARY), [PDF]: pdfResponse });
    renderDialog();
    await sectionList();

    await userEvent.click(screen.getByRole("button", { name: "Scarica il report completo" }));
    await waitFor(() => expect(click).toHaveBeenCalledTimes(1));
    const call = api.calls.find((entry) => entry.path === "/reports/accounting.pdf");
    expect(call?.query.get("sections")).toBe("LEDGER,INCOME,EXPENSES,FEES,SPONSORS,TRIPS,REFEREES");
    expect(call?.query.get("from")).toBe("2025-01-01");
  });

  it("downloads the incomes or the expenses alone, like any other section", async () => {
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
    const api = stubApi({ [SUMMARY]: () => json(200, REPORT_SUMMARY), [PDF]: pdfResponse });
    renderDialog();
    await sectionList();

    await userEvent.click(screen.getByRole("button", { name: "Solo questa: Uscite" }));
    await waitFor(() => expect(click).toHaveBeenCalledTimes(1));
    expect(api.calls.filter((entry) => entry.path === "/reports/accounting.pdf").at(-1)?.query.get("sections")).toBe("EXPENSES");
    await userEvent.click(screen.getByRole("button", { name: "Solo questa: Entrate" }));
    await waitFor(() => expect(click).toHaveBeenCalledTimes(2));
    expect(api.calls.filter((entry) => entry.path === "/reports/accounting.pdf").at(-1)?.query.get("sections")).toBe("INCOME");
  });

  it("downloads only the chosen sections, and asks to choose at least one", async () => {
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
    const api = stubApi({ [SUMMARY]: () => json(200, REPORT_SUMMARY), [PDF]: pdfResponse });
    renderDialog();
    await sectionList();

    await userEvent.click(screen.getByRole("checkbox", { name: "Sponsor" }));
    await userEvent.click(screen.getByRole("checkbox", { name: "Arbitri" }));
    await userEvent.click(screen.getByRole("button", { name: "Scarica le sezioni scelte" }));
    await waitFor(() => expect(click).toHaveBeenCalledTimes(1));
    expect(api.calls.find((entry) => entry.path === "/reports/accounting.pdf")?.query.get("sections")).toBe("LEDGER,INCOME,EXPENSES,FEES,TRIPS");

    for (const name of ["Bilancio", "Entrate", "Uscite", "Quote e incassi", "Trasferte"]) {
      await userEvent.click(screen.getByRole("checkbox", { name }));
    }
    expect(screen.getByText("Scegli almeno una sezione.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Scarica le sezioni scelte" })).toBeDisabled();
  });

  it("does not ask the API for a period longer than five years", async () => {
    const api = stubApi({ [SUMMARY]: () => json(200, REPORT_SUMMARY) });
    renderDialog({ from: new Date(2019, 0, 1), to: new Date(2025, 11, 31) });
    expect(await screen.findByText(/al massimo cinque anni/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Scarica il report completo" })).toBeDisabled();
    expect(api.calls).toHaveLength(0);
  });

  it("shows an error with a retry, and an error toast when the PDF cannot be made", async () => {
    let attempts = 0;
    stubApi({
      [SUMMARY]: () => (++attempts === 1 ? problem(500, "internal_error") : json(200, REPORT_SUMMARY)),
      [PDF]: () => problem(500, "internal_error"),
    });
    renderDialog();
    const alert = await screen.findByRole("alert");
    await userEvent.click(within(alert).getByRole("button", { name: "Riprova" }));
    await sectionList();

    await userEvent.click(screen.getByRole("button", { name: "Scarica il report completo" }));
    expect(await screen.findByText("Report non generato")).toBeInTheDocument();
  });

  it("has no detectable accessibility violations", async () => {
    stubApi({ [SUMMARY]: () => json(200, REPORT_SUMMARY) });
    renderDialog();
    await sectionList();
    await expectNoA11yViolations(document.body);
  });
});
