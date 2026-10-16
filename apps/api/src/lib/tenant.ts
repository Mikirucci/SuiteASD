import { Prisma, type PrismaClient } from '@prisma/client';

// Tenant isolation, enforced in one place.
//
// `scopeToTenant(prisma, societyId)` returns a Prisma client whose every model operation is rewritten so it can
// only see / write rows of that society. Module services receive THIS client (`request.db` via `tenantOf`),
// never the raw one, so a forgotten `where: { societyId }` cannot leak data.
//
// Rules applied:
//  - tenant models (every model with a `societyId` column): reads/updates/deletes get `AND societyId = <tenant>`;
//    creates get `societyId` filled in (and must not carry a different one); `societyId` can never be updated.
//  - Society: only the caller's own society is visible; it can be updated, never created/deleted.
//  - User (global identity): readable only if the user has a Membership in the tenant; never writable here.
// Not covered (by design, see docs/API.md): `$queryRaw`/`$executeRaw` and rows reached through nested writes.

type JsonObject = Record<string, unknown>;

export class TenantViolationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TenantViolationError';
  }
}

// Models without a `societyId` column. Any other model must have one (enforced by a test).
// LoginToken belongs to the global identity (User) and is reachable only from the auth module's unscoped client.
export const GLOBAL_MODELS: readonly string[] = ['Society', 'User', 'LoginToken'];

export const TENANT_MODELS: ReadonlySet<string> = new Set(
  Prisma.dmmf.datamodel.models
    .filter((model) => model.fields.some((field) => field.name === 'societyId'))
    .map((model) => model.name),
);

const FILTERED_OPERATIONS = new Set([
  'findFirst',
  'findFirstOrThrow',
  'findMany',
  'findUnique',
  'findUniqueOrThrow',
  'count',
  'aggregate',
  'groupBy',
  'update',
  'updateMany',
  'updateManyAndReturn',
  'delete',
  'deleteMany',
  'upsert',
]);
const READ_OPERATIONS = new Set([
  'findFirst',
  'findFirstOrThrow',
  'findMany',
  'findUnique',
  'findUniqueOrThrow',
  'count',
  'aggregate',
  'groupBy',
]);
const UPDATE_OPERATIONS = new Set(['update', 'updateMany', 'updateManyAndReturn', 'upsert']);
const CREATE_OPERATIONS = new Set(['create', 'createMany', 'createManyAndReturn', 'upsert']);

function isObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function toObject(value: unknown): JsonObject {
  return isObject(value) ? value : {};
}

function toArray(value: unknown): unknown[] {
  if (value === undefined) return [];
  return Array.isArray(value) ? (value as unknown[]) : [value];
}

function withFilter(args: JsonObject, filter: JsonObject): JsonObject {
  const where = toObject(args.where);
  return { ...args, where: { ...where, AND: [...toArray(where.AND), filter] } };
}

function withTenantData(data: unknown, societyId: string): unknown {
  if (Array.isArray(data)) return data.map((item) => withTenantData(item, societyId));
  const row = toObject(data);
  if ('society' in row) {
    throw new TenantViolationError('Set the `societyId` scalar instead of the `society` relation');
  }
  if (row.societyId !== undefined && row.societyId !== societyId) {
    throw new TenantViolationError('Attempt to write a row for a different society');
  }
  return { ...row, societyId };
}

function assertNoTenantChange(data: unknown): void {
  const row = toObject(data);
  if ('societyId' in row || 'society' in row) {
    throw new TenantViolationError('The tenant of an existing row cannot be changed');
  }
}

function filterFor(model: string, societyId: string): JsonObject {
  if (model === 'Society') return { id: societyId };
  if (model === 'User') return { memberships: { some: { societyId } } };
  return { societyId };
}

// Generic only so the result can be handed back to Prisma's typed `query`; the rewrite itself is untyped JSON.
export function applyTenant<A>(model: string, operation: string, args: A, societyId: string): A {
  const input = toObject(args);

  if (model === 'User') {
    if (!READ_OPERATIONS.has(operation)) {
      throw new TenantViolationError(`User is a global model: "${operation}" is not allowed on a tenant client`);
    }
    return withFilter(input, filterFor(model, societyId)) as A;
  }

  if (model === 'Society') {
    if (!READ_OPERATIONS.has(operation) && operation !== 'update') {
      throw new TenantViolationError(`"${operation}" is not allowed on Society through a tenant client`);
    }
    return withFilter(input, filterFor(model, societyId)) as A;
  }

  if (!TENANT_MODELS.has(model)) {
    throw new TenantViolationError(`Model ${model} has no societyId column`);
  }

  let next = input;
  if (FILTERED_OPERATIONS.has(operation)) next = withFilter(next, filterFor(model, societyId));
  if (UPDATE_OPERATIONS.has(operation)) assertNoTenantChange(next.data ?? next.update);
  if (CREATE_OPERATIONS.has(operation)) {
    next =
      operation === 'upsert'
        ? { ...next, create: withTenantData(next.create, societyId) }
        : { ...next, data: withTenantData(next.data, societyId) };
  }
  return next as A;
}

export function scopeToTenant(prisma: PrismaClient, societyId: string) {
  return prisma.$extends({
    name: 'tenant-scope',
    query: {
      $allModels: {
        $allOperations({ model, operation, args, query }) {
          return query(applyTenant(model, operation, args, societyId));
        },
      },
    },
  });
}

export type TenantDb = ReturnType<typeof scopeToTenant>;
