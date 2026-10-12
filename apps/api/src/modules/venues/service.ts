import type { Venue } from '@prisma/client';
import { notFound } from '../../lib/errors.js';
import type { CrudService } from '../../lib/crud-routes.js';
import { cursorArgs, toPage } from '../../lib/pagination.js';
import { toIso } from '../../lib/schemas.js';
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
    createdAt: toIso(venue.createdAt),
    updatedAt: toIso(venue.updatedAt),
  };
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

  async create({ db, auth }, body) {
    return toDto(await db.venue.create({ data: { ...body, societyId: auth.societyId } }));
  },

  // A missing / foreign-tenant id makes Prisma throw P2025, mapped to 404 by the error plugin.
  async update({ db }, id, body) {
    return toDto(await db.venue.update({ where: { id }, data: body }));
  },

  async remove({ db }, id) {
    const result = await db.venue.deleteMany({ where: { id } });
    if (result.count === 0) throw notFound('Venue');
  },
};
