import type { Prisma } from '@prisma/client';
import { conflict, notFound, unprocessable } from '../../lib/errors.js';
import { cursorArgs, toPage, type Page, type PaginationQuery } from '../../lib/pagination.js';
import { toIso, toIsoOrNull } from '../../lib/schemas.js';
import type { TenantRequestContext } from '../../plugins/auth.js';
import { eventStatusSchema, eventTypeSchema, type EventType } from '../../shared/enums.js';
import { loadConvocationSummaries } from '../convocations/summary.js';
import { createNotification } from '../notifications/service.js';
import { buildIcalendar } from './ical.js';
import { expandWeekly, toRrule } from './recurrence.js';
import type {
  CancelEventBody,
  CreateEventBody,
  CreatedEventDto,
  EventDto,
  ExportEventsQuery,
  ListEventsQuery,
  UpdateEventBody,
} from './schema.js';

const eventInclude = {
  team: { select: { id: true, name: true } },
  venue: { select: { id: true, name: true, address: true } },
} satisfies Prisma.EventInclude;

type EventRow = Prisma.EventGetPayload<{ include: typeof eventInclude }>;

async function toDtos(ctx: TenantRequestContext, rows: readonly EventRow[]): Promise<EventDto[]> {
  const summaries = await loadConvocationSummaries(ctx, rows);
  return rows.map((row) => {
    const convocations = summaries.get(row.id);
    if (!convocations) throw new Error(`Missing convocation summary for event ${row.id}`);
    return {
      id: row.id,
      type: eventTypeSchema.parse(row.type),
      title: row.title,
      startsAt: toIso(row.startsAt),
      endsAt: toIsoOrNull(row.endsAt),
      status: eventStatusSchema.parse(row.status),
      notes: row.notes,
      team: row.team,
      venue: row.venue,
      recurrenceRule: row.recurrenceRule,
      recurrenceParentId: row.recurrenceParentId,
      convocations,
      convocationsSentAt: toIsoOrNull(row.convocationsSentAt),
      createdAt: toIso(row.createdAt),
      updatedAt: toIso(row.updatedAt),
    };
  });
}

async function loadEvent(ctx: TenantRequestContext, id: string): Promise<EventRow> {
  const row = await ctx.db.event.findFirst({ where: { id }, include: eventInclude });
  if (!row) throw notFound('Event');
  return row;
}

async function toDto(ctx: TenantRequestContext, row: EventRow): Promise<EventDto> {
  const [dto] = await toDtos(ctx, [row]);
  if (!dto) throw new Error('unreachable');
  return dto;
}

// Ids received from the client are checked through the scoped client: a foreign-tenant id looks "not found".
// The venue may legitimately be missing: `venueId` is optional.
async function assertReferences({ db }: TenantRequestContext, teamId?: string | null, venueId?: string | null) {
  if (teamId && !(await db.team.findFirst({ where: { id: teamId }, select: { id: true } }))) throw notFound('Team');
  if (venueId && !(await db.venue.findFirst({ where: { id: venueId }, select: { id: true } }))) throw notFound('Venue');
}

function rangeFilter(filters: Omit<ListEventsQuery, keyof PaginationQuery>): Prisma.EventWhereInput {
  return {
    ...(filters.from || filters.to
      ? { startsAt: { ...(filters.from ? { gte: new Date(filters.from) } : {}), ...(filters.to ? { lt: new Date(filters.to) } : {}) } }
      : {}),
    ...(filters.teamId ? { teamId: filters.teamId } : {}),
    ...(filters.type ? { type: filters.type } : {}),
    ...(filters.status ? { status: filters.status } : {}),
  };
}

export async function listEvents(
  ctx: TenantRequestContext,
  filters: Omit<ListEventsQuery, keyof PaginationQuery>,
  query: PaginationQuery,
): Promise<Page<EventDto>> {
  const rows = await ctx.db.event.findMany({
    where: rangeFilter(filters),
    include: eventInclude,
    orderBy: [{ startsAt: 'asc' }, { id: 'asc' }],
    ...cursorArgs(query),
  });
  const page = toPage(rows, query);
  return { data: await toDtos(ctx, page.data), page: page.page };
}

export async function getEvent(ctx: TenantRequestContext, id: string): Promise<EventDto> {
  return toDto(ctx, await loadEvent(ctx, id));
}

export async function createEvent(ctx: TenantRequestContext, body: CreateEventBody): Promise<CreatedEventDto> {
  const { db, auth } = ctx;
  if (body.recurrence && body.type !== 'TRAINING') {
    throw unprocessable('recurrence_not_allowed', 'Only trainings can repeat');
  }
  await assertReferences(ctx, body.teamId, body.venueId);

  const startsAt = new Date(body.startsAt);
  const durationMs = body.endsAt ? new Date(body.endsAt).getTime() - startsAt.getTime() : null;
  const base = {
    societyId: auth.societyId,
    type: body.type,
    title: body.title,
    teamId: body.teamId ?? null,
    venueId: body.venueId ?? null,
    notes: body.notes ?? null,
    maxConvocations: body.maxConvocations ?? null,
  };
  const endsAtFor = (start: Date) => (durationMs === null ? null : new Date(start.getTime() + durationMs));

  if (!body.recurrence) {
    const row = await db.event.create({
      data: { ...base, startsAt, endsAt: endsAtFor(startsAt) },
      include: eventInclude,
    });
    return { ...(await toDto(ctx, row)), occurrencesCreated: 1 };
  }

  const society = await db.society.findFirstOrThrow({ select: { timezone: true } });
  const starts = expandWeekly(startsAt, body.recurrence, society.timezone);
  if (starts.length === 0) throw unprocessable('recurrence_empty', 'The series ends before its first occurrence');
  const rule = toRrule(body.recurrence);

  const root = await db.$transaction(async (tx) => {
    const first = await tx.event.create({
      data: { ...base, startsAt: starts[0] ?? startsAt, endsAt: endsAtFor(starts[0] ?? startsAt), recurrenceRule: rule },
      include: eventInclude,
    });
    await tx.event.createMany({
      data: starts.slice(1).map((start) => ({
        ...base,
        startsAt: start,
        endsAt: endsAtFor(start),
        recurrenceParentId: first.id,
      })),
    });
    return first;
  });
  return { ...(await toDto(ctx, root)), occurrencesCreated: starts.length };
}

const TYPE_LABELS: Record<EventType, { name: string; moved: string; cancelled: string }> = {
  MATCH: { name: 'Partita', moved: 'Partita spostata', cancelled: 'Partita annullata' },
  TRAINING: { name: 'Allenamento', moved: 'Allenamento spostato', cancelled: 'Allenamento annullato' },
  TOURNAMENT: { name: 'Torneo', moved: 'Torneo spostato', cancelled: 'Torneo annullato' },
  MEETING: { name: 'Riunione', moved: 'Riunione spostata', cancelled: 'Riunione annullata' },
};

// "Giovedì 19 novembre alle 19:00", in the society time zone.
function formatWhen(date: Date, timeZone: string): string {
  const day = new Intl.DateTimeFormat('it-IT', { timeZone, weekday: 'long', day: 'numeric', month: 'long' }).format(date);
  const time = new Intl.DateTimeFormat('it-IT', { timeZone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(date);
  return `${day.charAt(0).toUpperCase()}${day.slice(1)} alle ${time}`;
}

// Athletes of the event's team and the convoked athletes, plus their guardians.
async function recipientUserIds(ctx: TenantRequestContext, event: EventRow): Promise<string[]> {
  const members = await ctx.db.member.findMany({
    where: {
      OR: [
        { convocations: { some: { eventId: event.id } } },
        ...(event.teamId ? [{ teamMemberships: { some: { teamId: event.teamId, leftAt: null } } }] : []),
      ],
    },
    select: { userId: true, guardianLinks: { select: { guardianUserId: true } } },
  });
  const ids = members.flatMap((member) => [member.userId, ...member.guardianLinks.map((link) => link.guardianUserId)]);
  return [...new Set(ids.filter((id): id is string => id !== null))];
}

async function notifyChange(
  ctx: TenantRequestContext,
  event: EventRow,
  change: 'moved' | 'cancelled',
  extra?: string,
): Promise<void> {
  const society = await ctx.db.society.findFirstOrThrow({ select: { timezone: true } });
  const labels = TYPE_LABELS[eventTypeSchema.parse(event.type)];
  const when = formatWhen(event.startsAt, society.timezone);
  await createNotification(ctx.db, {
    societyId: ctx.auth.societyId,
    userIds: await recipientUserIds(ctx, event),
    type: 'EVENT_CHANGED',
    title: change === 'moved' ? labels.moved : labels.cancelled,
    body: change === 'moved' ? `${event.title}: ${when}` : `${event.title} (${when})${extra ? `. ${extra}` : ''}`,
    data: { eventId: event.id, change },
  });
}

export async function updateEvent(ctx: TenantRequestContext, id: string, body: UpdateEventBody): Promise<EventDto> {
  const current = await loadEvent(ctx, id);
  if (current.status === 'CANCELLED') throw conflict('event_cancelled', 'A cancelled event cannot be modified');
  await assertReferences(ctx, body.teamId, body.venueId);

  const startsAt = body.startsAt ? new Date(body.startsAt) : current.startsAt;
  const endsAt = body.endsAt === undefined ? current.endsAt : body.endsAt === null ? null : new Date(body.endsAt);
  if (endsAt && endsAt <= startsAt) {
    throw unprocessable('invalid_time_range', 'endsAt must be after startsAt', [{ path: 'endsAt', message: 'endsAt must be after startsAt' }]);
  }

  // Moving the event in time or place is a "spostamento": status POSTPONED and everybody involved is notified.
  const moved = startsAt.getTime() !== current.startsAt.getTime() || (body.venueId !== undefined && body.venueId !== current.venueId);
  const row = await ctx.db.event.update({
    where: { id },
    data: {
      ...(body.title === undefined ? {} : { title: body.title }),
      startsAt,
      endsAt,
      ...(body.teamId === undefined ? {} : { teamId: body.teamId }),
      ...(body.venueId === undefined ? {} : { venueId: body.venueId }),
      ...(body.notes === undefined ? {} : { notes: body.notes }),
      ...(body.maxConvocations === undefined ? {} : { maxConvocations: body.maxConvocations }),
      ...(moved ? { status: 'POSTPONED' } : {}),
    },
    include: eventInclude,
  });
  if (moved) await notifyChange(ctx, row, 'moved');
  return toDto(ctx, row);
}

export async function cancelEvent(ctx: TenantRequestContext, id: string, body: CancelEventBody): Promise<EventDto> {
  const current = await loadEvent(ctx, id);
  if (current.status === 'CANCELLED') throw conflict('event_cancelled', 'The event is already cancelled');
  const row = await ctx.db.event.update({ where: { id }, data: { status: 'CANCELLED' }, include: eventInclude });
  await notifyChange(ctx, row, 'cancelled', body.reason);
  return toDto(ctx, row);
}

export async function deleteEvent({ db }: TenantRequestContext, id: string): Promise<void> {
  const result = await db.event.deleteMany({ where: { id } });
  if (result.count === 0) throw notFound('Event');
}

const MAX_EXPORTED_EVENTS = 2000;

export async function exportCalendar(ctx: TenantRequestContext, filters: ExportEventsQuery): Promise<string> {
  const [rows, society] = await Promise.all([
    ctx.db.event.findMany({
      where: rangeFilter(filters),
      include: eventInclude,
      orderBy: [{ startsAt: 'asc' }, { id: 'asc' }],
      take: MAX_EXPORTED_EVENTS,
    }),
    ctx.db.society.findFirstOrThrow({ select: { name: true } }),
  ]);
  return buildIcalendar(
    rows.map((row) => ({
      id: row.id,
      title: row.title,
      startsAt: row.startsAt,
      endsAt: row.endsAt,
      cancelled: row.status === 'CANCELLED',
      location: row.venue ? [row.venue.name, row.venue.address].filter(Boolean).join(', ') : null,
      description: row.notes,
      updatedAt: row.updatedAt,
    })),
    society.name,
  );
}
