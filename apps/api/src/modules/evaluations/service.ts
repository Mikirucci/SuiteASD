import type { Prisma } from '@prisma/client';
import { z } from 'zod';
import { conflict, forbidden, notFound, unprocessable } from '../../lib/errors.js';
import { cursorArgs, toPage, type Page, type PaginationQuery } from '../../lib/pagination.js';
import { toIso, toIsoOrNull } from '../../lib/schemas.js';
import type { TenantRequestContext } from '../../plugins/auth.js';
import { can } from '../../rbac/permissions.js';
import { ownMemberIds } from '../members/access.js';
import { createNotification } from '../notifications/service.js';
import type {
  EvaluationDto,
  HistoryItemDto,
  ListSummariesQuery,
  MemberSummaryDto,
  PublishResultDto,
  PutEvaluationBody,
  PutStatsBody,
  ReportCardsDto,
  StatsDto,
} from './schema.js';
import {
  formatRating,
  pickMvpMemberIds,
  summarizeEvaluations,
  type StatLine,
  type SummaryEntry,
} from './rules.js';

// ---- access (ABAC) -----------------------------------------------------------------------------
// evaluations:read (admin, coach) sees every report card, drafts included. evaluations:readOwn (athlete, guardian)
// sees only PUBLISHED report cards of their own member record / linked children.

type Access = { all: true } | { all: false; memberIds: ReadonlySet<string> };

async function accessOf(ctx: TenantRequestContext): Promise<Access> {
  if (can(ctx.auth.roles, 'evaluations:read')) return { all: true };
  if (can(ctx.auth.roles, 'evaluations:readOwn')) return { all: false, memberIds: await ownMemberIds(ctx) };
  throw forbidden();
}

function canSee(access: Access, memberId: string): boolean {
  return access.all || access.memberIds.has(memberId);
}

// ---- mapping -----------------------------------------------------------------------------------

type EvaluationRow = Prisma.PlayerEvaluationGetPayload<object>;
type StatsRow = Prisma.PlayerMatchStatsGetPayload<object>;

const extraSchema = z.object({ receptions: z.number().int().min(0), errors: z.number().int().min(0) });

function statLineOf(row: StatsRow): StatLine {
  const extra = extraSchema.safeParse(row.extra);
  return {
    attackPoints: row.attackPoints,
    aces: row.aces,
    blocks: row.blocks,
    receptions: extra.success ? extra.data.receptions : 0,
    errors: extra.success ? extra.data.errors : 0,
  };
}

function toEvaluationDto(row: EvaluationRow): EvaluationDto {
  return {
    id: row.id,
    matchId: row.matchId,
    memberId: row.memberId,
    rating: row.rating,
    notes: row.notes,
    isMvp: row.isMvp,
    published: row.publishedAt !== null,
    publishedAt: toIsoOrNull(row.publishedAt),
    authorId: row.authorId,
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
  };
}

function toStatsDto(row: StatsRow): StatsDto {
  return { matchId: row.matchId, memberId: row.memberId, ...statLineOf(row), updatedAt: toIso(row.updatedAt) };
}

const matchInclude = { homeTeam: true, awayTeam: true, group: { include: { competition: true } } } satisfies Prisma.MatchInclude;
type MatchRow = Prisma.MatchGetPayload<{ include: typeof matchInclude }>;

// "Aquile Volley 3–1 Delfini Volley" (en dash, as in the SPEC notification text).
function matchLabel(match: Pick<MatchRow, 'homeTeam' | 'awayTeam' | 'homeSets' | 'awaySets'>): string {
  return `${match.homeTeam.name} ${match.homeSets ?? '-'}–${match.awaySets ?? '-'} ${match.awayTeam.name}`;
}

async function requireMatch({ db }: TenantRequestContext, id: string): Promise<MatchRow> {
  const match = await db.match.findFirst({ where: { id }, include: matchInclude });
  if (!match) throw notFound('Match');
  return match;
}

function requirePlayed(match: MatchRow): void {
  if (match.status !== 'PLAYED') throw conflict('match_not_played', 'Report cards can only be written for a played match');
}

// The players of OUR team(s) in the match: current and former members of the team roster.
async function squadMemberIds({ db }: TenantRequestContext, match: MatchRow): Promise<Set<string>> {
  const teamIds = [match.homeTeam.teamId, match.awayTeam.teamId].filter((id): id is string => id !== null);
  if (teamIds.length === 0) return new Set();
  const rows = await db.teamMembership.findMany({ where: { teamId: { in: teamIds } }, select: { memberId: true } });
  return new Set(rows.map((row) => row.memberId));
}

async function assertPlayerOfMatch(ctx: TenantRequestContext, match: MatchRow, memberId: string): Promise<void> {
  if (!(await ctx.db.member.findFirst({ where: { id: memberId }, select: { id: true } }))) throw notFound('Member');
  if (!(await squadMemberIds(ctx, match)).has(memberId)) {
    throw unprocessable('member_not_in_squad', 'The member does not belong to the team that played this match');
  }
}

// ---- MVP ---------------------------------------------------------------------------------------

async function recomputeMvp({ db }: TenantRequestContext, matchId: string): Promise<void> {
  const rows = await db.playerEvaluation.findMany({ where: { matchId }, select: { memberId: true, rating: true } });
  const mvp = pickMvpMemberIds(rows);
  await db.playerEvaluation.updateMany({ where: { matchId, memberId: { in: [...mvp] } }, data: { isMvp: true } });
  await db.playerEvaluation.updateMany({ where: { matchId, memberId: { notIn: [...mvp] } }, data: { isMvp: false } });
}

// ---- report cards of a match -------------------------------------------------------------------

export async function getReportCards(ctx: TenantRequestContext, matchId: string): Promise<ReportCardsDto> {
  const access = await accessOf(ctx);
  const match = await requireMatch(ctx, matchId);
  const [evaluations, stats] = await Promise.all([
    ctx.db.playerEvaluation.findMany({ where: { matchId } }),
    ctx.db.playerMatchStats.findMany({ where: { matchId } }),
  ]);

  const visibleEvaluations = evaluations.filter((row) => access.all || (row.publishedAt !== null && canSee(access, row.memberId)));
  const evaluationByMember = new Map(visibleEvaluations.map((row) => [row.memberId, row]));
  // Players only see their statistics together with the published report card.
  const statsByMember = new Map(
    stats.filter((row) => access.all || evaluationByMember.has(row.memberId)).map((row) => [row.memberId, row]),
  );

  const memberIds = new Set([...evaluationByMember.keys(), ...statsByMember.keys()]);
  if (access.all) for (const id of await squadMemberIds(ctx, match)) memberIds.add(id);

  const members = await ctx.db.member.findMany({
    where: { id: { in: [...memberIds] } },
    select: { id: true, firstName: true, lastName: true, fieldRole: true },
    orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }, { id: 'asc' }],
  });
  return {
    matchId,
    label: matchLabel(match),
    data: members.map((member) => {
      const evaluation = evaluationByMember.get(member.id);
      const statsRow = statsByMember.get(member.id);
      return {
        member,
        evaluation: evaluation ? toEvaluationDto(evaluation) : null,
        stats: statsRow ? toStatsDto(statsRow) : null,
      };
    }),
  };
}

// ---- writing -----------------------------------------------------------------------------------

export async function putEvaluation(
  ctx: TenantRequestContext,
  matchId: string,
  memberId: string,
  body: PutEvaluationBody,
): Promise<EvaluationDto> {
  const match = await requireMatch(ctx, matchId);
  requirePlayed(match);
  await assertPlayerOfMatch(ctx, match, memberId);

  const existing = await ctx.db.playerEvaluation.findFirst({ where: { matchId, memberId } });
  const saved = existing
    ? await ctx.db.playerEvaluation.update({ where: { id: existing.id }, data: { rating: body.rating, notes: body.notes } })
    : await ctx.db.playerEvaluation.create({
        data: {
          societyId: ctx.auth.societyId,
          matchId,
          memberId,
          authorId: ctx.auth.userId,
          rating: body.rating,
          notes: body.notes ?? null,
        },
      });
  await recomputeMvp(ctx, matchId);
  return toEvaluationDto(await ctx.db.playerEvaluation.findFirstOrThrow({ where: { id: saved.id } }));
}

export async function deleteEvaluation(ctx: TenantRequestContext, matchId: string, memberId: string): Promise<void> {
  await requireMatch(ctx, matchId);
  const result = await ctx.db.playerEvaluation.deleteMany({ where: { matchId, memberId } });
  if (result.count === 0) throw notFound('Report card');
  await recomputeMvp(ctx, matchId);
}

export async function putStats(
  ctx: TenantRequestContext,
  matchId: string,
  memberId: string,
  body: PutStatsBody,
): Promise<StatsDto> {
  const match = await requireMatch(ctx, matchId);
  requirePlayed(match);
  await assertPlayerOfMatch(ctx, match, memberId);

  const data = {
    attackPoints: body.attackPoints,
    aces: body.aces,
    blocks: body.blocks,
    extra: { receptions: body.receptions, errors: body.errors },
  };
  const existing = await ctx.db.playerMatchStats.findFirst({ where: { matchId, memberId }, select: { id: true } });
  const saved = existing
    ? await ctx.db.playerMatchStats.update({ where: { id: existing.id }, data })
    : await ctx.db.playerMatchStats.create({ data: { societyId: ctx.auth.societyId, matchId, memberId, ...data } });
  return toStatsDto(saved);
}

export async function deleteStats(ctx: TenantRequestContext, matchId: string, memberId: string): Promise<void> {
  await requireMatch(ctx, matchId);
  const result = await ctx.db.playerMatchStats.deleteMany({ where: { matchId, memberId } });
  if (result.count === 0) throw notFound('Statistics');
}

// ---- publication -------------------------------------------------------------------------------

// Publishes every draft report card of the match and notifies the player and the linked guardians
// (SPEC 06/07: "Pagella pubblicata - Aquile 3-1 Delfini · voto 8,5"). Already published cards are untouched,
// so calling it twice never notifies twice.
export async function publishEvaluations(ctx: TenantRequestContext, matchId: string): Promise<PublishResultDto> {
  const match = await requireMatch(ctx, matchId);
  requirePlayed(match);

  const drafts = await ctx.db.playerEvaluation.findMany({ where: { matchId, publishedAt: null }, orderBy: { id: 'asc' } });
  if (drafts.length === 0) return { publishedCount: 0, evaluations: [] };

  const draftIds = drafts.map((row) => row.id);
  await ctx.db.playerEvaluation.updateMany({
    where: { id: { in: draftIds }, publishedAt: null },
    data: { publishedAt: new Date() },
  });
  const published = await ctx.db.playerEvaluation.findMany({
    where: { id: { in: draftIds }, publishedAt: { not: null } },
    orderBy: { id: 'asc' },
  });

  const members = await ctx.db.member.findMany({
    where: { id: { in: published.map((row) => row.memberId) } },
    select: { id: true, userId: true, guardianLinks: { select: { guardianUserId: true } } },
  });
  const recipients = new Map(
    members.map((member) => [
      member.id,
      [...(member.userId ? [member.userId] : []), ...member.guardianLinks.map((link) => link.guardianUserId)],
    ]),
  );
  const label = matchLabel(match);
  for (const row of published) {
    await createNotification(ctx.db, {
      societyId: ctx.auth.societyId,
      userIds: recipients.get(row.memberId) ?? [],
      type: 'EVALUATION_PUBLISHED',
      title: 'Pagella pubblicata',
      body: `${label} · voto ${formatRating(row.rating)}`,
      data: { matchId, memberId: row.memberId, evaluationId: row.id, rating: row.rating },
    });
  }
  return { publishedCount: published.length, evaluations: published.map(toEvaluationDto) };
}

// ---- history and season aggregates -------------------------------------------------------------

function seasonFilter(seasonId: string | undefined): Prisma.PlayerEvaluationWhereInput {
  return seasonId ? { match: { group: { competition: { seasonId } } } } : {};
}

async function requireVisibleMember(ctx: TenantRequestContext, access: Access, memberId: string) {
  // A player asking for somebody else's data gets 404, exactly like a member of another society.
  const member = canSee(access, memberId)
    ? await ctx.db.member.findFirst({
        where: { id: memberId },
        select: { id: true, firstName: true, lastName: true, fieldRole: true },
      })
    : null;
  if (!member) throw notFound('Member');
  return member;
}

async function statsFor(ctx: TenantRequestContext, memberIds: string[], matchIds: string[]): Promise<Map<string, StatsRow>> {
  if (memberIds.length === 0 || matchIds.length === 0) return new Map();
  const rows = await ctx.db.playerMatchStats.findMany({ where: { memberId: { in: memberIds }, matchId: { in: matchIds } } });
  return new Map(rows.map((row) => [`${row.matchId}:${row.memberId}`, row]));
}

export async function getMemberHistory(
  ctx: TenantRequestContext,
  memberId: string,
  seasonId: string | undefined,
  query: PaginationQuery,
): Promise<Page<HistoryItemDto>> {
  const access = await accessOf(ctx);
  await requireVisibleMember(ctx, access, memberId);
  const rows = await ctx.db.playerEvaluation.findMany({
    where: { memberId, ...(access.all ? {} : { publishedAt: { not: null } }), ...seasonFilter(seasonId) },
    include: { match: { include: { homeTeam: true, awayTeam: true } } },
    orderBy: [{ match: { playedAt: 'desc' } }, { id: 'asc' }],
    ...cursorArgs(query),
  });
  const page = toPage(rows, query);
  const stats = await statsFor(ctx, [memberId], page.data.map((row) => row.matchId));
  return {
    data: page.data.map((row) => {
      const statsRow = stats.get(`${row.matchId}:${memberId}`);
      return {
        matchId: row.matchId,
        round: row.match.round,
        playedAt: toIsoOrNull(row.match.playedAt),
        label: matchLabel(row.match),
        evaluation: toEvaluationDto(row),
        stats: statsRow ? toStatsDto(statsRow) : null,
      };
    }),
    page: page.page,
  };
}

type EvaluationWithMatch = Prisma.PlayerEvaluationGetPayload<{ include: { match: { select: { playedAt: true } } } }>;

function toSummaryEntries(rows: EvaluationWithMatch[], stats: Map<string, StatsRow>): SummaryEntry[] {
  return rows.map((row) => {
    const statsRow = stats.get(`${row.matchId}:${row.memberId}`);
    return {
      matchId: row.matchId,
      playedAt: row.match.playedAt,
      rating: row.rating,
      isMvp: row.isMvp,
      stats: statsRow ? statLineOf(statsRow) : null,
    };
  });
}

function toSummaryDto(summary: ReturnType<typeof summarizeEvaluations>) {
  return { ...summary, trend: summary.trend.map((point) => ({ ...point, playedAt: toIsoOrNull(point.playedAt) })) };
}

// Aggregates only count PUBLISHED report cards, for staff and players alike, so everybody sees the same numbers.
export async function getMemberSummary(
  ctx: TenantRequestContext,
  memberId: string,
  seasonId: string | undefined,
): Promise<MemberSummaryDto> {
  const access = await accessOf(ctx);
  const member = await requireVisibleMember(ctx, access, memberId);
  const rows = await ctx.db.playerEvaluation.findMany({
    where: { memberId, publishedAt: { not: null }, ...seasonFilter(seasonId) },
    include: { match: { select: { playedAt: true } } },
  });
  const stats = await statsFor(ctx, [memberId], rows.map((row) => row.matchId));
  return { member, ...toSummaryDto(summarizeEvaluations(toSummaryEntries(rows, stats))) };
}

// Team comparison for the coach: one summary per player with at least one published report card.
export async function listMemberSummaries(
  ctx: TenantRequestContext,
  filters: ListSummariesQuery,
  query: PaginationQuery,
): Promise<Page<MemberSummaryDto>> {
  const members = await ctx.db.member.findMany({
    where: {
      ...(filters.teamId ? { teamMemberships: { some: { teamId: filters.teamId } } } : {}),
      evaluations: { some: { publishedAt: { not: null }, ...seasonFilter(filters.seasonId) } },
    },
    select: { id: true, firstName: true, lastName: true, fieldRole: true },
    orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }, { id: 'asc' }],
    ...cursorArgs(query),
  });
  const page = toPage(members, query);
  const memberIds = page.data.map((member) => member.id);
  const rows = await ctx.db.playerEvaluation.findMany({
    where: { memberId: { in: memberIds }, publishedAt: { not: null }, ...seasonFilter(filters.seasonId) },
    include: { match: { select: { playedAt: true } } },
  });
  const stats = await statsFor(ctx, memberIds, [...new Set(rows.map((row) => row.matchId))]);
  return {
    data: page.data.map((member) => ({
      member,
      ...toSummaryDto(
        summarizeEvaluations(toSummaryEntries(rows.filter((row) => row.memberId === member.id), stats)),
      ),
    })),
    page: page.page,
  };
}
