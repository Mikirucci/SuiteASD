import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ROLES, type Role } from '../src/shared/enums.js';
import { API, createTestContext, type TestContext } from './helpers/app.js';
import { createActor, createMember, createSociety, type Actor } from './helpers/factories.js';

describe('self-service: contact details and children', () => {
  let ctx: TestContext;
  let societyId: string;
  const actors = {} as Record<Role, Actor>;
  let athleteMemberId: string;
  let childId: string;
  let otherMemberId: string;

  beforeAll(async () => {
    ctx = await createTestContext();
    societyId = (await createSociety(ctx, 'Autogestione ASD')).id;
    for (const role of ROLES) actors[role] = await createActor(ctx, societyId, role);
    athleteMemberId = (await createMember(ctx, societyId, { firstName: 'Sara', lastName: 'Conti', userId: actors.ATLETA.user.id })).id;
    childId = (await createMember(ctx, societyId, { firstName: 'Anna', lastName: 'Conti' })).id;
    await ctx.prisma.guardianLink.create({ data: { societyId, guardianUserId: actors.GENITORE.user.id, memberId: childId } });
    otherMemberId = (await createMember(ctx, societyId, { firstName: 'Elisa', lastName: 'Altra' })).id;
  });

  afterAll(async () => {
    await ctx.close();
  });

  const send = (method: 'PATCH' | 'POST' | 'GET', actor: Actor | null, url: string, payload?: object) =>
    ctx.app.inject({ method, url: `${API}${url}`, headers: actor?.headers, payload });

  describe('PATCH /members/:id/contact', () => {
    it('lets an athlete update their own contact details, and clear one with null', async () => {
      const response = await send('PATCH', actors.ATLETA, `/members/${athleteMemberId}/contact`, {
        phone: '333 1234567',
        email: 'sara@example.test',
        address: 'Via Roma 1',
        city: 'Bologna',
        postalCode: '40100',
        kitSize: 'S',
      });
      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({ phone: '333 1234567', email: 'sara@example.test', city: 'Bologna', kitSize: 'S' });
      const cleared = await send('PATCH', actors.ATLETA, `/members/${athleteMemberId}/contact`, { phone: null });
      expect(cleared.json().phone).toBeNull();
      expect(cleared.json().city).toBe('Bologna');
    });

    it('lets a guardian update the details of their child', async () => {
      const response = await send('PATCH', actors.GENITORE, `/members/${childId}/contact`, { phone: '339 7654321', kitSize: 'XS' });
      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({ phone: '339 7654321', kitSize: 'XS' });
    });

    it('never touches somebody else\'s member, and shows it as missing', async () => {
      expect((await send('PATCH', actors.ATLETA, `/members/${otherMemberId}/contact`, { phone: '111 111111' })).statusCode).toBe(404);
      expect((await send('PATCH', actors.GENITORE, `/members/${athleteMemberId}/contact`, { phone: '111 111111' })).statusCode).toBe(404);
      expect((await send('PATCH', actors.ATLETA, `/members/${childId}/contact`, { phone: '111 111111' })).statusCode).toBe(404);
      expect((await ctx.prisma.member.findUniqueOrThrow({ where: { id: otherMemberId } })).phone).toBeNull();
    });

    it('is for athletes and guardians only: the others use the regular update', async () => {
      for (const role of ['ADMIN', 'SEGRETERIA', 'ALLENATORE', 'STAFF'] as const) {
        expect((await send('PATCH', actors[role], `/members/${athleteMemberId}/contact`, { phone: '222 222222' })).statusCode, role).toBe(403);
      }
      expect((await send('PATCH', null, `/members/${athleteMemberId}/contact`, { phone: '222 222222' })).statusCode).toBe(401);
    });

    it('cannot change identity, teams or status through it', async () => {
      const identity = await send('PATCH', actors.ATLETA, `/members/${athleteMemberId}/contact`, { firstName: 'Mallory', status: 'INACTIVE', teamIds: [] });
      expect(identity.statusCode).toBe(422);
      const member = await ctx.prisma.member.findUniqueOrThrow({ where: { id: athleteMemberId } });
      expect(member).toMatchObject({ firstName: 'Sara', status: 'ACTIVE' });
      // Mixed: the allowed field goes through, the others are ignored.
      const mixed = await send('PATCH', actors.ATLETA, `/members/${athleteMemberId}/contact`, { phone: '333 0000000', firstName: 'Mallory' });
      expect(mixed.statusCode).toBe(200);
      expect(mixed.json()).toMatchObject({ phone: '333 0000000', firstName: 'Sara' });
    });

    it('validates the fields', async () => {
      expect((await send('PATCH', actors.ATLETA, `/members/${athleteMemberId}/contact`, {})).statusCode).toBe(422);
      expect((await send('PATCH', actors.ATLETA, `/members/${athleteMemberId}/contact`, { email: 'non-una-email' })).statusCode).toBe(422);
    });
  });

  describe('POST /me/children', () => {
    const child = (overrides: Record<string, unknown> = {}) => ({
      firstName: 'Marta',
      lastName: 'Conti',
      birthDate: '2015-04-12',
      gender: 'FEMALE',
      relation: 'MADRE',
      ...overrides,
    });

    it('lets a guardian register a child: member with no team, linked to the guardian', async () => {
      const response = await send('POST', actors.GENITORE, '/me/children', child());
      expect(response.statusCode).toBe(201);
      const body = response.json();
      expect(body).toMatchObject({ firstName: 'Marta', lastName: 'Conti', birthDate: '2015-04-12', gender: 'FEMALE', status: 'ACTIVE', teams: [] });
      expect(body.guardians).toMatchObject([{ userId: actors.GENITORE.user.id, relation: 'MADRE' }]);
      expect(body.documentStatus).toBe('OK'); // no document types in this society
      const me = (await send('GET', actors.GENITORE, '/me')).json();
      expect(me.children.map((entry: { firstName: string }) => entry.firstName).sort()).toEqual(['Anna', 'Marta']);
    });

    it('tells the administration, not the guardian', async () => {
      const society = await createSociety(ctx, 'Figli ASD');
      const owner = await createActor(ctx, society.id, 'ADMIN');
      const parent = await createActor(ctx, society.id, 'GENITORE');
      expect((await send('POST', parent, '/me/children', child({ firstName: 'Luca' }))).statusCode).toBe(201);
      const rows = await ctx.prisma.notification.findMany({ where: { societyId: society.id, type: 'ADMIN_NEW_ENROLMENT', channel: 'IN_APP' } });
      expect(rows.map((row) => row.userId)).toEqual([owner.user.id]);
      expect(rows[0]).toMatchObject({ title: 'Nuova iscrizione', body: 'Luca Conti' });
      expect(await ctx.prisma.notification.count({ where: { userId: parent.user.id } })).toBe(0);
    });

    it('is for guardians only', async () => {
      for (const role of ['ADMIN', 'SEGRETERIA', 'ALLENATORE', 'STAFF', 'ATLETA'] as const) {
        expect((await send('POST', actors[role], '/me/children', child())).statusCode, role).toBe(403);
      }
      expect((await send('POST', null, '/me/children', child())).statusCode).toBe(401);
    });

    it('validates the child and refuses a fiscal code already registered', async () => {
      expect((await send('POST', actors.GENITORE, '/me/children', child({ birthDate: undefined }))).statusCode).toBe(422);
      expect((await send('POST', actors.GENITORE, '/me/children', child({ firstName: '' }))).statusCode).toBe(422);
      expect((await send('POST', actors.GENITORE, '/me/children', child({ relation: 'ZIO' }))).statusCode).toBe(422);
      await createMember(ctx, societyId, { fiscalCode: 'CNTMRT15D52A944X' });
      const duplicate = await send('POST', actors.GENITORE, '/me/children', child({ fiscalCode: 'cntmrt15d52a944x' }));
      expect(duplicate.statusCode).toBe(409);
      expect(duplicate.json().code).toBe('fiscal_code_taken');
    });
  });
});
