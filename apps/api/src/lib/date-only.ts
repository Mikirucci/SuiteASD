import { z } from 'zod';

// Calendar dates without a time (contract start, ledger entry day) travel as `YYYY-MM-DD` and are stored as UTC midnight.
export const dateOnlySchema = z.iso.date();

export function fromDateOnly(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

export function toDateOnly(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function toDateOnlyOrNull(date: Date | null): string | null {
  return date ? toDateOnly(date) : null;
}
