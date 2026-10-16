import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { problemResponses, unprocessable } from '../../lib/errors.js';
import { idParamsSchema } from '../../lib/schemas.js';
import { bearerSecurity, tenantOf } from '../../plugins/auth.js';
import { ALLOWED_MIME_TYPES, MAX_UPLOAD_BYTES, createFileStorage, isAllowedMimeType } from '../documents/storage.js';
import { attachmentListSchema, attachmentSchema, listAttachmentsQuerySchema, uploadAttachmentQuerySchema } from './schema.js';
import { createAttachment, deleteAttachment, listAttachments, openAttachment } from './service.js';

export const attachmentRoutes: FastifyPluginAsyncZod = async (app) => {
  const storage = createFileStorage(app.config.STORAGE_DIR);
  const onRequest = [app.requirePermission('attachments:use')];

  // Raw upload, as for the documents of a member: the file is the request body.
  app.addContentTypeParser([...ALLOWED_MIME_TYPES], { parseAs: 'buffer', bodyLimit: MAX_UPLOAD_BYTES }, (_request, body, done) => {
    done(null, body);
  });

  app.get(
    '/attachments',
    {
      onRequest,
      schema: {
        tags: ['Attachments'],
        summary: 'List the files attached to a record (venue, sponsor, trip, kit, staff member, referee, ledger entry)',
        description: 'Allowed to the roles that manage that kind of record; the record must belong to the society.',
        security: bearerSecurity,
        querystring: listAttachmentsQuerySchema,
        response: { 200: attachmentListSchema, ...problemResponses(401, 403, 404, 422) },
      },
    },
    async (request) => ({ data: await listAttachments(tenantOf(request), request.query) }),
  );

  app.post(
    '/attachments',
    {
      onRequest,
      schema: {
        tags: ['Attachments'],
        summary: 'Attach a file to a record',
        description:
          `The request body is the raw file. Content-Type must be one of ${ALLOWED_MIME_TYPES.join(', ')}; ` +
          `maximum ${MAX_UPLOAD_BYTES / (1024 * 1024)} MB. The content is verified against the declared type.`,
        security: bearerSecurity,
        consumes: [...ALLOWED_MIME_TYPES],
        querystring: uploadAttachmentQuerySchema,
        response: { 201: attachmentSchema, ...problemResponses(400, 401, 403, 404, 415, 422) },
      },
    },
    async (request, reply) => {
      const mimeType = (request.headers['content-type'] ?? '').split(';')[0]?.trim().toLowerCase() ?? '';
      if (!isAllowedMimeType(mimeType) || !Buffer.isBuffer(request.body)) {
        throw unprocessable('unsupported_file_type', `Allowed file types: ${ALLOWED_MIME_TYPES.join(', ')}`);
      }
      const created = await createAttachment(tenantOf(request), request.query, { content: request.body, mimeType }, storage);
      return reply.status(201).send(created);
    },
  );

  app.get(
    '/attachments/:id/file',
    {
      onRequest,
      schema: {
        tags: ['Attachments'],
        summary: 'Download an attached file',
        security: bearerSecurity,
        params: idParamsSchema,
        response: {
          200: z.unknown().describe('Binary file (application/pdf, image/jpeg or image/png)'),
          ...problemResponses(401, 403, 404),
        },
      },
    },
    async (request, reply) => {
      const file = await openAttachment(tenantOf(request), request.params.id, storage);
      const asciiName = file.fileName.replace(/[^\x20-\x7e]/g, '_').replaceAll('"', '_');
      return reply
        .header('Content-Type', file.mimeType)
        .header('Content-Length', file.sizeBytes)
        .header('Content-Disposition', `attachment; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(file.fileName)}`)
        .header('Cache-Control', 'private, no-store')
        .send(file.stream);
    },
  );

  app.delete(
    '/attachments/:id',
    {
      onRequest,
      schema: {
        tags: ['Attachments'],
        summary: 'Delete an attached file',
        security: bearerSecurity,
        params: idParamsSchema,
        response: { 204: z.null(), ...problemResponses(401, 403, 404) },
      },
    },
    async (request, reply) => {
      await deleteAttachment(tenantOf(request), request.params.id, storage);
      return reply.status(204).send(null);
    },
  );
};
