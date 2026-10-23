import type { Prisma } from '@prisma/client';
import { isUniqueViolation } from '../../lib/prisma-errors.js';
import type { TenantDb } from '../../lib/tenant.js';
import { startOfUtcDay } from '../documents/status.js';

// A fee plan bills its target members when it is created, and anybody who becomes a target later: an athlete who
// enrols, is added to one of the plan's teams or becomes active again is billed from the plan's own schedule, so
// everything that was set up before they arrived applies to them too.
//
// What a newcomer owes: the installments still ahead. A date already gone is not billed backwards (somebody who
// joins in March does not owe October), but a plan that has no installment left still bills its last one, due
// today, so a one-off fee such as the enrolment is never skipped.
export type FeeBillingDb = Pick<TenantDb, 'feePlan' | 'payment' | 'member'>;

interface ScheduleEntry {
  number: number;
  dueDate: Date;
}

interface BillablePlan {
  id: string;
  name: string;
  amountCents: number;
  currency: string;
  schedule: readonly ScheduleEntry[];
}

const billablePlanInclude = { schedule: { orderBy: { number: 'asc' } } } satisfies Prisma.FeePlanInclude;

export function installmentDescription(planName: string, number: number, total: number): string {
  return total > 1 ? `${planName} · rata ${number} di ${total}` : planName;
}

export function installmentsOwedByNewcomer(schedule: readonly ScheduleEntry[], now: Date): ScheduleEntry[] {
  const today = startOfUtcDay(now);
  const ahead = schedule.filter((entry) => entry.dueDate >= today);
  if (ahead.length > 0) return [...ahead];
  const last = schedule[schedule.length - 1];
  return last ? [{ number: last.number, dueDate: today }] : [];
}

function targetOf(teamIds: readonly string[]): Prisma.FeePlanWhereInput {
  return { OR: [{ teams: { none: {} } }, { teams: { some: { teamId: { in: [...teamIds] } } } }] };
}

async function bill(db: FeeBillingDb, societyId: string, plan: BillablePlan, memberIds: readonly string[], now: Date): Promise<number> {
  const owed = installmentsOwedByNewcomer(plan.schedule, now);
  const rows = owed.flatMap((entry) =>
    memberIds.map((memberId) => ({
      societyId,
      memberId,
      feePlanId: plan.id,
      description: installmentDescription(plan.name, entry.number, plan.schedule.length),
      amountCents: plan.amountCents,
      currency: plan.currency,
      dueDate: entry.dueDate,
    })),
  );
  if (rows.length === 0) return 0;
  try {
    await db.payment.createMany({ data: rows });
  } catch (error) {
    // A concurrent sync of the same member already billed them: nothing is owed twice.
    if (isUniqueViolation(error)) return 0;
    throw error;
  }
  return rows.length;
}

// Bills one member for every active plan that targets them and has not billed them yet. Only active members are
// billed; somebody who already has a fee in the plan (they were there from the start, or left and came back) is
// left alone. Safe to call again. Returns the number of fees created.
export async function syncMemberFees(db: FeeBillingDb, societyId: string, memberId: string, now = new Date()): Promise<number> {
  const member = await db.member.findFirst({
    where: { id: memberId },
    select: { status: true, teamMemberships: { where: { leftAt: null }, select: { teamId: true } } },
  });
  if (member?.status !== 'ACTIVE') return 0;

  const plans = await db.feePlan.findMany({
    where: {
      isActive: true,
      schedule: { some: {} },
      payments: { none: { memberId } },
      ...targetOf(member.teamMemberships.map((membership) => membership.teamId)),
    },
    include: billablePlanInclude,
  });
  let created = 0;
  for (const plan of plans) created += await bill(db, societyId, plan, [memberId], now);
  return created;
}

// A plan that was switched off and is switched on again bills the targets that arrived in the meantime.
export async function syncPlanFees(db: FeeBillingDb, societyId: string, planId: string, now = new Date()): Promise<number> {
  const plan = await db.feePlan.findFirst({
    where: { id: planId, isActive: true },
    include: { ...billablePlanInclude, teams: { select: { teamId: true } } },
  });
  if (!plan) return 0;

  const teamIds = plan.teams.map((team) => team.teamId);
  const members = await db.member.findMany({
    where: {
      status: 'ACTIVE',
      payments: { none: { feePlanId: plan.id } },
      ...(teamIds.length > 0 ? { teamMemberships: { some: { teamId: { in: teamIds }, leftAt: null } } } : {}),
    },
    select: { id: true },
  });
  return bill(db, societyId, plan, members.map((member) => member.id), now);
}
