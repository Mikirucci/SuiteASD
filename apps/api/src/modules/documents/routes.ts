import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { problemResponses, unprocessable } from '../../lib/errors.js';
import { pageSchema, paginationQuerySchema } from '../../lib/pagination.js';
import { idParamsSchema } from '../../lib/schemas.js';
import { bearerSecurity, tenantOf } from '../../plugins/auth.js';
import {
  createDocumentBodySchema,
  createDocumentTypeBodySchema,
  documentSchema,
  documentTypeSchema,
  expirationsQuerySchema,
  expirationsSchema,
  updateDocumentBodySchema,
  updateDocumentTypeBodySchema,
  uploadDocumentQuerySchema,
  uploadQuerySchema,
} from './schema.js';
import {
  alertDocumentUploaded,
  createDocument,
  createDocumentType,
  deleteDocument,
  deleteDocumentType,
  getDocument,
  listDocumentTypes,
  listExpirations,
  listMemberDocuments,
  openDocumentFile,
  updateDocument,
  updateDocumentType,
  uploadDocumentFile,
  uploadMemberDocument,
} from './service.js';
import { ALLOWED_MIME_TYPES, MAX_UPLOAD_BYTES, createFileStorage, isAllowedMimeType } from './storage.js';

export const documentRoutes: FastifyPluginAsyncZod = async (app) => {
  const storage = createFileStorage(app.config.STORAGE_DIR);

  // Raw upload: the file is the request body (no multipart dependency). Only these types are parsed.
  app.addContentTypeParser([...ALLOWED_MIME_TYPES], { parseAs: 'buffer', bodyLimit: MAX_UPLOAD_BYTES }, (_request, body, done) => {
    done(null, body);
  });

  // ---- Document types ----------------------------------------------------------------------------------------

  app.get(
    '/document-types',
    {
      onRequest: [app.requirePermission('documents:readOwn')],
      schema: {
        tags: ['Documents'],
        summary: 'List document types (certificate, enrolment form, privacy...)',
        security: bearerSecurity,
        querystring: paginationQuerySchema,
        response: { 200: pageSchema(documentTypeSchema), ...problemResponses(400, 401, 403, 422) },
      },
    },
    async (request) => listDocumentTypes(tenantOf(request), request.query),
  );

  app.post(
    '/document-types',
    {
      onRequest: [app.requirePermission('documents:write')],
      schema: {
        tags: ['Documents'],
        summary: 'Create a document type',
        security: bearerSecurity,
        body: createDocumentTypeBodySchema,
        response: { 201: documentTypeSchema, ...problemResponses(401, 403, 409, 422) },
      },
    },
    async (request, reply) => reply.status(201).send(await createDocumentType(tenantOf(request), request.body)),
  );

  app.patch(
    '/document-types/:id',
    {
      onRequest: [app.requirePermission('documents:write')],
      schema: {
        tags: ['Documents'],
        summary: 'Update a document type (partial)',
        security: bearerSecurity,
        params: idParamsSchema,
        body: updateDocumentTypeBodySchema,
        response: { 200: documentTypeSchema, ...problemResponses(401, 403, 404, 409, 422) },
      },
    },
    async (request) => updateDocumentType(tenantOf(request), request.params.id, request.body),
  );

  app.delete(
    '/document-types/:id',
    {
      onRequest: [app.requirePermission('documents:write')],
      schema: {
        tags: ['Documents'],
        summary: 'Delete an unused document type',
        security: bearerSecurity,
        params: idParamsSchema,
        response: { 204: z.null(), ...problemResponses(401, 403, 404, 409) },
      },
    },
    async (request, reply) => {
      await deleteDocumentType(tenantOf(request), request.params.id);
      return reply.status(204).send(null);
    },
  );

  // ---- Documents of a member ---------------------------------------------------------------------------------

  app.get(
    '/members/:id/documents',
    {
      onRequest: [app.requirePermission('documents:readOwn')],
      schema: {
        tags: ['Documents'],
        summary: 'List the documents of a member (athletes and guardians: only their own)',
        security: bearerSecurity,
        params: idParamsSchema,
        querystring: paginationQuerySchema,
        response: { 200: pageSchema(documentSchema), ...problemResponses(400, 401, 403, 404, 422) },
      },
    },
    async (request) => listMemberDocuments(tenantOf(request), request.params.id, request.query),
  );

  app.post(
    '/members/:id/documents',
    {
      onRequest: [app.requirePermission('documents:write')],
      schema: {
        tags: ['Documents'],
        summary: 'Register a document for a member (upload the file with PUT /documents/{id}/file)',
        security: bearerSecurity,
        params: idParamsSchema,
        body: createDocumentBodySchema,
        response: { 201: documentSchema, ...problemResponses(401, 403, 404, 422) },
      },
    },
    async (request, reply) => reply.status(201).send(await createDocument(tenantOf(request), request.params.id, request.body)),
  );

  app.post(
    '/members/:id/documents/upload',
    {
      onRequest: [app.requirePermission('documents:readOwn')],
      schema: {
        tags: ['Documents'],
        summary: 'Upload a document for a member in one request (the secretary, or the athlete or guardian of that member)',
        description:
          'The request body is the raw file; the document type, dates and title travel in the query string. The record and ' +
          'the file are created together. When an athlete or guardian uploads, the administration is notified. ' +
          `Content-Type must be one of ${ALLOWED_MIME_TYPES.join(', ')}; maximum ${MAX_UPLOAD_BYTES / (1024 * 1024)} MB.`,
        security: bearerSecurity,
        consumes: [...ALLOWED_MIME_TYPES],
        params: idParamsSchema,
        querystring: uploadDocumentQuerySchema,
        response: { 201: documentSchema, ...problemResponses(400, 401, 403, 404, 415, 422) },
      },
    },
    async (request, reply) => {
      const mimeType = (request.headers['content-type'] ?? '').split(';')[0]?.trim().toLowerCase() ?? '';
      if (!isAllowedMimeType(mimeType) || !Buffer.isBuffer(request.body)) {
        throw unprocessable('unsupported_file_type', `Allowed file types: ${ALLOWED_MIME_TYPES.join(', ')}`);
      }
      const ctx = tenantOf(request);
      const uploaded = await uploadMemberDocument(ctx, request.params.id, request.query, { content: request.body, mimeType }, storage);
      await alertDocumentUploaded(ctx, uploaded, request.log);
      return reply.status(201).send(uploaded.document);
    },
  );

  // ---- Expiry timeline (declared before /documents/:id: static segments win anyway) ---------------------------

  app.get(
    '/documents/expirations',
    {
      onRequest: [app.requirePermission('documents:readOwn')],
      schema: {
        tags: ['Documents'],
        summary: 'Expiry timeline grouped by month, with days remaining',
        description:
          'Only the current document of each member and type counts. Items already expired before the window are listed in `overdue`. ' +
          'Athletes and guardians see only their own documents.',
        security: bearerSecurity,
        querystring: expirationsQuerySchema,
        response: { 200: expirationsSchema, ...problemResponses(401, 403, 422) },
      },
    },
    async (request) => listExpirations(tenantOf(request), request.query),
  );

  app.get(
    '/documents/:id',
    {
      onRequest: [app.requirePermission('documents:readOwn')],
      schema: {
        tags: ['Documents'],
        summary: 'Get a document',
        security: bearerSecurity,
        params: idParamsSchema,
        response: { 200: documentSchema, ...problemResponses(401, 403, 404) },
      },
    },
    async (request) => getDocument(tenantOf(request), request.params.id),
  );

  app.patch(
    '/documents/:id',
    {
      onRequest: [app.requirePermission('documents:write')],
      schema: {
        tags: ['Documents'],
        summary: 'Update a document (partial)',
        security: bearerSecurity,
        params: idParamsSchema,
        body: updateDocumentBodySchema,
        response: { 200: documentSchema, ...problemResponses(401, 403, 404, 422) },
      },
    },
    async (request) => updateDocument(tenantOf(request), request.params.id, request.body),
  );

  app.delete(
    '/documents/:id',
    {
      onRequest: [app.requirePermission('documents:write')],
      schema: {
        tags: ['Documents'],
        summary: 'Delete a document and its file',
        security: bearerSecurity,
        params: idParamsSchema,
        response: { 204: z.null(), ...problemResponses(401, 403, 404) },
      },
    },
    async (request, reply) => {
      await deleteDocument(tenantOf(request), request.params.id, storage);
      return reply.status(204).send(null);
    },
  );

  // ---- Files -------------------------------------------------------------------------------------------------

  app.put(
    '/documents/:id/file',
    {
      onRequest: [app.requirePermission('documents:write')],
      schema: {
        tags: ['Documents'],
        summary: 'Upload (or replace) the file of a document',
        description:
          `The request body is the raw file. Content-Type must be one of ${ALLOWED_MIME_TYPES.join(', ')}; ` +
          `maximum ${MAX_UPLOAD_BYTES / (1024 * 1024)} MB. The content is verified against the declared type.`,
        security: bearerSecurity,
        consumes: [...ALLOWED_MIME_TYPES],
        params: idParamsSchema,
        querystring: uploadQuerySchema,
        response: { 200: documentSchema, ...problemResponses(400, 401, 403, 404, 415, 422) },
      },
    },
    async (request) => {
      const mimeType = (request.headers['content-type'] ?? '').split(';')[0]?.trim().toLowerCase() ?? '';
      if (!isAllowedMimeType(mimeType) || !Buffer.isBuffer(request.body)) {
        throw unprocessable('unsupported_file_type', `Allowed file types: ${ALLOWED_MIME_TYPES.join(', ')}`);
      }
      return uploadDocumentFile(
        tenantOf(request),
        request.params.id,
        { content: request.body, mimeType, fileName: request.query.fileName },
        storage,
      );
    },
  );

  app.get(
    '/documents/:id/file',
    {
      onRequest: [app.requirePermission('documents:readOwn')],
      schema: {
        tags: ['Documents'],
        summary: 'Download the file of a document (authorized, access is logged)',
        description:
          'Only the secretary and the member\'s own athlete / guardian may download. Coaches and staff see the document status only. ' +
          'Send the Bearer token: fetch the file as a blob in the client.',
        security: bearerSecurity,
        params: idParamsSchema,
        response: { 200: z.unknown().describe('Binary file (application/pdf, image/jpeg or image/png)'), ...problemResponses(401, 403, 404) },
      },
    },
    async (request, reply) => {
      const file = await openDocumentFile(tenantOf(request), request.params.id, storage, (entry) => {
        request.log.info(entry, 'sensitive document accessed');
      });
      const asciiName = file.fileName.replace(/[^\x20-\x7e]/g, '_').replaceAll('"', '_');
      return reply
        .header('Content-Type', file.mimeType)
        .header('Content-Length', file.sizeBytes)
        .header('Content-Disposition', `attachment; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(file.fileName)}`)
        .header('Cache-Control', 'private, no-store')
        .send(file.stream);
    },
  );
};
