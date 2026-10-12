import type { Prisma, Sponsor } from '@prisma/client';
import type { CrudService } from '../../lib/crud-routes.js';
import { fromDateOnly, toDateOnlyOrNull } from '../../lib/date-only.js';
import { notFound } from '../../lib/errors.js';
import { cursorArgs, toPage } from '../../lib/pagination.js';
import { toIso } from '../../lib/schemas.js';
import { sponsorStatusSchema } from '../../shared/enums.js';
import type {
  CreateSponsorBody,
  ListSponsorsQuery,
  SponsorDto,
  UpdateSponsorBody,
} from './schema.js';

function toDto(sponsor: Sponsor): SponsorDto {
  return {
    id: sponsor.id,
    name: sponsor.name,
    contactName: sponsor.contactName,
    email: sponsor.email,
    phone: sponsor.phone,
    amountCents: sponsor.amountCents,
    contractStart: toDateOnlyOrNull(sponsor.contractStart),
    contractEnd: toDateOnlyOrNull(sponsor.contractEnd),
    status: sponsorStatusSchema.parse(sponsor.status),
    notes: sponsor.notes,
    createdAt: toIso(sponsor.createdAt),
    updatedAt: toIso(sponsor.updatedAt),
  };
}

// `undefined` leaves the column untouched, `null` clears it.
function toDate(value: string | null | undefined): Date | null | undefined {
  return typeof value === 'string' ? fromDateOnly(value) : value;
}

export const sponsorService: CrudService<SponsorDto, CreateSponsorBody, UpdateSponsorBody, ListSponsorsQuery> = {
  async list({ db }, query) {
    const where: Prisma.SponsorWhereInput = {
      ...(query.q ? { name: { contains: query.q } } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.expiresBefore ? { contractEnd: { lte: fromDateOnly(query.expiresBefore) } } : {}),
    };
    const rows = await db.sponsor.findMany({
      where,
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
      ...cursorArgs(query),
    });
    const page = toPage(rows, query);
    return { data: page.data.map(toDto), page: page.page };
  },

  async get({ db }, id) {
    const sponsor = await db.sponsor.findFirst({ where: { id } });
    if (!sponsor) throw notFound('Sponsor');
    return toDto(sponsor);
  },

  async create({ db, auth }, body) {
    const { contractStart, contractEnd, ...rest } = body;
    const sponsor = await db.sponsor.create({
      data: { ...rest, societyId: auth.societyId, contractStart: toDate(contractStart), contractEnd: toDate(contractEnd) },
    });
    return toDto(sponsor);
  },

  async update({ db }, id, body) {
    const { contractStart, contractEnd, ...rest } = body;
    const sponsor = await db.sponsor.update({
      where: { id },
      data: { ...rest, contractStart: toDate(contractStart), contractEnd: toDate(contractEnd) },
    });
    return toDto(sponsor);
  },

  async remove({ db }, id) {
    const result = await db.sponsor.deleteMany({ where: { id } });
    if (result.count === 0) throw notFound('Sponsor');
  },
};
