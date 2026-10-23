import type { Prisma, Referee } from '@prisma/client';
import type { CrudService } from '../../lib/crud-routes.js';
import { conflict, notFound } from '../../lib/errors.js';
import { LINKED_CATEGORIES, syncLinkedExpense } from '../../lib/ledger-links.js';
import { cursorArgs, toPage } from '../../lib/pagination.js';
import { isUniqueViolation } from '../../lib/prisma-errors.js';
import { toIso, toIsoOrNull } from '../../lib/schemas.js';
import type { TenantRequestContext } from '../../plugins/auth.js';
import type {
  AssignmentDto,
  CreateAssignmentBody,
  CreateRefereeBody,
  ListAssignmentsQuery,
  ListRefereesQuery,
  RefereeDto,
  UpdateAssignmentBody,
  UpdateRefereeBody,
} from './schema.js';

// ---- referees ----------------------------------------------------------------------------------------------

const withCount = { _count: { select: { assignments: true } } } satisfies Prisma.RefereeInclude;
type RefereeRow = Referee & { _count: { assignments: number } };

function toRefereeDto(row: RefereeRow): RefereeDto {
  return {
    id: row.id,
    firstName: row.firstName,
    lastName: row.lastName,
    email: row.email,
    phone: row.phone,
    qualification: row.qualification,
    notes: row.notes,
    assignmentsCount: row._count.assignments,
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
  };
}

export const refereeService: CrudService<RefereeDto, CreateRefereeBody, UpdateRefereeBody, ListRefereesQuery> = {
  async list({ db }, query) {
    const rows = await db.referee.findMany({
      where: query.q ? { OR: [{ firstName: { contains: query.q } }, { lastName: { contains: query.q } }] } : {},
      include: withCount,
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }, { id: 'asc' }],
      ...cursorArgs(query),
    });
    const page = toPage(rows, query);
    return { data: page.data.map(toRefereeDto), page: page.page };
  },

  async get({ db }, id) {
    const row = await db.referee.findFirst({ where: { id }, include: withCount });
    if (!row) throw notFound('Referee');
    return toRefereeDto(row);
  },

  async create({ db, auth }, body) {
    return toRefereeDto(await db.referee.create({ data: { ...body, societyId: auth.societyId }, include: withCount }));
  },

  // A missing / foreign-tenant id makes Prisma throw P2025, mapped to 404 by the error plugin.
  async update({ db }, id, body) {
    return toRefereeDto(await db.referee.update({ where: { id }, data: body, include: withCount }));
  },

  // The designations carry fees and refunds: a referee with history is kept for the accounts.
  async remove({ db }, id) {
    if ((await db.refereeAssignment.count({ where: { refereeId: id } })) > 0) {
      throw conflict('referee_has_assignments', 'The referee has designations: remove them first');
    }
    const result = await db.referee.deleteMany({ where: { id } });
    if (result.count === 0) throw notFound('Referee');
  },
};

// ---- assignments -------------------------------------------------------------------------------------------

const assignmentInclude = {
  referee: { select: { firstName: true, lastName: true } },
  match: {
    select: {
      round: true,
      playedAt: true,
      homeTeam: { select: { name: true } },
      awayTeam: { select: { name: true } },
      group: { select: { name: true, competition: { select: { name: true } } } },
      event: { select: { startsAt: true } },
    },
  },
} satisfies Prisma.RefereeAssignmentInclude;
type AssignmentRow = Prisma.RefereeAssignmentGetPayload<{ include: typeof assignmentInclude }>;

function toAssignmentDto(row: AssignmentRow): AssignmentDto {
  const { match } = row;
  return {
    id: row.id,
    refereeId: row.refereeId,
    refereeName: `${row.referee.firstName} ${row.referee.lastName}`,
    matchId: row.matchId,
    match: {
      homeTeam: match.homeTeam.name,
      awayTeam: match.awayTeam.name,
      round: match.round,
      groupName: match.group.name,
      competitionName: match.group.competition.name,
      date: toIsoOrNull(match.event?.startsAt ?? match.playedAt),
    },
    feeCents: row.feeCents,
    reimbursedAt: toIsoOrNull(row.reimbursedAt),
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
  };
}

const utcDay = (date: Date): Date => new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));

// The fee of a designation is an expense of the balance on the day of the match, kept in step with it.
async function syncFee(ctx: TenantRequestContext, row: AssignmentRow): Promise<void> {
  await syncLinkedExpense({
    db: ctx.db,
    societyId: ctx.auth.societyId,
    userId: ctx.auth.userId,
    source: { refereeAssignmentId: row.id },
    expense: row.feeCents
      ? {
          category: LINKED_CATEGORIES.referee,
          description: `${row.referee.firstName} ${row.referee.lastName} · ${row.match.homeTeam.name} - ${row.match.awayTeam.name}`,
          amountCents: row.feeCents,
          occurredOn: utcDay(row.match.event?.startsAt ?? row.match.playedAt ?? row.createdAt),
        }
      : null,
  });
}

export const assignmentService: CrudService<
  AssignmentDto,
  CreateAssignmentBody,
  UpdateAssignmentBody,
  ListAssignmentsQuery
> = {
  async list({ db }, query) {
    const rows = await db.refereeAssignment.findMany({
      where: {
        ...(query.refereeId ? { refereeId: query.refereeId } : {}),
        ...(query.matchId ? { matchId: query.matchId } : {}),
        ...(query.reimbursed === undefined ? {} : { reimbursedAt: query.reimbursed ? { not: null } : null }),
      },
      include: assignmentInclude,
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
      ...cursorArgs(query),
    });
    const page = toPage(rows, query);
    return { data: page.data.map(toAssignmentDto), page: page.page };
  },

  async get({ db }, id) {
    const row = await db.refereeAssignment.findFirst({ where: { id }, include: assignmentInclude });
    if (!row) throw notFound('Referee designation');
    return toAssignmentDto(row);
  },

  async create(ctx, body) {
    const { db, auth } = ctx;
    // Ids from the client are checked through the scoped client: a foreign-tenant id looks "not found".
    if (!(await db.referee.findFirst({ where: { id: body.refereeId }, select: { id: true } }))) throw notFound('Referee');
    if (!(await db.match.findFirst({ where: { id: body.matchId }, select: { id: true } }))) throw notFound('Match');
    try {
      const row = await db.refereeAssignment.create({
        data: { societyId: auth.societyId, refereeId: body.refereeId, matchId: body.matchId, feeCents: body.feeCents ?? null },
        include: assignmentInclude,
      });
      await syncFee(ctx, row);
      return toAssignmentDto(row);
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw conflict('referee_already_assigned', 'The referee is already designated for this match');
      }
      throw error;
    }
  },

  async update(ctx, id, body) {
    const { reimbursedAt, ...rest } = body;
    const row = await ctx.db.refereeAssignment.update({
      where: { id },
      data: { ...rest, ...(reimbursedAt === undefined ? {} : { reimbursedAt: reimbursedAt === null ? null : new Date(reimbursedAt) }) },
      include: assignmentInclude,
    });
    await syncFee(ctx, row);
    return toAssignmentDto(row);
  },

  async remove({ db }, id) {
    const result = await db.refereeAssignment.deleteMany({ where: { id } });
    if (result.count === 0) throw notFound('Referee designation');
  },
};
