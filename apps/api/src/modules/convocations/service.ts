import type { Prisma } from '@prisma/client';
import { conflict, forbidden, notFound, unprocessable } from '../../lib/errors.js';
import { cursorArgs, toPage, type Page } from '../../lib/pagination.js';
import { toIso, toIsoOrNull } from '../../lib/schemas.js';
import type { TenantDb } from '../../lib/tenant.js';
import type { TenantRequestContext } from '../../plugins/auth.js';
import { can } from '../../rbac/permissions.js';
import { convocationStatusSchema, eventStatusSchema, eventTypeSchema, type NotificationChannel } from '../../shared/enums.js';
import { ineligibleMemberIds } from '../documents/service.js';
import { ownMemberFilter } from '../members/access.js';
import { createNotification } from '../notifications/service.js';
import type {
  ConvocationDto,
  CreateConvocationsBody,
  EventConvocationsDto,
  ListConvocationsQuery,
  RemindConvocationsResult,
  RespondBody,
  SendConvocationsResult,
} from './schema.js';
import { loadConvocationSummaries, maxConvocationsOf } from './summary.js';

// What the sending and reminder functions need. Request handlers build it with `scopeOf(ctx)`; the scheduled
// automations (no logged-in user) build it from the society they are running for.
export interface ConvocationScope {
  db: TenantDb;
  societyId: string;
  // Channels the automatic dispatch may use (its settings); manual sends from a request leave every channel open.
  channels?: readonly NotificationChannel[];
}

export function scopeOf(ctx: TenantRequestContext): ConvocationScope {
  return { db: ctx.db, societyId: ctx.auth.societyId };
}

const convocationInclude = {
  event: { select: { id: true, type: true, title: true, startsAt: true, status: true } },
  member: { select: { id: true, firstName: true, lastName: true, fieldRole: true } },
} satisfies Prisma.ConvocationInclude;

type ConvocationRow = Prisma.ConvocationGetPayload<{ include: typeof convocationInclude }>;

function toDto(row: ConvocationRow, showOverride: boolean): ConvocationDto {
  return {
    id: row.id,
    event: {
      id: row.event.id,
      type: eventTypeSchema.parse(row.event.type),
      title: row.event.title,
      startsAt: toIso(row.event.startsAt),
      status: eventStatusSchema.parse(row.event.status),
    },
    member: row.member,
    status: convocationStatusSchema.parse(row.status),
    sentAt: toIsoOrNull(row.sentAt),
    respondedAt: toIsoOrNull(row.respondedAt),
    declineReason: row.declineReason,
    overrideReason: showOverride ? row.overrideReason : null,
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
  };
}

const canSeeOverride = (ctx: TenantRequestContext) => can(ctx.auth.roles, 'convocations:read');

// Staff see every convocation; athletes and guardians only their own and their children's. A convocation is visible
// (and answerable) from the moment it exists: `sentAt` only records that the notification went out.
function visibilityFilter(ctx: TenantRequestContext): Prisma.ConvocationWhereInput {
  return can(ctx.auth.roles, 'convocations:read') ? {} : { member: ownMemberFilter(ctx) };
}

async function loadEvent({ db }: Pick<ConvocationScope, 'db'>, eventId: string) {
  const event = await db.event.findFirst({ where: { id: eventId } });
  if (!event) throw notFound('Event');
  return event;
}

// Convocations make sense only for an event that is still ahead of us and has not been cancelled.
function assertOpen(event: { status: string; startsAt: Date }, now: Date): void {
  if (event.status === 'CANCELLED') throw conflict('event_cancelled', 'The event is cancelled');
  if (event.startsAt <= now) throw conflict('event_started', 'The event has already started');
}

export async function listConvocations(
  ctx: TenantRequestContext,
  { limit, cursor, eventId, memberId, status, upcoming }: ListConvocationsQuery,
): Promise<Page<ConvocationDto>> {
  const rows = await ctx.db.convocation.findMany({
    where: {
      ...visibilityFilter(ctx),
      ...(eventId ? { eventId } : {}),
      ...(memberId ? { memberId } : {}),
      ...(status ? { status } : {}),
      ...(upcoming === undefined
        ? {}
        : { event: upcoming ? { startsAt: { gt: new Date() }, status: { not: 'CANCELLED' } } : { startsAt: { lte: new Date() } } }),
    },
    include: convocationInclude,
    orderBy: [{ event: { startsAt: 'asc' } }, { id: 'asc' }],
    ...cursorArgs({ limit, cursor }),
  });
  const page = toPage(rows, { limit, cursor });
  const showOverride = canSeeOverride(ctx);
  return { data: page.data.map((row) => toDto(row, showOverride)), page: page.page };
}

export async function getEventConvocations(ctx: TenantRequestContext, eventId: string): Promise<EventConvocationsDto> {
  const event = await loadEvent(ctx, eventId);
  const [rows, summaries] = await Promise.all([
    ctx.db.convocation.findMany({
      where: { ...visibilityFilter(ctx), eventId },
      include: convocationInclude,
      orderBy: [{ member: { lastName: 'asc' } }, { member: { firstName: 'asc' } }, { id: 'asc' }],
    }),
    loadConvocationSummaries(ctx, [event]),
  ]);
  const summary = summaries.get(event.id);
  if (!summary) throw new Error(`Missing convocation summary for event ${event.id}`);
  const showOverride = canSeeOverride(ctx);
  return { data: rows.map((row) => toDto(row, showOverride)), summary };
}

export interface CreateConvocationsOutcome {
  result: EventConvocationsDto;
  // Athletes convocated despite an expired certificate: the caller writes them to the audit log.
  overriddenMemberIds: string[];
}

export async function createConvocations(
  ctx: TenantRequestContext,
  eventId: string,
  body: CreateConvocationsBody,
): Promise<CreateConvocationsOutcome> {
  const { db, auth } = ctx;
  if (body.override && !can(auth.roles, 'convocations:override')) {
    throw forbidden('Only an administrator can override the eligibility rule');
  }
  const event = await loadEvent(ctx, eventId);
  assertOpen(event, new Date());

  const members = await db.member.findMany({
    where: { id: { in: body.memberIds } },
    select: { id: true, status: true, teamMemberships: { where: { leftAt: null }, select: { teamId: true } } },
  });
  if (members.length !== body.memberIds.length) throw notFound('Member');
  const pathOf = (memberId: string) => `memberIds.${body.memberIds.indexOf(memberId)}`;

  const inactive = members.filter((member) => member.status !== 'ACTIVE');
  if (inactive.length > 0) {
    throw unprocessable(
      'member_inactive',
      'Inactive members cannot be convocated',
      inactive.map((member) => ({ path: pathOf(member.id), message: 'Member is not active' })),
    );
  }
  const outsiders = event.teamId
    ? members.filter((member) => !member.teamMemberships.some((membership) => membership.teamId === event.teamId))
    : [];
  if (outsiders.length > 0) {
    throw unprocessable(
      'member_not_in_team',
      "Only athletes of the event's team can be convocated",
      outsiders.map((member) => ({ path: pathOf(member.id), message: "Member does not belong to the event's team" })),
    );
  }

  const already = new Set(
    (await db.convocation.findMany({ where: { eventId, memberId: { in: body.memberIds } }, select: { memberId: true } })).map(
      (row) => row.memberId,
    ),
  );
  const newIds = body.memberIds.filter((id) => !already.has(id));

  const ineligible = await ineligibleMemberIds(ctx, newIds);
  if (ineligible.size > 0 && !body.override) {
    throw unprocessable(
      'member_not_eligible',
      'Athletes with an expired medical certificate cannot be convocated',
      [...ineligible].map((id) => ({ path: pathOf(id), message: 'Medical certificate expired' })),
    );
  }

  await db.$transaction(async (tx) => {
    // The automatic rows of a team event (D-32) are not slots: they cover the whole roster and only the confirmed
    // athletes take a place. Manual additions to a team event are therefore checked against the confirmed ones; an
    // event without a team only has manual rows, so there every row that is not declined takes a slot.
    const taken = await tx.convocation.count({ where: { eventId, status: event.teamId ? 'CONFIRMED' : { not: 'DECLINED' } } });
    const capacity = maxConvocationsOf(event);
    if (taken + newIds.length > capacity) {
      throw conflict('capacity_exceeded', `The event has ${capacity} convocation slots, ${taken} already taken`);
    }
    await tx.convocation.createMany({
      data: newIds.map((memberId) => ({
        societyId: auth.societyId,
        eventId,
        memberId,
        ...(ineligible.has(memberId) && body.override
          ? { overriddenById: auth.userId, overrideReason: body.override.reason }
          : {}),
      })),
    });
  });

  return { result: await getEventConvocations(ctx, eventId), overriddenMemberIds: [...ineligible] };
}

export async function removeConvocation(ctx: TenantRequestContext, id: string): Promise<void> {
  const row = await ctx.db.convocation.findFirst({ where: { id }, select: { event: { select: { startsAt: true } } } });
  if (!row) throw notFound('Convocation');
  if (row.event.startsAt <= new Date()) throw conflict('event_started', 'The event has already started');
  await ctx.db.convocation.deleteMany({ where: { id } });
}

// Athlete or guardian answers for the athlete (ABAC: own member or linked child), even before any notification went out.
export async function respondToConvocation(
  ctx: TenantRequestContext,
  id: string,
  body: RespondBody,
): Promise<ConvocationDto> {
  const row = await ctx.db.convocation.findFirst({
    where: { id, member: ownMemberFilter(ctx) },
    include: convocationInclude,
  });
  if (!row) throw notFound('Convocation');
  assertOpen(row.event, new Date());

  const updated = await ctx.db.convocation.update({
    where: { id },
    data: { status: body.status, respondedAt: new Date(), declineReason: body.status === 'DECLINED' ? (body.reason ?? null) : null },
    include: convocationInclude,
  });
  return toDto(updated, false);
}

// ---------------------------------------------------------------------------------------------------------------
// Notifications: sending and reminders (also called by the scheduled automations)
// ---------------------------------------------------------------------------------------------------------------

// "Sabato 20:30" in the society time zone.
function formatSlot(date: Date, timeZone: string): string {
  const day = new Intl.DateTimeFormat('it-IT', { timeZone, weekday: 'long' }).format(date);
  const time = new Intl.DateTimeFormat('it-IT', { timeZone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(date);
  return `${day.charAt(0).toUpperCase()}${day.slice(1)} ${time}`;
}

type ConvocationRecipients = Prisma.ConvocationGetPayload<{
  include: { member: { select: { userId: true; guardianLinks: { select: { guardianUserId: true } } } } };
}>;

const recipientsInclude = {
  member: { select: { userId: true, guardianLinks: { select: { guardianUserId: true } } } },
} satisfies Prisma.ConvocationInclude;

function recipientUserIds(row: ConvocationRecipients): string[] {
  const ids = [row.member.userId, ...row.member.guardianLinks.map((link) => link.guardianUserId)];
  return ids.filter((id): id is string => id !== null);
}

// Notifies the convocations of an event that were not notified yet: marks them (Convocation.sentAt,
// Event.convocationsSentAt) and tells the athlete and the guardians. Idempotent: calling it again only handles convocations added since.
export async function sendConvocations(
  scope: ConvocationScope,
  eventId: string,
  now = new Date(),
): Promise<SendConvocationsResult> {
  const event = await loadEvent(scope, eventId);
  assertOpen(event, now);

  return scope.db.$transaction(async (tx) => {
    const unsent = await tx.convocation.findMany({ where: { eventId, sentAt: null }, include: recipientsInclude });
    if (unsent.length === 0) {
      return { eventId, sent: 0, notified: 0, convocationsSentAt: toIsoOrNull(event.convocationsSentAt) };
    }
    const society = await tx.society.findFirstOrThrow({ select: { timezone: true } });
    const claimed = await tx.convocation.updateMany({
      where: { id: { in: unsent.map((row) => row.id) }, sentAt: null },
      data: { sentAt: now },
    });
    const sentAt = event.convocationsSentAt ?? now;
    await tx.event.update({ where: { id: eventId }, data: { convocationsSentAt: sentAt } });

    let notified = 0;
    // Rows already answered are marked as sent too, but there is no point asking those athletes again.
    for (const row of unsent.filter((candidate) => candidate.status === 'PENDING')) {
      notified += await createNotification(tx, {
        societyId: scope.societyId,
        userIds: recipientUserIds(row),
        type: 'CONVOCATION',
        title: 'Convocazione',
        body: `${event.title}: ${formatSlot(event.startsAt, society.timezone)} · conferma presenza`,
        data: { eventId, convocationId: row.id, memberId: row.memberId },
        dedupeKey: `convocation:${row.id}`,
        channels: scope.channels,
      });
    }
    return { eventId, sent: claimed.count, notified, convocationsSentAt: sentAt.toISOString() };
  });
}

// Reminds the athletes (and guardians) who have not answered a sent convocation. At most one reminder per
// convocation and per day, however many times it is called.
export async function remindPendingConvocations(
  scope: ConvocationScope,
  eventId: string,
  now = new Date(),
): Promise<RemindConvocationsResult> {
  const event = await loadEvent(scope, eventId);
  assertOpen(event, now);

  return scope.db.$transaction(async (tx) => {
    const pending = await tx.convocation.findMany({
      where: { eventId, status: 'PENDING', sentAt: { not: null } },
      include: recipientsInclude,
    });
    const society = await tx.society.findFirstOrThrow({ select: { timezone: true } });
    const day = now.toISOString().slice(0, 10);
    let reminded = 0;
    let notified = 0;
    for (const row of pending) {
      const created = await createNotification(tx, {
        societyId: scope.societyId,
        userIds: recipientUserIds(row),
        type: 'CONVOCATION',
        title: 'Promemoria convocazione',
        body: `${event.title}: ${formatSlot(event.startsAt, society.timezone)} · rispondi alla convocazione`,
        data: { eventId, convocationId: row.id, memberId: row.memberId },
        dedupeKey: `convocation-reminder:${row.id}:${day}`,
        channels: scope.channels,
      });
      notified += created;
      if (created > 0) reminded += 1;
    }
    return { eventId, reminded, notified };
  });
}
