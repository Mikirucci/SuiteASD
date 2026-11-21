import { syncMemberConvocations, type AutoConvocationDb } from '../convocations/auto.js';
import { syncMemberFees, type FeeBillingDb } from '../fees/billing.js';

export type MemberSyncDb = AutoConvocationDb & FeeBillingDb;

// Whoever joins later gets everything that was set up before they arrived: the upcoming events of their teams and
// the fees of the plans that target them. Call it whenever a member enters the society, joins a team or becomes
// active again; it is idempotent, so calling it too often is harmless.
export async function syncMemberEntitlements(db: MemberSyncDb, societyId: string, memberId: string, now = new Date()): Promise<void> {
  await syncMemberConvocations(db, societyId, memberId, now);
  await syncMemberFees(db, societyId, memberId, now);
}
