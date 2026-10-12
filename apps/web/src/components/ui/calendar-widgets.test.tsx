import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { expectNoA11yViolations } from "@/test/a11y";
import { Timeline } from "./timeline";
import { WeekStrip } from "./week-strip";

const MATCH_DAY = new Date(2026, 10, 14);

describe("WeekStrip", () => {
  it("shows the seven days of the week starting on Monday", () => {
    render(<WeekStrip weekOf={MATCH_DAY} selected={MATCH_DAY} onSelect={() => undefined} />);
    const days = within(screen.getByRole("group", { name: "Giorni della settimana" })).getAllByRole("button");
    expect(days).toHaveLength(7);
    expect(days[0]).toHaveTextContent("9");
    expect(days[6]).toHaveTextContent("15");
  });

  it("marks the selected day and the days with events in the accessible name", () => {
    render(<WeekStrip weekOf={MATCH_DAY} selected={MATCH_DAY} onSelect={() => undefined} eventDays={[new Date(2026, 10, 12)]} />);
    expect(screen.getByRole("button", { name: /^sab 14 novembre/i })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: /^gio 12 novembre, con eventi/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^lun 9 novembre, nessun evento/i })).toBeInTheDocument();
  });

  it("reports the picked day", async () => {
    const onSelect = vi.fn();
    render(<WeekStrip weekOf={MATCH_DAY} selected={MATCH_DAY} onSelect={onSelect} />);
    await userEvent.click(screen.getByRole("button", { name: /^mar 10 novembre/i }));
    expect(onSelect).toHaveBeenCalledWith(new Date(2026, 10, 10));
  });

  it("has no detectable accessibility violations", async () => {
    const { container } = render(<WeekStrip weekOf={MATCH_DAY} selected={MATCH_DAY} onSelect={() => undefined} eventDays={[MATCH_DAY]} />);
    await expectNoA11yViolations(container);
  });
});

describe("Timeline", () => {
  const items = [
    { id: "sc", name: "Sara Conti", date: new Date(2026, 10, 27) },
    { id: "gr", name: "Giulia Rossi", date: new Date(2026, 9, 28) },
    { id: "far", name: "Anna Ferri", date: new Date(2028, 0, 1) },
  ];

  it("labels the months of the range", () => {
    render(<Timeline start={new Date(2026, 9, 1)} items={items} label="Scadenze" />);
    for (const month of ["ott", "nov", "dic", "gen", "feb", "mar"]) {
      expect(screen.getByText(month)).toBeInTheDocument();
    }
  });

  it("lists in date order and leaves out expiries outside the range", () => {
    render(<Timeline start={new Date(2026, 9, 1)} items={items} label="Scadenze" />);
    const list = screen.getByRole("list", { name: "Scadenze" });
    const entries = within(list).getAllByRole("listitem");
    expect(entries).toHaveLength(2);
    expect(entries[0]).toHaveTextContent("Giulia Rossi, scade il 28 ottobre 2026");
    expect(entries[1]).toHaveTextContent("Sara Conti, scade il 27 novembre 2026");
  });

  it("becomes selectable and keeps the visible initials in the accessible name", async () => {
    const onSelect = vi.fn();
    render(<Timeline start={new Date(2026, 9, 1)} items={items} selectedId="sc" onSelect={onSelect} label="Scadenze" />);
    const selected = screen.getByRole("button", { name: /^SC Sara Conti/ });
    expect(selected).toHaveAttribute("aria-pressed", "true");
    await userEvent.click(screen.getByRole("button", { name: /^GR Giulia Rossi/ }));
    expect(onSelect).toHaveBeenCalledWith("gr");
  });

  it("has no detectable accessibility violations", async () => {
    const { container } = render(<Timeline start={new Date(2026, 9, 1)} items={items} selectedId="sc" onSelect={() => undefined} label="Scadenze" />);
    await expectNoA11yViolations(container);
  });
});
