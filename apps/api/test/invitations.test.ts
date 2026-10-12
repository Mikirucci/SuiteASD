import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { hashToken } from '../src/lib/tokens.js';
import { API, createTestContext, type TestContext } from './helpers/app.js';
import { TEST_PASSWORD, createActor, createMember, createSociety, type Actor } from './helpers/factories.js';

describe('invitations, users and guardian links', () => {
  let ctx: TestContext;
  let societyId: string;
  let admin: Actor;
  let secretary: Actor;
  let athlete: Actor;
  let outsider: Actor;

  beforeAll(async () => {
    ctx = await createTestContext();
    societyId = (await createSociety(ctx, 'Aquile Volley')).id;
    admin = await createActor(ctx, societyId, 'ADMIN');
    secretary = await createActor(ctx, societyId, 'SEGRETERIA');
    athlete = await createActor(ctx, societyId, 'ATLETA');
    outsider = await createActor(ctx, (await createSociety(ctx, 'Altra ASD')).id, 'ADMIN');
  });

  afterAll(async () => {
    await ctx.close();
  });

  const invite = (actor: Actor, payload: object) =>
    ctx.app.inject({ method: 'POST', url: `${API}/invitations`, headers: actor.headers, payload });
  const accept = (payload: object) => ctx.app.inject({ method: 'POST', url: `${API}/invitations/accept`, payload });

  describe('creating invitations', () => {
    it('lets an admin invite any role and returns the one-time token', async () => {
      const response = await invite(admin, { email: 'New.Coach@Example.test', role: 'ALLENATORE' });
      expect(response.statusCode).toBe(201);
      const body = response.json();
      expect(body).toMatchObject({ email: 'new.coach@example.test', role: 'ALLENATORE', memberId: null });
      expect(body.token.length).toBeGreaterThan(30);
      const stored = await ctx.prisma.invitation.findUniqueOrThrow({ where: { id: body.id } });
      expect(stored.tokenHash).toBe(hashToken(body.token));
      expect(stored.tokenHash).not.toBe(body.token);
    });

    it('prevents privilege escalation: segreteria cannot invite admins or other segreteria', async () => {
      expect((await invite(secretary, { email: 'a@example.test', role: 'ADMIN' })).statusCode).toBe(403);
      expect((await invite(secretary, { email: 'b@example.test', role: 'SEGRETERIA' })).statusCode).toBe(403);
      expect((await invite(secretary, { email: 'c@example.test', role: 'STAFF' })).statusCode).toBe(201);
    });

    it('forbids roles without invitations:write', async () => {
      expect((await invite(athlete, { email: 'd@example.test', role: 'ATLETA' })).statusCode).toBe(403);
    });

    it('rejects a memberId for roles that cannot be linked and unknown or foreign members', async () => {
      const member = await createMember(ctx, societyId);
      expect((await invite(admin, { email: 'e@example.test', role: 'ALLENATORE', memberId: member.id })).statusCode).toBe(422);
      expect((await invite(admin, { email: 'f@example.test', role: 'ATLETA', memberId: 'missing' })).statusCode).toBe(404);
      expect((await invite(outsider, { email: 'g@example.test', role: 'ATLETA', memberId: member.id })).statusCode).toBe(404);
    });
  });

  describe('accepting invitations', () => {
    it('creates the account, links the athlete to the member and logs the user in', async () => {
      const member = await createMember(ctx, societyId, { firstName: 'Giulia', lastName: 'Rossi' });
      const { token } = (await invite(admin, { email: 'giulia@example.test', role: 'ATLETA', memberId: member.id })).json();

      const response = await accept({ token, password: TEST_PASSWORD, firstName: 'Giulia', lastName: 'Rossi' });
      expect(response.statusCode).toBe(200);
      const session = response.json();
      expect(session).toMatchObject({ roles: ['ATLETA'], society: { id: societyId } });

      const linked = await ctx.prisma.member.findUniqueOrThrow({ where: { id: member.id } });
      expect(linked.userId).toBe(session.user.id);
      const profile = await ctx.app.inject({
        method: 'GET',
        url: `${API}/me`,
        headers: { authorization: `Bearer ${session.accessToken}` },
      });
      expect(profile.json().member).toMatchObject({ id: member.id, firstName: 'Giulia' });
    });

    it('links a guardian to the athlete', async () => {
      const child = await createMember(ctx, societyId, { firstName: 'Sara', lastName: 'Conti' });
      const { token } = (await invite(admin, { email: 'parent@example.test', role: 'GENITORE', memberId: child.id })).json();
      const session = (await accept({ token, password: TEST_PASSWORD, firstName: 'Roberta', lastName: 'Conti' })).json();
      const profile = await ctx.app.inject({
        method: 'GET',
        url: `${API}/me`,
        headers: { authorization: `Bearer ${session.accessToken}` },
      });
      expect(profile.json().children).toEqual([
        { memberId: child.id, firstName: 'Sara', lastName: 'Conti', relation: 'ALTRO' },
      ]);
    });

    it('can be used only once', async () => {
      const { token } = (await invite(admin, { email: 'once@example.test', role: 'STAFF' })).json();
      const body = { token, password: TEST_PASSWORD, firstName: 'Once', lastName: 'Only' };
      expect((await accept(body)).statusCode).toBe(200);
      const second = await accept(body);
      expect(second.statusCode).toBe(422);
      expect(second.json()).toMatchObject({ code: 'invalid_invitation' });
    });

    it('rejects unknown, expired and revoked invitations', async () => {
      expect((await accept({ token: 'nope', password: TEST_PASSWORD, firstName: 'A', lastName: 'B' })).statusCode).toBe(422);

      const expired = (await invite(admin, { email: 'late@example.test', role: 'STAFF' })).json();
      await ctx.prisma.invitation.update({ where: { id: expired.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
      expect((await accept({ token: expired.token, password: TEST_PASSWORD, firstName: 'A', lastName: 'B' })).statusCode).toBe(422);

      const revoked = (await invite(admin, { email: 'revoked@example.test', role: 'STAFF' })).json();
      const revoke = await ctx.app.inject({ method: 'DELETE', url: `${API}/invitations/${revoked.id}`, headers: admin.headers });
      expect(revoke.statusCode).toBe(204);
      expect((await accept({ token: revoked.token, password: TEST_PASSWORD, firstName: 'A', lastName: 'B' })).statusCode).toBe(422);
    });

    it('requires a name for new accounts', async () => {
      const { token } = (await invite(admin, { email: 'noname@example.test', role: 'STAFF' })).json();
      const response = await accept({ token, password: TEST_PASSWORD });
      expect(response.statusCode).toBe(422);
      expect(response.json()).toMatchObject({ code: 'profile_required' });
    });

    it('adds the society to an existing account only with the right password', async () => {
      const existing = await createActor(ctx, (await createSociety(ctx, 'Prima ASD')).id, 'ALLENATORE');
      const { token } = (await invite(admin, { email: existing.user.email, role: 'ALLENATORE' })).json();
      expect((await accept({ token, password: 'wrong-password' })).statusCode).toBe(401);
      const ok = await accept({ token, password: TEST_PASSWORD });
      expect(ok.statusCode).toBe(200);
      expect(ok.json()).toMatchObject({ society: { id: societyId }, user: { id: existing.user.id } });
      expect(await ctx.prisma.membership.count({ where: { userId: existing.user.id } })).toBe(2);
    });

    it('refuses to link a member that already belongs to another account', async () => {
      const taken = await createActor(ctx, societyId, 'ATLETA');
      const member = await createMember(ctx, societyId, { userId: taken.user.id, fiscalCode: 'TKNMBR00A01H501Z' });
      const { token } = (await invite(admin, { email: 'thief@example.test', role: 'ATLETA', memberId: member.id })).json();
      const response = await accept({ token, password: TEST_PASSWORD, firstName: 'T', lastName: 'T' });
      expect(response.statusCode).toBe(409);
      expect(await ctx.prisma.user.findUnique({ where: { email: 'thief@example.test' } })).toBeNull();
      expect((await ctx.prisma.invitation.findUniqueOrThrow({ where: { tokenHash: hashToken(token) } })).acceptedAt).toBeNull();
    });
  });

  describe('listing and revoking', () => {
    it('lists only pending invitations of the own society', async () => {
      const society = await createSociety(ctx, 'List ASD');
      const owner = await createActor(ctx, society.id, 'ADMIN');
      const pending = (await invite(owner, { email: 'p1@example.test', role: 'STAFF' })).json();
      const used = (await invite(owner, { email: 'p2@example.test', role: 'STAFF' })).json();
      await accept({ token: used.token, password: TEST_PASSWORD, firstName: 'U', lastName: 'U' });
      await invite(outsider, { email: 'p3@example.test', role: 'STAFF' });

      const response = await ctx.app.inject({ method: 'GET', url: `${API}/invitations`, headers: owner.headers });
      expect(response.statusCode).toBe(200);
      expect(response.json().data.map((item: { id: string }) => item.id)).toEqual([pending.id]);
      expect(response.json().data[0]).not.toHaveProperty('token');
    });

    it('cannot revoke an invitation of another society', async () => {
      const foreign = (await invite(outsider, { email: 'x1@example.test', role: 'STAFF' })).json();
      const response = await ctx.app.inject({ method: 'DELETE', url: `${API}/invitations/${foreign.id}`, headers: admin.headers });
      expect(response.statusCode).toBe(404);
    });
  });

  describe('users listing', () => {
    it('lists the accounts of the society with their roles and hides other societies', async () => {
      const society = await createSociety(ctx, 'Users ASD');
      const owner = await createActor(ctx, society.id, 'ADMIN');
      const coach = await createActor(ctx, society.id, 'ALLENATORE', 'STAFF');
      const response = await ctx.app.inject({ method: 'GET', url: `${API}/users`, headers: owner.headers });
      expect(response.statusCode).toBe(200);
      const users: { id: string; roles: string[] }[] = response.json().data;
      expect(users.map((user) => user.id).sort()).toEqual([owner.user.id, coach.user.id].sort());
      expect(users.find((user) => user.id === coach.user.id)?.roles.sort()).toEqual(['ALLENATORE', 'STAFF']);
      expect(JSON.stringify(users)).not.toContain('passwordHash');
    });

    it('filters by role and search text', async () => {
      const society = await createSociety(ctx, 'Search ASD');
      const owner = await createActor(ctx, society.id, 'ADMIN');
      await createActor(ctx, society.id, 'ALLENATORE');
      const byRole = await ctx.app.inject({ method: 'GET', url: `${API}/users?role=ALLENATORE`, headers: owner.headers });
      expect(byRole.json().data).toHaveLength(1);
      const byText = await ctx.app.inject({ method: 'GET', url: `${API}/users?q=nobody-here`, headers: owner.headers });
      expect(byText.json().data).toHaveLength(0);
    });

    it('is forbidden to roles without users:read', async () => {
      const response = await ctx.app.inject({ method: 'GET', url: `${API}/users`, headers: athlete.headers });
      expect(response.statusCode).toBe(403);
    });
  });

  describe('guardian links', () => {
    it('links a GENITORE account to an athlete, lists and removes the link', async () => {
      const parent = await createActor(ctx, societyId, 'GENITORE');
      const child = await createMember(ctx, societyId, { firstName: 'Marta', lastName: 'Bianchi' });
      const created = await ctx.app.inject({
        method: 'POST',
        url: `${API}/guardian-links`,
        headers: secretary.headers,
        payload: { guardianUserId: parent.user.id, memberId: child.id, relation: 'MADRE' },
      });
      expect(created.statusCode).toBe(201);
      expect(created.json()).toMatchObject({ guardianUserId: parent.user.id, memberId: child.id, relation: 'MADRE' });

      const profile = await ctx.app.inject({ method: 'GET', url: `${API}/me`, headers: parent.headers });
      expect(profile.json().children).toEqual([
        { memberId: child.id, firstName: 'Marta', lastName: 'Bianchi', relation: 'MADRE' },
      ]);

      const list = await ctx.app.inject({ method: 'GET', url: `${API}/guardian-links?memberId=${child.id}`, headers: admin.headers });
      expect(list.json().data).toHaveLength(1);

      const duplicate = await ctx.app.inject({
        method: 'POST',
        url: `${API}/guardian-links`,
        headers: admin.headers,
        payload: { guardianUserId: parent.user.id, memberId: child.id },
      });
      expect(duplicate.statusCode).toBe(409);

      const removed = await ctx.app.inject({
        method: 'DELETE',
        url: `${API}/guardian-links/${created.json().id}`,
        headers: admin.headers,
      });
      expect(removed.statusCode).toBe(204);
      expect((await ctx.app.inject({ method: 'GET', url: `${API}/me`, headers: parent.headers })).json().children).toEqual([]);
    });

    it('requires the guardian to have the GENITORE role and the athlete to exist in the society', async () => {
      const member = await createMember(ctx, societyId);
      const notParent = await ctx.app.inject({
        method: 'POST',
        url: `${API}/guardian-links`,
        headers: admin.headers,
        payload: { guardianUserId: athlete.user.id, memberId: member.id },
      });
      expect(notParent.statusCode).toBe(422);
      expect(notParent.json()).toMatchObject({ code: 'not_a_guardian' });

      const parent = await createActor(ctx, societyId, 'GENITORE');
      const foreignMember = await createMember(ctx, outsider.societyId, { fiscalCode: 'FRGNMB00A01H501Q' });
      const crossTenant = await ctx.app.inject({
        method: 'POST',
        url: `${API}/guardian-links`,
        headers: admin.headers,
        payload: { guardianUserId: parent.user.id, memberId: foreignMember.id },
      });
      expect(crossTenant.statusCode).toBe(404);
    });

    it('cannot see or delete links of another society and is forbidden to athletes', async () => {
      const society = await createSociety(ctx, 'Links ASD');
      const parent = await createActor(ctx, society.id, 'GENITORE');
      const child = await createMember(ctx, society.id);
      const link = await ctx.prisma.guardianLink.create({
        data: { societyId: society.id, guardianUserId: parent.user.id, memberId: child.id },
      });
      const list = await ctx.app.inject({ method: 'GET', url: `${API}/guardian-links`, headers: admin.headers });
      expect(list.json().data.map((item: { id: string }) => item.id)).not.toContain(link.id);
      const remove = await ctx.app.inject({ method: 'DELETE', url: `${API}/guardian-links/${link.id}`, headers: admin.headers });
      expect(remove.statusCode).toBe(404);
      const forbidden = await ctx.app.inject({ method: 'GET', url: `${API}/guardian-links`, headers: athlete.headers });
      expect(forbidden.statusCode).toBe(403);
    });
  });
});
