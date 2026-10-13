import { render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Timeline } from "./timeline";

const TRACK_WIDTH = 600;

beforeEach(() => {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(TRACK_WIDTH);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("Timeline overlapping avatars", () => {
  it("puts expiries on the same days on separate rows and keeps distant ones together", () => {
    render(
      <Timeline
        start={new Date(2026, 9, 1)}
        label="Scadenze"
        items={[
          { id: "a", name: "Sara Conti", date: new Date(2026, 10, 27) },
          { id: "b", name: "Francesca Monti", date: new Date(2026, 10, 27) },
          { id: "c", name: "Elena Russo", date: new Date(2027, 1, 18) },
        ]}
      />,
    );
    const list = screen.getByRole("list", { name: "Scadenze" });
    const tops = within(list)
      .getAllByRole("listitem")
      .map((item) => item.style.top);
    expect(tops).toEqual(["0px", "44px", "0px"]);
    expect(list.style.height).toBe("92px");
  });

  it("keeps a single row of the usual height when nothing overlaps", () => {
    render(
      <Timeline
        start={new Date(2026, 9, 1)}
        label="Scadenze"
        items={[
          { id: "a", name: "Giulia Rossi", date: new Date(2026, 9, 28) },
          { id: "b", name: "Elena Russo", date: new Date(2027, 1, 18) },
        ]}
      />,
    );
    expect(screen.getByRole("list", { name: "Scadenze" }).style.height).toBe("48px");
  });
});
