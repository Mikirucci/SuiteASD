import { expandWeekly, toRrule } from '../../src/modules/events/recurrence.js';
import type { SeedStep } from './context.js';

// SPEC sections 4 and 6: Serie D plays Aquile Volley vs Delfini Volley on Saturday 14 November 2026 at 20:30 at the
// Palazzetto, 12 convocation slots with 5 confirmed; the team trains every Thursday at 19:00.
// The match is not linked to a `Match` row here: the competitions seed owns the fixtures.

const TIME_ZONE = 'Europe/Rome';
const TRAINING_START = '2026-09-24T19:00:00+02:00';
const TRAINING_SERIES_UNTIL = '2027-05-27';
const MATCH_START = '2026-11-14T20:30:00+01:00';
const SQUAD_SIZE = 12;
const MINUTE_MS = 60_000;

const CONFIRMED_JERSEYS = new Set([1, 3, 4, 5, 6]);
const DECLINED_JERSEY = 7;

export const seedEvents: SeedStep = async (context) => {
  const { prisma, societyId } = context;
  const teamId = context.teamIds['Serie D'];
  if (!teamId) throw new Error('Team Serie D must be seeded before events');

  const venue =
    (await prisma.venue.findFirst({ where: { societyId, name: 'Palazzetto' } })) ??
    (await prisma.venue.create({
      data: { societyId, name: 'Palazzetto', address: 'Via dello Sport 1', city: 'Bologna', capacity: 300 },
    }));

  await seedTrainings(context, teamId, venue.id);
  await seedMatch(context, teamId, venue.id);
};

async function seedTrainings(context: Parameters<SeedStep>[0], teamId: string, venueId: string): Promise<void> {
  const { prisma, societyId } = context;
  const starts = expandWeekly(new Date(TRAINING_START), { interval: 1, until: TRAINING_SERIES_UNTIL }, TIME_ZONE);
  const base = { societyId, type: 'TRAINING', title: 'Allenamento Serie D', teamId, venueId, notes: 'Giovedì 19:00' };
  const endOf = (start: Date) => new Date(start.getTime() + 90 * MINUTE_MS);

  const [firstStart, ...others] = starts;
  if (!firstStart) throw new Error('The training series is empty');
  const first = await prisma.event.create({
    data: {
      ...base,
      startsAt: firstStart,
      endsAt: endOf(firstStart),
      recurrenceRule: toRrule({ interval: 1, until: TRAINING_SERIES_UNTIL }),
    },
  });
  await prisma.event.createMany({
    data: others.map((start) => ({ ...base, startsAt: start, endsAt: endOf(start), recurrenceParentId: first.id })),
  });

  // Check-in history for the trainings already held, so the attendance percentages are not empty.
  const squad = await prisma.member.findMany({
    where: { societyId, teamMemberships: { some: { teamId } } },
    select: { id: true },
    orderBy: { id: 'asc' },
  });
  const held = await prisma.event.findMany({
    where: { societyId, type: 'TRAINING', startsAt: { lt: new Date() } },
    select: { id: true },
    orderBy: { startsAt: 'asc' },
  });
  await prisma.attendance.createMany({
    data: held.flatMap((event, eventIndex) =>
      squad.map((member, memberIndex) => ({
        societyId,
        eventId: event.id,
        memberId: member.id,
        present: (memberIndex + eventIndex) % 5 !== 0,
        recordedById: context.users.allenatore.id,
      })),
    ),
  });
}

async function seedMatch(context: Parameters<SeedStep>[0], teamId: string, venueId: string): Promise<void> {
  const { prisma, societyId } = context;
  const startsAt = new Date(MATCH_START);
  const sentAt = new Date();
  const event = await prisma.event.create({
    data: {
      societyId,
      type: 'MATCH',
      title: 'Aquile Volley vs Delfini Volley',
      startsAt,
      endsAt: new Date(startsAt.getTime() + 120 * MINUTE_MS),
      teamId,
      venueId,
      notes: 'Serie D · Girone B · Giornata 6',
      convocationsSentAt: sentAt,
    },
  });

  const squad = await prisma.teamMembership.findMany({
    where: { societyId, teamId, jerseyNumber: { lte: SQUAD_SIZE } },
    orderBy: { jerseyNumber: 'asc' },
    select: { memberId: true, jerseyNumber: true },
  });
  for (const { memberId, jerseyNumber } of squad) {
    const confirmed = jerseyNumber !== null && CONFIRMED_JERSEYS.has(jerseyNumber);
    const declined = jerseyNumber === DECLINED_JERSEY;
    const convocation = await prisma.convocation.create({
      data: {
        societyId,
        eventId: event.id,
        memberId,
        status: confirmed ? 'CONFIRMED' : declined ? 'DECLINED' : 'PENDING',
        sentAt,
        respondedAt: confirmed || declined ? sentAt : null,
        declineReason: declined ? 'Impegno di lavoro' : null,
      },
    });
    const member = await prisma.member.findUniqueOrThrow({ where: { id: memberId }, select: { userId: true } });
    if (member.userId) {
      // Written directly (in-app only): seeding must not queue demo emails for the dispatch job.
      await prisma.notification.create({
        data: {
          societyId,
          userId: member.userId,
          type: 'CONVOCATION',
          channel: 'IN_APP',
          title: 'Convocazione',
          body: 'Aquile Volley vs Delfini Volley: Sabato 20:30 · conferma presenza',
          data: { eventId: event.id, convocationId: convocation.id, memberId },
          dedupeKey: `convocation:${convocation.id}`,
          status: 'SENT',
          sentAt,
        },
      });
    }
  }
}
