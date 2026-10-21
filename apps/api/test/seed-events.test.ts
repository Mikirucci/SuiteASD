import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DEMO_PASSWORD } from '../prisma/seed/context.js';
import { runSeed } from '../prisma/seed/run.js';
import { API, createTestContext, type TestContext } from './helpers/app.js';

describe('demo seed: calendar and convocations (SPEC sections 4 and 6)', () => {
  let ctx: TestContext;
  let societyId: string;

  const login = async (email: string) =>
    ({
      authorization: `Bearer ${
        (await ctx.app.inject({ method: 'POST', url: `${API}/auth/login`, payload: { email, password: DEMO_PASSWORD } })).json()
          .accessToken as string
      }`,
    });

  beforeAll(async () => {
    ctx = await createTestContext();
    societyId = (await runSeed(ctx.prisma, ctx.app.passwords)).societyId;
  });

  afterAll(async () => {
    await ctx.close();
  });

  it('has the Aquile Volley vs Delfini Volley match on Saturday 14 November 2026 at 20:30 at the Palazzetto', async () => {
    const event = await ctx.prisma.event.findFirstOrThrow({
      where: { societyId, type: 'MATCH' },
      include: { venue: true, team: true },
    });
    expect(event).toMatchObject({
      title: 'Aquile Volley vs Delfini Volley',
      notes: 'Serie D · Girone B · Giornata 6',
      team: { name: 'Serie D' },
      venue: { name: 'Palazzetto' },
    });
    expect(event.startsAt.toISOString()).toBe('2026-11-14T19:30:00.000Z');
    const wallClock = new Intl.DateTimeFormat('it-IT', {
      timeZone: 'Europe/Rome',
      weekday: 'long',
      hour: '2-digit',
      minute: '2-digit',
    }).format(event.startsAt);
    expect(wallClock).toBe('sabato 20:30');
  });

  it('shows 5/12 confirmed convocations to the coach and the demo athlete can answer hers', async () => {
    const coach = await login('allenatore@aquilevolley.it');
    const events = await ctx.app.inject({ method: 'GET', url: `${API}/events?type=MATCH`, headers: coach });
    const match = events.json().data[0];
    expect(match.convocations).toEqual({ confirmed: 5, declined: 1, pending: 6, total: 12, capacity: 12 });
    expect(match.convocationsSentAt).not.toBeNull();

    // The demo date is fixed by the SPEC: move the match ahead so this test keeps working once it has passed.
    await ctx.prisma.event.update({ where: { id: match.id }, data: { startsAt: new Date(Date.now() + 3 * 86_400_000) } });
    const athlete = await login('atleta@aquilevolley.it');
    const mine = await ctx.app.inject({ method: 'GET', url: `${API}/convocations?upcoming=true`, headers: athlete });
    // D-32: besides the match she already answers the trainings still ahead, from the day they exist.
    const convocation = mine.json().data.find((row: { event: { id: string } }) => row.event.id === match.id);
    expect(mine.json().data.length).toBeGreaterThan(1);
    expect(mine.json().data.every((row: { status: string }) => row.status === 'PENDING')).toBe(true);
    expect(convocation).toMatchObject({ status: 'PENDING', member: { firstName: 'Giulia', lastName: 'Rossi' } });

    const answer = await ctx.app.inject({
      method: 'PUT',
      url: `${API}/convocations/${convocation.id}/response`,
      headers: athlete,
      payload: { status: 'CONFIRMED' },
    });
    expect(answer.statusCode).toBe(200);
    const after = await ctx.app.inject({ method: 'GET', url: `${API}/events/${match.id}`, headers: coach });
    expect(after.json().convocations).toMatchObject({ confirmed: 6, total: 12 });
  });

  it('schedules the Serie D trainings every Thursday at 19:00 (society time) with a check-in history', async () => {
    const trainings = await ctx.prisma.event.findMany({ where: { societyId, type: 'TRAINING' }, orderBy: { startsAt: 'asc' } });
    expect(trainings.length).toBeGreaterThan(30);
    const format = new Intl.DateTimeFormat('it-IT', { timeZone: 'Europe/Rome', weekday: 'long', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
    expect(new Set(trainings.map((event) => format.format(event.startsAt)))).toEqual(new Set(['giovedì 19:00']));
    expect(trainings[0]?.recurrenceRule).toBe('FREQ=WEEKLY;INTERVAL=1;UNTIL=20270527');
    expect(trainings.slice(1).every((event) => event.recurrenceParentId === trainings[0]?.id)).toBe(true);

    const coach = await login('allenatore@aquilevolley.it');
    const serieD = await ctx.prisma.team.findFirstOrThrow({ where: { societyId, name: 'Serie D' } });
    const summary = await ctx.app.inject({ method: 'GET', url: `${API}/teams/${serieD.id}/attendance`, headers: coach });
    expect(summary.statusCode).toBe(200);
    expect(summary.json().trainings).toBeGreaterThan(0);
    expect(summary.json().summary.percentage).toBeGreaterThan(50);
  });

  it('does not queue emails for the demo notifications', async () => {
    expect(await ctx.prisma.notification.count({ where: { societyId, type: 'CONVOCATION', channel: 'EMAIL' } })).toBe(0);
    expect(await ctx.prisma.notification.count({ where: { societyId, type: 'CONVOCATION', channel: 'IN_APP' } })).toBeGreaterThan(0);
  });
});
