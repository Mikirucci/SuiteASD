import type { Event, Member } from '@prisma/client';
import type { TestContext } from './app.js';
import { createActor, createMember, type Actor } from './factories.js';

const DAY_MS = 86_400_000;

export function inDays(days: number, hour = 18): Date {
  const date = new Date(Date.now() + days * DAY_MS);
  date.setUTCHours(hour, 0, 0, 0);
  return date;
}

export async function createEvent(
  ctx: TestContext,
  societyId: string,
  overrides: Partial<Omit<Event, 'id'>> = {},
): Promise<Event> {
  return ctx.prisma.event.create({
    data: { societyId, type: 'TRAINING', title: 'Allenamento Serie D', startsAt: inDays(7), ...overrides },
  });
}

export interface Athlete {
  member: Member;
  athlete: Actor | null;
  guardian: Actor | null;
}

// A member of `teamId`, optionally with an athlete account and a guardian account linked to it.
export async function createAthlete(
  ctx: TestContext,
  societyId: string,
  teamId: string,
  accounts: { athlete?: boolean; guardian?: boolean } = {},
  member: Partial<Member> = {},
): Promise<Athlete> {
  const athlete = accounts.athlete ? await createActor(ctx, societyId, 'ATLETA') : null;
  const created = await createMember(ctx, societyId, { ...(athlete ? { userId: athlete.user.id } : {}), ...member });
  await ctx.prisma.teamMembership.create({ data: { societyId, teamId, memberId: created.id } });
  const guardian = accounts.guardian ? await createActor(ctx, societyId, 'GENITORE') : null;
  if (guardian) {
    await ctx.prisma.guardianLink.create({
      data: { societyId, guardianUserId: guardian.user.id, memberId: created.id, relation: 'MADRE' },
    });
  }
  return { member: created, athlete, guardian };
}

// A medical certificate for the member, expiring `daysAhead` days from now (negative = already expired).
export async function addCertificate(ctx: TestContext, societyId: string, memberId: string, daysAhead: number): Promise<void> {
  const type = await ctx.prisma.documentType.upsert({
    where: { societyId_key: { societyId, key: 'MEDICAL_CERTIFICATE' } },
    create: { societyId, key: 'MEDICAL_CERTIFICATE', name: 'Certificato medico', requiresExpiry: true },
    update: {},
  });
  await ctx.prisma.document.create({
    data: {
      societyId,
      memberId,
      documentTypeId: type.id,
      title: 'Certificato medico',
      expiresAt: new Date(Date.now() + daysAhead * DAY_MS),
    },
  });
}
