import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDefaultDocumentTypes } from '../src/lib/society-defaults.js';
import { API, createTestContext, type TestContext } from './helpers/app.js';
import { TEST_PASSWORD, createActor, createMember, createSociety, createTeam, type Actor } from './helpers/factories.js';

const DAY_MS = 86_400_000;

function birthDateYearsAgo(years: number, extraDays = 0): string {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear() - years, now.getUTCMonth(), now.getUTCDate()) - extraDays * DAY_MS)
    .toISOString()
    .slice(0, 10);
}

describe('enrolment links (join-links): the administration shares them, people enrol with no approval', () => {
  let ctx: TestContext;
  let societyId: string;
  let teamId: string;
  let admin: Actor;
  let secretary: Actor;
  let coach: Actor;
  let athlete: Actor;
  let outsider: Actor;
  let emailCounter = 0;

  beforeAll(async () => {
    ctx = await createTestContext();
    societyId = (await createSociety(ctx, 'Aquile Iscrizioni')).id;
    await createDefaultDocumentTypes(ctx.prisma, societyId);
    teamId = (await createTeam(ctx, societyId, 'Under 16')).id;
    admin = await createActor(ctx, societyId, 'ADMIN');
    secretary = await createActor(ctx, societyId, 'SEGRETERIA');
    coach = await createActor(ctx, societyId, 'ALLENATORE');
    athlete = await createActor(ctx, societyId, 'ATLETA');
    outsider = await createActor(ctx, (await createSociety(ctx, 'Altra ASD')).id, 'ADMIN');
  });

  afterAll(async () => {
    await ctx.close();
  });

  const createLink = (actor: Actor, payload: object = {}) =>
    ctx.app.inject({ method: 'POST', url: `${API}/join-links`, headers: actor.headers, payload });
  const linkOf = async (payload: object = {}) => (await createLink(admin, payload)).json<{ id: string; code: string; url: string }>();
  const info = (code: string) => ctx.app.inject({ method: 'GET', url: `${API}/join/${code}` });
  const enrol = (code: string, payload: object) => ctx.app.inject({ method: 'POST', url: `${API}/join/${code}`, payload });

  const newEmail = () => `iscritto${(emailCounter += 1)}@example.test`;
  const athleteBody = (overrides: Record<string, unknown> = {}) => ({
    kind: 'ATLETA',
    account: { email: newEmail(), password: 'Sup3rSegreta!', firstName: 'Sara', lastName: 'Conti' },
    athlete: { birthDate: birthDateYearsAgo(16), gender: 'FEMALE', fieldRole: 'Libero' },
    ...overrides,
  });

  describe('creating and managing links', () => {
    it('lets admin and segreteria create a link, with the shareable url and the team', async () => {
      for (const actor of [admin, secretary]) {
        const response = await createLink(actor, { teamId, label: 'Open day', maxUses: 30 });
        expect(response.statusCode).toBe(201);
        const body = response.json();
        expect(body).toMatchObject({
          label: 'Open day',
          team: { id: teamId, name: 'Under 16', category: 'U16' },
          maxUses: 30,
          uses: 0,
          status: 'ACTIVE',
          expiresAt: null,
        });
        expect(body.code).toMatch(/^[A-Za-z0-9_-]{16}$/);
        expect(body.url).toBe(`http://localhost:3000/iscrizione/${body.code}`);
      }
    });

    it('forbids everybody else', async () => {
      for (const actor of [coach, athlete]) {
        expect((await createLink(actor)).statusCode).toBe(403);
        expect((await ctx.app.inject({ method: 'GET', url: `${API}/join-links`, headers: actor.headers })).statusCode).toBe(403);
      }
      expect((await ctx.app.inject({ method: 'POST', url: `${API}/join-links`, payload: {} })).statusCode).toBe(401);
    });

    it('rejects a team of another society, an expiry in the past and silly limits', async () => {
      const foreignTeam = await createTeam(ctx, outsider.societyId, 'Foreign');
      expect((await createLink(admin, { teamId: foreignTeam.id })).statusCode).toBe(404);
      expect((await createLink(admin, { expiresAt: new Date(Date.now() - 1000).toISOString() })).statusCode).toBe(422);
      expect((await createLink(admin, { maxUses: 0 })).statusCode).toBe(422);
    });

    it('lists the links of the society only, newest first, with their status', async () => {
      const fresh = await createSociety(ctx, 'Elenco ASD');
      const owner = await createActor(ctx, fresh.id, 'ADMIN');
      const first = (await createLink(owner, { label: 'Prima' })).json();
      const second = (await createLink(owner, { label: 'Seconda', maxUses: 1 })).json();
      await ctx.prisma.joinLink.update({ where: { id: second.id }, data: { uses: 1 } });
      const expired = (await createLink(owner, { label: 'Scaduta' })).json();
      await ctx.prisma.joinLink.update({ where: { id: expired.id }, data: { expiresAt: new Date(Date.now() - 1000) } });

      const list = (await ctx.app.inject({ method: 'GET', url: `${API}/join-links`, headers: owner.headers })).json();
      expect(list.data.map((link: { label: string; status: string }) => [link.label, link.status]).sort()).toEqual([
        ['Prima', 'ACTIVE'],
        ['Scaduta', 'EXPIRED'],
        ['Seconda', 'EXHAUSTED'],
      ]);
      expect(list.data.map((link: { id: string }) => link.id)).toContain(first.id);
      const foreign = (await ctx.app.inject({ method: 'GET', url: `${API}/join-links`, headers: outsider.headers })).json();
      expect(foreign.data).toEqual([]);
    });

    it('revokes a link, and only the owner society can', async () => {
      const link = await linkOf();
      expect((await ctx.app.inject({ method: 'DELETE', url: `${API}/join-links/${link.id}`, headers: outsider.headers })).statusCode).toBe(404);
      expect((await ctx.app.inject({ method: 'DELETE', url: `${API}/join-links/${link.id}`, headers: secretary.headers })).statusCode).toBe(204);
      expect((await ctx.app.inject({ method: 'DELETE', url: `${API}/join-links/${link.id}`, headers: secretary.headers })).statusCode).toBe(404);
      const response = await info(link.code);
      expect(response.statusCode).toBe(410);
      expect(response.json().code).toBe('join_link_revoked');
    });
  });

  describe('opening a link (public)', () => {
    it('tells the society and the team, without any token', async () => {
      const link = await linkOf({ teamId });
      const response = await info(link.code);
      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ society: { name: 'Aquile Iscrizioni' }, team: { name: 'Under 16', category: 'U16' } });
      const open = await linkOf();
      expect((await info(open.code)).json().team).toBeNull();
    });

    it('answers 404 to an unknown code and 410 to a link that no longer works, saying why', async () => {
      expect((await info('codice-che-non-esiste')).statusCode).toBe(404);
      const expired = await linkOf();
      await ctx.prisma.joinLink.update({ where: { id: expired.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
      const response = await info(expired.code);
      expect(response.statusCode).toBe(410);
      expect(response.json().code).toBe('join_link_expired');
    });
  });

  describe('enrolling', () => {
    it('creates the account, the athlete and the team membership at once and signs the person in', async () => {
      const link = await linkOf({ teamId });
      const response = await enrol(link.code, athleteBody());
      expect(response.statusCode).toBe(201);
      const session = response.json();
      expect(session.roles).toEqual(['ATLETA']);
      expect(session.society).toMatchObject({ name: 'Aquile Iscrizioni' });

      const member = await ctx.prisma.member.findFirstOrThrow({
        where: { societyId, userId: session.user.id },
        include: { teamMemberships: true },
      });
      expect(member).toMatchObject({ firstName: 'Sara', lastName: 'Conti', gender: 'FEMALE', fieldRole: 'Libero', status: 'ACTIVE' });
      expect(member.teamMemberships.map((row) => row.teamId)).toEqual([teamId]);
      expect(member.joinedAt).not.toBeNull();
      expect((await ctx.prisma.joinLink.findUniqueOrThrow({ where: { id: link.id } })).uses).toBe(1);

      // The session works: the athlete sees their own record, with all required documents still missing.
      const headers = { authorization: `Bearer ${session.accessToken}` };
      const me = (await ctx.app.inject({ method: 'GET', url: `${API}/me`, headers })).json();
      expect(me.member).toMatchObject({ id: member.id });
      const own = (await ctx.app.inject({ method: 'GET', url: `${API}/members/${member.id}`, headers })).json();
      expect(own.documentStatus).toBe('MISSING');
      expect(own.documents.map((doc: { status: string }) => doc.status)).toEqual(['MISSING', 'MISSING', 'MISSING']);
    });

    it('lets the same account log in afterwards', async () => {
      const link = await linkOf();
      const body = athleteBody();
      expect((await enrol(link.code, body)).statusCode).toBe(201);
      const login = await ctx.app.inject({
        method: 'POST',
        url: `${API}/auth/login`,
        payload: { email: body.account.email, password: 'Sup3rSegreta!' },
      });
      expect(login.statusCode).toBe(200);
    });

    it('lets a parent enrol a child: the child is the member, the parent a guardian', async () => {
      const link = await linkOf({ teamId });
      const response = await enrol(link.code, {
        kind: 'GENITORE',
        relation: 'MADRE',
        account: { email: newEmail(), password: 'Sup3rSegreta!', firstName: 'Roberta', lastName: 'Conti' },
        athlete: { firstName: 'Anna', lastName: 'Conti', birthDate: birthDateYearsAgo(10) },
      });
      expect(response.statusCode).toBe(201);
      const session = response.json();
      expect(session.roles).toEqual(['GENITORE']);
      const child = await ctx.prisma.member.findFirstOrThrow({
        where: { societyId, firstName: 'Anna', lastName: 'Conti' },
        include: { guardianLinks: true, teamMemberships: true },
      });
      expect(child.userId).toBeNull();
      expect(child.guardianLinks).toMatchObject([{ guardianUserId: session.user.id, relation: 'MADRE' }]);
      expect(child.teamMemberships.map((row) => row.teamId)).toEqual([teamId]);

      const headers = { authorization: `Bearer ${session.accessToken}` };
      const me = (await ctx.app.inject({ method: 'GET', url: `${API}/me`, headers })).json();
      expect(me.member).toBeNull();
      expect(me.children).toMatchObject([{ memberId: child.id, firstName: 'Anna', relation: 'MADRE' }]);
    });

    it('requires the first and last name of the child when a guardian enrols', async () => {
      const link = await linkOf();
      const response = await enrol(link.code, {
        kind: 'GENITORE',
        account: { email: newEmail(), password: 'Sup3rSegreta!', firstName: 'Roberta', lastName: 'Conti' },
        athlete: { birthDate: birthDateYearsAgo(10) },
      });
      expect(response.statusCode).toBe(422);
    });

    it('refuses an athlete younger than 14 who signs up alone, and accepts the 14th birthday', async () => {
      const link = await linkOf();
      const tooYoung = await enrol(link.code, athleteBody({ athlete: { birthDate: birthDateYearsAgo(14, -1) } }));
      expect(tooYoung.statusCode).toBe(422);
      expect(tooYoung.json().code).toBe('guardian_required');
      expect((await enrol(link.code, athleteBody({ athlete: { birthDate: birthDateYearsAgo(14) } }))).statusCode).toBe(201);
      const future = await enrol(link.code, athleteBody({ athlete: { birthDate: birthDateYearsAgo(-1) } }));
      expect(future.statusCode).toBe(422);
    });

    it('enrols without a team when the link has none', async () => {
      const link = await linkOf();
      const session = (await enrol(link.code, athleteBody())).json();
      const member = await ctx.prisma.member.findFirstOrThrow({
        where: { societyId, userId: session.user.id },
        include: { teamMemberships: true },
      });
      expect(member.teamMemberships).toEqual([]);
    });

    it('lets somebody who already has an account enrol with their current password, and refuses a wrong one', async () => {
      const link = await linkOf({ teamId });
      const existing = await createActor(ctx, outsider.societyId, 'ADMIN');
      const body = (password: string) => athleteBody({ account: { email: existing.user.email, password, firstName: 'Mario', lastName: 'Rossi' } });
      expect((await enrol(link.code, body('sbagliata1'))).statusCode).toBe(401);
      expect(await ctx.prisma.member.count({ where: { societyId, userId: existing.user.id } })).toBe(0);

      const response = await enrol(link.code, body(TEST_PASSWORD));
      expect(response.statusCode).toBe(201);
      expect(response.json().society.name).toBe('Aquile Iscrizioni');
      expect(await ctx.prisma.member.count({ where: { societyId, userId: existing.user.id } })).toBe(1);
      expect(await ctx.prisma.user.count({ where: { email: existing.user.email } })).toBe(1);
    });

    it('does not enrol the same account twice in a society', async () => {
      const link = await linkOf();
      const body = athleteBody();
      expect((await enrol(link.code, body)).statusCode).toBe(201);
      const again = await enrol(link.code, body);
      expect(again.statusCode).toBe(409);
      expect(again.json().code).toBe('member_already_exists');
    });

    it('rejects a fiscal code that is already registered, undoing everything', async () => {
      const link = await linkOf();
      await createMember(ctx, societyId, { firstName: 'Gia', lastName: 'Presente', fiscalCode: 'PRSGIA00A41H501Z' });
      const body = athleteBody({ athlete: { birthDate: birthDateYearsAgo(16), fiscalCode: 'PRSGIA00A41H501Z' } });
      const response = await enrol(link.code, body);
      expect(response.statusCode).toBe(409);
      expect(response.json().code).toBe('fiscal_code_taken');
      expect(await ctx.prisma.user.count({ where: { email: body.account.email } })).toBe(0);
      expect((await ctx.prisma.joinLink.findUniqueOrThrow({ where: { id: link.id } })).uses).toBe(0);
    });

    it('stops at the maximum number of uses', async () => {
      const link = await linkOf({ maxUses: 2 });
      expect((await enrol(link.code, athleteBody())).statusCode).toBe(201);
      expect((await enrol(link.code, athleteBody())).statusCode).toBe(201);
      const third = await enrol(link.code, athleteBody());
      expect(third.statusCode).toBe(410);
      expect(third.json().code).toBe('join_link_exhausted');
      expect((await ctx.prisma.joinLink.findUniqueOrThrow({ where: { id: link.id } })).uses).toBe(2);
    });

    it('does not let two simultaneous enrolments pass a single remaining use', async () => {
      const link = await linkOf({ maxUses: 1 });
      const results = await Promise.all([enrol(link.code, athleteBody()), enrol(link.code, athleteBody())]);
      expect(results.map((response) => response.statusCode).sort()).toEqual([201, 410]);
    });

    it('refuses a revoked or expired link, and validates the body', async () => {
      const link = await linkOf();
      await ctx.app.inject({ method: 'DELETE', url: `${API}/join-links/${link.id}`, headers: admin.headers });
      expect((await enrol(link.code, athleteBody())).statusCode).toBe(410);
      const open = await linkOf();
      expect((await enrol(open.code, { kind: 'ATLETA' })).statusCode).toBe(422);
      expect((await enrol(open.code, athleteBody({ account: { email: 'non-una-email', password: 'Sup3rSegreta!', firstName: 'A', lastName: 'B' } }))).statusCode).toBe(422);
      expect((await enrol(open.code, athleteBody({ account: { email: newEmail(), password: 'corta', firstName: 'A', lastName: 'B' } }))).statusCode).toBe(422);
    });
  });

  describe('the administration is told, as it happens', () => {
    it('notifies admin and segreteria (not the coach, not the athlete) of a new enrolment', async () => {
      const society = await createSociety(ctx, 'Avvisi ASD');
      const owner = await createActor(ctx, society.id, 'ADMIN');
      const desk = await createActor(ctx, society.id, 'SEGRETERIA');
      const trainer = await createActor(ctx, society.id, 'ALLENATORE');
      const team = await createTeam(ctx, society.id, 'Under 14');
      const link = (await createLink(owner, { teamId: team.id })).json();
      const response = await enrol(link.code, athleteBody());
      expect(response.statusCode).toBe(201);

      const rows = await ctx.prisma.notification.findMany({ where: { societyId: society.id, type: 'ADMIN_NEW_ENROLMENT', channel: 'IN_APP' } });
      expect(rows.map((row) => row.userId).sort()).toEqual([owner.user.id, desk.user.id].sort());
      expect(rows[0]).toMatchObject({ title: 'Nuova iscrizione', body: 'Sara Conti · Under 14' });
      expect(await ctx.prisma.notification.count({ where: { userId: trainer.user.id } })).toBe(0);
      // It shows in the log of the automation that governs it.
      const run = await ctx.prisma.automationRun.findFirst({ where: { societyId: society.id, automation: { key: 'admin-alerts' } } });
      expect(run?.status).toBe('SUCCESS');
    });

    it('stays silent while the "Avvisare l\'amministrazione" automation is off, but the enrolment still works', async () => {
      const society = await createSociety(ctx, 'Silenzio ASD');
      const owner = await createActor(ctx, society.id, 'ADMIN');
      await ctx.prisma.automation.create({ data: { societyId: society.id, key: 'admin-alerts', enabled: false } });
      const link = (await createLink(owner)).json();
      expect((await enrol(link.code, athleteBody())).statusCode).toBe(201);
      expect(await ctx.prisma.notification.count({ where: { societyId: society.id } })).toBe(0);
    });
  });
});
