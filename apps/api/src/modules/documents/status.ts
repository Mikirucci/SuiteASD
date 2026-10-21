// Pure date / status rules for member documents (SPEC 01 and 02). No I/O here: easy to unit test.

export const MEDICAL_CERTIFICATE_KEY = 'MEDICAL_CERTIFICATE';

// A document is "in scadenza" (amber) when it expires within this many days (first reminder threshold, SPEC 02).
export const EXPIRING_THRESHOLD_DAYS = 30;

export const DOCUMENT_STATUSES = ['OK', 'EXPIRING', 'EXPIRED', 'MISSING'] as const;
export type DocumentStatus = (typeof DOCUMENT_STATUSES)[number];

const DAY_MS = 86_400_000;

export function startOfUtcDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

// Dates without time ("2026-11-27") are stored as UTC midnight.
export function parseDateOnly(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

export function formatDateOnly(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * DAY_MS);
}

// Whole days from today to the expiry day: 0 = expires today (still valid), negative = already expired.
export function daysUntil(expiresAt: Date, now: Date): number {
  return Math.round((startOfUtcDay(expiresAt).getTime() - startOfUtcDay(now).getTime()) / DAY_MS);
}

export function statusForExpiry(expiresAt: Date, now: Date): Exclude<DocumentStatus, 'MISSING'> {
  const days = daysUntil(expiresAt, now);
  if (days < 0) return 'EXPIRED';
  return days <= EXPIRING_THRESHOLD_DAYS ? 'EXPIRING' : 'OK';
}

interface DocumentLike {
  expiresAt: Date | null;
  fileKey: string | null;
}

// The "current" document of a (member, type) pair: the one valid the longest. Documents of a type without
// expiry only need to exist; for expiring types a record without a date cannot prove validity and is ignored.
// A record with its file always wins over one without: the file is what proves the document was handed in.
export function pickCurrentDocument<T extends DocumentLike>(documents: readonly T[], requiresExpiry: boolean): T | null {
  const withFile = documents.filter((document) => document.fileKey !== null);
  const candidates = withFile.length > 0 ? withFile : documents;
  if (!requiresExpiry) return candidates[0] ?? null;
  let current: T | null = null;
  for (const document of candidates) {
    if (!document.expiresAt) continue;
    if (!current?.expiresAt || document.expiresAt > current.expiresAt) current = document;
  }
  return current;
}

export function statusOfDocument(document: DocumentLike | null, requiresExpiry: boolean, now: Date): DocumentStatus {
  // A record with no attached file is a promise, not a document: it stays MISSING until the file arrives
  if (document?.fileKey == null) return 'MISSING';
  if (!requiresExpiry) return 'OK';
  return document.expiresAt ? statusForExpiry(document.expiresAt, now) : 'MISSING';
}

// Overall level of a member, as shown by the three list indicators: MISSING also covers expired documents.
export type OverallDocumentStatus = 'OK' | 'EXPIRING' | 'MISSING';

export function overallStatus(statuses: readonly DocumentStatus[]): OverallDocumentStatus {
  if (statuses.some((status) => status === 'MISSING' || status === 'EXPIRED')) return 'MISSING';
  return statuses.some((status) => status === 'EXPIRING') ? 'EXPIRING' : 'OK';
}
