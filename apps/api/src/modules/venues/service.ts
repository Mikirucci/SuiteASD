import type { Venue } from '@prisma/client';
import type { CrudService } from '../../lib/crud-routes.js';
import { fromDateOnly, toDateOnly, toDateOnlyOrNull } from '../../lib/date-only.js';
import { notFound } from '../../lib/errors.js';
import { syncLinkedExpense, today } from '../../lib/ledger-links.js';
import { cursorArgs, toPage } from '../../lib/pagination.js';
import { toIso } from '../../lib/schemas.js';
import type { TenantRequestContext } from '../../plugins/auth.js';
import type { CreateVenueBody, ListVenuesQuery, UpdateVenueBody, VenueDto } from './schema.js';

function toDto(venue: Venue): VenueDto {
  return {
    id: venue.id,
    name: venue.name,
    address: venue.address,
    city: venue.city,
    capacity: venue.capacity,
    availability: venue.availability,
    notes: venue.notes,
    costCents: venue.costCents,
    costDate: toDateOnlyOrNull(venue.costDate),
    createdAt: toIso(venue.createdAt),
    updatedAt: toIso(venue.updatedAt),
  };
}

// The cost of a venue is an expense of the balance, kept in step with it.
async function syncCost(ctx: TenantRequestContext, venue: Venue): Promise<void> {
  await syncLinkedExpense({
    db: ctx.db,
    societyId: ctx.auth.societyId,
    userId: ctx.auth.userId,
    source: { venueId: venue.id },
    expense: venue.costCents
      ? { category: 'Palestre', description: venue.name, amountCents: venue.costCents, occurredOn: venue.costDate ?? today() }
      : null,
  });
}

export const venueService: CrudService<VenueDto, CreateVenueBody, UpdateVenueBody, ListVenuesQuery> = {
  async list({ db }, query) {
    const rows = await db.venue.findMany({
      where: query.q ? { OR: [{ name: { contains: query.q } }, { city: { contains: query.q } }] } : {},
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
      ...cursorArgs(query),
    });
    const page = toPage(rows, query);
    return { data: page.data.map(toDto), page: page.page };
  },

  async get({ db }, id) {
    const venue = await db.venue.findFirst({ where: { id } });
    if (!venue) throw notFound('Venue');
    return toDto(venue);
  },

  async create(ctx, body) {
    const { costDate, ...rest } = body;
    const venue = await ctx.db.venue.create({
      data: {
        ...rest,
        societyId: ctx.auth.societyId,
        costDate: body.costCents ? fromDateOnly(costDate ?? toDateOnly(today())) : null,
      },
    });
    await syncCost(ctx, venue);
    return toDto(venue);
  },

  // A missing / foreign-tenant id makes Prisma throw P2025, mapped to 404 by the error plugin.
  async update(ctx, id, body) {
    const current = await ctx.db.venue.findFirst({ where: { id }, select: { costDate: true } });
    if (!current) throw notFound('Venue');
    const { costDate, ...rest } = body;
    // A cost keeps the day it was booked unless a new one is given; removing the cost clears the day
    const bookedOn =
      body.costCents === null
        ? null
        : costDate !== undefined
          ? (costDate === null ? today() : fromDateOnly(costDate))
          : body.costCents && !current.costDate
            ? today()
            : undefined;
    const venue = await ctx.db.venue.update({ where: { id }, data: { ...rest, costDate: bookedOn } });
    await syncCost(ctx, venue);
    return toDto(venue);
  },

  async remove({ db }, id) {
    const result = await db.venue.deleteMany({ where: { id } });
    if (result.count === 0) throw notFound('Venue');
  },
};
