import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { expectNoA11yViolations } from "@/test/a11y";
import { json, problem, renderWithProviders, stubApi } from "@/test/stub-api";
import { ReportPanel } from "./report-panel";
import { REPORT_SUMMARY } from "./test-fixtures";

const SUMMARY = "GET /reports/accounting/summary";
const PDF = "GET /reports/accounting.pdf";

function pdfResponse() {
  return new Response("%PDF-1.4", {
    status: 200,
    headers: { "content-type": "application/pdf", "content-disposition": 'attachment; filename="report-aquile.pdf"' },
  });
}

beforeEach(() => {
  URL.createObjectURL = () => "blob:test";
  URL.revokeObjectURL = () => undefined;
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("ReportPanel", () => {
  it("starts from the whole year and lists what each section holds", async () => {
    const api = stubApi({ [SUMMARY]: () => json(200, REPORT_SUMMARY) });
    renderWithProviders(<ReportPanel year={2025} />);

    expect(screen.getByRole("status", { name: "Calcolo del contenuto del report" })).toBeInTheDocument();
    const list = await screen.findByRole("list", { name: "Sezioni del report" });
    const rows = within(list).getAllByRole("listitem");
    expect(rows).toHaveLength(5);
    expect(rows[0]).toHaveTextContent("Bilancio");
    expect(rows[0]).toHaveTextContent("12 voci · saldo");
    expect(rows[1]).toHaveTextContent("8 voci · incassato");
    expect(rows[2]).toHaveTextContent("Nessuna voce nel periodo");
    expect(rows[3]).toHaveTextContent("1 voce · costi");
    expect(screen.getByLabelText("Dal")).toHaveValue("2025-01-01");
    expect(screen.getByLabelText("Al")).toHaveValue("2025-12-31");
    expect(api.calls[0]?.query.get("from")).toBe("2025-01-01");
    expect(api.calls[0]?.query.get("to")).toBe("2025-12-31");
  });

  it("downloads the whole report with every section", async () => {
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
    const api = stubApi({ [SUMMARY]: () => json(200, REPORT_SUMMARY), [PDF]: pdfResponse });
    renderWithProviders(<ReportPanel year={2025} />);
    await screen.findByRole("list", { name: "Sezioni del report" });

    await userEvent.click(screen.getByRole("button", { name: "Scarica il report completo" }));
    await waitFor(() => expect(click).toHaveBeenCalledTimes(1));
    const call = api.calls.find((entry) => entry.path === "/reports/accounting.pdf");
    expect(call?.query.get("sections")).toBe("LEDGER,FEES,SPONSORS,TRIPS,REFEREES");
    expect(call?.query.get("from")).toBe("2025-01-01");
  });

  it("downloads one section alone", async () => {
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
    const api = stubApi({ [SUMMARY]: () => json(200, REPORT_SUMMARY), [PDF]: pdfResponse });
    renderWithProviders(<ReportPanel year={2025} />);
    await screen.findByRole("list", { name: "Sezioni del report" });

    await userEvent.click(screen.getByRole("button", { name: "Scarica solo Trasferte" }));
    await waitFor(() => expect(click).toHaveBeenCalledTimes(1));
    expect(api.calls.find((entry) => entry.path === "/reports/accounting.pdf")?.query.get("sections")).toBe("TRIPS");
  });

  it("downloads only the chosen sections, and asks to choose at least one", async () => {
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
    const api = stubApi({ [SUMMARY]: () => json(200, REPORT_SUMMARY), [PDF]: pdfResponse });
    renderWithProviders(<ReportPanel year={2025} />);
    await screen.findByRole("list", { name: "Sezioni del report" });

    await userEvent.click(screen.getByRole("checkbox", { name: "Sponsor" }));
    await userEvent.click(screen.getByRole("checkbox", { name: "Arbitri" }));
    await userEvent.click(screen.getByRole("button", { name: "Scarica le sezioni scelte" }));
    await waitFor(() => expect(click).toHaveBeenCalledTimes(1));
    expect(api.calls.find((entry) => entry.path === "/reports/accounting.pdf")?.query.get("sections")).toBe("LEDGER,FEES,TRIPS");

    for (const name of ["Bilancio", "Quote e incassi", "Trasferte"]) {
      await userEvent.click(screen.getByRole("checkbox", { name }));
    }
    expect(screen.getByText("Scegli almeno una sezione.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Scarica le sezioni scelte" })).toBeDisabled();
  });

  it("asks again for the summary when the period changes", async () => {
    const api = stubApi({ [SUMMARY]: () => json(200, REPORT_SUMMARY) });
    renderWithProviders(<ReportPanel year={2025} />);
    await screen.findByRole("list", { name: "Sezioni del report" });

    const from = screen.getByLabelText("Dal");
    await userEvent.clear(from);
    await userEvent.type(from, "2025-07-01");
    await waitFor(() => expect(api.calls.some((call) => call.query.get("from") === "2025-07-01")).toBe(true));
  });

  it("does not ask the API for a period that ends before it starts", async () => {
    const api = stubApi({ [SUMMARY]: () => json(200, REPORT_SUMMARY) });
    renderWithProviders(<ReportPanel year={2025} />);
    await screen.findByRole("list", { name: "Sezioni del report" });
    const count = api.calls.length;

    const to = screen.getByLabelText("Al");
    await userEvent.clear(to);
    await userEvent.type(to, "2024-12-31");
    expect(await screen.findByText(/la data di inizio non può essere dopo quella di fine/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Scarica il report completo" })).toBeDisabled();
    expect(api.calls.filter((call) => call.query.get("to") === "2024-12-31")).toHaveLength(0);
    expect(api.calls.length).toBe(count);
  });

  it("restarts from the new year when the page changes year", async () => {
    stubApi({ [SUMMARY]: () => json(200, REPORT_SUMMARY) });
    function Page() {
      const [year, setYear] = useState(2025);
      return (
        <>
          <button onClick={() => setYear(2024)}>Anno precedente</button>
          <ReportPanel year={year} />
        </>
      );
    }
    renderWithProviders(<Page />);
    await screen.findByRole("list", { name: "Sezioni del report" });
    await userEvent.click(screen.getByRole("button", { name: "Anno precedente" }));
    await waitFor(() => expect(screen.getByLabelText("Dal")).toHaveValue("2024-01-01"));
    expect(screen.getByLabelText("Al")).toHaveValue("2024-12-31");
  });

  it("shows an error with a retry, and an error toast when the PDF cannot be made", async () => {
    let attempts = 0;
    stubApi({
      [SUMMARY]: () => (++attempts === 1 ? problem(500, "internal_error") : json(200, REPORT_SUMMARY)),
      [PDF]: () => problem(500, "internal_error"),
    });
    renderWithProviders(<ReportPanel year={2025} />);
    const alert = await screen.findByRole("alert");
    await userEvent.click(within(alert).getByRole("button", { name: "Riprova" }));
    await screen.findByRole("list", { name: "Sezioni del report" });

    await userEvent.click(screen.getByRole("button", { name: "Scarica il report completo" }));
    expect(await screen.findByText("Report non generato")).toBeInTheDocument();
  });

  it("has no detectable accessibility violations", async () => {
    stubApi({ [SUMMARY]: () => json(200, REPORT_SUMMARY) });
    const { container } = renderWithProviders(<ReportPanel year={2025} />);
    await screen.findByRole("list", { name: "Sezioni del report" });
    await expectNoA11yViolations(container);
  });
});
