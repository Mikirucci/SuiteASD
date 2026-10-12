import { Prisma } from '@prisma/client';
import { conflict, notFound, unprocessable } from '../../lib/errors.js';
import { cursorArgs, toPage, type Page, type PaginationQuery } from '../../lib/pagination.js';
import { isUniqueViolation } from '../../lib/prisma-errors.js';
import { toIso, toIsoOrNull } from '../../lib/schemas.js';
import type { TenantRequestContext } from '../../plugins/auth.js';
import {
  competitionKindSchema,
  matchStatusSchema,
  sportSchema,
  type Tiebreaker,
} from '../../shared/enums.js';
import { validateMatchResult } from './match-result.js';
import {
  pointsRulesSchema,
  setScoresSchema,
  tiebreakersSchema,
  type CompetitionDto,
  type CreateCompetitionBody,
  type CreateGroupTeamBody,
  type CreateMatchBody,
  type CreateSeasonBody,
  type GroupDto,
  type GroupTeamDto,
  type ListCompetitionsQuery,
  type ListMatchesQuery,
  type MatchDto,
  type MatchResultBody,
  type RoundSummaryDto,
  type SeasonDto,
  type StandingsDto,
  type UpdateCompetitionBody,
  type UpdateGroupTeamBody,
  type UpdateMatchBody,
  type UpdateSeasonBody,
} from './schema.js';
import { DEFAULT_POINTS_RULES, DEFAULT_TIEBREAKERS, computeStandings, type PointsRules } from './standings.js';

// Ids received from the client are always checked through the scoped client: a foreign-tenant id looks "not found".

// ---- seasons -----------------------------------------------------------------------------------

type SeasonRow = Prisma.SeasonGetPayload<object>;

function toSeasonDto(season: SeasonRow): SeasonDto {
  return {
    id: season.id,
    name: season.name,
    startsOn: toIso(season.startsOn),
    endsOn: toIso(season.endsOn),
    isCurrent: season.isCurrent,
    createdAt: toIso(season.createdAt),
    updatedAt: toIso(season.updatedAt),
  };
}

export async function listSeasons({ db }: TenantRequestContext, query: PaginationQuery): Promise<Page<SeasonDto>> {
  const rows = await db.season.findMany({ orderBy: [{ startsOn: 'desc' }, { id: 'asc' }], ...cursorArgs(query) });
  const page = toPage(rows, query);
  return { data: page.data.map(toSeasonDto), page: page.page };
}

export async function getSeason({ db }: TenantRequestContext, id: string): Promise<SeasonDto> {
  const season = await db.season.findFirst({ where: { id } });
  if (!season) throw notFound('Season');
  return toSeasonDto(season);
}

async function clearCurrentSeason({ db }: TenantRequestContext, exceptId?: string): Promise<void> {
  await db.season.updateMany({
    where: { isCurrent: true, ...(exceptId ? { id: { not: exceptId } } : {}) },
    data: { isCurrent: false },
  });
}

export async function createSeason(ctx: TenantRequestContext, body: CreateSeasonBody): Promise<SeasonDto> {
  try {
    const season = await ctx.db.season.create({
      data: {
        societyId: ctx.auth.societyId,
        name: body.name,
        startsOn: new Date(body.startsOn),
        endsOn: new Date(body.endsOn),
        isCurrent: body.isCurrent,
      },
    });
    if (season.isCurrent) await clearCurrentSeason(ctx, season.id);
    return toSeasonDto(season);
  } catch (error) {
    if (isUniqueViolation(error)) throw conflict('season_name_taken', `A season named "${body.name}" already exists`);
    throw error;
  }
}

export async function updateSeason(ctx: TenantRequestContext, id: string, body: UpdateSeasonBody): Promise<SeasonDto> {
  const current = await ctx.db.season.findFirst({ where: { id } });
  if (!current) throw notFound('Season');
  const startsOn = body.startsOn ? new Date(body.startsOn) : current.startsOn;
  const endsOn = body.endsOn ? new Date(body.endsOn) : current.endsOn;
  if (endsOn <= startsOn) {
    throw unprocessable('validation_error', 'The season must end after it starts', [
      { path: 'endsOn', message: 'endsOn must be after startsOn' },
    ]);
  }
  try {
    const season = await ctx.db.season.update({
      where: { id },
      data: { name: body.name, startsOn, endsOn, isCurrent: body.isCurrent },
    });
    if (body.isCurrent) await clearCurrentSeason(ctx, id);
    return toSeasonDto(season);
  } catch (error) {
    if (isUniqueViolation(error)) throw conflict('season_name_taken', 'A season with this name already exists');
    throw error;
  }
}

export async function deleteSeason({ db }: TenantRequestContext, id: string): Promise<void> {
  if (!(await db.season.findFirst({ where: { id }, select: { id: true } }))) throw notFound('Season');
  const [competitions, feePlans] = await Promise.all([
    db.competition.count({ where: { seasonId: id } }),
    db.feePlan.count({ where: { seasonId: id } }),
  ]);
  if (competitions + feePlans > 0) {
    throw conflict('season_in_use', 'The season still has competitions or fee plans: remove them first');
  }
  await db.season.deleteMany({ where: { id } });
}

// ---- competitions ------------------------------------------------------------------------------

const competitionInclude = { _count: { select: { groups: true } } } satisfies Prisma.CompetitionInclude;
type CompetitionRow = Prisma.CompetitionGetPayload<{ include: typeof competitionInclude }>;

function rulesOf(competition: { pointsRules: Prisma.JsonValue }): PointsRules {
  const parsed = pointsRulesSchema.safeParse(competition.pointsRules);
  return parsed.success ? parsed.data : DEFAULT_POINTS_RULES;
}

function tiebreakersOf(competition: { tiebreakers: Prisma.JsonValue }): Tiebreaker[] {
  const parsed = tiebreakersSchema.safeParse(competition.tiebreakers);
  return parsed.success ? parsed.data : [...DEFAULT_TIEBREAKERS];
}

function toCompetitionDto(competition: CompetitionRow): CompetitionDto {
  return {
    id: competition.id,
    seasonId: competition.seasonId,
    name: competition.name,
    kind: competitionKindSchema.parse(competition.kind),
    sport: sportSchema.parse(competition.sport),
    pointsRules: pointsRulesSchema.parse(rulesOf(competition)),
    tiebreakers: tiebreakersOf(competition),
    groupsCount: competition._count.groups,
    createdAt: toIso(competition.createdAt),
    updatedAt: toIso(competition.updatedAt),
  };
}

async function assertSeasonExists({ db }: TenantRequestContext, seasonId: string): Promise<void> {
  if (!(await db.season.findFirst({ where: { id: seasonId }, select: { id: true } }))) throw notFound('Season');
}

async function requireCompetition({ db }: TenantRequestContext, id: string) {
  const competition = await db.competition.findFirst({ where: { id } });
  if (!competition) throw notFound('Competition');
  return competition;
}

export async function listCompetitions(
  { db }: TenantRequestContext,
  filters: ListCompetitionsQuery,
  query: PaginationQuery,
): Promise<Page<CompetitionDto>> {
  const rows = await db.competition.findMany({
    where: {
      ...(filters.seasonId ? { seasonId: filters.seasonId } : {}),
      ...(filters.kind ? { kind: filters.kind } : {}),
      ...(filters.q ? { name: { contains: filters.q } } : {}),
    },
    include: competitionInclude,
    orderBy: [{ name: 'asc' }, { id: 'asc' }],
    ...cursorArgs(query),
  });
  const page = toPage(rows, query);
  return { data: page.data.map(toCompetitionDto), page: page.page };
}

export async function getCompetition({ db }: TenantRequestContext, id: string): Promise<CompetitionDto> {
  const competition = await db.competition.findFirst({ where: { id }, include: competitionInclude });
  if (!competition) throw notFound('Competition');
  return toCompetitionDto(competition);
}

export async function createCompetition(ctx: TenantRequestContext, body: CreateCompetitionBody): Promise<CompetitionDto> {
  await assertSeasonExists(ctx, body.seasonId);
  const competition = await ctx.db.competition.create({
    data: {
      societyId: ctx.auth.societyId,
      seasonId: body.seasonId,
      name: body.name,
      kind: body.kind,
      sport: body.sport,
      pointsRules: body.pointsRules,
      tiebreakers: body.tiebreakers,
    },
    include: competitionInclude,
  });
  return toCompetitionDto(competition);
}

export async function updateCompetition(
  ctx: TenantRequestContext,
  id: string,
  body: UpdateCompetitionBody,
): Promise<CompetitionDto> {
  await requireCompetition(ctx, id);
  const competition = await ctx.db.competition.update({
    where: { id },
    data: {
      name: body.name,
      kind: body.kind,
      pointsRules: body.pointsRules === null ? Prisma.DbNull : body.pointsRules,
      tiebreakers: body.tiebreakers === null ? Prisma.DbNull : body.tiebreakers,
    },
    include: competitionInclude,
  });
  return toCompetitionDto(competition);
}

export async function deleteCompetition({ db }: TenantRequestContext, id: string): Promise<void> {
  if (!(await db.competition.findFirst({ where: { id }, select: { id: true } }))) throw notFound('Competition');
  if ((await db.match.count({ where: { group: { competitionId: id } } })) > 0) {
    throw conflict('competition_has_matches', 'Delete the matches of the competition first');
  }
  await db.competition.deleteMany({ where: { id } });
}

// ---- groups ------------------------------------------------------------------------------------

const groupInclude = { _count: { select: { teams: true, matches: true } } } satisfies Prisma.GroupInclude;
type GroupRow = Prisma.GroupGetPayload<{ include: typeof groupInclude }>;

function toGroupDto(group: GroupRow): GroupDto {
  return {
    id: group.id,
    competitionId: group.competitionId,
    name: group.name,
    teamsCount: group._count.teams,
    matchesCount: group._count.matches,
    createdAt: toIso(group.createdAt),
    updatedAt: toIso(group.updatedAt),
  };
}

async function requireGroup({ db }: TenantRequestContext, competitionId: string, groupId: string) {
  const group = await db.group.findFirst({
    where: { id: groupId, competitionId },
    include: { competition: true },
  });
  if (!group) throw notFound('Group');
  return group;
}

export async function listGroups(
  ctx: TenantRequestContext,
  competitionId: string,
  query: PaginationQuery,
): Promise<Page<GroupDto>> {
  await requireCompetition(ctx, competitionId);
  const rows = await ctx.db.group.findMany({
    where: { competitionId },
    include: groupInclude,
    orderBy: [{ name: 'asc' }, { id: 'asc' }],
    ...cursorArgs(query),
  });
  const page = toPage(rows, query);
  return { data: page.data.map(toGroupDto), page: page.page };
}

export async function getGroup(ctx: TenantRequestContext, competitionId: string, groupId: string): Promise<GroupDto> {
  const group = await ctx.db.group.findFirst({ where: { id: groupId, competitionId }, include: groupInclude });
  if (!group) throw notFound('Group');
  return toGroupDto(group);
}

export async function createGroup(ctx: TenantRequestContext, competitionId: string, name: string): Promise<GroupDto> {
  await requireCompetition(ctx, competitionId);
  try {
    const group = await ctx.db.group.create({
      data: { societyId: ctx.auth.societyId, competitionId, name },
      include: groupInclude,
    });
    return toGroupDto(group);
  } catch (error) {
    if (isUniqueViolation(error)) throw conflict('group_name_taken', `A group named "${name}" already exists`);
    throw error;
  }
}

export async function renameGroup(
  ctx: TenantRequestContext,
  competitionId: string,
  groupId: string,
  name: string,
): Promise<GroupDto> {
  await requireGroup(ctx, competitionId, groupId);
  try {
    const group = await ctx.db.group.update({ where: { id: groupId }, data: { name }, include: groupInclude });
    return toGroupDto(group);
  } catch (error) {
    if (isUniqueViolation(error)) throw conflict('group_name_taken', 'A group with this name already exists');
    throw error;
  }
}

export async function deleteGroup(ctx: TenantRequestContext, competitionId: string, groupId: string): Promise<void> {
  await requireGroup(ctx, competitionId, groupId);
  if ((await ctx.db.match.count({ where: { groupId } })) > 0) {
    throw conflict('group_has_matches', 'Delete the matches of the group first');
  }
  await ctx.db.group.deleteMany({ where: { id: groupId } });
}

// ---- group participants ------------------------------------------------------------------------

type GroupTeamRow = Prisma.GroupTeamGetPayload<object>;

function toGroupTeamDto(row: GroupTeamRow): GroupTeamDto {
  return {
    id: row.id,
    groupId: row.groupId,
    name: row.name,
    teamId: row.teamId,
    isOurTeam: row.teamId !== null,
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
  };
}

export async function listGroupTeams(
  ctx: TenantRequestContext,
  competitionId: string,
  groupId: string,
  query: PaginationQuery,
): Promise<Page<GroupTeamDto>> {
  await requireGroup(ctx, competitionId, groupId);
  const rows = await ctx.db.groupTeam.findMany({
    where: { groupId },
    orderBy: [{ name: 'asc' }, { id: 'asc' }],
    ...cursorArgs(query),
  });
  const page = toPage(rows, query);
  return { data: page.data.map(toGroupTeamDto), page: page.page };
}

export async function createGroupTeam(
  ctx: TenantRequestContext,
  competitionId: string,
  groupId: string,
  body: CreateGroupTeamBody,
): Promise<GroupTeamDto> {
  await requireGroup(ctx, competitionId, groupId);
  let name = body.name;
  if (body.teamId) {
    const team = await ctx.db.team.findFirst({ where: { id: body.teamId }, select: { id: true, name: true } });
    if (!team) throw notFound('Team');
    if (await ctx.db.groupTeam.findFirst({ where: { groupId, teamId: team.id }, select: { id: true } })) {
      throw conflict('team_already_in_group', 'This team already plays in the group');
    }
    name ??= team.name;
  }
  if (!name) throw unprocessable('validation_error', 'A name is required', [{ path: 'name', message: 'Required' }]);
  try {
    const row = await ctx.db.groupTeam.create({
      data: { societyId: ctx.auth.societyId, groupId, name, teamId: body.teamId ?? null },
    });
    return toGroupTeamDto(row);
  } catch (error) {
    if (isUniqueViolation(error)) throw conflict('group_team_name_taken', `"${name}" already plays in the group`);
    throw error;
  }
}

export async function renameGroupTeam(
  ctx: TenantRequestContext,
  competitionId: string,
  groupId: string,
  teamId: string,
  body: UpdateGroupTeamBody,
): Promise<GroupTeamDto> {
  await requireGroup(ctx, competitionId, groupId);
  if (!(await ctx.db.groupTeam.findFirst({ where: { id: teamId, groupId }, select: { id: true } }))) {
    throw notFound('Group team');
  }
  try {
    return toGroupTeamDto(await ctx.db.groupTeam.update({ where: { id: teamId }, data: { name: body.name } }));
  } catch (error) {
    if (isUniqueViolation(error)) throw conflict('group_team_name_taken', 'A team with this name already plays in the group');
    throw error;
  }
}

export async function deleteGroupTeam(
  ctx: TenantRequestContext,
  competitionId: string,
  groupId: string,
  teamId: string,
): Promise<void> {
  await requireGroup(ctx, competitionId, groupId);
  if (!(await ctx.db.groupTeam.findFirst({ where: { id: teamId, groupId }, select: { id: true } }))) {
    throw notFound('Group team');
  }
  if ((await ctx.db.match.count({ where: { OR: [{ homeTeamId: teamId }, { awayTeamId: teamId }] } })) > 0) {
    throw conflict('group_team_has_matches', 'The team has matches in the group: delete them first');
  }
  await ctx.db.groupTeam.deleteMany({ where: { id: teamId } });
}

// ---- matches -----------------------------------------------------------------------------------

const matchInclude = {
  homeTeam: true,
  awayTeam: true,
  group: { select: { competitionId: true } },
} satisfies Prisma.MatchInclude;
type MatchRow = Prisma.MatchGetPayload<{ include: typeof matchInclude }>;

function toMatchDto(match: MatchRow): MatchDto {
  const scores = setScoresSchema.safeParse(match.setScores);
  const side = (team: MatchRow['homeTeam']) => ({ id: team.id, name: team.name, isOurTeam: team.teamId !== null });
  return {
    id: match.id,
    competitionId: match.group.competitionId,
    groupId: match.groupId,
    round: match.round,
    homeTeam: side(match.homeTeam),
    awayTeam: side(match.awayTeam),
    status: matchStatusSchema.parse(match.status),
    homeSets: match.homeSets,
    awaySets: match.awaySets,
    setScores: scores.success ? scores.data : null,
    playedAt: toIsoOrNull(match.playedAt),
    eventId: match.eventId,
    createdAt: toIso(match.createdAt),
    updatedAt: toIso(match.updatedAt),
  };
}

async function assertParticipant({ db }: TenantRequestContext, groupId: string, groupTeamId: string): Promise<void> {
  if (!(await db.groupTeam.findFirst({ where: { id: groupTeamId, groupId }, select: { id: true } }))) {
    throw notFound('Group team');
  }
}

async function assertEventFree({ db }: TenantRequestContext, eventId: string, exceptMatchId?: string): Promise<void> {
  if (!(await db.event.findFirst({ where: { id: eventId }, select: { id: true } }))) throw notFound('Event');
  const linked = await db.match.findFirst({
    where: { eventId, ...(exceptMatchId ? { id: { not: exceptMatchId } } : {}) },
    select: { id: true },
  });
  if (linked) throw conflict('event_already_linked', 'This calendar event is already linked to another match');
}

async function requireMatch({ db }: TenantRequestContext, id: string) {
  const match = await db.match.findFirst({ where: { id }, include: matchInclude });
  if (!match) throw notFound('Match');
  return match;
}

export async function listMatches(
  ctx: TenantRequestContext,
  competitionId: string,
  groupId: string,
  filters: ListMatchesQuery,
  query: PaginationQuery,
): Promise<Page<MatchDto>> {
  await requireGroup(ctx, competitionId, groupId);
  const rows = await ctx.db.match.findMany({
    where: {
      groupId,
      ...(filters.round === undefined ? {} : { round: filters.round }),
      ...(filters.status ? { status: filters.status } : {}),
      ...(filters.groupTeamId
        ? { OR: [{ homeTeamId: filters.groupTeamId }, { awayTeamId: filters.groupTeamId }] }
        : {}),
    },
    include: matchInclude,
    orderBy: [{ round: 'asc' }, { playedAt: 'asc' }, { id: 'asc' }],
    ...cursorArgs(query),
  });
  const page = toPage(rows, query);
  return { data: page.data.map(toMatchDto), page: page.page };
}

export async function getMatch(ctx: TenantRequestContext, id: string): Promise<MatchDto> {
  return toMatchDto(await requireMatch(ctx, id));
}

export async function createMatch(
  ctx: TenantRequestContext,
  competitionId: string,
  groupId: string,
  body: CreateMatchBody,
): Promise<MatchDto> {
  await requireGroup(ctx, competitionId, groupId);
  await assertParticipant(ctx, groupId, body.homeTeamId);
  await assertParticipant(ctx, groupId, body.awayTeamId);
  if (body.eventId) await assertEventFree(ctx, body.eventId);
  const match = await ctx.db.match.create({
    data: {
      societyId: ctx.auth.societyId,
      groupId,
      round: body.round,
      homeTeamId: body.homeTeamId,
      awayTeamId: body.awayTeamId,
      playedAt: body.playedAt ? new Date(body.playedAt) : undefined,
      eventId: body.eventId,
    },
    include: matchInclude,
  });
  return toMatchDto(match);
}

export async function updateMatch(ctx: TenantRequestContext, id: string, body: UpdateMatchBody): Promise<MatchDto> {
  const current = await requireMatch(ctx, id);
  const isPlayed = current.status === 'PLAYED';
  if (isPlayed && (body.status !== undefined || body.homeTeamId !== undefined || body.awayTeamId !== undefined)) {
    throw conflict('match_already_played', 'Remove the result before changing the teams or the status of a played match');
  }
  const homeTeamId = body.homeTeamId ?? current.homeTeamId;
  const awayTeamId = body.awayTeamId ?? current.awayTeamId;
  if (homeTeamId === awayTeamId) {
    throw unprocessable('validation_error', 'A team cannot play against itself', [
      { path: 'awayTeamId', message: 'A team cannot play against itself' },
    ]);
  }
  if (body.homeTeamId) await assertParticipant(ctx, current.groupId, body.homeTeamId);
  if (body.awayTeamId) await assertParticipant(ctx, current.groupId, body.awayTeamId);
  if (body.eventId) await assertEventFree(ctx, body.eventId, id);

  const match = await ctx.db.match.update({
    where: { id },
    data: {
      round: body.round,
      homeTeamId: body.homeTeamId,
      awayTeamId: body.awayTeamId,
      status: body.status,
      playedAt: body.playedAt === undefined ? undefined : body.playedAt === null ? null : new Date(body.playedAt),
      eventId: body.eventId,
    },
    include: matchInclude,
  });
  return toMatchDto(match);
}

export async function deleteMatch(ctx: TenantRequestContext, id: string): Promise<void> {
  await requireMatch(ctx, id);
  const [evaluations, stats] = await Promise.all([
    ctx.db.playerEvaluation.count({ where: { matchId: id } }),
    ctx.db.playerMatchStats.count({ where: { matchId: id } }),
  ]);
  if (evaluations + stats > 0) {
    throw conflict('match_has_evaluations', 'The match has report cards or statistics: delete them first');
  }
  await ctx.db.match.deleteMany({ where: { id } });
}

// Enter or correct the result. The standings are derived, so nothing else needs updating.
export async function setMatchResult(ctx: TenantRequestContext, id: string, body: MatchResultBody): Promise<MatchDto> {
  const current = await requireMatch(ctx, id);
  if (current.status === 'CANCELLED') throw conflict('match_cancelled', 'A cancelled match cannot have a result');

  const errors = validateMatchResult(body);
  if (errors.length > 0) throw unprocessable('invalid_result', 'The result is not valid', errors);

  const match = await ctx.db.match.update({
    where: { id },
    data: {
      status: 'PLAYED',
      homeSets: body.homeSets,
      awaySets: body.awaySets,
      setScores: body.setScores ?? Prisma.DbNull,
      playedAt: body.playedAt ? new Date(body.playedAt) : (current.playedAt ?? new Date()),
    },
    include: matchInclude,
  });
  return toMatchDto(match);
}

export async function clearMatchResult(ctx: TenantRequestContext, id: string): Promise<MatchDto> {
  const current = await requireMatch(ctx, id);
  if (current.status !== 'PLAYED') throw conflict('match_not_played', 'The match has no result to remove');
  const match = await ctx.db.match.update({
    where: { id },
    data: { status: 'SCHEDULED', homeSets: null, awaySets: null, setScores: Prisma.DbNull },
    include: matchInclude,
  });
  return toMatchDto(match);
}

// ---- standings and rounds ----------------------------------------------------------------------

export async function getStandings(
  ctx: TenantRequestContext,
  competitionId: string,
  groupId: string,
): Promise<StandingsDto> {
  const group = await requireGroup(ctx, competitionId, groupId);
  const [teams, matches] = await Promise.all([
    ctx.db.groupTeam.findMany({ where: { groupId }, orderBy: { id: 'asc' } }),
    ctx.db.match.findMany({ where: { groupId, status: { not: 'CANCELLED' } }, orderBy: { id: 'asc' } }),
  ]);
  const played = matches.flatMap((match) =>
    match.status === 'PLAYED' && match.homeSets !== null && match.awaySets !== null
      ? [
          {
            homeTeamId: match.homeTeamId,
            awayTeamId: match.awayTeamId,
            homeSets: match.homeSets,
            awaySets: match.awaySets,
            setScores: setScoresSchema.safeParse(match.setScores).data ?? null,
          },
        ]
      : [],
  );
  const pointsRules = rulesOf(group.competition);
  const tiebreakers = tiebreakersOf(group.competition);
  return {
    competitionId,
    groupId,
    groupName: group.name,
    pointsRules: pointsRulesSchema.parse(pointsRules),
    tiebreakers,
    matchesPlayed: played.length,
    matchesTotal: matches.length,
    rows: computeStandings({ teams, matches: played, rules: pointsRules, tiebreakers }),
  };
}

export async function listRounds(
  ctx: TenantRequestContext,
  competitionId: string,
  groupId: string,
): Promise<RoundSummaryDto[]> {
  await requireGroup(ctx, competitionId, groupId);
  const matches = await ctx.db.match.findMany({ where: { groupId }, select: { round: true, status: true } });
  const rounds = new Map<number | null, RoundSummaryDto>();
  for (const { round, status } of matches) {
    const summary = rounds.get(round) ?? { round, matchesCount: 0, playedCount: 0 };
    summary.matchesCount += 1;
    if (status === 'PLAYED') summary.playedCount += 1;
    rounds.set(round, summary);
  }
  return [...rounds.values()].sort((a, b) => (a.round ?? Number.MAX_SAFE_INTEGER) - (b.round ?? Number.MAX_SAFE_INTEGER));
}
