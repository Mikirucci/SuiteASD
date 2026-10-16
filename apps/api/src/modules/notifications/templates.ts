// Italian texts of the notification types (SPEC 07 and docs/DECISIONS.md D-21). Pure functions: the same input always gives the same text.

export interface RenderedNotification {
  title: string;
  body: string;
}

export type NotificationTemplate =
  | { type: 'CONVOCATION'; eventTitle: string; startsAt: Date }
  | { type: 'FEE_DUE'; description: string; amountCents: number; dueDate: Date; today: Date }
  | { type: 'CERTIFICATE_EXPIRING'; memberName: string; documentName: string; daysLeft: number }
  | { type: 'EVENT_CHANGED'; change: 'MOVED' | 'CANCELLED'; eventTitle: string; startsAt: Date }
  | { type: 'EVALUATION_PUBLISHED'; matchLabel: string; rating: number }
  | { type: 'ANNOUNCEMENT'; title: string; body: string }
  | { type: 'DOCUMENT_MISSING'; memberName: string; documentNames: readonly string[] }
  | { type: 'ADMIN_PAYMENT_RECEIVED'; memberName: string; description: string; amountCents: number }
  | { type: 'ADMIN_FEE_OVERDUE'; count: number; totalCents: number }
  | { type: 'ADMIN_DOCUMENT_ALERT'; membersToFix: number; documentsToFix: number; expiringSoon: number }
  | { type: 'ADMIN_DOCUMENT_UPLOADED'; memberName: string; documentName: string; expiresAt: Date | null }
  | { type: 'ADMIN_NEW_ENROLMENT'; memberName: string; teamName: string | null }
  | { type: 'ADMIN_SPONSOR_EXPIRING'; sponsorName: string; daysLeft: number };

const TIMEZONE = 'Europe/Rome';
const DAY_MS = 86_400_000;
const EXCERPT_LENGTH = 140;

const weekdayFormat = new Intl.DateTimeFormat('it-IT', { timeZone: TIMEZONE, weekday: 'long' });
const dateFormat = new Intl.DateTimeFormat('it-IT', { timeZone: TIMEZONE, day: 'numeric', month: 'long' });
const timeFormat = new Intl.DateTimeFormat('it-IT', { timeZone: TIMEZONE, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
const dateOnlyFormat = new Intl.DateTimeFormat('it-IT', { timeZone: 'UTC', day: 'numeric', month: 'long' });

export function formatEuro(cents: number): string {
  const whole = cents % 100 === 0;
  const amount = (cents / 100).toLocaleString('it-IT', {
    minimumFractionDigits: whole ? 0 : 2,
    maximumFractionDigits: 2,
  });
  return `€ ${amount}`;
}

export function formatRating(rating: number): string {
  return rating.toLocaleString('it-IT', { minimumFractionDigits: 0, maximumFractionDigits: 1 });
}

function capitalise(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function pluralDays(days: number): string {
  return days === 1 ? '1 giorno' : `${days} giorni`;
}

function whenLabel(startsAt: Date): string {
  return `${weekdayFormat.format(startsAt)} ${dateFormat.format(startsAt)} alle ${timeFormat.format(startsAt)}`;
}

function startOfUtcDay(date: Date): number {
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

export function renderNotification(template: NotificationTemplate): RenderedNotification {
  switch (template.type) {
    case 'CONVOCATION':
      return {
        title: 'Convocazione',
        body: `${template.eventTitle} · ${capitalise(weekdayFormat.format(template.startsAt))} ${timeFormat.format(template.startsAt)} · conferma presenza`,
      };
    case 'FEE_DUE': {
      const daysToDue = Math.round((startOfUtcDay(template.dueDate) - startOfUtcDay(template.today)) / DAY_MS);
      const amount = formatEuro(template.amountCents);
      const due = dateOnlyFormat.format(template.dueDate);
      if (daysToDue < 0) {
        return {
          title: 'Quota scaduta',
          body: `${template.description} · ${amount} · scaduta il ${due} (da ${pluralDays(-daysToDue)})`,
        };
      }
      return {
        title: 'Quota in scadenza',
        body: `${template.description} · ${amount} · scade il ${due}${daysToDue === 0 ? ' (oggi)' : ` (tra ${pluralDays(daysToDue)})`}`,
      };
    }
    case 'CERTIFICATE_EXPIRING': {
      const subject = `${template.memberName} · ${template.documentName}`;
      if (template.daysLeft < 0) {
        return { title: 'Documento scaduto', body: `${subject} — scaduto da ${pluralDays(-template.daysLeft)}, serve il rinnovo` };
      }
      return {
        title: 'Documento in scadenza',
        body: `${subject} — ${template.daysLeft === 0 ? 'scade oggi' : `scade tra ${pluralDays(template.daysLeft)}`}`,
      };
    }
    case 'EVENT_CHANGED':
      return template.change === 'CANCELLED'
        ? { title: 'Evento annullato', body: `${template.eventTitle} — ${whenLabel(template.startsAt)}` }
        : { title: 'Evento spostato', body: `${template.eventTitle} — ${capitalise(whenLabel(template.startsAt))}` };
    case 'EVALUATION_PUBLISHED':
      return { title: 'Pagella pubblicata', body: `${template.matchLabel} · voto ${formatRating(template.rating)}` };
    case 'ANNOUNCEMENT':
      return { title: template.title, body: template.body.slice(0, EXCERPT_LENGTH) };
    case 'DOCUMENT_MISSING':
      return {
        title: 'Documenti da caricare',
        body: `Per ${template.memberName} mancano: ${template.documentNames.join(', ')}`,
      };
    case 'ADMIN_PAYMENT_RECEIVED':
      return {
        title: 'Pagamento ricevuto',
        body: `${template.memberName} · ${template.description} · ${formatEuro(template.amountCents)}`,
      };
    case 'ADMIN_FEE_OVERDUE':
      return {
        title: 'Quote scadute da incassare',
        body: `${template.count === 1 ? '1 quota scaduta' : `${template.count} quote scadute`} per ${formatEuro(template.totalCents)} complessivi`,
      };
    case 'ADMIN_DOCUMENT_ALERT': {
      const parts = [
        template.membersToFix > 0
          ? `${template.membersToFix === 1 ? '1 tesserato' : `${template.membersToFix} tesserati`} con ${template.documentsToFix === 1 ? '1 documento mancante o scaduto' : `${template.documentsToFix} documenti mancanti o scaduti`}`
          : null,
        template.expiringSoon > 0 ? `${template.expiringSoon === 1 ? '1 documento' : `${template.expiringSoon} documenti`} in scadenza` : null,
      ].filter((part) => part !== null);
      return { title: 'Documenti da sistemare', body: parts.join(' · ') };
    }
    case 'ADMIN_DOCUMENT_UPLOADED':
      return {
        title: 'Documento caricato',
        body: `${template.memberName} · ${template.documentName}${template.expiresAt ? ` · scade il ${dateOnlyFormat.format(template.expiresAt)}` : ''}`,
      };
    case 'ADMIN_NEW_ENROLMENT':
      return {
        title: 'Nuova iscrizione',
        body: `${template.memberName}${template.teamName ? ` · ${template.teamName}` : ''}`,
      };
    case 'ADMIN_SPONSOR_EXPIRING':
      return {
        title: 'Contratto sponsor in scadenza',
        body: `${template.sponsorName} — ${template.daysLeft <= 0 ? 'scade oggi' : `scade tra ${pluralDays(template.daysLeft)}`}`,
      };
  }
}
