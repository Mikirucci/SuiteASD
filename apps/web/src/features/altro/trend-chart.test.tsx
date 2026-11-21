import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { expectNoA11yViolations } from "@/test/a11y";
import { ENTRATE, SPESE, trendOf } from "./ledger-data";
import { TrendChart } from "./trend-chart";
import type { LedgerTrend } from "./types";

const year = trendOf([...ENTRATE, ...SPESE]);
/** The text of a figure with its no-break space turned into an ordinary one. */
const plain = (text: string | null | undefined): string => (text ?? "").replace(/\s/g, " ");
const chart = () => screen.getByRole("figure", { name: "Entrate e uscite del periodo" });
/** The bars of the chart: one column for each month. */
const columns = () => Array.from(chart().querySelectorAll("div[aria-hidden='true'].cursor-pointer"));
const readout = () => chart().querySelector("[aria-live='polite']") as HTMLElement;

describe("TrendChart", () => {
  it("draws a pair of bars for every month and says how to read them until one is chosen", () => {
    render(<TrendChart trend={year} />);
    expect(columns()).toHaveLength(12);
    expect(readout()).toHaveTextContent(/Passa il mouse su una barra, toccala o usa le frecce/);
    expect(plain(readout().textContent)).toContain("La barra più alta vale € 1500");
    expect(screen.getByRole("list", { name: "Legenda" })).toHaveTextContent("EntrateUscite");
    // one stop for the keyboard, not twelve
    expect(screen.getAllByRole("group", { name: /usa le frecce/ })).toHaveLength(1);
  });

  it("shows the figures of a bar under the chart when the pointer is on it, and lets go when it leaves", async () => {
    render(<TrendChart trend={year} />);
    await userEvent.hover(columns()[8] as HTMLElement);
    expect(readout()).toHaveTextContent("settembre 2026");
    const figures = within(readout()).getAllByRole("definition").map((item) => plain(item.textContent));
    expect(figures).toEqual(["€ 1500", "€ 640", "€ 860"]);
    // what the bar weighs on the period, and the average to compare it with
    expect(plain(readout().textContent)).toContain("Pesa il 67% delle entrate e il 80% delle uscite del periodo");
    expect(plain(readout().textContent)).toContain("In media per mese: entrate € 187, uscite € 67");

    await userEvent.unhover(columns()[8] as HTMLElement);
    expect(readout()).toHaveTextContent(/Passa il mouse su una barra/);
  });

  it("keeps a bar chosen by a tap until the next tap, and a tap on another bar moves to it", async () => {
    render(<TrendChart trend={year} />);
    await userEvent.click(columns()[10] as HTMLElement);
    expect(readout()).toHaveTextContent("novembre 2026");
    expect(within(readout()).getAllByRole("definition").map((item) => plain(item.textContent))).toEqual(["€ 240", "€ 45", "€ 195"]);
    await userEvent.click(columns()[9] as HTMLElement);
    expect(readout()).toHaveTextContent("ottobre 2026");
    await userEvent.click(columns()[9] as HTMLElement);
    // the pointer is still on the bar: it shows what it shows when pointed at; away from it, nothing is chosen any more
    await userEvent.unhover(columns()[9] as HTMLElement);
    expect(readout()).toHaveTextContent(/Passa il mouse su una barra/);
  });

  it("goes from one period to the next with the arrows, and Escape lets go", async () => {
    render(<TrendChart trend={year} />);
    screen.getByRole("group", { name: /usa le frecce/ }).focus();
    await userEvent.keyboard("{ArrowRight}");
    expect(readout()).toHaveTextContent("gennaio 2026");
    await userEvent.keyboard("{ArrowRight}{ArrowRight}");
    expect(readout()).toHaveTextContent("marzo 2026");
    await userEvent.keyboard("{End}");
    expect(readout()).toHaveTextContent("dicembre 2026");
    await userEvent.keyboard("{ArrowRight}");
    expect(readout()).toHaveTextContent("dicembre 2026");
    await userEvent.keyboard("{Home}{ArrowLeft}");
    expect(readout()).toHaveTextContent("gennaio 2026");
    await userEvent.keyboard("{Escape}");
    expect(readout()).toHaveTextContent(/Passa il mouse su una barra/);
  });

  it("starts from the last period with the left arrow, when nothing is chosen", async () => {
    render(<TrendChart trend={year} />);
    screen.getByRole("group", { name: /usa le frecce/ }).focus();
    await userEvent.keyboard("{ArrowLeft}");
    expect(readout()).toHaveTextContent("dicembre 2026");
  });

  it("labels the months under the bars", () => {
    render(<TrendChart trend={year} />);
    expect(chart()).toHaveTextContent("gen");
    expect(chart()).toHaveTextContent("dic");
  });

  it("switches to a table with every period, entrate, uscite and saldo, and back", async () => {
    render(<TrendChart trend={year} />);
    await userEvent.click(screen.getByRole("button", { name: "Mostra come tabella" }));
    const table = screen.getByRole("table", { name: /Entrate, uscite e saldo di ogni mese del periodo/ });
    const rows = within(table).getAllByRole("row");
    expect(rows).toHaveLength(13);
    expect(within(table).getByRole("columnheader", { name: "Saldo" })).toBeInTheDocument();
    const settembre = rows.find((row) => within(row).queryByRole("rowheader", { name: "settembre 2026" })) as HTMLElement;
    expect(within(settembre).getAllByRole("cell").map((cell) => plain(cell.textContent))).toEqual(["€ 1500", "€ 640", "€ 860"]);
    const novembre = rows.find((row) => within(row).queryByRole("rowheader", { name: "novembre 2026" })) as HTMLElement;
    expect(within(novembre).getAllByRole("cell").map((cell) => plain(cell.textContent))).toEqual(["€ 240", "€ 45", "€ 195"]);
    await userEvent.click(screen.getByRole("button", { name: "Mostra come grafico" }));
    expect(screen.getByRole("figure")).toBeInTheDocument();
  });

  it("writes a negative balance with a minus, never with colour alone", async () => {
    render(<TrendChart trend={trendOf(SPESE)} />);
    await userEvent.click(columns()[9] as HTMLElement);
    expect(plain(readout().textContent)).toContain("− € 120");
    await userEvent.click(screen.getByRole("button", { name: "Mostra come tabella" }));
    const ottobre = screen.getAllByRole("row").find((row) => within(row).queryByRole("rowheader", { name: "ottobre 2026" })) as HTMLElement;
    expect(plain(ottobre.textContent)).toContain("− € 120");
  });

  it("goes day by day for a short period, names the weekday and keeps the bars wide enough to be touched", async () => {
    const days: LedgerTrend = {
      granularity: "DAY",
      totals: { incomeCents: 5000, expenseCents: 0, balanceCents: 5000 },
      buckets: Array.from({ length: 30 }, (_, index) => ({
        key: `2026-11-${String(index + 1).padStart(2, "0")}`,
        incomeCents: index === 4 ? 5000 : 0,
        expenseCents: 0,
        balanceCents: index === 4 ? 5000 : 0,
      })),
    };
    render(<TrendChart trend={days} />);
    expect(columns()).toHaveLength(30);
    // the chart scrolls sideways rather than squeezing thirty bars on a phone
    expect(screen.getByRole("group", { name: /usa le frecce/ })).toHaveStyle({ minWidth: "420px" });
    await userEvent.click(columns()[4] as HTMLElement);
    expect(readout()).toHaveTextContent("giovedì 5 novembre 2026");
    expect(plain(readout().textContent)).toContain("In media per giorno");
    expect(readout()).toHaveTextContent(/Passa il mouse|vedere le cifre|Entrate/);
  });

  it("explains a period with nothing in it instead of drawing empty bars", () => {
    render(<TrendChart trend={trendOf([])} />);
    expect(screen.getByRole("heading", { name: "Nessun movimento in questo periodo" })).toBeInTheDocument();
    expect(screen.queryByRole("figure")).not.toBeInTheDocument();
  });

  it("has no detectable accessibility violations, as a chart (with a bar chosen) and as a table", async () => {
    const { container } = render(<TrendChart trend={year} />);
    await userEvent.click(columns()[8] as HTMLElement);
    await expectNoA11yViolations(container);
    await userEvent.click(screen.getByRole("button", { name: "Mostra come tabella" }));
    await expectNoA11yViolations(container);
  });
});
