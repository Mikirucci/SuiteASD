import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { scopeToTenant } from '../src/lib/tenant.js';
import { dispatchQueuedEmails, retryDelayMs } from '../src/modules/notifications/dispatch.js';
import { resolveRecipients } from '../src/modules/notifications/recipients.js';
import { createNotification } from '../src/modules/notifications/service.js';
import type { EmailMessage, EmailResult, EmailTransport } from '../src/lib/email.js';
import { API, createTestContext, type TestContext } from './helpers/app.js';
import { createActor, createMember, createSociety, createTeam, type Actor } from './helpers/factories.js';

describe('notifications (SPEC 07)', () => {
  let ctx: TestContext;
  let societyId: string;
  let athlete: Actor;
  let guardian: Actor;
  let coach: Actor;
  let otherSocietyAdmin: Actor;

  beforeAll(async () => {
    ctx = await createTestContext();
    societyId = (await createSociety(ctx, 'Notifiche ASD')).id;
    athlete = await createActor(ctx, societyId, 'ATLETA');
    guardian = await createActor(ctx, societyId, 'GENITORE');
    coach = await createActor(ctx, societyId, 'ALLENATORE');
    otherSocietyAdmin = await createActor(ctx, (await createSociety(ctx, 'Altra ASD')).id, 'ADMIN');
  });

  afterAll(async () => {
    await ctx.close();
  });

  const db = () => scopeToTenant(ctx.prisma, societyId);
  const notify = (userIds: string[], overrides: Partial<Parameters<typeof createNotification>[1]> = {}) =>
    createNotification(db(), { societyId, userIds, type: 'ANNOUNCEMENT', title: 'Titolo', body: 'Testo', ...overrides });
  const get = (actor: Actor | null, path: string) => ctx.app.inject({ method: 'GET', url: `${API}${path}`, headers: actor?.headers });
  const send = (method: 'POST' | 'PUT', actor: Actor | null, path: string, payload?: object) =>
    ctx.app.inject({ method, url: `${API}${path}`, headers: actor?.headers, payload });

  describe('createNotification', () => {
    it('writes a delivered in-app row and a queued email row per recipient, once per user', async () => {
      const user = await createActor(ctx, societyId, 'ATLETA');
      expect(await notify([user.user.id, user.user.id])).toBe(2);
      const rows = await ctx.prisma.notification.findMany({ where: { userId: user.user.id }, orderBy: { channel: 'asc' } });
      expect(rows.map((row) => [row.channel, row.status])).toEqual([
        ['EMAIL', 'PENDING'],
        ['IN_APP', 'SENT'],
      ]);
      expect(rows.find((row) => row.channel === 'IN_APP')?.sentAt).not.toBeNull();
    });

    it('does nothing without recipients', async () => {
      expect(await notify([])).toBe(0);
    });

    it('is idempotent per dedupe key and recipient, and still reaches new recipients', async () => {
      const first = await createActor(ctx, societyId, 'ATLETA');
      const second = await createActor(ctx, societyId, 'ATLETA');
      expect(await notify([first.user.id], { dedupeKey: 'unit:1' })).toBe(2);
      expect(await notify([first.user.id], { dedupeKey: 'unit:1' })).toBe(0);
      expect(await notify([first.user.id, second.user.id], { dedupeKey: 'unit:1' })).toBe(2);
      expect(await ctx.prisma.notification.count({ where: { dedupeKey: 'unit:1' } })).toBe(4);
      expect(await notify([first.user.id], { dedupeKey: 'unit:2' })).toBe(2);
    });

    it('respects the preferences of the user, per type and channel', async () => {
      const user = await createActor(ctx, societyId, 'ATLETA');
      await ctx.prisma.notificationPreference.create({
        data: { societyId, userId: user.user.id, type: 'FEE_DUE', channel: 'EMAIL', enabled: false },
      });
      expect(await notify([user.user.id], { type: 'FEE_DUE' })).toBe(1);
      expect(await notify([user.user.id], { type: 'CONVOCATION' })).toBe(2);
      const feeRows = await ctx.prisma.notification.findMany({ where: { userId: user.user.id, type: 'FEE_DUE' } });
      expect(feeRows.map((row) => row.channel)).toEqual(['IN_APP']);
    });

    it('queues no email while the "notifications-dispatch" automation is off, but keeps the in-app center working', async () => {
      const off = await createSociety(ctx, 'Spenta ASD');
      const user = await createActor(ctx, off.id, 'ATLETA');
      await ctx.prisma.automation.create({ data: { societyId: off.id, key: 'notifications-dispatch', enabled: false } });
      const written = await createNotification(scopeToTenant(ctx.prisma, off.id), {
        societyId: off.id,
        userIds: [user.user.id],
        type: 'ANNOUNCEMENT',
        title: 'T',
        body: 'B',
      });
      expect(written).toBe(1);
      expect((await ctx.prisma.notification.findFirstOrThrow({ where: { userId: user.user.id } })).channel).toBe('IN_APP');
    });
  });

  describe('recipients by role', () => {
    it('resolves athlete + guardians for members, and adds the staff for a team', async () => {
      const society = await createSociety(ctx, 'Destinatari ASD');
      const scoped = scopeToTenant(ctx.prisma, society.id);
      const playerAccount = await createActor(ctx, society.id, 'ATLETA');
      const parent = await createActor(ctx, society.id, 'GENITORE');
      const trainer = await createActor(ctx, society.id, 'ALLENATORE');
      const team = await createTeam(ctx, society.id);
      const member = await createMember(ctx, society.id, { userId: playerAccount.user.id });
      const withoutAccount = await createMember(ctx, society.id, { firstName: 'Marta', lastName: 'Bianchi' });
      const inactive = await createMember(ctx, society.id, { firstName: 'Ex', lastName: 'Atleta', status: 'INACTIVE' });
      await ctx.prisma.guardianLink.create({ data: { societyId: society.id, guardianUserId: parent.user.id, memberId: member.id } });
      for (const m of [member, withoutAccount, inactive]) {
        await ctx.prisma.teamMembership.create({ data: { societyId: society.id, teamId: team.id, memberId: m.id } });
      }
      const staffMember = await ctx.prisma.staffMember.create({
        data: { societyId: society.id, firstName: 'Marco', lastName: 'Villa', userId: trainer.user.id },
      });
      await ctx.prisma.teamStaff.create({ data: { societyId: society.id, teamId: team.id, staffMemberId: staffMember.id } });

      const sorted = async (promise: Promise<string[]>) => (await promise).sort();
      const athleteAndParent = [playerAccount.user.id, parent.user.id].sort();
      expect(await sorted(resolveRecipients(scoped, { kind: 'MEMBERS', memberIds: [member.id, withoutAccount.id] }))).toEqual(athleteAndParent);
      expect(await resolveRecipients(scoped, { kind: 'MEMBERS', memberIds: [] })).toEqual([]);
      expect(await sorted(resolveRecipients(scoped, { kind: 'TEAM', teamId: team.id }))).toEqual(athleteAndParent);
      expect(await sorted(resolveRecipients(scoped, { kind: 'TEAM', teamId: team.id, includeStaff: true }))).toEqual(
        [...athleteAndParent, trainer.user.id].sort(),
      );
      expect(await resolveRecipients(scoped, { kind: 'ROLES', roles: ['GENITORE'] })).toEqual([parent.user.id]);
      expect(await resolveRecipients(scoped, { kind: 'ROLES' })).toHaveLength(3);
    });

    it('never reaches users of another society', async () => {
      const scoped = scopeToTenant(ctx.prisma, societyId);
      const everybody = await resolveRecipients(scoped, { kind: 'ROLES' });
      expect(everybody).not.toContain(otherSocietyAdmin.user.id);
      expect(everybody).toEqual(expect.arrayContaining([athlete.user.id, guardian.user.id, coach.user.id]));
    });
  });

  describe('notification center', () => {
    it('requires a token', async () => {
      for (const path of ['/notifications', '/notifications/unread-count', '/notifications/preferences']) {
        expect((await get(null, path)).statusCode, path).toBe(401);
      }
    });

    it('lists only the own in-app notifications, newest first, with unread filter and count', async () => {
      const user = await createActor(ctx, societyId, 'ATLETA');
      const other = await createActor(ctx, societyId, 'ATLETA');
      for (const n of [1, 2, 3]) await notify([user.user.id], { title: `Avviso ${n}`, type: n === 3 ? 'FEE_DUE' : 'ANNOUNCEMENT' });
      await notify([other.user.id], { title: 'Non mio' });

      const all = (await get(user, '/notifications')).json();
      expect(all.data).toHaveLength(3);
      expect(all.data.map((item: { title: string }) => item.title)).not.toContain('Non mio');
      expect(all.data[0]).toMatchObject({ readAt: null, data: null });
      expect((await get(user, '/notifications/unread-count')).json()).toEqual({ count: 3 });

      const first = all.data[0].id as string;
      const read = await send('POST', user, `/notifications/${first}/read`);
      expect(read.statusCode).toBe(200);
      expect(read.json().readAt).not.toBeNull();
      const readAt = read.json().readAt;
      expect((await send('POST', user, `/notifications/${first}/read`)).json().readAt).toBe(readAt);

      const unread = (await get(user, '/notifications?unread=true')).json();
      expect(unread.data).toHaveLength(2);
      expect((await get(user, '/notifications?unread=false')).json().data).toHaveLength(3);
      expect((await get(user, '/notifications?type=FEE_DUE')).json().data).toHaveLength(1);
      expect((await get(user, '/notifications/unread-count')).json()).toEqual({ count: 2 });
    });

    it('paginates with a cursor without gaps or duplicates', async () => {
      const user = await createActor(ctx, societyId, 'ATLETA');
      for (let n = 0; n < 5; n += 1) await notify([user.user.id], { title: `Pag ${n}` });
      const seen: string[] = [];
      let cursor: string | null = null;
      do {
        const query: string = cursor ? `limit=2&cursor=${cursor}` : 'limit=2';
        const body: { data: { id: string }[]; page: { nextCursor: string | null } } = (await get(user, `/notifications?${query}`)).json();
        seen.push(...body.data.map((item) => item.id));
        cursor = body.page.nextCursor;
      } while (cursor);
      expect(seen).toHaveLength(5);
      expect(new Set(seen).size).toBe(5);
      expect((await get(user, '/notifications?cursor=nope')).statusCode).toBe(400);
    });

    it('marks everything read and answers 404 for other people notifications and other societies', async () => {
      const user = await createActor(ctx, societyId, 'ATLETA');
      const other = await createActor(ctx, societyId, 'ATLETA');
      await notify([user.user.id, other.user.id]);
      const foreign = await ctx.prisma.notification.findFirstOrThrow({ where: { userId: other.user.id, channel: 'IN_APP' } });
      expect((await send('POST', user, `/notifications/${foreign.id}/read`)).statusCode).toBe(404);
      expect((await send('POST', otherSocietyAdmin, `/notifications/${foreign.id}/read`)).statusCode).toBe(404);
      expect((await ctx.prisma.notification.findUniqueOrThrow({ where: { id: foreign.id } })).readAt).toBeNull();

      expect((await send('POST', user, '/notifications/read-all')).json()).toEqual({ updated: 1 });
      expect((await send('POST', user, '/notifications/read-all')).json()).toEqual({ updated: 0 });
      expect((await get(user, '/notifications/unread-count')).json()).toEqual({ count: 0 });
      expect((await get(other, '/notifications/unread-count')).json()).toEqual({ count: 1 });
    });

    it('does not list the queued email rows in the center', async () => {
      const user = await createActor(ctx, societyId, 'ATLETA');
      await notify([user.user.id]);
      expect(await ctx.prisma.notification.count({ where: { userId: user.user.id } })).toBe(2);
      expect((await get(user, '/notifications')).json().data).toHaveLength(1);
    });
  });

  describe('preferences', () => {
    it('lists every type and channel enabled by default', async () => {
      const user = await createActor(ctx, societyId, 'GENITORE');
      const body = (await get(user, '/notifications/preferences')).json();
      expect(body.preferences).toHaveLength(12);
      expect(body.preferences.every((item: { enabled: boolean }) => item.enabled)).toBe(true);
    });

    it('switches a channel off for a type and back on, and then stops creating that channel', async () => {
      const user = await createActor(ctx, societyId, 'GENITORE');
      const off = await send('PUT', user, '/notifications/preferences', {
        preferences: [{ type: 'CONVOCATION', channel: 'EMAIL', enabled: false }],
      });
      expect(off.statusCode).toBe(200);
      const disabled = off.json().preferences.filter((item: { enabled: boolean }) => !item.enabled);
      expect(disabled).toEqual([{ type: 'CONVOCATION', channel: 'EMAIL', enabled: false }]);
      expect(await notify([user.user.id], { type: 'CONVOCATION' })).toBe(1);

      const on = await send('PUT', user, '/notifications/preferences', {
        preferences: [{ type: 'CONVOCATION', channel: 'EMAIL', enabled: true }],
      });
      expect(on.json().preferences.every((item: { enabled: boolean }) => item.enabled)).toBe(true);
      expect(await ctx.prisma.notificationPreference.count({ where: { userId: user.user.id } })).toBe(1);
    });

    it('keeps each user preferences private and validates the body', async () => {
      const user = await createActor(ctx, societyId, 'ATLETA');
      await send('PUT', user, '/notifications/preferences', { preferences: [{ type: 'FEE_DUE', channel: 'IN_APP', enabled: false }] });
      const stranger = await createActor(ctx, societyId, 'ATLETA');
      expect((await get(stranger, '/notifications/preferences')).json().preferences.every((item: { enabled: boolean }) => item.enabled)).toBe(true);

      for (const payload of [
        {},
        { preferences: [] },
        { preferences: [{ type: 'NOPE', channel: 'EMAIL', enabled: true }] },
        { preferences: [{ type: 'FEE_DUE', channel: 'PUSH', enabled: true }] },
        {
          preferences: [
            { type: 'FEE_DUE', channel: 'EMAIL', enabled: true },
            { type: 'FEE_DUE', channel: 'EMAIL', enabled: false },
          ],
        },
      ]) {
        expect((await send('PUT', user, '/notifications/preferences', payload)).statusCode, JSON.stringify(payload)).toBe(422);
      }
    });
  });

  describe('email queue (dispatch)', () => {
    const NOW = new Date('2026-11-14T10:00:00.000Z');

    const fakeTransport = (results: EmailResult[]) => {
      const sent: EmailMessage[] = [];
      let call = 0;
      const transport: EmailTransport = {
        provider: 'test-provider',
        async send(message) {
          sent.push(message);
          const result = results[Math.min(call, results.length - 1)] ?? { ok: true, providerId: null };
          call += 1;
          return result;
        },
      };
      return { transport, sent };
    };

    const queueEmail = async (society = societyId) => {
      const user = await createActor(ctx, society, 'ATLETA');
      await createNotification(scopeToTenant(ctx.prisma, society), {
        societyId: society,
        userIds: [user.user.id],
        type: 'FEE_DUE',
        title: 'Quota in scadenza',
        body: 'Quota novembre',
      });
      const row = await ctx.prisma.notification.findFirstOrThrow({ where: { userId: user.user.id, channel: 'EMAIL' } });
      return { user, row };
    };

    const run = (societyForRun: string, transport: EmailTransport | null, maxAttempts = 3, now = NOW) =>
      dispatchQueuedEmails(scopeToTenant(ctx.prisma, societyForRun), societyForRun, { transport, maxAttempts, batchSize: 100, now });

    it('sends the email, marks it SENT and logs the attempt', async () => {
      const society = (await createSociety(ctx, 'Invio ASD')).id;
      const { user, row } = await queueEmail(society);
      const { transport, sent } = fakeTransport([{ ok: true, providerId: 'abc' }]);
      expect(await run(society, transport)).toEqual({ sent: 1, skipped: 0, failed: 0, retryLater: 0 });
      expect(sent).toEqual([{ to: user.user.email, subject: 'Quota in scadenza', text: 'Quota novembre', idempotencyKey: row.id }]);
      expect(await ctx.prisma.notification.findUniqueOrThrow({ where: { id: row.id } })).toMatchObject({ status: 'SENT', attempts: 1 });
      expect(await ctx.prisma.notificationLog.findMany({ where: { notificationId: row.id } })).toMatchObject([
        { attempt: 1, status: 'SENT', provider: 'test-provider', error: null },
      ]);
      expect(await run(society, transport)).toEqual({ sent: 0, skipped: 0, failed: 0, retryLater: 0 });
    });

    it('records SKIPPED, without pretending to send, when no provider is configured', async () => {
      const society = (await createSociety(ctx, 'Senza provider ASD')).id;
      const { row } = await queueEmail(society);
      expect(await run(society, null)).toEqual({ sent: 0, skipped: 1, failed: 0, retryLater: 0 });
      expect(await ctx.prisma.notification.findUniqueOrThrow({ where: { id: row.id } })).toMatchObject({ status: 'SKIPPED', sentAt: null });
      expect(await ctx.prisma.notificationLog.findMany({ where: { notificationId: row.id } })).toMatchObject([
        { attempt: 1, status: 'SKIPPED', provider: null, error: 'Email provider not configured' },
      ]);
    });

    it('skips disabled accounts', async () => {
      const society = (await createSociety(ctx, 'Disattivo ASD')).id;
      const { user, row } = await queueEmail(society);
      await ctx.prisma.user.update({ where: { id: user.user.id }, data: { isActive: false } });
      const { transport, sent } = fakeTransport([{ ok: true, providerId: null }]);
      expect((await run(society, transport)).skipped).toBe(1);
      expect(sent).toHaveLength(0);
      expect((await ctx.prisma.notification.findUniqueOrThrow({ where: { id: row.id } })).status).toBe('SKIPPED');
    });

    it('retries with back-off and gives up after the maximum number of attempts', async () => {
      const society = (await createSociety(ctx, 'Retry ASD')).id;
      const { row } = await queueEmail(society);
      const failure: EmailResult = { ok: false, error: 'timeout', retryable: true };
      const { transport, sent } = fakeTransport([failure]);

      expect(await run(society, transport, 2)).toMatchObject({ retryLater: 1, failed: 0 });
      const afterFirst = await ctx.prisma.notification.findUniqueOrThrow({ where: { id: row.id } });
      expect(afterFirst).toMatchObject({ status: 'PENDING', attempts: 1 });
      expect(afterFirst.scheduledAt?.getTime()).toBe(NOW.getTime() + retryDelayMs(1));

      // Not due yet: nothing happens.
      expect(await run(society, transport, 2, new Date(NOW.getTime() + 60_000))).toEqual({ sent: 0, skipped: 0, failed: 0, retryLater: 0 });
      expect(sent).toHaveLength(1);

      expect(await run(society, transport, 2, new Date(NOW.getTime() + retryDelayMs(1)))).toMatchObject({ failed: 1, retryLater: 0 });
      expect(await ctx.prisma.notification.findUniqueOrThrow({ where: { id: row.id } })).toMatchObject({ status: 'FAILED', attempts: 2 });
      const logs = await ctx.prisma.notificationLog.findMany({ where: { notificationId: row.id }, orderBy: { attempt: 'asc' } });
      expect(logs.map((log) => [log.attempt, log.status, log.error])).toEqual([
        [1, 'FAILED', 'timeout'],
        [2, 'FAILED', 'timeout'],
      ]);
    });

    it('recovers when a retry succeeds, and does not retry a message the provider rejects for good', async () => {
      const society = (await createSociety(ctx, 'Recupero ASD')).id;
      const flaky = await queueEmail(society);
      const { transport } = fakeTransport([{ ok: false, error: 'boom', retryable: true }, { ok: true, providerId: 'x' }]);
      await run(society, transport);
      await run(society, transport, 3, new Date(NOW.getTime() + retryDelayMs(1)));
      expect(await ctx.prisma.notification.findUniqueOrThrow({ where: { id: flaky.row.id } })).toMatchObject({ status: 'SENT', attempts: 2 });

      const rejected = await queueEmail(society);
      const reject = fakeTransport([{ ok: false, error: 'invalid recipient', retryable: false }]);
      expect(await run(society, reject.transport)).toMatchObject({ failed: 1, retryLater: 0 });
      expect((await ctx.prisma.notification.findUniqueOrThrow({ where: { id: rejected.row.id } })).status).toBe('FAILED');
    });

    it('only handles the queue of its own society', async () => {
      const mine = (await createSociety(ctx, 'Coda mia ASD')).id;
      const theirs = (await createSociety(ctx, 'Coda altrui ASD')).id;
      await queueEmail(mine);
      const foreign = await queueEmail(theirs);
      const { transport } = fakeTransport([{ ok: true, providerId: null }]);
      expect((await run(mine, transport)).sent).toBe(1);
      expect((await ctx.prisma.notification.findUniqueOrThrow({ where: { id: foreign.row.id } })).status).toBe('PENDING');
    });
  });
});
