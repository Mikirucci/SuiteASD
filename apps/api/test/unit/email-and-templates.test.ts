import { describe, expect, it } from 'vitest';
import { loadConfig } from '../../src/config/env.js';
import { createEmailTransport, createResendTransport, type FetchLike } from '../../src/lib/email.js';
import { formatEuro, renderNotification } from '../../src/modules/notifications/templates.js';

const message = { to: 'sara@example.test', subject: 'Oggetto', text: 'Testo', idempotencyKey: 'notification-1' };

function respond(status: number, body: unknown): { fetchImpl: FetchLike; calls: { url: string; init: RequestInit }[] } {
  const calls: { url: string; init: RequestInit }[] = [];
  const fetchImpl: FetchLike = async (url, init) => {
    calls.push({ url, init });
    return new Response(typeof body === 'string' ? body : JSON.stringify(body), { status });
  };
  return { fetchImpl, calls };
}

describe('Resend email transport', () => {
  it('posts the message with the API key and an idempotency key', async () => {
    const { fetchImpl, calls } = respond(200, { id: 'email_1' });
    const result = await createResendTransport({ apiKey: 'key', from: 'ASD <no@x.test>' }, fetchImpl).send(message);
    expect(result).toEqual({ ok: true, providerId: 'email_1' });
    expect(calls[0]?.url).toBe('https://api.resend.com/emails');
    expect(calls[0]?.init.headers).toMatchObject({ authorization: 'Bearer key', 'idempotency-key': 'notification-1' });
    const body = calls[0]?.init.body;
    expect(typeof body).toBe('string');
    expect(JSON.parse(typeof body === 'string' ? body : '')).toEqual({
      from: 'ASD <no@x.test>',
      to: ['sara@example.test'],
      subject: 'Oggetto',
      text: 'Testo',
    });
  });

  it('treats server errors, rate limits and network failures as retryable, other rejections as final', async () => {
    const transport = (fetchImpl: FetchLike) => createResendTransport({ apiKey: 'k', from: 'f' }, fetchImpl);
    expect(await transport(respond(503, { message: 'down' }).fetchImpl).send(message)).toEqual({
      ok: false,
      error: 'Resend answered 503: down',
      retryable: true,
    });
    expect(await transport(respond(429, {}).fetchImpl).send(message)).toMatchObject({ ok: false, retryable: true });
    expect(await transport(respond(422, { message: 'invalid to' }).fetchImpl).send(message)).toMatchObject({
      ok: false,
      retryable: false,
      error: 'Resend answered 422: invalid to',
    });
    expect(await transport(respond(500, 'not json').fetchImpl).send(message)).toMatchObject({ ok: false, retryable: true });
    const offline = await transport(async () => Promise.reject(new Error('ECONNRESET'))).send(message);
    expect(offline).toEqual({ ok: false, error: 'ECONNRESET', retryable: true });
  });

  it('tolerates a success answer without the expected shape', async () => {
    expect(await createResendTransport({ apiKey: 'k', from: 'f' }, respond(200, 'ok').fetchImpl).send(message)).toEqual({
      ok: true,
      providerId: null,
    });
  });
});

describe('email configuration', () => {
  const base = { DATABASE_URL: 'file:./x.db', JWT_SECRET: 'u'.repeat(40) };

  it('creates no transport without RESEND_API_KEY', () => {
    expect(createEmailTransport(loadConfig(base))).toBeNull();
  });

  it('creates the Resend transport when the key and sender are set', () => {
    const transport = createEmailTransport(loadConfig({ ...base, RESEND_API_KEY: 're_1', EMAIL_FROM: 'ASD <no@x.test>' }));
    expect(transport?.provider).toBe('resend');
  });

  it('refuses a key without a sender address', () => {
    expect(() => loadConfig({ ...base, RESEND_API_KEY: 're_1' })).toThrow(/EMAIL_FROM/);
  });
});

describe('notification templates (Italian)', () => {
  const saturday = new Date('2026-11-14T19:30:00.000Z'); // 20:30 in Rome (CET)

  it('formats euro amounts the Italian way', () => {
    expect(formatEuro(6000)).toBe('€ 60');
    expect(formatEuro(6050)).toBe('€ 60,50');
  });

  it('renders the convocation', () => {
    expect(renderNotification({ type: 'CONVOCATION', eventTitle: 'Aquile vs Delfini', startsAt: saturday })).toEqual({
      title: 'Convocazione',
      body: 'Aquile vs Delfini · Sabato 20:30 · conferma presenza',
    });
  });

  it('renders the fee reminder before and after the due date', () => {
    const today = new Date('2026-11-10T08:00:00.000Z');
    const due = new Date('2026-11-15T00:00:00.000Z');
    expect(renderNotification({ type: 'FEE_DUE', description: 'Quota novembre', amountCents: 6000, dueDate: due, today })).toEqual({
      title: 'Quota in scadenza',
      body: 'Quota novembre · € 60 · scade il 15 novembre (tra 5 giorni)',
    });
    expect(
      renderNotification({ type: 'FEE_DUE', description: 'Quota novembre', amountCents: 6000, dueDate: due, today: due }).body,
    ).toContain('(oggi)');
    expect(
      renderNotification({
        type: 'FEE_DUE',
        description: 'Quota novembre',
        amountCents: 6000,
        dueDate: due,
        today: new Date('2026-11-16T08:00:00.000Z'),
      }),
    ).toEqual({ title: 'Quota scaduta', body: 'Quota novembre · € 60 · scaduta il 15 novembre (da 1 giorno)' });
  });

  it('renders the certificate reminders for the three situations', () => {
    const render = (daysLeft: number) =>
      renderNotification({ type: 'CERTIFICATE_EXPIRING', memberName: 'Sara Conti', documentName: 'Certificato medico', daysLeft });
    expect(render(15)).toEqual({ title: 'Documento in scadenza', body: 'Sara Conti · Certificato medico — scade tra 15 giorni' });
    expect(render(0).body).toContain('scade oggi');
    expect(render(-3)).toEqual({
      title: 'Documento scaduto',
      body: 'Sara Conti · Certificato medico — scaduto da 3 giorni, serve il rinnovo',
    });
  });

  it('renders event changes, report cards and announcements', () => {
    const thursday = new Date('2026-11-12T18:00:00.000Z'); // 19:00 in Rome
    expect(renderNotification({ type: 'EVENT_CHANGED', change: 'MOVED', eventTitle: 'Allenamento', startsAt: thursday })).toEqual({
      title: 'Evento spostato',
      body: 'Allenamento — Giovedì 12 novembre alle 19:00',
    });
    expect(renderNotification({ type: 'EVENT_CHANGED', change: 'CANCELLED', eventTitle: 'Allenamento', startsAt: thursday }).title).toBe(
      'Evento annullato',
    );
    expect(renderNotification({ type: 'EVALUATION_PUBLISHED', matchLabel: 'Aquile 3-1 Delfini', rating: 8.5 })).toEqual({
      title: 'Pagella pubblicata',
      body: 'Aquile 3-1 Delfini · voto 8,5',
    });
    const long = renderNotification({ type: 'ANNOUNCEMENT', title: 'Avviso', body: 'x'.repeat(300) });
    expect(long.title).toBe('Avviso');
    expect(long.body).toHaveLength(140);
  });
});
