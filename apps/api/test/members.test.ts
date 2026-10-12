import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDefaultDocumentTypes } from '../src/lib/society-defaults.js';
import { ROLES, type Role } from '../src/shared/enums.js';
import { API, createTestContext, type TestContext } from './helpers/app.js';
import { createActor, createMember, createSociety, createTeam, type Actor } from './helpers/factories.js';

const DAY_MS = 86_400_000;
const inDays = (days: number): Date => {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) + days * DAY_MS);
};

describe('members module (SPEC 01)', () => {
  let ctx: TestContext;
  let storageDir: string;
  let societyId: string;
  let otherSocietyId: string;
  const actors = {} as Record<Role, Actor>;
  let outsider: Actor;
  const typeIds = {} as Record<'cert' | 'form' | 'privacy', string>;

  const get = (actor: Actor | null, url: string) => ctx.app.inject({ method: 'GET', url: `${API}${url}`, headers: actor?.headers });
  const send = (method: 'POST' | 'PATCH' | 'DELETE', actor: Actor, url: string, payload?: object) =>
    ctx.app.inject({ method, url: `${API}${url}`, headers: actor.headers, payload });

  beforeAll(async () => {
    storageDir = mkdtempSync(join(tmpdir(), 'suiteasd-storage-'));
    ctx = await createTestContext({ STORAGE_DIR: storageDir });
    societyId = (await createSociety(ctx, 'Aquile Members')).id;
    otherSocietyId = (await createSociety(ctx, 'Altra Societa')).id;
    await createDefaultDocumentTypes(ctx.prisma, societyId);
    await createDefaultDocumentTypes(ctx.prisma, otherSocietyId);
    const types = await ctx.prisma.documentType.findMany({ where: { societyId } });
    for (const [slot, key] of [['cert', 'MEDICAL_CERTIFICATE'], ['form', 'MEMBERSHIP_FORM'], ['privacy', 'PRIVACY_CONSENT']] as const) {
      typeIds[slot] = types.find((type) => type.key === key)?.id ?? '';
    }
    for (const role of ROLES) actors[role] = await createActor(ctx, societyId, role);
    outsider = await createActor(ctx, otherSocietyId, 'ADMIN');
  });

  afterAll(async () => {
    await ctx.close();
    rmSync(storageDir, { recursive: true, force: true });
  });

  describe('authorization (role matrix)', () => {
    it.each([
      ['ADMIN', 200],
      ['SEGRETERIA', 200],
      ['ALLENATORE', 200],
      ['STAFF', 200],
      ['ATLETA', 200],
      ['GENITORE', 200],
    ] as const)('%s listing members gets %i (athletes and guardians are scoped to their own)', async (role, expected) => {
      expect((await get(actors[role], '/members')).statusCode).toBe(expected);
    });

    it.each([
      ['ADMIN', 201],
      ['SEGRETERIA', 201],
      ['ALLENATORE', 403],
      ['STAFF', 403],
      ['ATLETA', 403],
      ['GENITORE', 403],
    ] as const)('%s creating a member gets %i', async (role, expected) => {
      const response = await send('POST', actors[role], '/members', { firstName: 'Matrix', lastName: role });
      expect(response.statusCode).toBe(expected);
    });

    it.each([
      ['ADMIN', 200],
      ['SEGRETERIA', 200],
      ['ALLENATORE', 200],
      ['STAFF', 200],
      ['ATLETA', 403],
      ['GENITORE', 403],
    ] as const)('%s reading the summary gets %i', async (role, expected) => {
      expect((await get(actors[role], '/members/summary')).statusCode).toBe(expected);
    });

    it.each(ROLES)('%s export and import follow members:write', async (role) => {
      const allowed = role === 'ADMIN' || role === 'SEGRETERIA';
      const exported = await get(actors[role], '/members/export');
      const imported = await send('POST', actors[role], '/members/import', { csv: 'nome;cognome\nA;B' });
      expect([exported.statusCode, imported.statusCode]).toEqual(allowed ? [200, 200] : [403, 403]);
    });
  });

  describe('CRUD', () => {
    it('creates, reads, updates and deletes a member with teams', async () => {
      const u14 = await createTeam(ctx, societyId, 'CRUD U14');
      const u16 = await createTeam(ctx, societyId, 'CRUD U16');
      const created = await send('POST', actors.SEGRETERIA, '/members', {
        firstName: 'Lucia',
        lastName: 'Verdi',
        birthDate: '2011-05-04',
        gender: 'FEMALE',
        fiscalCode: 'vrdlcu11e44h501x',
        fieldRole: 'Libero',
        kitSize: 'S',
        teamIds: [u14.id],
      });
      expect(created.statusCode).toBe(201);
      const member = created.json();
      expect(member).toMatchObject({
        firstName: 'Lucia',
        birthDate: '2011-05-04',
        fiscalCode: 'VRDLCU11E44H501X',
        fieldRole: 'Libero',
        kitSize: 'S',
        status: 'ACTIVE',
        guardians: [],
        documentStatus: 'MISSING',
      });
      expect(member.teams.map((team: { name: string }) => team.name)).toEqual(['CRUD U14']);
      expect(member.documents.map((doc: { key: string; status: string }) => [doc.key, doc.status])).toEqual([
        ['MEDICAL_CERTIFICATE', 'MISSING'],
        ['MEMBERSHIP_FORM', 'MISSING'],
        ['PRIVACY_CONSENT', 'MISSING'],
      ]);

      const updated = await send('PATCH', actors.ADMIN, `/members/${member.id}`, {
        lastName: 'Verdi Rossi',
        kitSize: null,
        teamIds: [u16.id],
      });
      expect(updated.statusCode).toBe(200);
      expect(updated.json()).toMatchObject({ lastName: 'Verdi Rossi', kitSize: null, fieldRole: 'Libero' });
      expect(updated.json().teams.map((team: { name: string }) => team.name)).toEqual(['CRUD U16']);
      // The old team is kept as history (leftAt), not deleted.
      expect(await ctx.prisma.teamMembership.count({ where: { memberId: member.id } })).toBe(2);

      const rejoined = await send('PATCH', actors.ADMIN, `/members/${member.id}`, { teamIds: [u14.id, u16.id] });
      expect(rejoined.json().teams).toHaveLength(2);
      expect(await ctx.prisma.teamMembership.count({ where: { memberId: member.id } })).toBe(2);

      expect((await send('DELETE', actors.ADMIN, `/members/${member.id}`)).statusCode).toBe(204);
      expect((await get(actors.ADMIN, `/members/${member.id}`)).statusCode).toBe(404);
    });

    it('rejects invalid bodies with 422 and field errors', async () => {
      const response = await send('POST', actors.ADMIN, '/members', {
        firstName: ' ',
        lastName: 'X',
        email: 'not-an-email',
        fiscalCode: 'short',
        birthDate: '2011-13-40',
      });
      expect(response.statusCode).toBe(422);
      const paths = response.json().errors.map((error: { path: string }) => error.path);
      expect(paths).toEqual(expect.arrayContaining(['firstName', 'email', 'fiscalCode', 'birthDate']));
      const empty = await send('PATCH', actors.ADMIN, `/members/${(await createMember(ctx, societyId)).id}`, {});
      expect(empty.statusCode).toBe(422);
    });

    it('answers 409 for a duplicate fiscal code and allows it in another society', async () => {
      await send('POST', actors.ADMIN, '/members', { firstName: 'Dup', lastName: 'One', fiscalCode: 'DPLDPL00A01H501A' });
      const again = await send('POST', actors.ADMIN, '/members', { firstName: 'Dup', lastName: 'Two', fiscalCode: 'dpldpl00a01h501a' });
      expect(again.statusCode).toBe(409);
      expect(again.json()).toMatchObject({ code: 'fiscal_code_taken' });
      const other = await send('POST', outsider, '/members', { firstName: 'Dup', lastName: 'Two', fiscalCode: 'DPLDPL00A01H501A' });
      expect(other.statusCode).toBe(201);
    });

    it('returns 404 for an unknown team on create and update', async () => {
      const response = await send('POST', actors.ADMIN, '/members', { firstName: 'No', lastName: 'Team', teamIds: ['missing'] });
      expect(response.statusCode).toBe(404);
      const member = await createMember(ctx, societyId);
      expect((await send('PATCH', actors.ADMIN, `/members/${member.id}`, { teamIds: ['missing'] })).statusCode).toBe(404);
    });

    it('shows the linked guardians in the detail', async () => {
      const member = await createMember(ctx, societyId, { firstName: 'Con', lastName: 'Genitore' });
      const guardian = await createActor(ctx, societyId, 'GENITORE');
      await ctx.prisma.guardianLink.create({
        data: { societyId, guardianUserId: guardian.user.id, memberId: member.id, relation: 'MADRE' },
      });
      const detail = (await get(actors.SEGRETERIA, `/members/${member.id}`)).json();
      expect(detail.guardians).toEqual([
        { linkId: expect.any(String), userId: guardian.user.id, firstName: 'Test', lastName: 'GENITORE', relation: 'MADRE' },
      ]);
    });
  });

  describe('document indicators and filters', () => {
    let scope: { societyId: string; admin: Actor; ok: string; expiring: string; expired: string; missing: string; team: string };

    beforeAll(async () => {
      const society = await createSociety(ctx, 'Indicators ASD');
      await createDefaultDocumentTypes(ctx.prisma, society.id);
      const types = await ctx.prisma.documentType.findMany({ where: { societyId: society.id } });
      const idOf = (key: string) => types.find((type) => type.key === key)?.id ?? '';
      const team = await createTeam(ctx, society.id, 'Indicators U16');
      const create = async (lastName: string, certDays: number | null, form: boolean) => {
        const member = await createMember(ctx, society.id, { firstName: 'Ind', lastName });
        await ctx.prisma.teamMembership.create({ data: { societyId: society.id, teamId: team.id, memberId: member.id } });
        if (certDays !== null) {
          await ctx.prisma.document.create({
            data: { societyId: society.id, memberId: member.id, documentTypeId: idOf('MEDICAL_CERTIFICATE'), expiresAt: inDays(certDays) },
          });
        }
        if (form) {
          await ctx.prisma.document.create({ data: { societyId: society.id, memberId: member.id, documentTypeId: idOf('MEMBERSHIP_FORM') } });
        }
        await ctx.prisma.document.create({ data: { societyId: society.id, memberId: member.id, documentTypeId: idOf('PRIVACY_CONSENT') } });
        return member.id;
      };
      scope = {
        societyId: society.id,
        admin: await createActor(ctx, society.id, 'ADMIN'),
        ok: await create('Aaa', 200, true),
        expiring: await create('Bbb', 15, true),
        expired: await create('Ccc', -3, true),
        missing: await create('Ddd', 200, false),
        team: team.id,
      };
    });

    it('reports one indicator per required type with days remaining', async () => {
      const list = (await get(scope.admin, '/members?limit=100')).json();
      const byId = new Map<string, { documentStatus: string; documents: { key: string; status: string; daysRemaining: number | null }[] }>(
        list.data.map((member: { id: string }) => [member.id, member]),
      );
      const statusesOf = (id: string) => byId.get(id)?.documents.map((doc) => doc.status);
      expect(statusesOf(scope.ok)).toEqual(['OK', 'OK', 'OK']);
      expect(statusesOf(scope.expiring)).toEqual(['EXPIRING', 'OK', 'OK']);
      expect(statusesOf(scope.expired)).toEqual(['EXPIRED', 'OK', 'OK']);
      expect(statusesOf(scope.missing)).toEqual(['OK', 'MISSING', 'OK']);
      expect(byId.get(scope.expiring)?.documents[0]?.daysRemaining).toBe(15);
      expect(byId.get(scope.expired)?.documents[0]?.daysRemaining).toBe(-3);
      expect([scope.ok, scope.expiring, scope.expired, scope.missing].map((id) => byId.get(id)?.documentStatus)).toEqual([
        'OK',
        'EXPIRING',
        'MISSING',
        'MISSING',
      ]);
    });

    it('filters by document status, team and search text', async () => {
      const names = async (query: string) =>
        (await get(scope.admin, `/members?${query}`)).json<{ data: { lastName: string }[] }>().data.map((member) => member.lastName);
      expect(await names('documentStatus=OK')).toEqual(['Aaa']);
      expect(await names('documentStatus=EXPIRING')).toEqual(['Bbb']);
      expect(await names('documentStatus=MISSING')).toEqual(['Ccc', 'Ddd']);
      expect(await names(`teamId=${scope.team}`)).toEqual(['Aaa', 'Bbb', 'Ccc', 'Ddd']);
      expect(await names(`teamId=${scope.team}&q=bbb`)).toEqual(['Bbb']);
      expect(await names('q=ind ccc')).toEqual(['Ccc']);
      expect(await names('q=zzzz')).toEqual([]);
    });

    it('paginates with a cursor, also when the document filter is active', async () => {
      const collected: string[] = [];
      let cursor: string | null = null;
      do {
        const query: string = cursor ? `limit=1&documentStatus=MISSING&cursor=${cursor}` : 'limit=1&documentStatus=MISSING';
        const body: { data: { lastName: string }[]; page: { nextCursor: string | null } } = (await get(scope.admin, `/members?${query}`)).json();
        collected.push(...body.data.map((member) => member.lastName));
        cursor = body.page.nextCursor;
      } while (cursor);
      expect(collected).toEqual(['Ccc', 'Ddd']);
      expect((await get(scope.admin, '/members?cursor=garbage')).statusCode).toBe(400);
    });

    it('computes the summary footer: members, teams, missing or expired documents', async () => {
      const summary = (await get(scope.admin, '/members/summary')).json();
      // Ccc has an expired certificate, Ddd a missing enrolment form.
      expect(summary).toEqual({ tesserati: 4, squadre: 1, documentiMancanti: 2 });
    });

    it('does not count inactive members as tesserati', async () => {
      const inactive = await createMember(ctx, scope.societyId, { firstName: 'Ex', lastName: 'Socia', status: 'INACTIVE' });
      const summary = (await get(scope.admin, '/members/summary')).json();
      expect(summary.tesserati).toBe(4);
      expect((await get(scope.admin, '/members?status=INACTIVE')).json().data.map((member: { id: string }) => member.id)).toEqual([inactive.id]);
    });
  });

  describe('access for athletes, guardians and coaches', () => {
    let childId: string;
    let ownId: string;
    let strangerId: string;
    let athlete: Actor;
    let guardian: Actor;

    beforeAll(async () => {
      athlete = await createActor(ctx, societyId, 'ATLETA');
      guardian = await createActor(ctx, societyId, 'GENITORE');
      ownId = (await createMember(ctx, societyId, { firstName: 'Own', lastName: 'Athlete', userId: athlete.user.id, fiscalCode: 'WNTTHL00A01H501A', address: 'Via Roma 1', notes: 'nota' })).id;
      childId = (await createMember(ctx, societyId, { firstName: 'Child', lastName: 'OfGuardian' })).id;
      strangerId = (await createMember(ctx, societyId, { firstName: 'Stranger', lastName: 'Member' })).id;
      await ctx.prisma.guardianLink.create({ data: { societyId, guardianUserId: guardian.user.id, memberId: childId, relation: 'PADRE' } });
    });

    it('lets an athlete see only their own member record', async () => {
      const list = (await get(athlete, '/members?limit=100')).json();
      expect(list.data.map((member: { id: string }) => member.id)).toEqual([ownId]);
      expect(list.data[0]).toMatchObject({ fiscalCode: 'WNTTHL00A01H501A', address: 'Via Roma 1' });
      expect((await get(athlete, `/members/${ownId}`)).statusCode).toBe(200);
      expect((await get(athlete, `/members/${strangerId}`)).statusCode).toBe(404);
      expect((await get(athlete, `/members/${childId}`)).statusCode).toBe(404);
    });

    it('lets a guardian see only the linked children', async () => {
      const list = (await get(guardian, '/members?limit=100')).json();
      expect(list.data.map((member: { id: string }) => member.id)).toEqual([childId]);
      expect((await get(guardian, `/members/${childId}`)).statusCode).toBe(200);
      expect((await get(guardian, `/members/${ownId}`)).statusCode).toBe(404);
    });

    it('applies the scope also to search and filters', async () => {
      const response = await get(athlete, '/members?q=Stranger');
      expect(response.json().data).toEqual([]);
    });

    it('hides identity and address data of minors from coaches and staff', async () => {
      for (const role of ['ALLENATORE', 'STAFF'] as const) {
        const detail = (await get(actors[role], `/members/${ownId}`)).json();
        expect(detail).toMatchObject({ firstName: 'Own', fiscalCode: null, address: null, postalCode: null, notes: null });
      }
      const secretary = (await get(actors.SEGRETERIA, `/members/${ownId}`)).json();
      expect(secretary).toMatchObject({ fiscalCode: 'WNTTHL00A01H501A', address: 'Via Roma 1', notes: 'nota' });
    });
  });

  describe('CSV import and export', () => {
    let importer: Actor;
    let team: string;

    beforeAll(async () => {
      const society = await createSociety(ctx, 'Import ASD');
      importer = await createActor(ctx, society.id, 'SEGRETERIA');
      team = (await createTeam(ctx, society.id, 'Serie D')).id;
      await createMember(ctx, society.id, { firstName: 'Gia', lastName: 'Presente', fiscalCode: 'PRSGIA00A41H501Z' });
    });

    const csv = [
      'Nome;Cognome;Data di nascita;Codice fiscale;Email;Squadra;Sesso;Telefono',
      'Anna;Bianchi;04/05/2011;bnchnn11e44h501t;anna@example.test;Serie D;F;+39 333 1234567',
      'Marta;;2010-01-01;;;;;',
      'Luisa;Neri;31/02/2010;;;;;',
      'Paola;Gialli;;;;Under 99;;',
      'Gia;Doppia;;PRSGIA00A41H501Z;;;;',
      'Dina;Uno;;DPLDNA00A41H501Z;;;;',
      'Dina;Due;;dpldna00a41h501z;;;;',
    ].join('\r\n');

    it('validates without writing on a dry run and reports every problem with its row', async () => {
      const response = await send('POST', importer, '/members/import', { csv });
      expect(response.statusCode).toBe(200);
      const result = response.json<{ errors: { row: number; field: string }[] }>();
      expect(result).toMatchObject({ dryRun: true, totalRows: 7, validRows: 2, invalidRows: 5, created: 0, ignoredColumns: [] });
      const byRow = (row: number) => result.errors.filter((error) => error.row === row).map((error) => error.field);
      expect(byRow(3)).toEqual(['lastName']);
      expect(byRow(4)).toEqual(['birthDate']);
      expect(byRow(5)).toEqual(['teams']);
      expect(byRow(6)).toEqual(['fiscalCode']);
      expect(byRow(8)).toEqual(['fiscalCode']);
      expect(await ctx.prisma.member.count({ where: { societyId: importer.societyId } })).toBe(1);
    });

    it('is a dry run unless dryRun is false, then creates the valid rows only', async () => {
      const response = await send('POST', importer, '/members/import', { csv, dryRun: false });
      expect(response.json()).toMatchObject({ dryRun: false, created: 2, invalidRows: 5 });
      const anna = await ctx.prisma.member.findFirstOrThrow({
        where: { societyId: importer.societyId, firstName: 'Anna' },
        include: { teamMemberships: true },
      });
      expect(anna).toMatchObject({ lastName: 'Bianchi', gender: 'FEMALE', fiscalCode: 'BNCHNN11E44H501T', phone: '+39 333 1234567' });
      expect(anna.birthDate?.toISOString()).toBe('2011-05-04T00:00:00.000Z');
      expect(anna.teamMemberships.map((membership) => membership.teamId)).toEqual([team]);
      expect(await ctx.prisma.member.count({ where: { societyId: importer.societyId } })).toBe(3);
      // Running it again cannot duplicate the people already created.
      const again = await send('POST', importer, '/members/import', { csv, dryRun: false });
      expect(again.json().created).toBe(0);
    });

    it('reports ignored columns and rejects malformed files', async () => {
      const ignored = await send('POST', importer, '/members/import', { csv: 'nome,cognome,hobby\nA,B,nuoto' });
      expect(ignored.json()).toMatchObject({ validRows: 1, ignoredColumns: ['hobby'] });
      const noHeader = await send('POST', importer, '/members/import', { csv: 'nome;squadra\nA;Serie D' });
      expect(noHeader.statusCode).toBe(422);
      expect(noHeader.json()).toMatchObject({ code: 'invalid_csv' });
      const unterminated = await send('POST', importer, '/members/import', { csv: 'nome;cognome\n"A;B' });
      expect(unterminated.statusCode).toBe(422);
      expect((await send('POST', importer, '/members/import', { csv: '' })).statusCode).toBe(422);
    });

    it('exports a CSV that neutralizes formulas and can be imported back', async () => {
      await ctx.prisma.member.create({
        data: { societyId: importer.societyId, firstName: '=cmd|calc', lastName: 'Evil', phone: '+39 333 000000' },
      });
      const response = await get(importer, `/members/export?teamId=${team}`);
      expect(response.statusCode).toBe(200);
      expect(response.headers['content-type']).toContain('text/csv');
      expect(response.headers['content-disposition']).toContain('attachment');
      const lines = response.body.split('\r\n');
      expect(lines[0]).toContain('nome;cognome;dataNascita');
      expect(lines[0]).toContain('statoDocumenti');
      expect(response.body).toContain('Anna;Bianchi;2011-05-04');
      expect(response.body).toContain('Serie D');

      const all = (await get(importer, '/members/export')).body;
      expect(all).toContain("'=cmd|calc");
      expect(all).toContain("'+39 333 000000");
      const dry = (await send('POST', importer, '/members/import', { csv: all })).json();
      // Every exported row already exists (same fiscal code) or is a formula-guarded copy: nothing breaks.
      expect(dry.totalRows).toBe(4);
      expect(dry.errors.every((error: { field: string }) => error.field === 'fiscalCode')).toBe(true);
    });
  });

  describe('tenant isolation', () => {
    it('never lists, reads, updates or deletes members of another society', async () => {
      const foreign = await createMember(ctx, societyId, { firstName: 'Only', lastName: 'Aquile' });
      const list = (await get(outsider, '/members?limit=100')).json();
      expect(list.data.map((member: { id: string }) => member.id)).not.toContain(foreign.id);
      const responses = await Promise.all([
        get(outsider, `/members/${foreign.id}`),
        send('PATCH', outsider, `/members/${foreign.id}`, { lastName: 'Stolen' }),
        send('DELETE', outsider, `/members/${foreign.id}`),
      ]);
      expect(responses.map((response) => response.statusCode)).toEqual([404, 404, 404]);
      expect(await ctx.prisma.member.findUnique({ where: { id: foreign.id } })).toMatchObject({ lastName: 'Aquile' });
    });

    it('refuses a team of another society', async () => {
      const foreignTeam = await createTeam(ctx, societyId, 'Private team');
      const response = await send('POST', outsider, '/members', { firstName: 'Cross', lastName: 'Tenant', teamIds: [foreignTeam.id] });
      expect(response.statusCode).toBe(404);
    });

    it('creates the member in the token society even when the body names another one', async () => {
      const response = await send('POST', outsider, '/members', { firstName: 'Inj', lastName: 'Ected', societyId });
      expect(response.statusCode).toBe(201);
      const stored = await ctx.prisma.member.findUniqueOrThrow({ where: { id: response.json().id } });
      expect(stored.societyId).toBe(otherSocietyId);
    });
  });
});
