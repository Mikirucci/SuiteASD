import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { createFileStorage } from '../modules/documents/storage.js';
import { purgeAttachmentsOf } from '../modules/attachments/service.js';
import type { AttachmentEntityType } from '../shared/enums.js';
import type { Permission } from '../rbac/permissions.js';
import { bearerSecurity, tenantOf, type TenantRequestContext } from '../plugins/auth.js';
import { problemResponses } from './errors.js';
import { pageSchema, type Page, type PaginationQuery } from './pagination.js';
import { idParamsSchema } from './schemas.js';

// The five operations of a plain CRUD resource. A module implements them in its `service.ts`.
export interface CrudService<Dto, CreateBody, UpdateBody, ListQuery extends PaginationQuery> {
  list(ctx: TenantRequestContext, query: ListQuery): Promise<Page<Dto>>;
  get(ctx: TenantRequestContext, id: string): Promise<Dto>;
  create(ctx: TenantRequestContext, body: CreateBody): Promise<Dto>;
  update(ctx: TenantRequestContext, id: string, body: UpdateBody): Promise<Dto>;
  remove(ctx: TenantRequestContext, id: string): Promise<void>;
}

export interface CrudRoutesConfig<Dto, CreateBody, UpdateBody, ListQuery extends PaginationQuery> {
  // Collection path, e.g. `/venues`; items live at `${path}/:id`.
  path: string;
  tag: string;
  // Singular noun used in OpenAPI summaries, e.g. `venue`.
  noun: string;
  permissions: { read: Permission; write: Permission };
  // Set when files can be attached to the resource: they are deleted together with the record.
  attachmentType?: AttachmentEntityType;
  schemas: {
    dto: z.ZodType<Dto>;
    createBody: z.ZodType<CreateBody>;
    updateBody: z.ZodType<UpdateBody>;
    // Pagination params merged with the module's filters: `paginationQuerySchema.extend({ ... })`.
    listQuery: z.ZodType<ListQuery>;
  };
  service: CrudService<Dto, CreateBody, UpdateBody, ListQuery>;
}

// Registers GET list / GET one / POST / PATCH / DELETE for a resource, with RBAC, Zod validation and OpenAPI.
// Same shape as the reference module (`modules/teams/routes.ts`), written once for the plain CRUD modules.
// The `as` casts on `body`/`query`: Fastify cannot resolve request types of a schema that is a generic parameter and
// types them as an opaque conditional of `T`; the value was already validated by the Zod schema as a `T`.
export function registerCrudRoutes<Dto, CreateBody, UpdateBody, ListQuery extends PaginationQuery>(
  app: FastifyInstance,
  config: CrudRoutesConfig<Dto, CreateBody, UpdateBody, ListQuery>,
): void {
  const { path, tag, noun, permissions, schemas, service, attachmentType } = config;
  const storage = createFileStorage(app.config.STORAGE_DIR);
  const typed = app.withTypeProvider<ZodTypeProvider>();
  const itemPath = `${path}/:id`;

  typed.get(
    path,
    {
      onRequest: [app.requirePermission(permissions.read)],
      schema: {
        tags: [tag],
        summary: `List ${noun}s (cursor pagination)`,
        security: bearerSecurity,
        querystring: schemas.listQuery,
        response: { 200: pageSchema(schemas.dto), ...problemResponses(400, 401, 403, 422) },
      },
    },
    async (request) => service.list(tenantOf(request), request.query as ListQuery),
  );

  typed.get(
    itemPath,
    {
      onRequest: [app.requirePermission(permissions.read)],
      schema: {
        tags: [tag],
        summary: `Get a ${noun}`,
        security: bearerSecurity,
        params: idParamsSchema,
        response: { 200: schemas.dto, ...problemResponses(401, 403, 404) },
      },
    },
    async (request) => service.get(tenantOf(request), request.params.id),
  );

  typed.post(
    path,
    {
      onRequest: [app.requirePermission(permissions.write)],
      schema: {
        tags: [tag],
        summary: `Create a ${noun}`,
        security: bearerSecurity,
        body: schemas.createBody,
        response: { 201: schemas.dto, ...problemResponses(401, 403, 404, 409, 422) },
      },
    },
    async (request, reply) =>
      reply.status(201).send(await service.create(tenantOf(request), request.body as CreateBody)),
  );

  typed.patch(
    itemPath,
    {
      onRequest: [app.requirePermission(permissions.write)],
      schema: {
        tags: [tag],
        summary: `Update a ${noun} (partial)`,
        security: bearerSecurity,
        params: idParamsSchema,
        body: schemas.updateBody,
        response: { 200: schemas.dto, ...problemResponses(401, 403, 404, 409, 422) },
      },
    },
    async (request) => service.update(tenantOf(request), request.params.id, request.body as UpdateBody),
  );

  typed.delete(
    itemPath,
    {
      onRequest: [app.requirePermission(permissions.write)],
      schema: {
        tags: [tag],
        summary: `Delete a ${noun}`,
        security: bearerSecurity,
        params: idParamsSchema,
        response: { 204: z.null(), ...problemResponses(401, 403, 404, 409) },
      },
    },
    async (request, reply) => {
      const ctx = tenantOf(request);
      await service.remove(ctx, request.params.id);
      if (attachmentType) await purgeAttachmentsOf(ctx, attachmentType, request.params.id, storage);
      return reply.status(204).send(null);
    },
  );
}

// PATCH body: every field optional (`null` clears a nullable field), at least one field required.
export function patchBodySchema<Shape extends z.ZodRawShape>(shape: Shape) {
  return z
    .object(shape)
    .partial()
    .refine((body) => Object.keys(body).length > 0, { message: 'At least one field is required' });
}

