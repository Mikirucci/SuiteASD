import type { TenantDb } from '../../lib/tenant.js';
import { ineligibleMemberIds } from '../documents/service.js';

// D-32: a team event convocates its eligible athletes as soon as it exists, so they can answer without any "send" step.
// These functions keep the rows in line with the events and the rosters. They only ever add or remove PENDING rows of
// events still ahead: an answer already given and the history of past events are never touched. They accept the tenant
// client or one of its transactions.
export type AutoConvocationDb = Pick<TenantDb, 'convocation' | 'document' | 'event' | 'member' | 'teamMembership'>;

export interface AutoConvocationEvent {
  id: string;
  teamId: string | null;
  startsAt: Date;
  status: string;
}

// SQLite limits the number of bound variables of a statement.
const INSERT_CHUNK = 500;

const isOpen = (event: AutoConvocationEvent, now: Date): boolean => event.status !== 'CANCELLED' && event.startsAt > now;

async function insertRows(db: AutoConvocationDb, societyId: string, rows: { eventId: string; memberId: string }[]): Promise<void> {
  for (let start = 0; start < rows.length; start += INSERT_CHUNK) {
    await db.convocation.createMany({ data: rows.slice(start, start + INSERT_CHUNK).map((row) => ({ societyId, ...row })) });
  }
}

// Convocates the active members of each event's team who are eligible (no expired medical certificate). Events that
// have no team, were cancelled or already started are ignored. Safe to call again: existing rows are left alone.
// The ineligible are not convocated here: they stay convocable by hand with an administrator's override.
export async function addTeamConvocations(
  db: AutoConvocationDb,
  societyId: string,
  events: readonly AutoConvocationEvent[],
  now = new Date(),
): Promise<void> {
  const open = events.filter((event) => isOpen(event, now));
  const teamIds = [...new Set(open.flatMap((event) => (event.teamId ? [event.teamId] : [])))];
  if (teamIds.length === 0) return;

  const memberships = await db.teamMembership.findMany({
    where: { teamId: { in: teamIds }, leftAt: null, member: { status: 'ACTIVE' } },
    select: { teamId: true, memberId: true },
  });
  const ineligible = await ineligibleMemberIds({ db }, [...new Set(memberships.map((row) => row.memberId))], now);
  const rosters = new Map<string, string[]>();
  for (const { teamId, memberId } of memberships) {
    if (ineligible.has(memberId)) continue;
    rosters.set(teamId, [...(rosters.get(teamId) ?? []), memberId]);
  }

  const existing = await db.convocation.findMany({ where: { eventId: { in: open.map((event) => event.id) } }, select: { eventId: true, memberId: true } });
  const taken = new Set(existing.map((row) => `${row.eventId}|${row.memberId}`));
  const rows = open.flatMap((event) =>
    (event.teamId ? (rosters.get(event.teamId) ?? []) : [])
      .filter((memberId) => !taken.has(`${event.id}|${memberId}`))
      .map((memberId) => ({ eventId: event.id, memberId })),
  );
  await insertRows(db, societyId, rows);
}

// Re-aligns the future convocations of one member with their situation: the PENDING rows of the team events they no
// longer belong to (they left the team, or are not active any more) go away, and the events of their teams that lack
// a row get one (if the member is eligible). Called whenever a membership or the status of a member changes.
export async function syncMemberConvocations(db: AutoConvocationDb, societyId: string, memberId: string, now = new Date()): Promise<void> {
  const member = await db.member.findFirst({
    where: { id: memberId },
    select: { status: true, teamMemberships: { where: { leftAt: null }, select: { teamId: true } } },
  });
  if (!member) return;
  const teamIds = member.status === 'ACTIVE' ? member.teamMemberships.map((membership) => membership.teamId) : [];

  await db.convocation.deleteMany({
    where: { memberId, status: 'PENDING', event: { startsAt: { gt: now }, teamId: { not: null, notIn: teamIds } } },
  });
  if (teamIds.length === 0) return;

  const missing = await db.event.findMany({
    where: {
      teamId: { in: teamIds },
      startsAt: { gt: now },
      status: { not: 'CANCELLED' },
      convocations: { none: { memberId } },
    },
    select: { id: true, teamId: true, startsAt: true, status: true },
  });
  await addTeamConvocations(db, societyId, missing, now);
}

// The event moved to another team (or to none): the unanswered rows of members who are not in the new team are
// dropped, the athletes of the new team are convocated. `event` is the event as it is after the change.
export async function realignEventTeam(
  db: AutoConvocationDb,
  societyId: string,
  event: AutoConvocationEvent,
  previousTeamId: string | null,
  now = new Date(),
): Promise<void> {
  if (!isOpen(event, now)) return;
  const stale = event.teamId
    ? { NOT: { member: { teamMemberships: { some: { teamId: event.teamId, leftAt: null } } } } }
    : previousTeamId
      ? { member: { teamMemberships: { some: { teamId: previousTeamId, leftAt: null } } } }
      : null;
  if (stale) await db.convocation.deleteMany({ where: { eventId: event.id, status: 'PENDING', ...stale } });
  await addTeamConvocations(db, societyId, [event], now);
}
