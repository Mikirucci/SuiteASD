import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDefaultDocumentTypes } from '../src/lib/society-defaults.js';
import { ROLES, type Role } from '../src/shared/enums.js';
import { API, createTestContext, type TestContext } from './helpers/app.js';
import { createActor, createMember, createSociety, createTeam, type Actor } from './helpers/factories.js';

const inDays = (days: number): Date => new Date(`${new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10)}T00:00:00.000Z`);

describe('document type report (Scadenze e documenti: cards per type, people inside)', () => {
  let ctx: TestContext;
  let societyId: string;
  let teamId: string;
  let certificateId: string;
  let optionalTypeId: string;
  const actors = {} as Record<Role, Actor>;
  let outsider: Actor;

  const get = (actor: Actor | null, url: string) => ctx.app.inject({ method: 'GET', url: `${API}${url}`, headers: actor?.headers });

  beforeAll(async () => {
    ctx = await createTestContext();
    societyId = (await createSociety(ctx, 'Documenti ASD')).id;
    outsider = await createActor(ctx, (await createSociety(ctx, 'Altra Documenti ASD')).id, 'ADMIN');
    for (const role of ROLES) actors[role] = await createActor(ctx, societyId, role);
    await createDefaultDocumentTypes(ctx.prisma, societyId);
    teamId = (await createTeam(ctx, societyId, 'Under 16')).id;
    certificateId = (await ctx.prisma.documentType.findFirstOrThrow({ where: { societyId, key: 'MEDICAL_CERTIFICATE' } })).id;
    optionalTypeId = (
      await ctx.prisma.documentType.create({ data: { societyId, key: 'PHOTO_RELEASE', name: 'Liberatoria foto', isRequired: false } })
    ).id;

    const member = async (lastName: string, inTeam = false, status = 'ACTIVE') => {
      const created = await createMember(ctx, societyId, { firstName: 'Atleta', lastName, status });
      if (inTeam) await ctx.prisma.teamMembership.create({ data: { societyId, teamId, memberId: created.id } });
      return created;
    };
    const certificate = (memberId: string, days: number | null, fileKey: string | null = 'test/file.pdf') =>
      ctx.prisma.document.create({
        data: { societyId, memberId, documentTypeId: certificateId, expiresAt: days === null ? null : inDays(days), fileKey },
      });

    // Verdi valid, Gialli expiring, Rossi expired, Neri nothing, Blu has the date but not the file, Viola is not active.
    await certificate((await member('Verdi', true)).id, 200);
    await certificate((await member('Gialli', true)).id, 10);
    await certificate((await member('Rossi')).id, -4);
    await member('Neri');
    await certificate((await member('Blu')).id, 200, null);
    await certificate((await member('Viola', false, 'INACTIVE')).id, 200);
    // An optional type only concerns who handed it in.
    const holder = await member('Arancio');
    await ctx.prisma.document.create({ data: { societyId, memberId: holder.id, documentTypeId: optionalTypeId, fileKey: 'test/file.pdf' } });
  });

  afterAll(async () => {
    await ctx.close();
  });

  it('is limited to the roles that read documents and to the own society', async () => {
    expect((await get(null, '/document-types/report')).statusCode).toBe(401);
    const readers: readonly Role[] = ['ADMIN', 'SEGRETERIA', 'ALLENATORE', 'STAFF'];
    for (const role of ROLES) {
      const expected = readers.includes(role) ? 200 : 403;
      expect((await get(actors[role], '/document-types/report')).statusCode, role).toBe(expected);
      expect((await get(actors[role], `/document-types/${certificateId}/people`)).statusCode, role).toBe(expected);
    }
    expect((await get(outsider, `/document-types/${certificateId}/people`)).statusCode).toBe(404);
    expect((await get(outsider, '/document-types/report')).json()).toEqual({ data: [] });
  });

  it('counts valid, expiring, expired and missing people of each type, active members only', async () => {
    const { data } = (await get(actors.ADMIN, '/document-types/report')).json<{ data: ({ documentTypeId: string } & Record<string, number>)[] }>();
    const of = (typeId: string) => data.find((entry) => entry.documentTypeId === typeId);
    // Arancio and Neri have no certificate and Blu has the date but not the file: three missing
    expect(of(certificateId)).toMatchObject({ validPeople: 1, expiringPeople: 1, expiredPeople: 1, missingPeople: 3 });
    expect(of(optionalTypeId)).toMatchObject({ validPeople: 1, expiringPeople: 0, expiredPeople: 0, missingPeople: 0 });
  });

  it('lists the people of a type by name with the state of their current document', async () => {
    const body = (await get(actors.SEGRETERIA, `/document-types/${certificateId}/people`)).json<{
      people: { memberName: string; status: string; expiresAt: string | null; hasFile: boolean; documentId: string | null }[];
    }>();
    expect(body.people.map((person) => person.memberName)).toEqual([
      'Atleta Arancio',
      'Atleta Blu',
      'Atleta Gialli',
      'Atleta Neri',
      'Atleta Rossi',
      'Atleta Verdi',
    ]);
    expect(body.people.map((person) => person.status)).toEqual(['MISSING', 'MISSING', 'EXPIRING', 'MISSING', 'EXPIRED', 'OK']);
    expect(body.people.find((person) => person.memberName === 'Atleta Blu')).toMatchObject({ hasFile: false, expiresAt: inDays(200).toISOString().slice(0, 10) });
    expect(body.people.find((person) => person.memberName === 'Atleta Neri')).toMatchObject({ hasFile: false, expiresAt: null, documentId: null });
    expect(body.people.find((person) => person.memberName === 'Atleta Verdi')).toMatchObject({ hasFile: true });
  });

  it('only lists the holders of an optional type', async () => {
    const body = (await get(actors.ADMIN, `/document-types/${optionalTypeId}/people`)).json<{ people: { memberName: string }[] }>();
    expect(body.people.map((person) => person.memberName)).toEqual(['Atleta Arancio']);
  });

  it('narrows the people by name, team and status without changing the figures of the type', async () => {
    const names = async (query: string) =>
      (await get(actors.ADMIN, `/document-types/${certificateId}/people?${query}`))
        .json<{ people: { memberName: string }[] }>()
        .people.map((person) => person.memberName);
    expect(await names('q=ross')).toEqual(['Atleta Rossi']);
    expect(await names('status=EXPIRING')).toEqual(['Atleta Gialli']);
    expect(await names(`teamId=${teamId}`)).toEqual(['Atleta Gialli', 'Atleta Verdi']);
    expect(await names(`teamId=${teamId}&status=OK`)).toEqual(['Atleta Verdi']);
    const filtered = (await get(actors.ADMIN, `/document-types/${certificateId}/people?q=ross`)).json();
    expect(filtered.stats).toEqual({ validPeople: 1, expiringPeople: 1, expiredPeople: 1, missingPeople: 3 });
  });

  it('answers 404 for an unknown type and 422 for an unknown status', async () => {
    expect((await get(actors.ADMIN, '/document-types/does-not-exist/people')).statusCode).toBe(404);
    expect((await get(actors.ADMIN, `/document-types/${certificateId}/people?status=NOPE`)).statusCode).toBe(422);
  });
});
