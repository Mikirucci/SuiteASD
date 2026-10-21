import { describe, expect, it } from 'vitest';
import { CsvParseError, parseCsv, toCsv } from '../../src/lib/csv.js';
import {
  daysUntil,
  overallStatus,
  pickCurrentDocument,
  statusForExpiry,
  statusOfDocument,
} from '../../src/modules/documents/status.js';
import { matchesSignature, sanitizeFileName } from '../../src/modules/documents/storage.js';
import { normalizeHeader } from '../../src/modules/members/csv-columns.js';

const NOW = new Date('2026-10-12T15:30:00.000Z');
const day = (iso: string): Date => new Date(`${iso}T00:00:00.000Z`);

describe('expiry rules (SPEC 02)', () => {
  it('counts whole days regardless of the time of day', () => {
    expect(daysUntil(day('2026-10-12'), NOW)).toBe(0);
    expect(daysUntil(day('2026-10-27'), NOW)).toBe(15);
    expect(daysUntil(day('2026-10-11'), NOW)).toBe(-1);
  });

  it('is valid through the expiry day, amber within 30 days, red once expired', () => {
    expect(statusForExpiry(day('2026-10-12'), NOW)).toBe('EXPIRING');
    expect(statusForExpiry(day('2026-11-11'), NOW)).toBe('EXPIRING');
    expect(statusForExpiry(day('2026-11-12'), NOW)).toBe('OK');
    expect(statusForExpiry(day('2026-10-11'), NOW)).toBe('EXPIRED');
  });

  it('treats a missing document as MISSING and a no-expiry document as OK', () => {
    expect(statusOfDocument(null, true, NOW)).toBe('MISSING');
    expect(statusOfDocument({ expiresAt: null, fileKey: 'k' }, false, NOW)).toBe('OK');
    expect(statusOfDocument({ expiresAt: null, fileKey: 'k' }, true, NOW)).toBe('MISSING');
  });

  it('keeps a document without its file MISSING, whatever its expiry', () => {
    expect(statusOfDocument({ expiresAt: null, fileKey: null }, false, NOW)).toBe('MISSING');
    expect(statusOfDocument({ expiresAt: day('2027-06-01'), fileKey: null }, true, NOW)).toBe('MISSING');
    expect(statusOfDocument({ expiresAt: day('2027-06-01'), fileKey: 'k' }, true, NOW)).toBe('OK');
  });

  it('picks the document valid the longest as the current one', () => {
    const old = { expiresAt: day('2026-01-01'), fileKey: 'old' };
    const renewed = { expiresAt: day('2027-01-01'), fileKey: 'new' };
    expect(pickCurrentDocument([old, renewed], true)).toBe(renewed);
    expect(pickCurrentDocument([{ expiresAt: null, fileKey: 'k' }], true)).toBeNull();
    expect(pickCurrentDocument([], false)).toBeNull();
  });

  it('prefers a document with its file over a later one still waiting for it', () => {
    const onFile = { expiresAt: day('2026-12-01'), fileKey: 'k' };
    const waiting = { expiresAt: day('2027-12-01'), fileKey: null };
    expect(pickCurrentDocument([waiting, onFile], true)).toBe(onFile);
    expect(pickCurrentDocument([waiting], true)).toBe(waiting);
  });

  it('aggregates to the worst indicator, expired counting as missing', () => {
    expect(overallStatus(['OK', 'OK'])).toBe('OK');
    expect(overallStatus(['OK', 'EXPIRING'])).toBe('EXPIRING');
    expect(overallStatus(['EXPIRING', 'EXPIRED'])).toBe('MISSING');
    expect(overallStatus(['OK', 'MISSING'])).toBe('MISSING');
  });
});

describe('file safety helpers', () => {
  it('strips directories, control characters and odd symbols from file names', () => {
    expect(sanitizeFileName('../../etc/passwd')).toBe('passwd');
    expect(sanitizeFileName('..\\..\\windows\\system32\\evil.pdf')).toBe('evil.pdf');
    expect(sanitizeFileName('cert\u0000ificato<script>.pdf')).toBe('certificato_script_.pdf');
    expect(sanitizeFileName('...')).toBe('documento');
    expect(sanitizeFileName(undefined)).toBe('documento');
    expect(sanitizeFileName('a'.repeat(300)).length).toBe(100);
    expect(sanitizeFileName('Certificato è valido.pdf')).toBe('Certificato è valido.pdf');
  });

  it('recognizes real content by its magic bytes', () => {
    expect(matchesSignature(Buffer.from('%PDF-1.7 ...'), 'application/pdf')).toBe(true);
    expect(matchesSignature(Buffer.from('%PDF-1.7 ...'), 'image/png')).toBe(false);
    expect(matchesSignature(Buffer.from([0xff, 0xd8, 0xff, 0xe0]), 'image/jpeg')).toBe(true);
    expect(matchesSignature(Buffer.from('<html>'), 'image/jpeg')).toBe(false);
    expect(matchesSignature(Buffer.alloc(0), 'application/pdf')).toBe(false);
  });
});

describe('csv helpers', () => {
  it('parses quoted fields, escaped quotes, embedded newlines, CRLF and blank lines', () => {
    const text = 'nome;note\r\n"Anna";"dice ""ciao""; poi\nva"\r\n\r\nMarta;\r\n';
    expect(parseCsv(text)).toEqual([
      ['nome', 'note'],
      ['Anna', 'dice "ciao"; poi\nva'],
      ['Marta', ''],
    ]);
  });

  it('detects the comma delimiter and ignores a BOM', () => {
    expect(parseCsv(`${String.fromCharCode(0xfeff)}a,b\n1,2`)).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ]);
  });

  it('rejects an unterminated quote', () => {
    expect(() => parseCsv('a;b\n"open;2')).toThrow(CsvParseError);
  });

  it('neutralizes spreadsheet formulas on export and round-trips plain data', () => {
    const csv = toCsv([['nome', 'telefono'], ['=HYPERLINK("x")', '+39 333 1234567'], ['A;B', null]]);
    expect(csv).toContain("'=HYPERLINK");
    expect(csv).toContain("'+39 333 1234567");
    expect(csv).toContain('"A;B";');
    expect(parseCsv(csv)[2]).toEqual(['A;B', '']);
  });

  it('normalizes headers regardless of accents, case and punctuation', () => {
    expect(normalizeHeader(' Data di Nascita ')).toBe('datadinascita');
    expect(normalizeHeader('Città')).toBe('citta');
  });
});
