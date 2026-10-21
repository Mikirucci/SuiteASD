import type { TenantDb } from './tenant.js';

// A venue, a kit or a trip with a cost weighs on the balance: the cost is kept as one expense entry of the ledger,
// created, updated and removed together with the cost. The entry is deleted with its source (foreign key cascade).

export type LedgerSource = { venueId: string } | { kitId: string } | { tripId: string };

export interface LinkedExpense {
  category: string;
  description: string;
  amountCents: number;
  occurredOn: Date;
}

interface SyncArgs {
  db: Pick<TenantDb, 'ledgerEntry'>;
  societyId: string;
  userId: string;
  source: LedgerSource;
  /** The cost as it is now: null (or zero) means the source has no cost and its expense must not exist. */
  expense: LinkedExpense | null;
}

export async function syncLinkedExpense({ db, societyId, userId, source, expense }: SyncArgs): Promise<void> {
  const existing = await db.ledgerEntry.findFirst({ where: source, select: { id: true } });
  if (!expense || expense.amountCents <= 0) {
    if (existing) await db.ledgerEntry.deleteMany({ where: { id: existing.id } });
    return;
  }
  const data = {
    kind: 'EXPENSE',
    category: expense.category,
    description: expense.description,
    amountCents: expense.amountCents,
    occurredOn: expense.occurredOn,
  };
  if (existing) {
    await db.ledgerEntry.update({ where: { id: existing.id }, data });
    return;
  }
  await db.ledgerEntry.create({ data: { ...data, ...source, societyId, createdById: userId } });
}

/** The day a cost without an explicit date is booked: today, as a calendar day. */
export function today(now = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}
