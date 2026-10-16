import { existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ATTACHMENT_ENTITY_TYPES, ROLES, type AttachmentEntityType, type Role } from '../src/shared/enums.js';
import { API, createTestContext, type TestContext } from './helpers/app.js';
import { createActor, createSociety, type Actor } from './helpers/factories.js';

const PDF = Buffer.from('%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF\n');
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00]);

describe('attachments on the records of the administration', () => {
  let ctx: TestContext;
  let storageDir: string;
  let societyId: string;
  const actors = {} as Record<Role, Actor>;
  let outsider: Actor;
  const entityIds = {} as Record<AttachmentEntityType, string>;
  let foreignVenueId: string;

  beforeAll(async () => {
    storageDir = mkdtempSync(join(tmpdir(), 'suiteasd-attachments-'));
    ctx = await createTestContext({ STORAGE_DIR: storageDir });
    societyId = (await createSociety(ctx, 'Allegati ASD')).id;
    const otherId = (await createSociety(ctx, 'Altra ASD')).id;
    for (const role of ROLES) actors[role] = await createActor(ctx, societyId, role);
    outsider = await createActor(ctx, otherId, 'ADMIN');

    const p = ctx.prisma;
    entityIds.VENUE = (await p.venue.create({ data: { societyId, name: 'Palazzetto' } })).id;
    entityIds.SPONSOR = (await p.sponsor.create({ data: { societyId, name: 'Ottica Rossi' } })).id;
    entityIds.TRIP = (await p.trip.create({ data: { societyId, destination: 'Rimini', departAt: new Date('2026-12-01T08:00:00.000Z') } })).id;
    entityIds.KIT = (await p.kit.create({ data: { societyId, item: 'Maglia', size: 'M' } })).id;
    entityIds.STAFF_MEMBER = (await p.staffMember.create({ data: { societyId, firstName: 'Marco', lastName: 'Villa', role: 'COACH' } })).id;
    entityIds.REFEREE = (await p.referee.create({ data: { societyId, firstName: 'Luca', lastName: 'Bianchi' } })).id;
    entityIds.LEDGER_ENTRY = (
      await p.ledgerEntry.create({ data: { societyId, kind: 'EXPENSE', category: 'Affitto', amountCents: 12000, occurredOn: new Date('2026-10-01T00:00:00.000Z') } })
    ).id;
    foreignVenueId = (await p.venue.create({ data: { societyId: otherId, name: 'Altro palazzetto' } })).id;
  });

  afterAll(async () => {
    await ctx.close();
    rmSync(storageDir, { recursive: true, force: true });
  });

  const upload = (
    actor: Actor | null,
    entityType: string,
    entityId: string,
    options: { body?: Buffer; type?: string; title?: string; fileName?: string } = {},
  ) => {
    const query = new URLSearchParams({ entityType, entityId, fileName: options.fileName ?? 'contratto.pdf' });
    if (options.title) query.set('title', options.title);
    return ctx.app.inject({
      method: 'POST',
      url: `${API}/attachments?${query.toString()}`,
      headers: { ...(actor?.headers ?? {}), 'content-type': options.type ?? 'application/pdf' },
      payload: options.body ?? PDF,
    });
  };
  const list = (actor: Actor, entityType: string, entityId: string) =>
    ctx.app.inject({ method: 'GET', url: `${API}/attachments?entityType=${entityType}&entityId=${entityId}`, headers: actor.headers });
  const download = (actor: Actor | null, id: string) =>
    ctx.app.inject({ method: 'GET', url: `${API}/attachments/${id}/file`, headers: actor?.headers });
  const remove = (actor: Actor, id: string) => ctx.app.inject({ method: 'DELETE', url: `${API}/attachments/${id}`, headers: actor.headers });
  const filesOnDisk = () => (existsSync(join(storageDir, societyId)) ? readdirSync(join(storageDir, societyId)) : []);

  describe('authorization', () => {
    // Who manages which record: the roles of its `:write` permission.
    it.each([
      ['VENUE', ['ADMIN', 'SEGRETERIA', 'STAFF']],
      ['SPONSOR', ['ADMIN']],
      ['TRIP', ['ADMIN', 'STAFF']],
      ['KIT', ['ADMIN', 'STAFF']],
      ['STAFF_MEMBER', ['ADMIN']],
      ['REFEREE', ['ADMIN', 'STAFF']],
      ['LEDGER_ENTRY', ['ADMIN']],
    ] as const)('%s: only %j may attach, list and download', async (entityType, allowed) => {
      for (const role of ROLES) {
        const response = await upload(actors[role], entityType, entityIds[entityType], { title: `da ${role}` });
        expect(response.statusCode, `${entityType} upload by ${role}`).toBe(allowed.includes(role as never) ? 201 : 403);
        const listing = await list(actors[role], entityType, entityIds[entityType]);
        expect(listing.statusCode, `${entityType} list by ${role}`).toBe(allowed.includes(role as never) ? 200 : 403);
      }
    });

    it('requires a session', async () => {
      expect((await upload(null, 'VENUE', entityIds.VENUE)).statusCode).toBe(401);
      expect((await download(null, 'x')).statusCode).toBe(401);
    });

    it('covers every kind of record', () => {
      expect(Object.keys(entityIds).sort()).toEqual([...ATTACHMENT_ENTITY_TYPES].sort());
    });
  });

  describe('attaching, listing, downloading and deleting', () => {
    it('stores the file and serves back the same bytes, with the title and the sanitized name', async () => {
      const created = await upload(actors.ADMIN, 'VENUE', entityIds.VENUE, { title: 'Contratto di affitto', fileName: '../../etc/contratto 2026.pdf' });
      expect(created.statusCode).toBe(201);
      const body = created.json();
      expect(body).toMatchObject({
        entityType: 'VENUE',
        entityId: entityIds.VENUE,
        title: 'Contratto di affitto',
        fileName: 'contratto 2026.pdf',
        mimeType: 'application/pdf',
        sizeBytes: PDF.length,
      });
      expect(body.downloadUrl).toBe(`/api/v1/attachments/${body.id}/file`);

      const file = await download(actors.ADMIN, body.id);
      expect(file.statusCode).toBe(200);
      expect(file.headers['content-type']).toBe('application/pdf');
      expect(file.headers['content-disposition']).toContain('contratto 2026.pdf');
      expect(file.headers['cache-control']).toBe('private, no-store');
      expect(file.rawPayload.equals(PDF)).toBe(true);
    });

    it('accepts images and lists newest first', async () => {
      const first = (await upload(actors.ADMIN, 'KIT', entityIds.KIT, { title: 'Fattura', body: PDF })).json();
      const second = (await upload(actors.ADMIN, 'KIT', entityIds.KIT, { title: 'Foto', body: PNG, type: 'image/png', fileName: 'foto.png' })).json();
      const items = (await list(actors.ADMIN, 'KIT', entityIds.KIT)).json().data as { id: string; title: string }[];
      const ids = items.map((item) => item.id);
      expect(ids.indexOf(second.id)).toBeLessThan(ids.indexOf(first.id));
    });

    it('refuses unsupported types and content that is not what it claims', async () => {
      expect((await upload(actors.ADMIN, 'VENUE', entityIds.VENUE, { body: Buffer.from('ciao'), type: 'text/plain' })).statusCode).toBeGreaterThanOrEqual(400);
      const fake = await upload(actors.ADMIN, 'VENUE', entityIds.VENUE, { body: Buffer.from('non e un pdf'), type: 'application/pdf' });
      expect(fake.statusCode).toBe(422);
      expect(fake.json().code).toBe('file_content_mismatch');
      expect((await upload(actors.ADMIN, 'VENUE', entityIds.VENUE, { body: Buffer.alloc(0) })).statusCode).toBeGreaterThanOrEqual(400);
    });

    it('rejects a record that does not exist or belongs to another society', async () => {
      expect((await upload(actors.ADMIN, 'VENUE', 'missing')).statusCode).toBe(404);
      expect((await upload(actors.ADMIN, 'VENUE', foreignVenueId)).statusCode).toBe(404);
      expect((await upload(outsider, 'VENUE', entityIds.VENUE)).statusCode).toBe(404);
      expect((await list(outsider, 'VENUE', entityIds.VENUE)).statusCode).toBe(404);
      expect((await ctx.app.inject({ method: 'GET', url: `${API}/attachments?entityType=BOH&entityId=x`, headers: actors.ADMIN.headers })).statusCode).toBe(422);
    });

    it('keeps the files of one society invisible to another', async () => {
      const mine = (await upload(actors.ADMIN, 'SPONSOR', entityIds.SPONSOR)).json();
      expect((await download(outsider, mine.id)).statusCode).toBe(404);
      expect((await remove(outsider, mine.id)).statusCode).toBe(404);
      expect((await download(actors.ADMIN, mine.id)).statusCode).toBe(200);
    });

    it('deletes the row and the file, and only for those who manage the record', async () => {
      const created = (await upload(actors.ADMIN, 'VENUE', entityIds.VENUE, { title: 'Da togliere' })).json();
      const before = filesOnDisk().length;
      expect((await remove(actors.ALLENATORE, created.id)).statusCode).toBe(403);
      expect((await remove(actors.ADMIN, created.id)).statusCode).toBe(204);
      expect(filesOnDisk().length).toBe(before - 1);
      expect((await download(actors.ADMIN, created.id)).statusCode).toBe(404);
      expect((await remove(actors.ADMIN, created.id)).statusCode).toBe(404);
    });

    it('limits the files of one record', async () => {
      const venue = await ctx.prisma.venue.create({ data: { societyId, name: 'Piena' } });
      for (let index = 0; index < 20; index += 1) {
        expect((await upload(actors.ADMIN, 'VENUE', venue.id)).statusCode).toBe(201);
      }
      const over = await upload(actors.ADMIN, 'VENUE', venue.id);
      expect(over.statusCode).toBe(422);
      expect(over.json().code).toBe('too_many_attachments');
    });
  });

  describe('when the record is deleted', () => {
    it('removes its attachments and their files with it', async () => {
      const venue = await ctx.prisma.venue.create({ data: { societyId, name: 'Da chiudere' } });
      const created = (await upload(actors.ADMIN, 'VENUE', venue.id, { title: 'Contratto' })).json();
      const stored = await ctx.prisma.attachment.findUniqueOrThrow({ where: { id: created.id } });
      expect(existsSync(join(storageDir, stored.fileKey))).toBe(true);

      const deleted = await ctx.app.inject({ method: 'DELETE', url: `${API}/venues/${venue.id}`, headers: actors.ADMIN.headers });
      expect(deleted.statusCode).toBe(204);
      expect(await ctx.prisma.attachment.count({ where: { entityId: venue.id } })).toBe(0);
      expect(existsSync(join(storageDir, stored.fileKey))).toBe(false);
    });

    it.each([
      ['SPONSOR', 'sponsors'],
      ['TRIP', 'trips'],
      ['KIT', 'kits'],
      ['STAFF_MEMBER', 'staff'],
      ['REFEREE', 'referees'],
      ['LEDGER_ENTRY', 'ledger/entries'],
    ] as const)('%s: deleting through /%s cleans up too', async (entityType, path) => {
      const created = (await upload(actors.ADMIN, entityType, entityIds[entityType], { title: 'Da pulire' })).json();
      const stored = await ctx.prisma.attachment.findUniqueOrThrow({ where: { id: created.id } });
      const deleted = await ctx.app.inject({ method: 'DELETE', url: `${API}/${path}/${entityIds[entityType]}`, headers: actors.ADMIN.headers });
      expect(deleted.statusCode).toBe(204);
      expect(await ctx.prisma.attachment.count({ where: { entityType, entityId: entityIds[entityType] } })).toBe(0);
      expect(existsSync(join(storageDir, stored.fileKey))).toBe(false);
    });
  });
});
