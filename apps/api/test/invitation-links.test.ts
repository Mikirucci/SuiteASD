import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Role } from '../src/shared/enums.js';
import { API, createTestContext, type TestContext } from './helpers/app.js';
import { TEST_PASSWORD, createActor, createSociety, type Actor } from './helpers/factories.js';

// The platform cannot send emails yet: an invitation is a link for a role that the inviter passes on, and the person
// gives their own email when joining. Joining puts the person in Staff and tells the administration.
describe('invitation links, Staff card and alert to the administration', () => {
  let ctx: TestContext;
  let societyId: string;
  let owner: Actor;
  let desk: Actor;
  let counter = 0;

  beforeAll(async () => {
    ctx = await createTestContext();
    societyId = (await createSociety(ctx, 'Link ASD')).id;
    owner = await createActor(ctx, societyId, 'ADMIN');
    desk = await createActor(ctx, societyId, 'SEGRETERIA');
  });

  afterAll(async () => {
    await ctx.close();
  });

  const invite = (actor: Actor, payload: object) =>
    ctx.app.inject({ method: 'POST', url: `${API}/invitations`, headers: actor.headers, payload });
  const accept = (payload: object) => ctx.app.inject({ method: 'POST', url: `${API}/invitations/accept`, payload });
  const info = (token: string) => ctx.app.inject({ method: 'GET', url: `${API}/invitations/${token}` });
  const staffList = async () =>
    (await ctx.app.inject({ method: 'GET', url: `${API}/staff?limit=100`, headers: owner.headers })).json<{
      data: { id: string; firstName: string; lastName: string; email: string | null; role: string; userId: string | null }[];
    }>().data;

  /** An invitation link for a role, accepted by a brand new person: returns what they typed and the session. */
  async function join(role: Role, firstName: string, lastName: string, inviter: Actor = owner) {
    counter += 1;
    const email = `${firstName}.${lastName}.${counter}@example.test`.toLowerCase();
    const { token } = (await invite(inviter, { role })).json();
    const response = await accept({ token, password: TEST_PASSWORD, firstName, lastName, email });
    return { email, response, token };
  }

  describe('the link names nobody', () => {
    it('is created without an email, with a note of who it is for', async () => {
      const response = await invite(desk, { role: 'ALLENATORE', label: '  Marco, nuovo allenatore U14 ' });
      expect(response.statusCode).toBe(201);
      expect(response.json()).toMatchObject({ email: null, label: 'Marco, nuovo allenatore U14', role: 'ALLENATORE' });
      const list = await ctx.app.inject({ method: 'GET', url: `${API}/invitations`, headers: owner.headers });
      expect(list.json().data[0]).toMatchObject({ email: null, label: 'Marco, nuovo allenatore U14' });
    });

    it('still accepts an email typed by the inviter, as before', async () => {
      const response = await invite(owner, { role: 'STAFF', email: 'Typed@Example.test' });
      expect(response.json()).toMatchObject({ email: 'typed@example.test', label: null });
    });

    it('refuses a note that is empty or too long', async () => {
      expect((await invite(owner, { role: 'STAFF', label: '   ' })).statusCode).toBe(422);
      expect((await invite(owner, { role: 'STAFF', label: 'x'.repeat(81) })).statusCode).toBe(422);
    });

    it('tells the person who opens it the society and the role, with no masked email', async () => {
      const { token } = (await invite(owner, { role: 'SEGRETERIA' })).json();
      expect((await info(token)).json()).toEqual({ society: { name: 'Link ASD' }, role: 'SEGRETERIA', maskedEmail: null });
    });

    it('asks for the email when joining, and creates the account with it', async () => {
      const { token } = (await invite(owner, { role: 'ALLENATORE' })).json();
      const withoutEmail = await accept({ token, password: TEST_PASSWORD, firstName: 'Luca', lastName: 'Verdi' });
      expect(withoutEmail.statusCode).toBe(422);
      expect(withoutEmail.json()).toMatchObject({ code: 'email_required' });
      // The link was not consumed by the refusal
      const joined = await accept({ token, password: TEST_PASSWORD, firstName: 'Luca', lastName: 'Verdi', email: 'Luca.Verdi@Example.test' });
      expect(joined.statusCode).toBe(200);
      expect(joined.json().roles).toEqual(['ALLENATORE']);
      const user = await ctx.prisma.user.findUniqueOrThrow({ where: { email: 'luca.verdi@example.test' } });
      expect(user).toMatchObject({ firstName: 'Luca', lastName: 'Verdi' });
    });

    it('ignores an email given at joining when the inviter had typed one', async () => {
      const { token } = (await invite(owner, { role: 'STAFF', email: 'fixed@example.test' })).json();
      const joined = await accept({ token, password: TEST_PASSWORD, firstName: 'Fixed', lastName: 'Person', email: 'other@example.test' });
      expect(joined.statusCode).toBe(200);
      expect(await ctx.prisma.user.findUnique({ where: { email: 'fixed@example.test' } })).not.toBeNull();
      expect(await ctx.prisma.user.findUnique({ where: { email: 'other@example.test' } })).toBeNull();
    });

    it('lets a person who already has an account join with that email and password', async () => {
      const { email } = await join('ALLENATORE', 'Elena', 'Gialli');
      const { token } = (await invite(owner, { role: 'STAFF' })).json();
      const wrong = await accept({ token, password: 'not-the-password-1', email });
      expect(wrong.statusCode).toBe(401);
      const right = await accept({ token, password: TEST_PASSWORD, email });
      expect(right.statusCode).toBe(200);
      expect(right.json().roles.sort()).toEqual(['ALLENATORE', 'STAFF']);
    });
  });

  describe('the person appears in Staff', () => {
    it.each([
      ['ALLENATORE', 'COACH'],
      ['STAFF', 'OTHER'],
      ['SEGRETERIA', 'MANAGER'],
      ['ADMIN', 'MANAGER'],
    ] as const)('puts an invited %s in Staff as %s, linked to the account', async (role, staffRole) => {
      const first = `Nome${role}`;
      const { email, response } = await join(role, first, 'Cognome');
      expect(response.statusCode).toBe(200);
      const card = (await staffList()).find((item) => item.email === email);
      expect(card).toMatchObject({ firstName: first, lastName: 'Cognome', role: staffRole });
      const user = await ctx.prisma.user.findUniqueOrThrow({ where: { email } });
      expect(card?.userId).toBe(user.id);
    });

    it('does not put an athlete or a guardian in Staff', async () => {
      const before = (await staffList()).length;
      for (const role of ['ATLETA', 'GENITORE'] as const) expect((await join(role, `Nome${role}`, 'Famiglia')).response.statusCode).toBe(200);
      expect(await staffList()).toHaveLength(before);
    });

    it('does not duplicate the card when the same person joins with a second role', async () => {
      const { email } = await join('ALLENATORE', 'Doppio', 'Ruolo');
      const { token } = (await invite(owner, { role: 'STAFF' })).json();
      expect((await accept({ token, password: TEST_PASSWORD, email })).statusCode).toBe(200);
      const cards = (await staffList()).filter((item) => item.email === email);
      expect(cards).toHaveLength(1);
      // The first role keeps its place
      expect(cards[0]?.role).toBe('COACH');
    });

    it('links a card typed in advance with the same email instead of making a second one', async () => {
      const typed = await ctx.prisma.staffMember.create({
        data: { societyId, firstName: 'Anticipo', lastName: 'Scritto', email: 'anticipo@example.test', role: 'COACH', qualifications: 'Allenatore 2° grado' },
      });
      const { token } = (await invite(owner, { role: 'ALLENATORE' })).json();
      const joined = await accept({ token, password: TEST_PASSWORD, firstName: 'Anticipo', lastName: 'Scritto', email: 'anticipo@example.test' });
      expect(joined.statusCode).toBe(200);
      const cards = (await staffList()).filter((item) => item.email === 'anticipo@example.test');
      expect(cards).toHaveLength(1);
      expect(cards[0]).toMatchObject({ id: typed.id });
      expect(cards[0]?.userId).not.toBeNull();
      expect(await ctx.prisma.staffMember.findUniqueOrThrow({ where: { id: typed.id } })).toMatchObject({ qualifications: 'Allenatore 2° grado' });
    });

    it('keeps each society to its own Staff', async () => {
      const other = await createSociety(ctx, 'Altra Link ASD');
      const otherOwner = await createActor(ctx, other.id, 'ADMIN');
      const { token } = (await invite(otherOwner, { role: 'ALLENATORE' })).json();
      await accept({ token, password: TEST_PASSWORD, firstName: 'Altrove', lastName: 'Allenatore', email: 'altrove@example.test' });
      expect((await staffList()).some((item) => item.email === 'altrove@example.test')).toBe(false);
      expect(await ctx.prisma.staffMember.count({ where: { societyId: other.id, email: 'altrove@example.test' } })).toBe(1);
    });
  });

  describe('the administration is told', () => {
    it('notifies admin and segreteria, not the coach and not the new person', async () => {
      const society = await createSociety(ctx, 'Avvisi Link ASD');
      const boss = await createActor(ctx, society.id, 'ADMIN');
      const secretary = await createActor(ctx, society.id, 'SEGRETERIA');
      const coach = await createActor(ctx, society.id, 'ALLENATORE');
      const { token } = (await invite(boss, { role: 'ALLENATORE' })).json();
      const joined = await accept({ token, password: TEST_PASSWORD, firstName: 'Marco', lastName: 'Rossi', email: 'marco.avviso@example.test' });
      expect(joined.statusCode).toBe(200);

      const rows = await ctx.prisma.notification.findMany({
        where: { societyId: society.id, type: 'ADMIN_INVITATION_ACCEPTED', channel: 'IN_APP' },
      });
      expect(rows.map((row) => row.userId).sort()).toEqual([boss.user.id, secretary.user.id].sort());
      expect(rows[0]).toMatchObject({ title: 'Nuovo collaboratore', body: "Marco Rossi ha accettato l'invito come allenatore" });
      expect(await ctx.prisma.notification.count({ where: { userId: coach.user.id } })).toBe(0);
      const newUser = await ctx.prisma.user.findUniqueOrThrow({ where: { email: 'marco.avviso@example.test' } });
      expect(await ctx.prisma.notification.count({ where: { userId: newUser.id } })).toBe(0);

      // It is visible in the notification centre of the administration
      const list = await ctx.app.inject({ method: 'GET', url: `${API}/notifications?type=ADMIN_INVITATION_ACCEPTED`, headers: boss.headers });
      expect(list.json().data).toHaveLength(1);
    });

    it('does not tell the invited administrator about their own joining', async () => {
      const society = await createSociety(ctx, 'Avvisi Admin ASD');
      const boss = await createActor(ctx, society.id, 'ADMIN');
      const { token } = (await invite(boss, { role: 'ADMIN' })).json();
      await accept({ token, password: TEST_PASSWORD, firstName: 'Nuova', lastName: 'Admin', email: 'nuova.admin@example.test' });
      const newcomer = await ctx.prisma.user.findUniqueOrThrow({ where: { email: 'nuova.admin@example.test' } });
      const rows = await ctx.prisma.notification.findMany({ where: { societyId: society.id, type: 'ADMIN_INVITATION_ACCEPTED', channel: 'IN_APP' } });
      expect(rows.map((row) => row.userId)).toEqual([boss.user.id]);
      expect(rows.some((row) => row.userId === newcomer.id)).toBe(false);
    });

    it('stays silent while the automation that governs the alerts is off', async () => {
      const society = await createSociety(ctx, 'Silenzio Link ASD');
      const boss = await createActor(ctx, society.id, 'ADMIN');
      // No row means enabled: switching it off writes one
      await ctx.prisma.automation.create({ data: { societyId: society.id, key: 'admin-alerts', enabled: false } });
      const { token } = (await invite(boss, { role: 'STAFF' })).json();
      const joined = await accept({ token, password: TEST_PASSWORD, firstName: 'Silenzioso', lastName: 'Staff', email: 'silenzioso@example.test' });
      expect(joined.statusCode).toBe(200);
      expect(await ctx.prisma.notification.count({ where: { societyId: society.id, type: 'ADMIN_INVITATION_ACCEPTED' } })).toBe(0);
      // The joining itself went through
      expect(await ctx.prisma.staffMember.count({ where: { societyId: society.id, email: 'silenzioso@example.test' } })).toBe(1);
    });
  });
});
