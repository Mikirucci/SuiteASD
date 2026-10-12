// Minimal RFC 5545 writer for the calendar export (SPEC 04: iCal / Google Calendar sync).

export interface IcalEvent {
  id: string;
  title: string;
  startsAt: Date;
  endsAt: Date | null;
  cancelled: boolean;
  location: string | null;
  description: string | null;
  updatedAt: Date;
}

const DEFAULT_DURATION_MS = 60 * 60 * 1000;

function utcStamp(date: Date): string {
  return date.toISOString().replaceAll(/[-:]/g, '').replace(/\.\d{3}/, '');
}

function escapeText(value: string): string {
  return value
    .replaceAll('\\', '\\\\')
    .replaceAll(';', '\\;')
    .replaceAll(',', '\\,')
    .replaceAll(/\r\n|\r|\n/g, '\\n');
}

// Content lines are limited to 75 octets; continuation lines start with a space.
function fold(line: string): string {
  const encoder = new TextEncoder();
  const chunks: string[] = [];
  let current = '';
  let size = 0;
  for (const char of line) {
    const width = encoder.encode(char).length;
    const limit = chunks.length === 0 ? 75 : 74;
    if (size + width > limit) {
      chunks.push(current);
      current = '';
      size = 0;
    }
    current += char;
    size += width;
  }
  chunks.push(current);
  return chunks.join('\r\n ');
}

export function buildIcalendar(events: readonly IcalEvent[], calendarName: string): string {
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//SuiteASD//Calendario//IT', 'CALSCALE:GREGORIAN'];
  lines.push(`X-WR-CALNAME:${escapeText(calendarName)}`);
  for (const event of events) {
    const end = event.endsAt ?? new Date(event.startsAt.getTime() + DEFAULT_DURATION_MS);
    lines.push(
      'BEGIN:VEVENT',
      `UID:${event.id}@suiteasd`,
      `DTSTAMP:${utcStamp(event.updatedAt)}`,
      `DTSTART:${utcStamp(event.startsAt)}`,
      `DTEND:${utcStamp(end)}`,
      `SUMMARY:${escapeText(event.title)}`,
      `STATUS:${event.cancelled ? 'CANCELLED' : 'CONFIRMED'}`,
    );
    if (event.location) lines.push(`LOCATION:${escapeText(event.location)}`);
    if (event.description) lines.push(`DESCRIPTION:${escapeText(event.description)}`);
    lines.push('END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  return lines.map(fold).join('\r\n') + '\r\n';
}
