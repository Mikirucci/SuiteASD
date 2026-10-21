import type { Prisma, Trip } from '@prisma/client';
import type { CrudService } from '../../lib/crud-routes.js';
import { notFound } from '../../lib/errors.js';
import { syncLinkedExpense } from '../../lib/ledger-links.js';
import { cursorArgs, toPage } from '../../lib/pagination.js';
import { toIso, toIsoOrNull } from '../../lib/schemas.js';
import type { TenantRequestContext } from '../../plugins/auth.js';
import { tripStatusSchema, tripTransportSchema } from '../../shared/enums.js';
import type { CreateTripBody, ListTripsQuery, TripDto, UpdateTripBody } from './schema.js';

function toDto(trip: Trip): TripDto {
  return {
    id: trip.id,
    eventId: trip.eventId,
    destination: trip.destination,
    departAt: toIso(trip.departAt),
    returnAt: toIsoOrNull(trip.returnAt),
    transport: tripTransportSchema.parse(trip.transport),
    seats: trip.seats,
    costCents: trip.costCents,
    status: tripStatusSchema.parse(trip.status),
    notes: trip.notes,
    createdAt: toIso(trip.createdAt),
    updatedAt: toIso(trip.updatedAt),
  };
}

// Ids received from the client must be checked through the scoped client: a foreign-tenant id looks "not found".
async function assertEventExists({ db }: TenantRequestContext, eventId: string | null | undefined): Promise<void> {
  if (!eventId) return;
  if (!(await db.event.findFirst({ where: { id: eventId }, select: { id: true } }))) throw notFound('Event');
}

// The cost of a trip is an expense of the balance on the day of departure; a cancelled trip costs nothing.
async function syncCost(ctx: TenantRequestContext, trip: Trip): Promise<void> {
  const booked = trip.costCents && trip.status !== 'CANCELLED';
  await syncLinkedExpense({
    db: ctx.db,
    societyId: ctx.auth.societyId,
    userId: ctx.auth.userId,
    source: { tripId: trip.id },
    expense: booked
      ? { category: 'Trasferte', description: trip.destination, amountCents: trip.costCents ?? 0, occurredOn: new Date(Date.UTC(trip.departAt.getUTCFullYear(), trip.departAt.getUTCMonth(), trip.departAt.getUTCDate())) }
      : null,
  });
}

// `undefined` leaves the column untouched, `null` clears it.
function toDate(value: string | null | undefined): Date | null | undefined {
  return typeof value === 'string' ? new Date(value) : value;
}

export const tripService: CrudService<TripDto, CreateTripBody, UpdateTripBody, ListTripsQuery> = {
  async list({ db }, query) {
    const departAt: Prisma.DateTimeFilter = {
      ...(query.from ? { gte: new Date(query.from) } : {}),
      ...(query.to ? { lte: new Date(query.to) } : {}),
    };
    const rows = await db.trip.findMany({
      where: {
        ...(query.status ? { status: query.status } : {}),
        ...(query.eventId ? { eventId: query.eventId } : {}),
        ...(Object.keys(departAt).length > 0 ? { departAt } : {}),
      },
      orderBy: [{ departAt: 'asc' }, { id: 'asc' }],
      ...cursorArgs(query),
    });
    const page = toPage(rows, query);
    return { data: page.data.map(toDto), page: page.page };
  },

  async get({ db }, id) {
    const trip = await db.trip.findFirst({ where: { id } });
    if (!trip) throw notFound('Trip');
    return toDto(trip);
  },

  async create(ctx, body) {
    await assertEventExists(ctx, body.eventId);
    const { departAt, returnAt, ...rest } = body;
    const trip = await ctx.db.trip.create({
      data: { ...rest, societyId: ctx.auth.societyId, departAt: new Date(departAt), returnAt: toDate(returnAt) },
    });
    await syncCost(ctx, trip);
    return toDto(trip);
  },

  async update(ctx, id, body) {
    await assertEventExists(ctx, body.eventId);
    const { departAt, returnAt, ...rest } = body;
    const trip = await ctx.db.trip.update({
      where: { id },
      data: { ...rest, departAt: toDate(departAt) ?? undefined, returnAt: toDate(returnAt) },
    });
    await syncCost(ctx, trip);
    return toDto(trip);
  },

  async remove({ db }, id) {
    const result = await db.trip.deleteMany({ where: { id } });
    if (result.count === 0) throw notFound('Trip');
  },
};
