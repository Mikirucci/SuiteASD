import { randomUUID } from 'node:crypto';
import { existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDefaultDocumentTypes } from '../src/lib/society-defaults.js';
import { API, createTestContext, type TestContext } from './helpers/app.js';
import { createActor, createMember, createSociety, type Actor } from './helpers/factories.js';

const PDF = Buffer.from('%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF\n');
const DAY_MS = 86_400_000;
const inDays = (days: number): string => new Date(Date.now() + days * DAY_MS).toISOString().slice(0, 10);

describe('self-service documents and the alerts the administration gets', () => {
  let ctx: TestContext;
  let storageDir: string;
  let societyId: string;
  let admin: Actor;
  let secretary: Actor;
  let coach: Actor;
  let athlete: Actor;
  let guardian: Actor;
  let stranger: Actor;
  let athleteMemberId: string;
  let childId: string;
  let strangerMemberId: string;
  const types = {} as Record<'cert' | 'form' | 'privacy', string>;

  beforeAll(async () => {
    storageDir = mkdtempSync(join(tmpdir(), 'suiteasd-selfservice-'));
    ctx = await createTestContext({ STORAGE_DIR: storageDir });
    societyId = (await createSociety(ctx, 'Self Service ASD')).id;
    await createDefaultDocumentTypes(ctx.prisma, societyId);
    const stored = await ctx.prisma.documentType.findMany({ where: { societyId } });
    const idOf = (key: string): string => stored.find((type) => type.key === key)?.id ?? '';
    types.cert = idOf('MEDICAL_CERTIFICATE');
    types.form = idOf('MEMBERSHIP_FORM');
    types.privacy = idOf('PRIVACY_CONSENT');

    admin = await createActor(ctx, societyId, 'ADMIN');
    secretary = await createActor(ctx, societyId, 'SEGRETERIA');
    coach = await createActor(ctx, societyId, 'ALLENATORE');
    athlete = await createActor(ctx, societyId, 'ATLETA');
    guardian = await createActor(ctx, societyId, 'GENITORE');
    stranger = await createActor(ctx, societyId, 'ATLETA');

    athleteMemberId = (await createMember(ctx, societyId, { firstName: 'Sara', lastName: 'Conti', userId: athlete.user.id })).id;
    childId = (await createMember(ctx, societyId, { firstName: 'Anna', lastName: 'Conti' })).id;
    await ctx.prisma.guardianLink.create({ data: { societyId, guardianUserId: guardian.user.id, memberId: childId } });
    strangerMemberId = (await createMember(ctx, societyId, { firstName: 'Elisa', lastName: 'Altra', userId: stranger.user.id })).id;
  });

  afterAll(async () => {
    await ctx.close();
    rmSync(storageDir, { recursive: true, force: true });
  });

  const upload = (
    actor: Actor | null,
    memberId: string,
    options: { type?: string; expiresAt?: string; issuedAt?: string; title?: string; body?: Buffer; contentType?: string } = {},
  ) => {
    const query = new URLSearchParams({ documentTypeId: options.type ?? types.cert, fileName: 'certificato.pdf' });
    if (options.expiresAt) query.set('expiresAt', options.expiresAt);
    if (options.issuedAt) query.set('issuedAt', options.issuedAt);
    if (options.title) query.set('title', options.title);
    return ctx.app.inject({
      method: 'POST',
      url: `${API}/members/${memberId}/documents/upload?${query.toString()}`,
      headers: { ...(actor?.headers ?? {}), 'content-type': options.contentType ?? 'application/pdf' },
      payload: options.body ?? PDF,
    });
  };
  const get = (actor: Actor, url: string) => ctx.app.inject({ method: 'GET', url: `${API}${url}`, headers: actor.headers });
  const adminAlerts = (type: string) => ctx.prisma.notification.findMany({ where: { societyId, type, channel: 'IN_APP' }, orderBy: { createdAt: 'asc' } });
  const filesOnDisk = () => (existsSync(join(storageDir, societyId)) ? readdirSync(join(storageDir, societyId)).length : 0);

  describe('uploading a document in one request', () => {
    it('lets an athlete upload their own certificate: it is on file at once, with its expiry', async () => {
      const response = await upload(athlete, athleteMemberId, { expiresAt: inDays(300), title: 'Visita agonistica' });
      expect(response.statusCode).toBe(201);
      const body = response.json();
      expect(body).toMatchObject({
        memberId: athleteMemberId,
        documentType: { key: 'MEDICAL_CERTIFICATE' },
        title: 'Visita agonistica',
        expiresAt: inDays(300),
        status: 'OK',
        hasFile: true,
        fileName: 'certificato.pdf',
        mimeType: 'application/pdf',
        sizeBytes: PDF.length,
        notes: null,
      });
      expect(body.downloadUrl).toBe(`/api/v1/documents/${body.id}/file`);
      // The athlete can download their own file back.
      const file = await ctx.app.inject({ method: 'GET', url: body.downloadUrl, headers: athlete.headers });
      expect(file.statusCode).toBe(200);
      expect(file.rawPayload.equals(PDF)).toBe(true);
    });

    it('shows up in the administration by itself: member indicators, expiry timeline and the summary', async () => {
      const owner = await createActor(ctx, societyId, 'ATLETA');
      const member = await createMember(ctx, societyId, { firstName: 'Giulia', lastName: 'Rossi', userId: owner.user.id });

      const before = (await get(admin, `/members/${member.id}`)).json();
      expect(before.documents.map((doc: { status: string }) => doc.status)).toEqual(['MISSING', 'MISSING', 'MISSING']);
      expect(before.documentStatus).toBe('MISSING');

      expect((await upload(owner, member.id, { expiresAt: inDays(20) })).statusCode).toBe(201);
      const after = (await get(admin, `/members/${member.id}`)).json();
      expect(after.documents[0]).toMatchObject({ key: 'MEDICAL_CERTIFICATE', status: 'EXPIRING', daysRemaining: 20 });

      const timeline = (await get(admin, '/documents/expirations')).json();
      const names = JSON.stringify(timeline);
      expect(names).toContain(member.id);
    });

    it('lets a guardian upload for their child, and nobody else for somebody else’s member', async () => {
      expect((await upload(guardian, childId, { type: types.privacy })).statusCode).toBe(201);
      // Another athlete, a guardian of another child, and the coach: refused, without revealing the member exists.
      expect((await upload(athlete, strangerMemberId, { type: types.privacy })).statusCode).toBe(404);
      expect((await upload(guardian, athleteMemberId, { type: types.privacy })).statusCode).toBe(404);
      expect((await upload(coach, athleteMemberId, { type: types.privacy })).statusCode).toBe(403);
      expect((await upload(null, athleteMemberId, { type: types.privacy })).statusCode).toBe(401);
    });

    it('lets the secretary upload for any member', async () => {
      const response = await upload(secretary, strangerMemberId, { type: types.form });
      expect(response.statusCode).toBe(201);
      expect(response.json().status).toBe('OK');
    });

    it('requires the expiry of a certificate, refuses dates a type cannot have, and unknown types', async () => {
      const noExpiry = await upload(athlete, athleteMemberId);
      expect(noExpiry.statusCode).toBe(422);
      expect(noExpiry.json().code).toBe('expiry_required');
      const notApplicable = await upload(athlete, athleteMemberId, { type: types.privacy, expiresAt: inDays(10) });
      expect(notApplicable.statusCode).toBe(422);
      expect(notApplicable.json().code).toBe('expiry_not_applicable');
      expect((await upload(athlete, athleteMemberId, { type: 'missing', expiresAt: inDays(10) })).statusCode).toBe(404);
    });

    it('derives the expiry from the issue date and the validity of the type', async () => {
      const response = await upload(athlete, athleteMemberId, { issuedAt: inDays(-10) });
      expect(response.statusCode).toBe(201);
      expect(response.json().expiresAt).toBe(inDays(355));
    });

    it('leaves nothing behind when the file is not what it claims to be', async () => {
      const before = filesOnDisk();
      const documents = await ctx.prisma.document.count({ where: { memberId: athleteMemberId } });
      const fake = await upload(athlete, athleteMemberId, { expiresAt: inDays(100), body: Buffer.from('questo non è un pdf') });
      expect(fake.statusCode).toBe(422);
      expect(fake.json().code).toBe('file_content_mismatch');
      expect((await upload(athlete, athleteMemberId, { expiresAt: inDays(100), body: Buffer.from('ciao'), contentType: 'text/plain' })).statusCode).toBeGreaterThanOrEqual(400);
      expect(filesOnDisk()).toBe(before);
      expect(await ctx.prisma.document.count({ where: { memberId: athleteMemberId } })).toBe(documents);
    });

    it('does not let an athlete edit or delete documents: renewals are new uploads', async () => {
      const created = (await upload(athlete, athleteMemberId, { expiresAt: inDays(200) })).json();
      const patch = await ctx.app.inject({ method: 'PATCH', url: `${API}/documents/${created.id}`, headers: athlete.headers, payload: { expiresAt: inDays(900) } });
      expect(patch.statusCode).toBe(403);
      const del = await ctx.app.inject({ method: 'DELETE', url: `${API}/documents/${created.id}`, headers: athlete.headers });
      expect(del.statusCode).toBe(403);
    });

    it('a renewal with a later expiry makes the certificate current again', async () => {
      const society = await createSociety(ctx, 'Rinnovo ASD');
      await createDefaultDocumentTypes(ctx.prisma, society.id);
      const certificate = await ctx.prisma.documentType.findFirstOrThrow({ where: { societyId: society.id, key: 'MEDICAL_CERTIFICATE' } });
      const owner = await createActor(ctx, society.id, 'ATLETA');
      const member = await createMember(ctx, society.id, { userId: owner.user.id });
      await ctx.prisma.document.create({ data: { societyId: society.id, memberId: member.id, documentTypeId: certificate.id, expiresAt: new Date(`${inDays(-5)}T00:00:00.000Z`) } });
      const own = () => ctx.app.inject({ method: 'GET', url: `${API}/members/${member.id}`, headers: owner.headers });
      expect((await own()).json().documents[0].status).toBe('EXPIRED');
      const renewal = await ctx.app.inject({
        method: 'POST',
        url: `${API}/members/${member.id}/documents/upload?documentTypeId=${certificate.id}&expiresAt=${inDays(360)}&fileName=nuovo.pdf`,
        headers: { ...owner.headers, 'content-type': 'application/pdf' },
        payload: PDF,
      });
      expect(renewal.statusCode).toBe(201);
      expect((await own()).json().documents[0]).toMatchObject({ status: 'OK', expiresAt: inDays(360) });
    });
  });

  describe('the administration is told when an athlete uploads', () => {
    it('notifies admin and segreteria (not the uploader, not the coach), with the document and the expiry', async () => {
      const society = await createSociety(ctx, 'Avvisi Upload ASD');
      await createDefaultDocumentTypes(ctx.prisma, society.id);
      const certificate = await ctx.prisma.documentType.findFirstOrThrow({ where: { societyId: society.id, key: 'MEDICAL_CERTIFICATE' } });
      const owner = await createActor(ctx, society.id, 'ADMIN');
      const desk = await createActor(ctx, society.id, 'SEGRETERIA');
      const trainer = await createActor(ctx, society.id, 'ALLENATORE');
      const player = await createActor(ctx, society.id, 'ATLETA');
      const member = await createMember(ctx, society.id, { firstName: 'Sara', lastName: 'Conti', userId: player.user.id });

      const response = await ctx.app.inject({
        method: 'POST',
        url: `${API}/members/${member.id}/documents/upload?documentTypeId=${certificate.id}&expiresAt=2027-11-27&fileName=c.pdf`,
        headers: { ...player.headers, 'content-type': 'application/pdf' },
        payload: PDF,
      });
      expect(response.statusCode).toBe(201);

      const rows = await ctx.prisma.notification.findMany({ where: { societyId: society.id, type: 'ADMIN_DOCUMENT_UPLOADED', channel: 'IN_APP' } });
      expect(rows.map((row) => row.userId).sort()).toEqual([owner.user.id, desk.user.id].sort());
      expect(rows[0]).toMatchObject({ title: 'Documento caricato', body: 'Sara Conti · Certificato medico · scade il 27 novembre' });
      expect(await ctx.prisma.notification.count({ where: { userId: { in: [trainer.user.id, player.user.id] } } })).toBe(0);
      // The administration sees it in the log of the automation, with no click from anybody.
      const run = await ctx.prisma.automationRun.findFirst({ where: { societyId: society.id, automation: { key: 'admin-alerts' } } });
      expect(run?.status).toBe('SUCCESS');
    });

    it('does not alert when the secretary uploads', async () => {
      const before = (await adminAlerts('ADMIN_DOCUMENT_UPLOADED')).length;
      expect((await upload(secretary, strangerMemberId, { type: types.privacy })).statusCode).toBe(201);
      expect((await adminAlerts('ADMIN_DOCUMENT_UPLOADED')).length).toBe(before);
    });

    it('stays silent while the automation is off, and the upload still works', async () => {
      const society = await createSociety(ctx, 'Allarmi Spenti ASD');
      await createDefaultDocumentTypes(ctx.prisma, society.id);
      const privacy = await ctx.prisma.documentType.findFirstOrThrow({ where: { societyId: society.id, key: 'PRIVACY_CONSENT' } });
      await createActor(ctx, society.id, 'ADMIN');
      const player = await createActor(ctx, society.id, 'ATLETA');
      const member = await createMember(ctx, society.id, { userId: player.user.id });
      await ctx.prisma.automation.create({ data: { societyId: society.id, key: 'admin-alerts', enabled: false } });
      const response = await ctx.app.inject({
        method: 'POST',
        url: `${API}/members/${member.id}/documents/upload?documentTypeId=${privacy.id}`,
        headers: { ...player.headers, 'content-type': 'application/pdf' },
        payload: PDF,
      });
      expect(response.statusCode).toBe(201);
      expect(await ctx.prisma.notification.count({ where: { societyId: society.id } })).toBe(0);
    });
  });

  describe('a recorded payment', () => {
    async function feeIn(society: string, member: string) {
      return ctx.prisma.payment.create({
        data: { societyId: society, memberId: member, description: 'Quota novembre', amountCents: 6000, dueDate: new Date('2026-11-01T00:00:00.000Z') },
      });
    }
    const pay = (actor: Actor, feeId: string, key = randomUUID()) =>
      ctx.app.inject({
        method: 'POST',
        url: `${API}/fees/${feeId}/pay`,
        headers: { ...actor.headers, 'idempotency-key': key },
        payload: { method: 'CASH' },
      });

    it('tells the other administrators, not the one who recorded it', async () => {
      const society = await createSociety(ctx, 'Pagamenti ASD');
      const owner = await createActor(ctx, society.id, 'ADMIN');
      const desk = await createActor(ctx, society.id, 'SEGRETERIA');
      const parent = await createActor(ctx, society.id, 'GENITORE');
      const member = await createMember(ctx, society.id, { firstName: 'Sara', lastName: 'Conti' });
      await ctx.prisma.guardianLink.create({ data: { societyId: society.id, guardianUserId: parent.user.id, memberId: member.id } });
      const fee = await feeIn(society.id, member.id);

      expect((await pay(desk, fee.id)).statusCode).toBe(200);
      const rows = await ctx.prisma.notification.findMany({ where: { societyId: society.id, type: 'ADMIN_PAYMENT_RECEIVED', channel: 'IN_APP' } });
      expect(rows.map((row) => row.userId)).toEqual([owner.user.id]);
      expect(rows[0]).toMatchObject({ title: 'Pagamento ricevuto', body: 'Sara Conti · Quota novembre · € 60' });
      expect(await ctx.prisma.notification.count({ where: { userId: parent.user.id } })).toBe(0);
    });

    it('does not repeat the alert when the same request is replayed', async () => {
      const society = await createSociety(ctx, 'Replay ASD');
      const owner = await createActor(ctx, society.id, 'ADMIN');
      const desk = await createActor(ctx, society.id, 'SEGRETERIA');
      const fee = await feeIn(society.id, (await createMember(ctx, society.id)).id);
      const key = randomUUID();
      expect((await pay(desk, fee.id, key)).statusCode).toBe(200);
      expect((await pay(desk, fee.id, key)).headers['idempotent-replayed']).toBe('true');
      expect(await ctx.prisma.notification.count({ where: { userId: owner.user.id, type: 'ADMIN_PAYMENT_RECEIVED', channel: 'IN_APP' } })).toBe(1);
    });

    it('tells nobody when the only administrator is the one recording', async () => {
      const society = await createSociety(ctx, 'Da Solo ASD');
      const owner = await createActor(ctx, society.id, 'ADMIN');
      const fee = await feeIn(society.id, (await createMember(ctx, society.id)).id);
      expect((await pay(owner, fee.id)).statusCode).toBe(200);
      expect(await ctx.prisma.notification.count({ where: { societyId: society.id } })).toBe(0);
    });
  });
});
