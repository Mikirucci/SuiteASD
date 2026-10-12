import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { expectNoA11yViolations } from "@/test/a11y";
import { ProgressBar } from "./progress-bar";
import { formatGrade, gradeTone, ProgressRing } from "./progress-ring";

describe("ProgressBar", () => {
  it("exposes value, range and a readable text alternative", () => {
    render(<ProgressBar label="Presenze confermate" value={5} max={12} valueText="5 su 12 confermate" />);
    const bar = screen.getByRole("progressbar", { name: "Presenze confermate" });
    expect(bar).toHaveAttribute("aria-valuenow", "5");
    expect(bar).toHaveAttribute("aria-valuemax", "12");
    expect(bar).toHaveAttribute("aria-valuetext", "5 su 12 confermate");
  });

  it("has no detectable accessibility violations", async () => {
    const { container } = render(<ProgressBar label="Avanzamento" value={40} />);
    await expectNoA11yViolations(container);
  });
});

describe("ProgressRing", () => {
  it("describes the grade in words", () => {
    render(<ProgressRing value={8.4} label="Voto di Giulia Rossi" />);
    expect(screen.getByRole("img", { name: "Voto di Giulia Rossi: 8,4 su 10" })).toBeInTheDocument();
  });

  it("formats grades the Italian way", () => {
    expect(formatGrade(8.5)).toBe("8,5");
    expect(formatGrade(7)).toBe("7,0");
  });

  it.each([
    [9.1, "brand"],
    [8, "brand"],
    [7.4, "success"],
    [6.2, "warning"],
    [5.9, "danger"],
  ] as const)("colours a %s grade as %s", (grade, tone) => {
    expect(gradeTone(grade)).toBe(tone);
  });

  it("has no detectable accessibility violations", async () => {
    const { container } = render(<ProgressRing value={7.1} label="Voto di Sara Conti" />);
    await expectNoA11yViolations(container);
  });
});
