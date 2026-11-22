import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { CARD_TEMPLATES, templateOf } from "./card-templates";

// Vitest runs from apps/web
const CSS = readFileSync(join(process.cwd(), "src/app/globals.css"), "utf8");

function colorOf(name: string): string {
  const match = new RegExp(`--color-card-${name}:\\s*(#[0-9a-fA-F]{6})`).exec(CSS);
  if (!match?.[1]) throw new Error(`Missing token --color-card-${name}`);
  return match[1];
}

/** Relative luminance of an sRGB colour, WCAG 2.x. */
function luminance(hex: string): number {
  const channels = [1, 3, 5].map((start) => parseInt(hex.slice(start, start + 2), 16) / 255);
  const [r = 0, g = 0, b = 0] = channels.map((value) => (value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (light + 0.05) / (dark + 0.05);
}

describe("card templates", () => {
  it("offers the six templates of the backend", () => {
    expect(CARD_TEMPLATES.map((template) => template.value)).toEqual(["ELETTRICO", "MENTA", "OCEANO", "ALBA", "NOTTE", "CARBONE"]);
  });

  it.each(CARD_TEMPLATES.map((template) => template.value.toLowerCase()))(
    "the ink of %s reaches AA contrast on both ends of the gradient",
    (name) => {
      const ink = colorOf(`${name}-ink`);
      expect(contrast(ink, colorOf(`${name}-from`))).toBeGreaterThanOrEqual(4.5);
      expect(contrast(ink, colorOf(`${name}-to`))).toBeGreaterThanOrEqual(4.5);
    },
  );

  it("names every variable of a template in full, and every variable exists", () => {
    for (const template of CARD_TEMPLATES) {
      const name = template.value.toLowerCase();
      expect(template.style.background).toBe(`linear-gradient(135deg, var(--color-card-${name}-from), var(--color-card-${name}-to))`);
      expect(template.style.color).toBe(`var(--color-card-${name}-ink)`);
      expect(() => colorOf(`${name}-from`)).not.toThrow();
    }
  });

  it("finds a template by its value", () => {
    expect(templateOf("MENTA").label).toBe("Menta");
  });
});
