import type { CSSProperties } from "react";
import type { CardTemplate } from "./types";

/**
 * The backgrounds a card can have. Only the background changes: the information stays in the same places. The colours
 * live in globals.css (--color-card-*); the variables are named in full here so that nothing builds a name at run time.
 */
export interface TemplateOption {
  value: CardTemplate;
  label: string;
  /** The background and the ink written on it. */
  style: CSSProperties;
}

export const CARD_TEMPLATES: readonly TemplateOption[] = [
  {
    value: "ELETTRICO",
    label: "Elettrico",
    style: {
      background: "linear-gradient(135deg, var(--color-card-elettrico-from), var(--color-card-elettrico-to))",
      color: "var(--color-card-elettrico-ink)",
    },
  },
  {
    value: "MENTA",
    label: "Menta",
    style: {
      background: "linear-gradient(135deg, var(--color-card-menta-from), var(--color-card-menta-to))",
      color: "var(--color-card-menta-ink)",
    },
  },
  {
    value: "OCEANO",
    label: "Oceano",
    style: {
      background: "linear-gradient(135deg, var(--color-card-oceano-from), var(--color-card-oceano-to))",
      color: "var(--color-card-oceano-ink)",
    },
  },
  {
    value: "ALBA",
    label: "Alba",
    style: {
      background: "linear-gradient(135deg, var(--color-card-alba-from), var(--color-card-alba-to))",
      color: "var(--color-card-alba-ink)",
    },
  },
  {
    value: "NOTTE",
    label: "Notte",
    style: {
      background: "linear-gradient(135deg, var(--color-card-notte-from), var(--color-card-notte-to))",
      color: "var(--color-card-notte-ink)",
    },
  },
  {
    value: "CARBONE",
    label: "Carbone",
    style: {
      background: "linear-gradient(135deg, var(--color-card-carbone-from), var(--color-card-carbone-to))",
      color: "var(--color-card-carbone-ink)",
    },
  },
];

export function templateOf(value: CardTemplate): TemplateOption {
  const found = CARD_TEMPLATES.find((option) => option.value === value);
  if (!found) throw new Error(`Unknown card template: ${value}`);
  return found;
}
