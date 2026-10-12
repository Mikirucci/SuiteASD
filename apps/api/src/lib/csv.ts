// Minimal RFC 4180 CSV reader / writer (quoted fields, escaped quotes, CRLF), no dependency.

export type CsvDelimiter = ',' | ';';

export class CsvParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CsvParseError';
  }
}

// Italian spreadsheets export with ";" (the comma is the decimal separator): pick whichever the header uses most.
export function detectDelimiter(text: string): CsvDelimiter {
  const header = text.split(/\r?\n/, 1)[0] ?? '';
  const semicolons = header.split(';').length;
  const commas = header.split(',').length;
  return semicolons > commas ? ';' : ',';
}

// Returns the non-empty records. A UTF-8 BOM is ignored.
export function parseCsv(input: string, delimiter: CsvDelimiter = detectDelimiter(input)): string[][] {
  const text = input.startsWith(BOM) ? input.slice(1) : input;
  const records: string[][] = [];
  let record: string[] = [];
  let field = '';
  let inQuotes = false;
  let fieldWasQuoted = false;

  const endField = (): void => {
    record.push(field);
    field = '';
    fieldWasQuoted = false;
  };
  const endRecord = (): void => {
    endField();
    if (record.some((value) => value.trim() !== '')) records.push(record);
    record = [];
  };

  for (let index = 0; index < text.length; index += 1) {
    const char = text.charAt(index);
    if (inQuotes) {
      if (char !== '"') field += char;
      else if (text.charAt(index + 1) === '"') {
        field += '"';
        index += 1;
      } else inQuotes = false;
      continue;
    }
    if (char === '"' && field === '' && !fieldWasQuoted) {
      inQuotes = true;
      fieldWasQuoted = true;
    } else if (char === delimiter) endField();
    else if (char === '\n') endRecord();
    else if (char !== '\r') field += char;
  }
  if (inQuotes) throw new CsvParseError('Unterminated quoted field');
  if (field !== '' || record.length > 0) endRecord();
  return records;
}

const BOM = String.fromCharCode(0xfeff);

// Cells starting with these characters are interpreted as formulas by spreadsheets (CSV injection, OWASP).
const FORMULA_PREFIX = /^[=+\-@\t\r]/;

function escapeCell(value: string | number | null): string {
  if (value === null) return '';
  let text = String(value);
  if (FORMULA_PREFIX.test(text)) text = `'${text}`;
  return /[";\n\r,]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

// Semicolon separated, CRLF, UTF-8 BOM: opens correctly in Italian Excel.
export function toCsv(rows: readonly (readonly (string | number | null)[])[]): string {
  return `${BOM}${rows.map((row) => row.map(escapeCell).join(';')).join('\r\n')}\r\n`;
}
