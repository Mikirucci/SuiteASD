import { z } from 'zod';

// Building blocks shared by every module's Zod schemas.

export const idParamsSchema = z.object({ id: z.string().min(1).max(64) });

// Dates leave the API as ISO 8601 UTC strings; services convert with `toIso`.
export const isoDateTimeSchema = z.iso.datetime();

export const emailSchema = z.email().max(254);

export const passwordSchema = z.string().min(8).max(128);

export function toIso(date: Date): string {
  return date.toISOString();
}

export function toIsoOrNull(date: Date | null): string | null {
  return date ? date.toISOString() : null;
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}
