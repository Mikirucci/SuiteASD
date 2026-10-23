import type { Prisma } from '@prisma/client';
import { conflict, notFound } from '../../lib/errors.js';
import { cursorArgs, toPage, type Page, type PaginationQuery } from '../../lib/pagination.js';
import { isUniqueViolation } from '../../lib/prisma-errors.js';
import { toIso } from '../../lib/schemas.js';
import type { TenantRequestContext } from '../../plugins/auth.js';
import { sportSchema, teamGenderSchema } from '../../shared/enums.js';
import { syncMemberEntitlements } from '../members/entitlements.js';
import type {
  AddTeamMembersBody,
  AddTeamMembersResult,
  CreateTeamBody,
  ListTeamsQuery,
  TeamDto,
  UpdateTeamBody,
} from './schema.js';

// Services receive the tenant context ({ db, auth }): `db` is already limited to the caller's society.
// They throw AppError for expected failures; the error plugin turns them into RFC 7807 responses.

const withCounts = {
  _count: { select: { memberships: { where: { leftAt: null } } } },
} satisfies Prisma.TeamInclude;

type TeamRow = Prisma.TeamGetPayload<{ include: typeof withCounts }>;

function toDto(team: TeamRow): TeamDto {
  return {
    id: team.id,
    name: team.name,
    category: team.category,
    sport: sportSchema.parse(team.sport),
    gender: team.gender === null ? null : teamGenderSchema.parse(team.gender),
    description: team.description,
    seasonId: team.seasonId,
    membersCount: team._count.memberships,
    createdAt: toIso(team.createdAt),
    updatedAt: toIso(team.updatedAt),
  };
}

// Ids received from the client must be checked through the scoped client: a foreign-tenant id looks "not found".
async function assertSeasonExists({ db }: TenantRequestContext, seasonId: string | null | undefined): Promise<void> {
  if (!seasonId) return;
  if (!(await db.season.findFirst({ where: { id: seasonId }, select: { id: true } }))) throw notFound('Season');
}

export async function listTeams(
  { db }: TenantRequestContext,
  filters: ListTeamsQuery,
  query: PaginationQuery,
): Promise<Page<TeamDto>> {
  const rows = await db.team.findMany({
    where: {
      ...(filters.q ? { name: { contains: filters.q } } : {}),
      ...(filters.category ? { category: filters.category } : {}),
    },
    include: withCounts,
    orderBy: [{ name: 'asc' }, { id: 'asc' }],
    ...cursorArgs(query),
  });
  const page = toPage(rows, query);
  return { data: page.data.map(toDto), page: page.page };
}

export async function getTeam({ db }: TenantRequestContext, id: string): Promise<TeamDto> {
  const team = await db.team.findFirst({ where: { id }, include: withCounts });
  if (!team) throw notFound('Team');
  return toDto(team);
}

export async function createTeam(ctx: TenantRequestContext, body: CreateTeamBody): Promise<TeamDto> {
  await assertSeasonExists(ctx, body.seasonId);
  try {
    const team = await ctx.db.team.create({
      data: { ...body, societyId: ctx.auth.societyId },
      include: withCounts,
    });
    return toDto(team);
  } catch (error) {
    if (isUniqueViolation(error)) throw conflict('team_name_taken', `A team named "${body.name}" already exists`);
    throw error;
  }
}

export async function updateTeam(ctx: TenantRequestContext, id: string, body: UpdateTeamBody): Promise<TeamDto> {
  await assertSeasonExists(ctx, body.seasonId);
  try {
    // A missing / foreign-tenant id makes Prisma throw P2025, mapped to 404 by the error plugin.
    const team = await ctx.db.team.update({ where: { id }, data: body, include: withCounts });
    return toDto(team);
  } catch (error) {
    if (isUniqueViolation(error)) throw conflict('team_name_taken', 'A team with this name already exists');
    throw error;
  }
}

export async function deleteTeam({ db }: TenantRequestContext, id: string): Promise<void> {
  const result = await db.team.deleteMany({ where: { id } });
  if (result.count === 0) throw notFound('Team');
}

// Adds many members at once. Leaving a team keeps its row (history), so joining again reopens it.
export async function addTeamMembers(
  ctx: TenantRequestContext,
  teamId: string,
  body: AddTeamMembersBody,
): Promise<AddTeamMembersResult> {
  const { db } = ctx;
  if (!(await db.team.findFirst({ where: { id: teamId }, select: { id: true } }))) throw notFound('Team');
  const wanted = [...new Set(body.memberIds)];
  const found = await db.member.findMany({ where: { id: { in: wanted } }, select: { id: true } });
  if (found.length !== wanted.length) throw notFound('Member');
  const inside = await db.teamMembership.findMany({
    where: { teamId, memberId: { in: wanted }, leftAt: null },
    select: { memberId: true },
  });
  const already = new Set(inside.map((membership) => membership.memberId));
  const entering = wanted.filter((memberId) => !already.has(memberId));
  const now = new Date();
  for (const memberId of entering) {
    await db.teamMembership.upsert({
      where: { teamId_memberId: { teamId, memberId } },
      create: { societyId: ctx.auth.societyId, teamId, memberId, joinedAt: now },
      update: { leftAt: null, joinedAt: now },
    });
    // Entering a team brings the upcoming events and the fees set up for it
    await syncMemberEntitlements(db, ctx.auth.societyId, memberId, now);
  }
  return { added: entering.length, alreadyInTeam: already.size };
}
