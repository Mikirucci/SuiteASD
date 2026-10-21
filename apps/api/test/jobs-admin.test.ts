import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { adminDigest, digestBucket } from '../src/jobs/definitions/admin-digest.js';
import { missingDocuments, reminderBucket } from '../src/jobs/definitions/missing-documents.js';
import { sponsorExpiry } from '../src/jobs/definitions/sponsor-expiry.js';
import type { AutomationDefinition } from '../src/jobs/registry.js';
import { runAutomation } from '../src/jobs/runner.js';
import { createDefaultDocumentTypes } from '../src/lib/society-defaults.js';
import { createTestContext, type TestContext } from './helpers/app.js';
import { createActor, createMember, createSociety } from './helpers/factories.js';

const at = (date: string, time = '08:00:00') => new Date(`${date}T${time}.000Z`);
const day = (date: string) => at(date, '00:00:00');

describe('buckets (unit)', () => {
  it('puts the days of a reminder interval in one bucket', () => {
    expect(reminderBucket(at('2026-11-02'), 7)).toBe(reminderBucket(at('2026-11-02', '23:59:00'), 7));
    expect(reminderBucket(at('2026-11-02'), 1)).not.toBe(reminderBucket(at('2026-11-03'), 1));
    expect(reminderBucket(at('2026-11-14'), 7)).not.toBe(reminderBucket(at('2026-11-30'), 7));
  });

  it('starts the weekly digest on Monday', () => {
    // 2026-11-09 is a Monday
    const monday = digestBucket(at('2026-11-09'), 7);
    for (const date of ['2026-11-10', '2026-11-13', '2026-11-15']) expect(digestBucket(at(date), 7)).toBe(monday);
    expect(digestBucket(at('2026-11-16'), 7)).toBe(monday + 1);
    expect(digestBucket(at('2026-11-08'), 7)).toBe(monday - 1);
  });

  it('counts plain days for the other intervals', () => {
    expect(digestBucket(at('2026-11-09'), 1)).toBe(digestBucket(at('2026-11-09', '20:00:00'), 1));
    expect(digestBucket(at('2026-11-10'), 1)).toBe(digestBucket(at('2026-11-09'), 1) + 1);
  });
});

describe('automation jobs for the administration and the missing documents', () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await createTestContext();
  });

  afterAll(async () => {
    await ctx.close();
  });

  // `runKey` makes a run of the same day count as another one (idempotency is then left to the dedupe keys).
  let runCounter = 0;
  const run = (definition: AutomationDefinition, societyId: string, now: Date) =>
    runAutomation({ prisma: ctx.prisma, definition, societyId, now, log: ctx.app.log, runKey: `test-${(runCounter += 1)}` });

  // Notifications a run wrote (the result of every job here carries the count).
  const written = async (definition: AutomationDefinition, societyId: string, now: Date): Promise<number> => {
    const outcome = await run(definition, societyId, now);
    if (outcome.status !== 'SUCCESS') throw new Error(`The run ended as ${outcome.status}`);
    const count = outcome.result.notifications;
    if (typeof count !== 'number') throw new Error('The run reported no notification count');
    return count;
  };

  async function societyWithTypes(name: string) {
    const society = await createSociety(ctx, name);
    await createDefaultDocumentTypes(ctx.prisma, society.id);
    return society;
  }
  const typeOf = (societyId: string, key: string) => ctx.prisma.documentType.findFirstOrThrow({ where: { societyId, key } });
  const inApp = (societyId: string, type: string) =>
    ctx.prisma.notification.findMany({ where: { societyId, type, channel: 'IN_APP' }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] });

  describe('missing-documents', () => {
    async function athleteJoined(societyId: string, daysAgo: number, overrides: { status?: string } = {}) {
      const athlete = await createActor(ctx, societyId, 'ATLETA');
      const parent = await createActor(ctx, societyId, 'GENITORE');
      const member = await createMember(ctx, societyId, {
        firstName: 'Sara',
        lastName: 'Conti',
        userId: athlete.user.id,
        createdAt: new Date(Date.now() - daysAgo * 86_400_000),
        ...overrides,
      });
      await ctx.prisma.guardianLink.create({ data: { societyId, guardianUserId: parent.user.id, memberId: member.id } });
      return { athlete, parent, member };
    }

    it('lists the required documents never provided to the athlete and the guardian, and nobody else', async () => {
      const society = await societyWithTypes('Mancanti ASD');
      const { athlete, parent } = await athleteJoined(society.id, 10);
      const owner = await createActor(ctx, society.id, 'ADMIN');
      const coach = await createActor(ctx, society.id, 'ALLENATORE');

      const outcome = await run(missingDocuments, society.id, new Date());
      expect(outcome).toMatchObject({ status: 'SUCCESS', result: { membersChecked: 1, membersReminded: 1, notifications: 4 } });
      const rows = await inApp(society.id, 'DOCUMENT_MISSING');
      expect(rows.map((row) => row.userId).sort()).toEqual([athlete.user.id, parent.user.id].sort());
      expect(rows[0]).toMatchObject({
        title: 'Documenti da caricare',
        body: 'Per Sara Conti mancano: Certificato medico, Modulo iscrizione, Privacy e liberatoria',
      });
      expect(await ctx.prisma.notification.count({ where: { userId: { in: [owner.user.id, coach.user.id] } } })).toBe(0);
    });

    it('waits for the grace period after the enrolment', async () => {
      const society = await societyWithTypes('Appena Iscritti ASD');
      await athleteJoined(society.id, 1);
      expect(await run(missingDocuments, society.id, new Date())).toMatchObject({ status: 'SUCCESS', result: { membersChecked: 0, notifications: 0 } });
      // Three days after the enrolment the reminder starts.
      expect(await run(missingDocuments, society.id, new Date(Date.now() + 3 * 86_400_000))).toMatchObject({ result: { membersChecked: 1, membersReminded: 1 } });
    });

    it('repeats every seven days while documents are missing, and only lists what is still missing', async () => {
      const society = await societyWithTypes('Ripetizione ASD');
      const { member } = await athleteJoined(society.id, 10);
      const start = at('2026-11-02');
      const sent = (now: Date) => written(missingDocuments, society.id, now);
      const weekStart = new Date(Math.floor(start.getTime() / 86_400_000 / 7) * 7 * 86_400_000 + 86_400_000);

      expect(await sent(weekStart)).toBe(4);
      // The same week: nothing new.
      expect(await sent(new Date(weekStart.getTime() + 2 * 86_400_000))).toBe(0);

      // The athlete uploads the privacy form: the next week's reminder lists the other two only.
      const privacy = await typeOf(society.id, 'PRIVACY_CONSENT');
      await ctx.prisma.document.create({ data: { societyId: society.id, fileKey: 'test/file.pdf', memberId: member.id, documentTypeId: privacy.id } });
      expect(await sent(new Date(weekStart.getTime() + 7 * 86_400_000))).toBe(4);
      const rows = await inApp(society.id, 'DOCUMENT_MISSING');
      expect(rows.at(-1)?.body).toBe('Per Sara Conti mancano: Certificato medico, Modulo iscrizione');
    });

    it('stops once everything is on file, and leaves expired documents to the certificate reminders', async () => {
      const society = await societyWithTypes('Completi ASD');
      const { member } = await athleteJoined(society.id, 10);
      for (const key of ['MEMBERSHIP_FORM', 'PRIVACY_CONSENT']) {
        await ctx.prisma.document.create({ data: { societyId: society.id, fileKey: 'test/file.pdf', memberId: member.id, documentTypeId: (await typeOf(society.id, key)).id } });
      }
      // Certificate on file but expired: not "missing".
      await ctx.prisma.document.create({
        data: { societyId: society.id, fileKey: 'test/file.pdf', memberId: member.id, documentTypeId: (await typeOf(society.id, 'MEDICAL_CERTIFICATE')).id, expiresAt: day('2020-01-01') },
      });
      expect(await run(missingDocuments, society.id, new Date())).toMatchObject({ result: { membersChecked: 1, membersReminded: 0, notifications: 0 } });
    });

    it('skips members who are no longer active, and respects the opt-out of the athlete', async () => {
      const society = await societyWithTypes('Inattivi ASD');
      await athleteJoined(society.id, 10, { status: 'INACTIVE' });
      expect(await run(missingDocuments, society.id, new Date())).toMatchObject({ result: { membersChecked: 0 } });

      const { athlete } = await athleteJoined(society.id, 10);
      await ctx.prisma.notificationPreference.create({
        data: { societyId: society.id, userId: athlete.user.id, type: 'DOCUMENT_MISSING', channel: 'EMAIL', enabled: false },
      });
      await run(missingDocuments, society.id, new Date());
      const own = await ctx.prisma.notification.findMany({ where: { userId: athlete.user.id } });
      expect(own.map((row) => row.channel)).toEqual(['IN_APP']);
    });

    it('is configurable: channels, grace and interval', async () => {
      const society = await societyWithTypes('Config ASD');
      await athleteJoined(society.id, 1);
      await ctx.prisma.automation.create({
        data: { societyId: society.id, key: 'missing-documents', enabled: true, config: { graceDays: 0, everyDays: 1, channels: ['IN_APP'] } },
      });
      const first = await run(missingDocuments, society.id, new Date());
      expect(first).toMatchObject({ result: { membersReminded: 1, notifications: 2 } });
      expect(await ctx.prisma.notification.count({ where: { societyId: society.id, channel: 'EMAIL' } })).toBe(0);
      const next = await run(missingDocuments, society.id, new Date(Date.now() + 86_400_000));
      expect(next).toMatchObject({ result: { membersReminded: 1 } });
    });
  });

  describe('admin-digest', () => {
    async function administration(societyId: string) {
      return {
        owner: await createActor(ctx, societyId, 'ADMIN'),
        desk: await createActor(ctx, societyId, 'SEGRETERIA'),
        coach: await createActor(ctx, societyId, 'ALLENATORE'),
        player: await createActor(ctx, societyId, 'ATLETA'),
      };
    }

    it('sums up the overdue fees and the documents to fix, for admin and segreteria only', async () => {
      const society = await societyWithTypes('Riepilogo ASD');
      const { owner, desk, coach, player } = await administration(society.id);
      const sara = await createMember(ctx, society.id, { firstName: 'Sara', lastName: 'Conti' });
      const anna = await createMember(ctx, society.id, { firstName: 'Anna', lastName: 'Ferri' });
      for (const [member, description, due] of [[sara, 'Quota ottobre', '2026-10-01'], [anna, 'Quota ottobre', '2026-10-01']] as const) {
        await ctx.prisma.payment.create({ data: { societyId: society.id, memberId: member.id, description, amountCents: 6000, dueDate: day(due) } });
      }
      // Not due yet, and already paid: neither counts.
      await ctx.prisma.payment.create({ data: { societyId: society.id, memberId: sara.id, description: 'Futura', amountCents: 6000, dueDate: day('2099-01-01') } });
      await ctx.prisma.payment.create({ data: { societyId: society.id, memberId: sara.id, description: 'Pagata', amountCents: 6000, dueDate: day('2026-09-01'), status: 'PAID', paidAt: day('2026-09-02') } });
      // Sara has everything but an expiring certificate; Anna has nothing.
      for (const key of ['MEMBERSHIP_FORM', 'PRIVACY_CONSENT']) {
        await ctx.prisma.document.create({ data: { societyId: society.id, fileKey: 'test/file.pdf', memberId: sara.id, documentTypeId: (await typeOf(society.id, key)).id } });
      }
      await ctx.prisma.document.create({
        data: { societyId: society.id, fileKey: 'test/file.pdf', memberId: sara.id, documentTypeId: (await typeOf(society.id, 'MEDICAL_CERTIFICATE')).id, expiresAt: day('2026-11-20') },
      });

      const outcome = await run(adminDigest, society.id, at('2026-11-10'));
      expect(outcome).toMatchObject({
        status: 'SUCCESS',
        result: { overdueFees: 2, membersToFix: 1, documentsToFix: 3, expiringSoon: 1, notifications: 8 },
      });
      const fees = await inApp(society.id, 'ADMIN_FEE_OVERDUE');
      expect(fees.map((row) => row.userId).sort()).toEqual([owner.user.id, desk.user.id].sort());
      expect(fees[0]).toMatchObject({ title: 'Quote scadute da incassare', body: '2 quote scadute per € 120 complessivi' });
      const documents = await inApp(society.id, 'ADMIN_DOCUMENT_ALERT');
      expect(documents[0]).toMatchObject({ title: 'Documenti da sistemare', body: '1 tesserato con 3 documenti mancanti o scaduti · 1 documento in scadenza' });
      expect(await ctx.prisma.notification.count({ where: { userId: { in: [coach.user.id, player.user.id] } } })).toBe(0);
    });

    it('sends nothing when everything is in order', async () => {
      const society = await societyWithTypes('Tutto Ok ASD');
      await administration(society.id);
      const outcome = await run(adminDigest, society.id, at('2026-11-10'));
      expect(outcome).toMatchObject({ result: { overdueFees: 0, membersToFix: 0, expiringSoon: 0, notifications: 0 } });
    });

    it('reaches the administration once a week, on Monday, then again the week after', async () => {
      const society = await societyWithTypes('Settimanale ASD');
      await administration(society.id);
      const member = await createMember(ctx, society.id);
      await ctx.prisma.payment.create({ data: { societyId: society.id, memberId: member.id, description: 'Quota', amountCents: 5000, dueDate: day('2026-10-01') } });
      const sent = (now: Date) => written(adminDigest, society.id, now);

      const monday = at('2026-11-09');
      expect(await sent(monday)).toBeGreaterThan(0);
      expect(await sent(at('2026-11-10'))).toBe(0);
      expect(await sent(at('2026-11-15'))).toBe(0);
      expect(await sent(at('2026-11-16'))).toBeGreaterThan(0);
    });

    it('can be set to a daily summary', async () => {
      const society = await societyWithTypes('Giornaliero ASD');
      await administration(society.id);
      const member = await createMember(ctx, society.id);
      await ctx.prisma.payment.create({ data: { societyId: society.id, memberId: member.id, description: 'Quota', amountCents: 5000, dueDate: day('2026-10-01') } });
      await ctx.prisma.automation.create({ data: { societyId: society.id, key: 'admin-digest', enabled: true, config: { everyDays: 1 } } });
      const sent = (now: Date) => written(adminDigest, society.id, now);
      expect(await sent(at('2026-11-10'))).toBeGreaterThan(0);
      expect(await sent(at('2026-11-11'))).toBeGreaterThan(0);
    });
  });

  describe('sponsor-expiry', () => {
    async function sponsorEnding(societyId: string, name: string, end: string | null, status = 'ACTIVE') {
      return ctx.prisma.sponsor.create({
        data: { societyId, name, amountCents: 100000, status, contractStart: day('2025-09-01'), contractEnd: end ? day(end) : null },
      });
    }

    it('warns the administration at 30 and at 7 days, once each', async () => {
      const society = await createSociety(ctx, 'Sponsor ASD');
      const owner = await createActor(ctx, society.id, 'ADMIN');
      const coach = await createActor(ctx, society.id, 'ALLENATORE');
      await sponsorEnding(society.id, 'Ottica Rossi', '2026-11-30');

      // 20 days left -> the 30 days threshold
      expect(await run(sponsorExpiry, society.id, at('2026-11-10'))).toMatchObject({ result: { sponsorsChecked: 1, sponsorsNotified: 1, notifications: 2 } });
      const rows = await inApp(society.id, 'ADMIN_SPONSOR_EXPIRING');
      expect(rows[0]).toMatchObject({ userId: owner.user.id, title: 'Contratto sponsor in scadenza', body: 'Ottica Rossi — scade tra 20 giorni' });
      // Still in the same threshold: nothing new.
      expect(await run(sponsorExpiry, society.id, at('2026-11-15'))).toMatchObject({ result: { sponsorsNotified: 0, notifications: 0 } });
      // 5 days left -> the 7 days threshold
      expect(await run(sponsorExpiry, society.id, at('2026-11-25'))).toMatchObject({ result: { sponsorsNotified: 1 } });
      expect((await inApp(society.id, 'ADMIN_SPONSOR_EXPIRING')).at(-1)?.body).toBe('Ottica Rossi — scade tra 5 giorni');
      expect(await ctx.prisma.notification.count({ where: { userId: coach.user.id } })).toBe(0);
    });

    it('ignores contracts that are far away, already over, open-ended or not active', async () => {
      const society = await createSociety(ctx, 'Sponsor Altri ASD');
      await createActor(ctx, society.id, 'ADMIN');
      await sponsorEnding(society.id, 'Lontano', '2027-06-30');
      await sponsorEnding(society.id, 'Finito', '2026-10-01');
      await sponsorEnding(society.id, 'Aperto', null);
      await sponsorEnding(society.id, 'Potenziale', '2026-11-20', 'PROSPECT');
      await sponsorEnding(society.id, 'Scaduto', '2026-11-20', 'EXPIRED');
      expect(await run(sponsorExpiry, society.id, at('2026-11-10'))).toMatchObject({ result: { sponsorsChecked: 0, notifications: 0 } });
    });

    it('starts a new cycle when the contract is renewed', async () => {
      const society = await createSociety(ctx, 'Rinnovo Sponsor ASD');
      await createActor(ctx, society.id, 'ADMIN');
      const sponsor = await sponsorEnding(society.id, 'Ottica Rossi', '2026-11-30');
      await run(sponsorExpiry, society.id, at('2026-11-10'));
      await ctx.prisma.sponsor.update({ where: { id: sponsor.id }, data: { contractEnd: day('2026-12-15') } });
      expect(await run(sponsorExpiry, society.id, at('2026-11-20'))).toMatchObject({ result: { sponsorsNotified: 1 } });
    });

    it('uses the thresholds of the society', async () => {
      const society = await createSociety(ctx, 'Soglie ASD');
      await createActor(ctx, society.id, 'ADMIN');
      await sponsorEnding(society.id, 'Ottica Rossi', '2026-11-30');
      await ctx.prisma.automation.create({ data: { societyId: society.id, key: 'sponsor-expiry', enabled: true, config: { thresholdsDays: [3] } } });
      expect(await run(sponsorExpiry, society.id, at('2026-11-10'))).toMatchObject({ result: { sponsorsChecked: 0 } });
      expect(await run(sponsorExpiry, society.id, at('2026-11-28'))).toMatchObject({ result: { sponsorsNotified: 1 } });
    });
  });
});
