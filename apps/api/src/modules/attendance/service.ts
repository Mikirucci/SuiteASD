import type { Prisma } from '@prisma/client';
import { conflict, notFound, unprocessable } from '../../lib/errors.js';
import { cursorArgs, toPage } from '../../lib/pagination.js';
import { toIso } from '../../lib/schemas.js';
import type { TenantRequestContext } from '../../plugins/auth.js';
import type {
  AttendanceSheetDto,
  AttendanceTotals,
  CheckInBody,
  MemberHistoryDto,
  MemberHistoryQuery,
  RangeQuery,
  TeamSummaryDto,
} from './schema.js';

const memberSelect = { id: true, firstName: true, lastName: true, fieldRole: true } satisfies Prisma.MemberSelect;

// Cancelled trainings never count towards the percentages.
function countedTrainings(range: RangeQuery): Prisma.EventWhereInput {
  return {
    type: 'TRAINING',
    status: { not: 'CANCELLED' },
    ...(range.from || range.to
      ? { startsAt: { ...(range.from ? { gte: new Date(range.from) } : {}), ...(range.to ? { lt: new Date(range.to) } : {}) } }
      : {}),
  };
}

function totals(present: number, total: number): AttendanceTotals {
  return { present, total, percentage: total === 0 ? null : Math.round((present / total) * 1000) / 10 };
}

async function loadTraining({ db }: TenantRequestContext, eventId: string) {
  const event = await db.event.findFirst({ where: { id: eventId } });
  if (!event) throw notFound('Event');
  if (event.type !== 'TRAINING') throw unprocessable('attendance_not_allowed', 'Attendance is recorded for trainings only');
  return event;
}

// The check-in sheet: the athletes of the event team plus anybody already recorded (a guest from another team).
export async function getSheet(ctx: TenantRequestContext, eventId: string): Promise<AttendanceSheetDto> {
  const event = await loadTraining(ctx, eventId);
  const [records, roster] = await Promise.all([
    ctx.db.attendance.findMany({ where: { eventId }, select: { memberId: true, present: true, note: true } }),
    event.teamId
      ? ctx.db.member.findMany({
          where: { status: 'ACTIVE', teamMemberships: { some: { teamId: event.teamId, leftAt: null } } },
          select: memberSelect,
        })
      : [],
  ]);
  const recorded = new Map(records.map((record) => [record.memberId, record]));
  const extraIds = records.map((record) => record.memberId).filter((id) => !roster.some((member) => member.id === id));
  const extras = extraIds.length === 0 ? [] : await ctx.db.member.findMany({ where: { id: { in: extraIds } }, select: memberSelect });

  const data = [...roster, ...extras]
    .sort((a, b) => a.lastName.localeCompare(b.lastName, 'it') || a.firstName.localeCompare(b.firstName, 'it'))
    .map((member) => {
      const record = recorded.get(member.id);
      return { member, present: record?.present ?? null, note: record?.note ?? null };
    });
  const present = data.filter((row) => row.present === true).length;
  const absent = data.filter((row) => row.present === false).length;
  return { eventId, summary: { present, absent, notRecorded: data.length - present - absent }, data };
}

// Bulk upsert of the coach's check-in: calling it again with the same entries changes nothing.
export async function checkIn(ctx: TenantRequestContext, eventId: string, body: CheckInBody): Promise<AttendanceSheetDto> {
  const { db, auth } = ctx;
  const event = await loadTraining(ctx, eventId);
  if (event.status === 'CANCELLED') throw conflict('event_cancelled', 'The training is cancelled');

  const memberIds = body.entries.map((entry) => entry.memberId);
  const found = await db.member.count({ where: { id: { in: memberIds } } });
  if (found !== memberIds.length) throw notFound('Member');

  await db.$transaction(async (tx) => {
    for (const entry of body.entries) {
      await tx.attendance.upsert({
        where: { eventId_memberId: { eventId, memberId: entry.memberId } },
        create: {
          societyId: auth.societyId,
          eventId,
          memberId: entry.memberId,
          present: entry.present,
          note: entry.note ?? null,
          recordedById: auth.userId,
        },
        update: {
          present: entry.present,
          ...(entry.note === undefined ? {} : { note: entry.note }),
          recordedById: auth.userId,
        },
      });
    }
  });
  return getSheet(ctx, eventId);
}

export async function memberHistory(
  ctx: TenantRequestContext,
  memberId: string,
  { limit, cursor, ...range }: MemberHistoryQuery,
): Promise<MemberHistoryDto> {
  const member = await ctx.db.member.findFirst({ where: { id: memberId }, select: memberSelect });
  if (!member) throw notFound('Member');
  const where = { memberId, event: countedTrainings(range) } satisfies Prisma.AttendanceWhereInput;

  const [groups, rows] = await Promise.all([
    ctx.db.attendance.groupBy({ by: ['present'], where, _count: { _all: true }, orderBy: { present: 'asc' } }),
    ctx.db.attendance.findMany({
      where,
      select: { id: true, present: true, note: true, event: { select: { id: true, title: true, startsAt: true } } },
      orderBy: [{ event: { startsAt: 'desc' } }, { id: 'asc' }],
      ...cursorArgs({ limit, cursor }),
    }),
  ]);
  const present = groups.find((group) => group.present)?._count._all ?? 0;
  const absent = groups.find((group) => !group.present)?._count._all ?? 0;
  const page = toPage(rows, { limit, cursor });
  return {
    member,
    summary: totals(present, present + absent),
    data: page.data.map((row) => ({
      eventId: row.event.id,
      title: row.event.title,
      startsAt: toIso(row.event.startsAt),
      present: row.present,
      note: row.note,
    })),
    page: page.page,
  };
}

export async function teamSummary(ctx: TenantRequestContext, teamId: string, range: RangeQuery): Promise<TeamSummaryDto> {
  const { db } = ctx;
  const team = await db.team.findFirst({ where: { id: teamId }, select: { id: true, name: true } });
  if (!team) throw notFound('Team');
  const event = { teamId, ...countedTrainings(range) } satisfies Prisma.EventWhereInput;

  const [members, groups, trainings] = await Promise.all([
    db.member.findMany({
      where: { status: 'ACTIVE', teamMemberships: { some: { teamId, leftAt: null } } },
      select: memberSelect,
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }, { id: 'asc' }],
    }),
    db.attendance.groupBy({
      by: ['memberId', 'present'],
      where: { event },
      _count: { _all: true },
      orderBy: { memberId: 'asc' },
    }),
    db.event.count({ where: { ...event, attendances: { some: {} } } }),
  ]);

  const countOf = (memberId: string, present: boolean) =>
    groups.find((group) => group.memberId === memberId && group.present === present)?._count._all ?? 0;
  const rows = members.map((member) => {
    const present = countOf(member.id, true);
    return { member, ...totals(present, present + countOf(member.id, false)) };
  });
  const present = rows.reduce((sum, row) => sum + row.present, 0);
  const total = rows.reduce((sum, row) => sum + row.total, 0);
  return { team, trainings, summary: totals(present, total), members: rows };
}
