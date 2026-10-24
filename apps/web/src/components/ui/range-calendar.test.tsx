import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { expectNoA11yViolations } from "@/test/a11y";
import { toDayKey } from "@/lib/dates";
import { RangeCalendar } from "./range-calendar";

const OCTOBER = { from: new Date(2026, 9, 19), to: new Date(2026, 9, 25) };

describe("RangeCalendar", () => {
  it("opens on the month of the range, Monday first, with every day named in full", async () => {
    const { container } = render(<RangeCalendar value={OCTOBER} onChange={() => undefined} />);
    const calendar = screen.getByRole("group", { name: "Calendario" });
    expect(within(calendar).getByText("ottobre 2026")).toBeInTheDocument();
    expect(within(calendar).getAllByRole("button", { name: /\d{4}$/ })).toHaveLength(42);
    expect(within(calendar).getByRole("button", { name: "lunedì 19 ottobre 2026" })).toHaveAttribute("aria-pressed", "true");
    expect(within(calendar).getByRole("button", { name: "domenica 25 ottobre 2026" })).toHaveAttribute("aria-pressed", "true");
    expect(within(calendar).getByRole("button", { name: "martedì 20 ottobre 2026" })).toHaveAttribute("aria-pressed", "true");
    expect(within(calendar).getByRole("button", { name: "lunedì 26 ottobre 2026" })).toHaveAttribute("aria-pressed", "false");
    await expectNoA11yViolations(container);
  });

  it("returns the range once the first and the last day are chosen", async () => {
    const onChange = vi.fn();
    render(<RangeCalendar value={OCTOBER} onChange={onChange} />);
    await userEvent.click(screen.getByRole("button", { name: "giovedì 8 ottobre 2026" }));
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByText("Ora scegli l'ultimo giorno.")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "mercoledì 14 ottobre 2026" }));
    expect(onChange).toHaveBeenCalledTimes(1);
    const range = onChange.mock.calls[0]?.[0] as { from: Date; to: Date };
    expect([toDayKey(range.from), toDayKey(range.to)]).toEqual(["2026-10-08", "2026-10-14"]);
  });

  it("puts the earlier day first whatever the order of the clicks, and accepts a single day", async () => {
    const onChange = vi.fn();
    render(<RangeCalendar value={OCTOBER} onChange={onChange} />);
    await userEvent.click(screen.getByRole("button", { name: "mercoledì 14 ottobre 2026" }));
    await userEvent.click(screen.getByRole("button", { name: "giovedì 8 ottobre 2026" }));
    const reversed = onChange.mock.calls[0]?.[0] as { from: Date; to: Date };
    expect([toDayKey(reversed.from), toDayKey(reversed.to)]).toEqual(["2026-10-08", "2026-10-14"]);

    await userEvent.click(screen.getByRole("button", { name: "venerdì 9 ottobre 2026" }));
    await userEvent.click(screen.getByRole("button", { name: "venerdì 9 ottobre 2026" }));
    const single = onChange.mock.calls[1]?.[0] as { from: Date; to: Date };
    expect([toDayKey(single.from), toDayKey(single.to)]).toEqual(["2026-10-09", "2026-10-09"]);
  });

  it("chooses a whole week, Monday to Sunday, with a single click on any of its days", async () => {
    const onChange = vi.fn();
    render(<RangeCalendar value={OCTOBER} selection="week" onChange={onChange} />);
    expect(screen.getByText("Scegli un giorno: vale tutta la sua settimana.")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "giovedì 8 ottobre 2026" }));
    expect(onChange).toHaveBeenCalledTimes(1);
    const week = onChange.mock.calls[0]?.[0] as { from: Date; to: Date };
    expect([toDayKey(week.from), toDayKey(week.to)]).toEqual(["2026-10-05", "2026-10-11"]);

    // a week that starts in one month and ends in the next
    await userEvent.click(screen.getByRole("button", { name: "giovedì 29 ottobre 2026" }));
    const across = onChange.mock.calls[1]?.[0] as { from: Date; to: Date };
    expect([toDayKey(across.from), toDayKey(across.to)]).toEqual(["2026-10-26", "2026-11-01"]);
  });

  it("goes through the months, and a range can start in one and end in the next", async () => {
    const onChange = vi.fn();
    render(<RangeCalendar value={OCTOBER} onChange={onChange} />);
    await userEvent.click(screen.getByRole("button", { name: "Mese successivo" }));
    expect(screen.getByText("novembre 2026")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Mese precedente" }));
    await userEvent.click(screen.getByRole("button", { name: "Mese precedente" }));
    expect(screen.getByText("settembre 2026")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "martedì 15 settembre 2026" }));
    await userEvent.click(screen.getByRole("button", { name: "Mese successivo" }));
    await userEvent.click(screen.getByRole("button", { name: "sabato 10 ottobre 2026" }));
    const range = onChange.mock.calls[0]?.[0] as { from: Date; to: Date };
    expect([toDayKey(range.from), toDayKey(range.to)]).toEqual(["2026-09-15", "2026-10-10"]);
  });
});
