import type { Announcement, Prisma } from '@prisma/client';
import type { CrudService } from '../../lib/crud-routes.js';
import { notFound } from '../../lib/errors.js';
import { cursorArgs, toPage } from '../../lib/pagination.js';
import { toIso, toIsoOrNull } from '../../lib/schemas.js';
import type { TenantRequestContext } from '../../plugins/auth.js';
import { can } from '../../rbac/permissions.js';
import { resolveRecipients } from '../notifications/recipients.js';
import { createNotification } from '../notifications/service.js';
import { renderNotification } from '../notifications/templates.js';
import type {
  AnnouncementDto,
  AnnouncementStatus,
  CreateAnnouncementBody,
  ListAnnouncementsQuery,
  UpdateAnnouncementBody,
} from './schema.js';

const withTeam = { team: { select: { name: true } } } satisfies Prisma.AnnouncementInclude;
type AnnouncementRow = Prisma.AnnouncementGetPayload<{ include: typeof withTeam }>;

function statusOf(publishedAt: Date | null, now: Date): AnnouncementStatus {
  if (publishedAt === null) return 'DRAFT';
  return publishedAt <= now ? 'PUBLISHED' : 'SCHEDULED';
}

function toDto(row: AnnouncementRow, authorNames: ReadonlyMap<string, string>, now: Date): AnnouncementDto {
  return {
    id: row.id,
    title: row.title,
    body: row.body,
    teamId: row.teamId,
    teamName: row.team?.name ?? null,
    isPinned: row.isPinned,
    publishedAt: toIsoOrNull(row.publishedAt),
    status: statusOf(row.publishedAt, now),
    authorId: row.authorId,
    authorName: authorNames.get(row.authorId) ?? null,
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
  };
}

async function authorNamesOf({ db }: TenantRequestContext, rows: readonly Announcement[]): Promise<Map<string, string>> {
  const ids = [...new Set(rows.map((row) => row.authorId))];
  const users = await db.user.findMany({ where: { id: { in: ids } }, select: { id: true, firstName: true, lastName: true } });
  return new Map(users.map((user) => [user.id, `${user.firstName} ${user.lastName}`]));
}

async function presentOne(ctx: TenantRequestContext, row: AnnouncementRow, now = new Date()): Promise<AnnouncementDto> {
  return toDto(row, await authorNamesOf(ctx, [row]), now);
}

// Who sees what: managers see everything (drafts and scheduled included); everybody else only what is already
// published. Readers who cannot browse the whole roster (athletes, guardians) only get the society-wide
// announcements and the ones addressed to the teams of their own member / linked children.
async function visibilityFilter(ctx: TenantRequestContext, now: Date): Promise<Prisma.AnnouncementWhereInput> {
  const { db, auth } = ctx;
  if (can(auth.roles, 'announcements:write')) return {};
  const published: Prisma.AnnouncementWhereInput = { publishedAt: { lte: now } };
  if (can(auth.roles, 'members:read')) return published;

  const memberships = await db.teamMembership.findMany({
    where: {
      leftAt: null,
      member: { OR: [{ userId: auth.userId }, { guardianLinks: { some: { guardianUserId: auth.userId } } }] },
    },
    select: { teamId: true },
  });
  const teamIds = [...new Set(memberships.map((membership) => membership.teamId))];
  return { ...published, OR: [{ teamId: null }, { teamId: { in: teamIds } }] };
}

async function assertTeamExists({ db }: TenantRequestContext, teamId: string | null | undefined): Promise<void> {
  if (!teamId) return;
  if (!(await db.team.findFirst({ where: { id: teamId }, select: { id: true } }))) throw notFound('Team');
}

async function notifyPublished(ctx: TenantRequestContext, row: Announcement): Promise<void> {
  const audience = row.teamId === null ? ({ kind: 'ROLES' } as const) : ({ kind: 'TEAM', teamId: row.teamId } as const);
  const recipients = (await resolveRecipients(ctx.db, audience)).filter((userId) => userId !== ctx.auth.userId);
  const { title, body } = renderNotification({ type: 'ANNOUNCEMENT', title: row.title, body: row.body });
  await createNotification(ctx.db, {
    societyId: ctx.auth.societyId,
    userIds: recipients,
    type: 'ANNOUNCEMENT',
    title,
    body,
    data: { announcementId: row.id },
    dedupeKey: `announcement:${row.id}`,
  });
}

function statusFilter(status: AnnouncementStatus, now: Date): Prisma.AnnouncementWhereInput {
  if (status === 'DRAFT') return { publishedAt: null };
  return status === 'SCHEDULED' ? { publishedAt: { gt: now } } : { publishedAt: { lte: now } };
}

export const announcementService: CrudService<
  AnnouncementDto,
  CreateAnnouncementBody,
  UpdateAnnouncementBody,
  ListAnnouncementsQuery
> = {
  async list(ctx, query) {
    const now = new Date();
    const rows = await ctx.db.announcement.findMany({
      where: {
        AND: [
          await visibilityFilter(ctx, now),
          query.teamId ? { teamId: query.teamId } : {},
          query.status ? statusFilter(query.status, now) : {},
        ],
      },
      include: withTeam,
      orderBy: [{ isPinned: 'desc' }, { createdAt: 'desc' }, { id: 'asc' }],
      ...cursorArgs(query),
    });
    const page = toPage(rows, query);
    const authors = await authorNamesOf(ctx, page.data);
    return { data: page.data.map((row) => toDto(row, authors, now)), page: page.page };
  },

  async get(ctx, id) {
    const now = new Date();
    const row = await ctx.db.announcement.findFirst({
      where: { AND: [{ id }, await visibilityFilter(ctx, now)] },
      include: withTeam,
    });
    if (!row) throw notFound('Announcement');
    return presentOne(ctx, row, now);
  },

  async create(ctx, body) {
    await assertTeamExists(ctx, body.teamId);
    const now = new Date();
    const publishedAt = body.publishedAt === undefined ? now : body.publishedAt === null ? null : new Date(body.publishedAt);
    const row = await ctx.db.announcement.create({
      data: {
        societyId: ctx.auth.societyId,
        authorId: ctx.auth.userId,
        title: body.title,
        body: body.body,
        teamId: body.teamId,
        isPinned: body.isPinned,
        publishedAt,
      },
      include: withTeam,
    });
    if (statusOf(publishedAt, now) === 'PUBLISHED') await notifyPublished(ctx, row);
    return presentOne(ctx, row, now);
  },

  async update(ctx, id, body) {
    await assertTeamExists(ctx, body.teamId);
    const current = await ctx.db.announcement.findFirst({ where: { id }, select: { publishedAt: true } });
    if (!current) throw notFound('Announcement');
    const now = new Date();
    const { publishedAt, ...rest } = body;
    const row = await ctx.db.announcement.update({
      where: { id },
      data: { ...rest, ...(publishedAt === undefined ? {} : { publishedAt: publishedAt === null ? null : new Date(publishedAt) }) },
      include: withTeam,
    });
    // Recipients are notified when the announcement turns from not-yet-visible into published, once.
    if (statusOf(current.publishedAt, now) !== 'PUBLISHED' && statusOf(row.publishedAt, now) === 'PUBLISHED') {
      await notifyPublished(ctx, row);
    }
    return presentOne(ctx, row, now);
  },

  async remove({ db }, id) {
    const result = await db.announcement.deleteMany({ where: { id } });
    if (result.count === 0) throw notFound('Announcement');
  },
};
