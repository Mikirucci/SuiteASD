import type { TenantRequestContext } from '../../plugins/auth.js';
import { eventTypeSchema } from '../../shared/enums.js';
import { toIso, toIsoOrNull } from '../../lib/schemas.js';
import { MEDICAL_CERTIFICATE_KEY, addDays, pickCurrentDocument, statusOfDocument } from '../documents/status.js';
import { feesSummary } from '../fees/service.js';
import type { StatisticsOverviewDto } from './schema.js';

// Society dashboard (SPEC "Statistiche"): read-only figures computed from the data the other modules own.

const ATTENDANCE_WINDOW_DAYS = 90;
const LIST_SIZE = 5;

async function memberFigures({ db }: TenantRequestContext): Promise<StatisticsOverviewDto['members']> {
  const memberships = await db.teamMembership.findMany({
    where: { leftAt: null, member: { status: 'ACTIVE' } },
    select: { team: { select: { id: true, name: true } } },
  });
  const counts = new Map<string, { teamId: string; teamName: string; count: number }>();
  for (const { team } of memberships) {
    const entry = counts.get(team.id) ?? { teamId: team.id, teamName: team.name, count: 0 };
    entry.count += 1;
    counts.set(team.id, entry);
  }
  const byTeam = [...counts.values()].sort((a, b) => a.teamName.localeCompare(b.teamName, 'it'));
  return { total: await db.member.count({ where: { status: 'ACTIVE' } }), byTeam };
}

async function certificateFigures({ db }: TenantRequestContext, now: Date): Promise<StatisticsOverviewDto['certificates']> {
  const members = await db.member.findMany({ where: { status: 'ACTIVE' }, select: { id: true } });
  const documents = await db.document.findMany({
    where: { documentType: { key: MEDICAL_CERTIFICATE_KEY }, member: { status: 'ACTIVE' } },
    select: { memberId: true, expiresAt: true },
  });
  const byMember = new Map<string, { expiresAt: Date | null }[]>();
  for (const document of documents) byMember.set(document.memberId, [...(byMember.get(document.memberId) ?? []), document]);

  const figures = { OK: 0, EXPIRING: 0, EXPIRED: 0, MISSING: 0 };
  for (const { id } of members) {
    const current = pickCurrentDocument(byMember.get(id) ?? [], true);
    figures[statusOfDocument(current, true, now)] += 1;
  }
  return figures;
}

async function attendanceFigures({ db }: TenantRequestContext, now: Date): Promise<StatisticsOverviewDto['attendance']> {
  const where = { event: { type: 'TRAINING', startsAt: { gte: addDays(now, -ATTENDANCE_WINDOW_DAYS), lte: now } } };
  const [recordsCount, present] = await Promise.all([
    db.attendance.count({ where }),
    db.attendance.count({ where: { ...where, present: true } }),
  ]);
  return { averagePercent: recordsCount === 0 ? null : Math.round((present / recordsCount) * 100), recordsCount };
}

async function upcomingEvents({ db }: TenantRequestContext, now: Date): Promise<StatisticsOverviewDto['upcomingEvents']> {
  const events = await db.event.findMany({
    where: { status: 'SCHEDULED', startsAt: { gte: now } },
    include: { team: { select: { name: true } } },
    orderBy: [{ startsAt: 'asc' }, { id: 'asc' }],
    take: LIST_SIZE,
  });
  return events.map((event) => ({
    id: event.id,
    type: eventTypeSchema.parse(event.type),
    title: event.title,
    startsAt: toIso(event.startsAt),
    teamName: event.team?.name ?? null,
  }));
}

// Results of the matches in which one of the society's own teams played.
async function latestResults({ db }: TenantRequestContext): Promise<StatisticsOverviewDto['latestResults']> {
  const matches = await db.match.findMany({
    where: {
      status: 'PLAYED',
      homeSets: { not: null },
      awaySets: { not: null },
      OR: [{ homeTeam: { teamId: { not: null } } }, { awayTeam: { teamId: { not: null } } }],
    },
    include: {
      homeTeam: { select: { name: true } },
      awayTeam: { select: { name: true } },
      group: { select: { competition: { select: { name: true } } } },
    },
    orderBy: [{ playedAt: 'desc' }, { id: 'asc' }],
    take: LIST_SIZE,
  });
  return matches.flatMap((match) =>
    match.homeSets === null || match.awaySets === null
      ? []
      : [
          {
            matchId: match.id,
            competitionName: match.group.competition.name,
            homeTeam: match.homeTeam.name,
            awayTeam: match.awayTeam.name,
            homeSets: match.homeSets,
            awaySets: match.awaySets,
            playedAt: toIsoOrNull(match.playedAt),
          },
        ],
  );
}

export async function getOverview(ctx: TenantRequestContext, now = new Date()): Promise<StatisticsOverviewDto> {
  const [members, certificates, fees, attendance, events, results] = await Promise.all([
    memberFigures(ctx),
    certificateFigures(ctx, now),
    feesSummary(ctx, {}, now),
    attendanceFigures(ctx, now),
    upcomingEvents(ctx, now),
    latestResults(ctx),
  ]);
  return {
    members,
    certificates,
    fees: {
      collectedCents: fees.incassatoCents,
      toCollectCents: fees.daIncassareCents,
      overdueCents: fees.scadutoCents,
      remindersSent: fees.promemoriaInviati,
    },
    attendance,
    upcomingEvents: events,
    latestResults: results,
  };
}
