import type { Prisma } from '@prisma/client';
import { notFound } from '../../lib/errors.js';
import type { TenantRequestContext } from '../../plugins/auth.js';
import { formatDateOnly } from '../documents/status.js';
import type { PlanPeopleDto, PlanPeopleQuery, PlanPerson, PlanReportDto, PlanStats } from './schema.js';
import { statusOf } from './service.js';

// Per-plan view of the fees: what has been collected, what is still due, and how many people are settled, waiting
// or late. A person is late when any of their fees in the plan is overdue, waiting when some fee is still to pay
// but none is late, settled when nothing is left to pay. Cancelled fees are ignored.

const reportInclude = {
  member: {
    select: {
      firstName: true,
      lastName: true,
      teamMemberships: { where: { leftAt: null }, select: { team: { select: { id: true, name: true } } } },
    },
  },
} satisfies Prisma.PaymentInclude;

type ReportRow = Prisma.PaymentGetPayload<{ include: typeof reportInclude }>;

function groupByMember(rows: readonly ReportRow[], now: Date): PlanPerson[] {
  const people = new Map<string, PlanPerson>();
  for (const row of rows) {
    const status = statusOf(row, now);
    if (status === 'CANCELLED') continue;
    const person: PlanPerson = people.get(row.memberId) ?? {
      memberId: row.memberId,
      memberName: `${row.member.firstName} ${row.member.lastName}`,
      teams: row.member.teamMemberships.map((membership) => membership.team),
      totalDueCents: 0,
      allPlansDueCents: 0,
      paidCents: 0,
      status: 'PAID',
      feesCount: 0,
      nextDueDate: null,
    };
    person.feesCount += 1;
    if (status === 'PAID') {
      person.paidCents += row.amountCents;
    } else {
      person.totalDueCents += row.amountCents;
      const due = formatDateOnly(row.dueDate);
      if (person.nextDueDate === null || due < person.nextDueDate) person.nextDueDate = due;
      if (status === 'OVERDUE') person.status = 'OVERDUE';
      else if (person.status === 'PAID') person.status = 'PENDING';
    }
    people.set(row.memberId, person);
  }
  return [...people.values()].sort(
    (a, b) => a.memberName.localeCompare(b.memberName, 'it') || a.memberId.localeCompare(b.memberId),
  );
}

function statsOf(rows: readonly ReportRow[], people: readonly PlanPerson[], now: Date): PlanStats {
  let incassatoCents = 0;
  let scadutoCents = 0;
  let daIncassareCents = 0;
  for (const row of rows) {
    const status = statusOf(row, now);
    if (status === 'PAID') incassatoCents += row.amountCents;
    if (status === 'PENDING' || status === 'OVERDUE') daIncassareCents += row.amountCents;
    if (status === 'OVERDUE') scadutoCents += row.amountCents;
  }
  const count = (status: PlanPerson['status']) => people.filter((person) => person.status === status).length;
  return {
    incassatoCents,
    daIncassareCents,
    scadutoCents,
    paidPeople: count('PAID'),
    pendingPeople: count('PENDING'),
    overduePeople: count('OVERDUE'),
  };
}

export async function planReport(ctx: TenantRequestContext, now = new Date()): Promise<PlanReportDto> {
  const rows = await ctx.db.payment.findMany({
    where: { feePlanId: { not: null }, status: { not: 'CANCELLED' } },
    include: reportInclude,
  });
  const byPlan = new Map<string, ReportRow[]>();
  for (const row of rows) {
    if (row.feePlanId) byPlan.set(row.feePlanId, [...(byPlan.get(row.feePlanId) ?? []), row]);
  }
  return {
    data: [...byPlan].map(([feePlanId, planRows]) => ({
      feePlanId,
      ...statsOf(planRows, groupByMember(planRows, now), now),
    })),
  };
}

export async function planPeople(
  ctx: TenantRequestContext,
  feePlanId: string,
  filters: PlanPeopleQuery,
  now = new Date(),
): Promise<PlanPeopleDto> {
  if (!(await ctx.db.feePlan.findFirst({ where: { id: feePlanId }, select: { id: true } }))) throw notFound('Fee plan');
  const rows = await ctx.db.payment.findMany({
    where: { feePlanId, status: { not: 'CANCELLED' } },
    include: reportInclude,
  });
  const everyone = groupByMember(rows, now);
  const memberIds = everyone.map((person) => person.memberId);
  const otherRows = await ctx.db.payment.findMany({
    where: { memberId: { in: memberIds }, feePlanId: { not: null }, status: { not: 'CANCELLED' } },
    select: { memberId: true, amountCents: true, dueDate: true, status: true },
  });
  const dueAcrossPlans = new Map<string, number>();
  for (const row of otherRows) {
    const status = statusOf(row, now);
    if (status === 'PENDING' || status === 'OVERDUE') {
      dueAcrossPlans.set(row.memberId, (dueAcrossPlans.get(row.memberId) ?? 0) + row.amountCents);
    }
  }
  for (const person of everyone) person.allPlansDueCents = dueAcrossPlans.get(person.memberId) ?? 0;
  // The figures describe the whole plan: searching and filtering narrow the list of people, not the report.
  const stats = statsOf(rows, everyone, now);
  const needle = filters.q?.toLocaleLowerCase('it');
  const people = everyone.filter(
    (person) =>
      (!filters.status || person.status === filters.status) &&
      (!filters.teamId || person.teams.some((team) => team.id === filters.teamId)) &&
      (!needle || person.memberName.toLocaleLowerCase('it').includes(needle)),
  );
  return { stats, people };
}
