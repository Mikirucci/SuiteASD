import type { MemberBrief, StatLine } from "./types";

export const MIN_RATING = 1;
export const MAX_RATING = 10;

/** "8,5" or "8.5" -> 8.5; null when it is not a rating from 1 to 10 with at most one decimal (same rule as the API). */
export function parseRating(input: string): number | null {
  const normalized = input.trim().replace(",", ".");
  if (!/^\d{1,2}(\.\d)?$/.test(normalized)) return null;
  const value = Number(normalized);
  return value >= MIN_RATING && value <= MAX_RATING ? value : null;
}

/** 8.5 -> "8,5" (what the coach types and reads back). */
export function ratingToInput(rating: number): string {
  return String(rating).replace(".", ",");
}

export function memberName(member: Pick<MemberBrief, "firstName" | "lastName">): string {
  return `${member.firstName} ${member.lastName}`;
}

export const STAT_LABELS: ReadonlyArray<{ key: keyof StatLine; label: string }> = [
  { key: "attackPoints", label: "Attacchi vincenti" },
  { key: "aces", label: "Ace" },
  { key: "blocks", label: "Muri" },
  { key: "receptions", label: "Ricezioni" },
  { key: "errors", label: "Errori" },
];
