import type { EmailMessage } from '../../lib/email.js';

// Italian copy of the magic-link email (the product language). Pure: same input, same text.
export function magicLinkEmail(input: {
  to: string;
  firstName: string;
  link: string;
  ttlMinutes: number;
  idempotencyKey: string;
}): EmailMessage {
  const name = input.firstName.trim();
  return {
    to: input.to,
    subject: 'Il tuo link di accesso a SuiteASD',
    text: [
      name ? `Ciao ${name},` : 'Ciao,',
      '',
      `usa questo link per accedere a SuiteASD. Vale ${input.ttlMinutes} minuti e può essere usato una sola volta:`,
      '',
      input.link,
      '',
      'Se non lo hai richiesto tu, ignora questo messaggio: senza il link nessuno può entrare nel tuo account.',
    ].join('\n'),
    idempotencyKey: input.idempotencyKey,
  };
}
